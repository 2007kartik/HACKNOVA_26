"""
Tracking service — powers the dashboard endpoint.

All queries live here so the router stays thin and the logic is testable.
"""
import logging
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from ..models import Item, Meeting
from ..schemas import ItemStatus, ItemType

logger = logging.getLogger(__name__)

# Statuses considered "active" (not terminal, not done)
_ACTIVE_STATUSES = {
    ItemStatus.EXTRACTED.value,
    ItemStatus.NEEDS_CLARIFICATION.value,
    ItemStatus.READY_FOR_REVIEW.value,
    ItemStatus.APPROVED.value,
    ItemStatus.SYNCED.value,
}

# Statuses where we consider a task "pending but past the gate"
_PAST_GATE_STATUSES = {
    ItemStatus.APPROVED.value,
    ItemStatus.SYNCED.value,
}

# Terminal statuses — we ignore these for most tracking
_TERMINAL_STATUSES = {ItemStatus.REJECTED.value, ItemStatus.DONE.value}


def get_status_counts(db: Session, meeting_id: str | None = None) -> dict[str, int]:
    """
    Return item counts grouped by status.
    If meeting_id is given, scoped to that meeting; otherwise global.
    """
    query = db.query(Item)
    if meeting_id:
        query = query.filter(Item.meeting_id == meeting_id)

    items = query.all()
    counts: dict[str, int] = {s.value: 0 for s in ItemStatus}
    for item in items:
        counts[item.status] = counts.get(item.status, 0) + 1
    return counts


def get_overdue_items(db: Session, meeting_id: str | None = None) -> list[Item]:
    """
    Items that have a deadline in the past AND are not DONE or REJECTED.
    Scoped to meeting if meeting_id is provided.
    """
    today = date.today()
    query = (
        db.query(Item)
        .filter(
            Item.deadline < today,
            Item.deadline.isnot(None),
            Item.status.notin_([ItemStatus.DONE.value, ItemStatus.REJECTED.value]),
        )
    )
    if meeting_id:
        query = query.filter(Item.meeting_id == meeting_id)
    return query.order_by(Item.deadline.asc()).all()


def get_unassigned_items(db: Session, meeting_id: str | None = None) -> list[Item]:
    """
    ACTION_ITEM and FOLLOW_UP items with no owner that are still active.
    Scoped to meeting if meeting_id is provided.
    """
    query = (
        db.query(Item)
        .filter(
            Item.type.in_([ItemType.ACTION_ITEM.value, ItemType.FOLLOW_UP.value]),
            (Item.owner == None) | (Item.owner == ""),  # noqa: E711
            Item.status.notin_(list(_TERMINAL_STATUSES)),
        )
    )
    if meeting_id:
        query = query.filter(Item.meeting_id == meeting_id)
    return query.order_by(Item.created_at.asc()).all()


def get_awaiting_clarification_count(db: Session, meeting_id: str | None = None) -> int:
    """Count of items currently in NEEDS_CLARIFICATION."""
    query = db.query(Item).filter(
        Item.status == ItemStatus.NEEDS_CLARIFICATION.value
    )
    if meeting_id:
        query = query.filter(Item.meeting_id == meeting_id)
    return query.count()


def get_pending_from_previous_meetings(
    db: Session,
    current_meeting_id: str | None = None,
) -> list[Item]:
    """
    APPROVED or SYNCED items from meetings OTHER than the current one that are not DONE.
    These represent open commitments carried over from earlier meetings.
    """
    query = (
        db.query(Item)
        .filter(Item.status.in_(list(_PAST_GATE_STATUSES)))
    )
    if current_meeting_id:
        query = query.filter(Item.meeting_id != current_meeting_id)
    return query.order_by(Item.deadline.asc().nullslast()).all()


def get_approved_synced_items_for_overdue_check(
    db: Session,
) -> list[Item]:
    """
    Return all APPROVED and SYNCED items with a past deadline.
    Used by the scheduler to send overdue reminders.
    """
    today = date.today()
    return (
        db.query(Item)
        .filter(
            Item.status.in_(list(_PAST_GATE_STATUSES)),
            Item.deadline < today,
            Item.deadline.isnot(None),
        )
        .all()
    )
