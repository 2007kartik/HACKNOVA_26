"""
APScheduler background jobs.

Two jobs run on a configurable interval:
1. trello_sync_job    — checks SYNCED items on Trello; if in Done list → DONE
2. overdue_check_job  — sends Slack reminders for APPROVED/SYNCED overdue items

Both jobs are gated — they only touch items with eligible statuses.
The scheduler is disabled by default (ENABLE_SCHEDULER=false).
"""
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_scheduler: BackgroundScheduler | None = None


# ═══════════════════════════════════════════════════════════════════════════════
# Jobs
# ═══════════════════════════════════════════════════════════════════════════════

def trello_sync_job() -> None:
    """
    For every SYNCED item with an external_id, ask Trello for its current list.
    If the card is in a Done list → transition item to DONE.
    """
    from ..db import SessionLocal
    from ..models import Item, Meeting
    from ..schemas import ItemStatus
    from ..state_machine import transition
    from ..integrations.trello import TrelloClient

    db = SessionLocal()
    try:
        synced_items = (
            db.query(Item)
            .filter(
                Item.status == ItemStatus.SYNCED.value,
                Item.external_id.isnot(None),
            )
            .all()
        )

        if not synced_items:
            logger.debug("trello_sync_job: no SYNCED items to check")
            return

        client = TrelloClient()
        done_count = 0

        for item in synced_items:
            try:
                list_name = client.get_task_list_name(item.external_id)
                if client.is_done_list(list_name):
                    transition(db, item, ItemStatus.DONE,
                               actor="system:scheduler",
                               reason="Card moved to Done list on Trello")
                    done_count += 1
            except Exception as exc:
                logger.warning(
                    "trello_sync_job: could not check item %s: %s", item.id, exc
                )

        db.commit()
        logger.info(
            "trello_sync_job: checked %d items, transitioned %d to DONE",
            len(synced_items), done_count,
        )
    except Exception as exc:
        logger.exception("trello_sync_job failed: %s", exc)
        db.rollback()
    finally:
        db.close()


def overdue_check_job() -> None:
    """
    Find APPROVED/SYNCED items with overdue deadlines and send Slack reminders.
    Gate: only APPROVED/SYNCED items — the notifier enforces this too.
    """
    from ..db import SessionLocal
    from ..models import Meeting
    from ..services.tracking import get_approved_synced_items_for_overdue_check
    from ..integrations.notifier import SlackNotifier

    db = SessionLocal()
    try:
        overdue_items = get_approved_synced_items_for_overdue_check(db)

        if not overdue_items:
            logger.debug("overdue_check_job: no overdue items")
            return

        notifier = SlackNotifier()
        sent = 0

        for item in overdue_items:
            try:
                meeting = db.get(Meeting, item.meeting_id)
                meeting_title = meeting.title if meeting else "Unknown Meeting"
                notifier.send_overdue_reminder(item, meeting_title)
                sent += 1
            except Exception as exc:
                logger.warning(
                    "overdue_check_job: could not notify for item %s: %s", item.id, exc
                )

        logger.info(
            "overdue_check_job: found %d overdue items, sent %d reminders",
            len(overdue_items), sent,
        )
    except Exception as exc:
        logger.exception("overdue_check_job failed: %s", exc)
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════════════════
# Lifecycle
# ═══════════════════════════════════════════════════════════════════════════════

def start_scheduler() -> None:
    """Start APScheduler with both jobs. Called from main.py lifespan startup."""
    global _scheduler

    if _scheduler and _scheduler.running:
        logger.warning("Scheduler already running — skipping start.")
        return

    interval_minutes = settings.SYNC_INTERVAL_MINUTES
    _scheduler = BackgroundScheduler(timezone="UTC")

    _scheduler.add_job(
        trello_sync_job,
        trigger=IntervalTrigger(minutes=interval_minutes),
        id="trello_sync",
        name="Trello Sync",
        replace_existing=True,
        misfire_grace_time=60,
    )

    _scheduler.add_job(
        overdue_check_job,
        trigger=IntervalTrigger(minutes=interval_minutes),
        id="overdue_check",
        name="Overdue Check",
        replace_existing=True,
        misfire_grace_time=60,
    )

    _scheduler.start()
    logger.info(
        "Scheduler started — interval=%d minutes, jobs: trello_sync, overdue_check",
        interval_minutes,
    )


def stop_scheduler() -> None:
    """Gracefully stop APScheduler. Called from main.py lifespan shutdown."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped.")
    _scheduler = None


def run_sync_now(db) -> dict:
    """
    Manually trigger the Trello sync and return counts.
    Called by POST /sync endpoint — same logic as the scheduler job
    but uses the provided db session and returns results.
    """
    from ..models import Item
    from ..schemas import ItemStatus
    from ..state_machine import transition
    from ..integrations.trello import TrelloClient

    synced_items = (
        db.query(Item)
        .filter(
            Item.status == ItemStatus.SYNCED.value,
            Item.external_id.isnot(None),
        )
        .all()
    )

    items_checked = len(synced_items)
    done_count = 0

    if not synced_items:
        return {"synced_to_done": 0, "items_checked": 0}

    client = TrelloClient()

    for item in synced_items:
        try:
            list_name = client.get_task_list_name(item.external_id)
            if client.is_done_list(list_name):
                transition(db, item, ItemStatus.DONE,
                           actor="system:manual_sync",
                           reason="Card moved to Done list on Trello (manual sync)")
                done_count += 1
        except Exception as exc:
            logger.warning("run_sync_now: could not check item %s: %s", item.id, exc)

    db.commit()
    logger.info("Manual sync: checked=%d done=%d", items_checked, done_count)
    return {"synced_to_done": done_count, "items_checked": items_checked}
