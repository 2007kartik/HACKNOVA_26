"""
Background extraction job.

Called by POST /meetings/{id}/extract as a FastAPI BackgroundTask.
Runs the AI pipeline, persists all results, and sets item statuses
via the state machine. Never raises to the caller — all errors are
caught and stored in meeting.error_message.
"""
import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models import Meeting, Item, DuplicateLinkRow
from ..schemas import (
    MeetingIn, ExistingTask, ItemStatus, MeetingStatus,
    LinkRelation, LinkResolution,
)
from ..state_machine import initial_status, transition
from ..errors import PipelineError
from .ai.pipeline import run_pipeline

logger = logging.getLogger(__name__)


def run_extraction(meeting_id: str, db: Session) -> None:
    """
    Entry point for the background task.

    Steps:
    1. Load the meeting from DB.
    2. Build the MeetingIn + existing_tasks context.
    3. Call run_pipeline().
    4. Persist extracted items and duplicate links.
    5. Set initial status for each item via state machine.
    6. Mark meeting EXTRACTED (or FAILED on error).
    """
    meeting: Meeting | None = db.get(Meeting, meeting_id)
    if not meeting:
        logger.error("extraction_job: meeting %s not found", meeting_id)
        return

    logger.info("extraction_job: starting extraction for meeting '%s' (%s)", meeting.title, meeting_id)

    try:
        # ── 1. Build pipeline inputs ──────────────────────────────────────────
        import json as _json
        participants = _json.loads(meeting.participants_json or "[]")

        meeting_in = MeetingIn(
            title=meeting.title,
            date=meeting.date,
            participants=participants,
            raw_text=meeting.raw_text,
        )

        # Load existing tasks from other meetings for duplicate context
        existing_items = (
            db.query(Item)
            .filter(
                Item.meeting_id != meeting_id,
                Item.status != ItemStatus.REJECTED.value,
            )
            .all()
        )
        existing_tasks = [
            ExistingTask(
                id=it.id,
                title=it.title,
                owner=it.owner,
                deadline=it.deadline,
                status=ItemStatus(it.status),
                meeting_id=it.meeting_id,
            )
            for it in existing_items
        ]

        # ── 2. Run AI pipeline ────────────────────────────────────────────────
        result = run_pipeline(meeting_in, existing_tasks)
        logger.info(
            "extraction_job: pipeline returned %d items, %d links",
            len(result.items), len(result.links),
        )

        # ── 3. Persist items ──────────────────────────────────────────────────
        persisted_items: list[Item] = []
        for extracted in result.items:
            item = Item(
                meeting_id=meeting_id,
                type=extracted.type.value,
                commitment_level=extracted.commitment_level.value,
                title=extracted.title,
                description=extracted.description or "",
                owner=extracted.owner_resolved or extracted.owner_raw,
                deadline=extracted.deadline_resolved,
                evidence_quote=extracted.evidence_quote or "",
                speaker=extracted.speaker,
                timestamp=extracted.timestamp,
                confidence=extracted.confidence,
                flags_json=json.dumps([f.value for f in extracted.ambiguity_flags]),
                status=ItemStatus.EXTRACTED.value,  # will be updated below
                reasoning=extracted.reasoning or "",
            )
            db.add(item)
            persisted_items.append(item)

        # Flush to get IDs assigned before we write audit logs
        db.flush()

        # ── 4. Set initial statuses via state machine ─────────────────────────
        for item in persisted_items:
            target = initial_status(item)
            transition(
                db=db,
                item=item,
                new_status=target,
                actor="system:extraction",
                reason="Initial status set after AI extraction",
            )

        db.flush()

        # ── 5. Persist duplicate/conflict links ───────────────────────────────
        for link in result.links:
            # Validate indices are in range
            if link.item_a_idx >= len(persisted_items) or link.item_b_idx >= len(persisted_items):
                logger.warning(
                    "extraction_job: skipping link with out-of-range indices %d/%d (total items: %d)",
                    link.item_a_idx, link.item_b_idx, len(persisted_items),
                )
                continue

            link_row = DuplicateLinkRow(
                meeting_id=meeting_id,
                item_a_id=persisted_items[link.item_a_idx].id,
                item_b_id=persisted_items[link.item_b_idx].id,
                relation=link.relation.value,
                score=link.score,
                explanation=link.explanation or "",
                resolution=LinkResolution.PENDING.value,
            )
            db.add(link_row)

        # ── 6. Mark meeting as EXTRACTED ──────────────────────────────────────
        meeting.status = MeetingStatus.EXTRACTED.value
        db.commit()

        logger.info(
            "extraction_job: completed for meeting %s — %d items, %d links persisted",
            meeting_id, len(persisted_items), len(result.links),
        )

    except Exception as exc:
        logger.exception("extraction_job: failed for meeting %s: %s", meeting_id, exc)
        try:
            db.rollback()
            meeting = db.get(Meeting, meeting_id)
            if meeting:
                meeting.status = MeetingStatus.FAILED.value
                meeting.error_message = str(exc)
                db.commit()
        except Exception as inner:
            logger.error("extraction_job: could not update meeting to FAILED: %s", inner)
