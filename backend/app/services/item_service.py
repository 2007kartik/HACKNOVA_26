"""
Item service — all business logic for item mutations.

The router calls these functions; they handle DB reads/writes,
state machine calls, and audit logging. Nothing in this file
calls Trello or sends notifications.
"""
import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models import Item, Clarification, AuditLog
from ..schemas import (
    ItemEditRequest, ClarifyRequest,
    ItemStatus, ItemType, AmbiguityFlag,
)
from ..errors import NotFoundError, InvalidTransitionError
from ..state_machine import transition, revalidate_flags

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def get_item_or_404(item_id: str, db: Session) -> Item:
    item = db.get(Item, item_id)
    if not item:
        raise NotFoundError(f"Item '{item_id}' not found.")
    return item


def _write_edit_audit(db: Session, item: Item, diff: dict, actor: str) -> None:
    log = AuditLog(
        item_id=item.id,
        action="EDIT",
        actor=actor,
        diff_json=json.dumps(diff),
        ts=datetime.now(timezone.utc),
    )
    db.add(log)


# ═══════════════════════════════════════════════════════════════════════════════
# Edit
# ═══════════════════════════════════════════════════════════════════════════════

def edit_item(
    item_id: str,
    body: ItemEditRequest,
    actor: str,
    db: Session,
) -> Item:
    """
    Apply a partial edit to an item.
    Records which fields changed in AuditLog.
    Calls revalidate_flags() after every edit so status auto-transitions.
    """
    item = get_item_or_404(item_id, db)

    diff: dict = {}

    if body.title is not None and body.title != item.title:
        diff["title"] = [item.title, body.title]
        item.title = body.title

    if body.description is not None and body.description != item.description:
        diff["description"] = [item.description, body.description]
        item.description = body.description

    if body.owner is not None and body.owner != item.owner:
        diff["owner"] = [item.owner, body.owner]
        item.owner = body.owner.strip() if body.owner else None

    if body.deadline is not None and body.deadline != item.deadline:
        diff["deadline"] = [str(item.deadline), str(body.deadline)]
        item.deadline = body.deadline

    if body.type is not None and body.type.value != item.type:
        diff["type"] = [item.type, body.type.value]
        item.type = body.type.value

    if body.commitment_level is not None and body.commitment_level.value != item.commitment_level:
        diff["commitment_level"] = [item.commitment_level, body.commitment_level.value]
        item.commitment_level = body.commitment_level.value

    if not diff:
        # Nothing changed — return as-is
        return item

    item.updated_at = datetime.now(timezone.utc)

    # Write audit log for the edit
    _write_edit_audit(db, item, diff, actor)

    # Revalidate flags and auto-transition if needed
    revalidate_flags(db, item, actor=actor)

    db.commit()
    db.refresh(item)
    logger.info("Edited item %s: %s (actor=%s)", item_id, list(diff.keys()), actor)
    return item


# ═══════════════════════════════════════════════════════════════════════════════
# Approve / Reject / Unapprove
# ═══════════════════════════════════════════════════════════════════════════════

def approve_item(item_id: str, actor: str, db: Session) -> Item:
    """Transition item to APPROVED. Raises InvalidTransitionError on rule violation."""
    item = get_item_or_404(item_id, db)
    transition(db, item, ItemStatus.APPROVED, actor=actor)
    db.commit()
    db.refresh(item)
    logger.info("Approved item %s (actor=%s)", item_id, actor)
    return item


def reject_item(item_id: str, actor: str, reason: str | None, db: Session) -> Item:
    """Transition item to REJECTED from any non-terminal status."""
    item = get_item_or_404(item_id, db)
    transition(db, item, ItemStatus.REJECTED, actor=actor, reason=reason)
    db.commit()
    db.refresh(item)
    logger.info("Rejected item %s (actor=%s, reason=%s)", item_id, actor, reason)
    return item


def unapprove_item(item_id: str, actor: str, db: Session) -> Item:
    """Send an APPROVED item back to READY_FOR_REVIEW."""
    item = get_item_or_404(item_id, db)
    transition(db, item, ItemStatus.READY_FOR_REVIEW, actor=actor, reason="Un-approved by user")
    db.commit()
    db.refresh(item)
    logger.info("Un-approved item %s (actor=%s)", item_id, actor)
    return item


# ═══════════════════════════════════════════════════════════════════════════════
# Clarify
# ═══════════════════════════════════════════════════════════════════════════════

_FIELD_TO_FLAGS: dict[str, list[str]] = {
    "owner": [
        AmbiguityFlag.NO_OWNER.value,
        AmbiguityFlag.VAGUE_OWNER.value,
        AmbiguityFlag.MULTIPLE_OWNERS.value,
    ],
    "deadline": [
        AmbiguityFlag.VAGUE_DEADLINE.value,
        AmbiguityFlag.NO_DEADLINE.value,
    ],
}


def clarify_item(item_id: str, body: ClarifyRequest, db: Session) -> Item:
    """
    Apply a user's clarification answer to a specific field on the item.

    Steps:
    1. Store the Clarification row (for audit trail).
    2. Apply the answer to the item field (owner or deadline).
    3. Clear the related ambiguity flags from flags_json.
    4. Call revalidate_flags() to auto-transition if all flags are now clear.
    """
    item = get_item_or_404(item_id, db)

    # 1. Store clarification record
    clarification = Clarification(
        item_id=item_id,
        field=body.field,
        question=_generate_question(body.field, item),
        answer=body.answer,
        resolved=True,
    )
    db.add(clarification)

    # 2. Apply answer to item field
    diff: dict = {}
    field = body.field.lower()

    if field == "owner":
        old_owner = item.owner
        item.owner = body.answer.strip()
        diff["owner"] = [old_owner, item.owner]

        # 3. Clear owner-related flags
        flags = set(json.loads(item.flags_json or "[]"))
        for flag in _FIELD_TO_FLAGS.get("owner", []):
            flags.discard(flag)
        item.flags_json = json.dumps(sorted(flags))

    elif field == "deadline":
        from datetime import date as dt_date
        try:
            parsed_date = dt_date.fromisoformat(body.answer)
            old_deadline = str(item.deadline)
            item.deadline = parsed_date
            diff["deadline"] = [old_deadline, str(parsed_date)]

            # 3. Clear deadline-related flags
            flags = set(json.loads(item.flags_json or "[]"))
            for flag in _FIELD_TO_FLAGS.get("deadline", []):
                flags.discard(flag)
            item.flags_json = json.dumps(sorted(flags))
        except ValueError:
            # Answer isn't a valid ISO date — store the raw text as a note
            # but still clear VAGUE_DEADLINE since user acknowledged it
            diff["deadline_raw_clarification"] = [None, body.answer]
            flags = set(json.loads(item.flags_json or "[]"))
            flags.discard(AmbiguityFlag.VAGUE_DEADLINE.value)
            item.flags_json = json.dumps(sorted(flags))

    else:
        # Generic field — store the clarification but don't auto-apply
        diff[field] = [None, body.answer]

    item.updated_at = datetime.now(timezone.utc)

    # Write audit log
    audit = AuditLog(
        item_id=item_id,
        action="CLARIFY",
        actor="user",
        diff_json=json.dumps({"field": body.field, "answer": body.answer, **diff}),
        ts=datetime.now(timezone.utc),
    )
    db.add(audit)

    # 4. Revalidate flags and auto-transition
    revalidate_flags(db, item, actor="user:clarify")

    db.commit()
    db.refresh(item)
    logger.info("Clarified field '%s' on item %s", body.field, item_id)
    return item


def _generate_question(field: str, item: Item) -> str:
    """Generate a human-readable question for a clarification."""
    questions = {
        "owner": f"Who is responsible for '{item.title}'?",
        "deadline": f"What is the deadline for '{item.title}'?",
        "type": f"What type of item is '{item.title}'?",
        "commitment_level": f"Is '{item.title}' a confirmed commitment or a suggestion?",
    }
    return questions.get(field.lower(), f"Please clarify the '{field}' field for '{item.title}'.")


# ═══════════════════════════════════════════════════════════════════════════════
# Audit log
# ═══════════════════════════════════════════════════════════════════════════════

def get_audit_log(item_id: str, db: Session) -> list[AuditLog]:
    """Return all audit log entries for an item, oldest first."""
    get_item_or_404(item_id, db)  # ensure item exists
    return (
        db.query(AuditLog)
        .filter(AuditLog.item_id == item_id)
        .order_by(AuditLog.ts.asc())
        .all()
    )
