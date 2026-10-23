"""
State machine for Item status transitions.

THIS IS THE MOST IMPORTANT FILE.

All item status changes MUST go through transition() — nothing else may
write item.status directly. This makes the approval gate testable and
provably correct.

Stage 2 implements: initial_status(), revalidate_flags() (basic).
Stage 3 implements: full transition() with all rules and AuditLog writes.
"""
import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .schemas import ItemStatus, ItemType, CommitmentLevel, AmbiguityFlag
from .errors import InvalidTransitionError

logger = logging.getLogger(__name__)

# ── Allowed transitions map ───────────────────────────────────────────────────
ALLOWED_TRANSITIONS: dict[ItemStatus, set[ItemStatus]] = {
    ItemStatus.EXTRACTED: {
        ItemStatus.NEEDS_CLARIFICATION,
        ItemStatus.READY_FOR_REVIEW,
    },
    ItemStatus.NEEDS_CLARIFICATION: {
        ItemStatus.READY_FOR_REVIEW,
        ItemStatus.REJECTED,
    },
    ItemStatus.READY_FOR_REVIEW: {
        ItemStatus.APPROVED,
        ItemStatus.REJECTED,
        ItemStatus.NEEDS_CLARIFICATION,
    },
    ItemStatus.APPROVED: {
        ItemStatus.SYNCED,
        ItemStatus.READY_FOR_REVIEW,  # un-approve
        ItemStatus.REJECTED,
    },
    ItemStatus.SYNCED: {
        ItemStatus.DONE,
    },
    # Terminal states — no outgoing transitions
    ItemStatus.REJECTED: set(),
    ItemStatus.DONE: set(),
}

# Flags that block approval
_OWNER_FLAGS = {
    AmbiguityFlag.NO_OWNER,
    AmbiguityFlag.VAGUE_OWNER,
    AmbiguityFlag.MULTIPLE_OWNERS,
}

# Types that require a non-empty owner to be approved
_OWNER_REQUIRED_TYPES = {ItemType.ACTION_ITEM, ItemType.FOLLOW_UP}


# ═══════════════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════════════

def initial_status(item) -> ItemStatus:
    """
    Determine the starting status for a freshly extracted item.
    - Any ambiguity flag present → NEEDS_CLARIFICATION
    - Otherwise               → READY_FOR_REVIEW
    """
    flags = _get_flags(item)
    if flags:
        return ItemStatus.NEEDS_CLARIFICATION
    return ItemStatus.READY_FOR_REVIEW


def revalidate_flags(db: Session, item, actor: str = "system") -> None:
    """
    Re-compute ambiguity flags after an edit and auto-transition the item
    between NEEDS_CLARIFICATION and READY_FOR_REVIEW if appropriate.

    Rules applied:
    - Non-empty owner removes NO_OWNER, VAGUE_OWNER (but not MULTIPLE_OWNERS
      unless only one owner is now set — the user explicitly resolved it)
    - A valid resolved deadline removes VAGUE_DEADLINE and NO_DEADLINE
    - If no flags remain and item is NEEDS_CLARIFICATION → READY_FOR_REVIEW
    - If flags are added back and item is READY_FOR_REVIEW → NEEDS_CLARIFICATION
    """
    flags: list[str] = _get_flags(item)
    updated_flags = set(flags)

    # Owner checks
    owner = (item.owner or "").strip()
    if owner:
        updated_flags.discard(AmbiguityFlag.NO_OWNER.value)
        updated_flags.discard(AmbiguityFlag.VAGUE_OWNER.value)
        # MULTIPLE_OWNERS stays until user explicitly resolves which owner
    else:
        # If owner was cleared, re-add NO_OWNER if it isn't there already
        if item.type in (ItemType.ACTION_ITEM.value, ItemType.FOLLOW_UP.value):
            updated_flags.add(AmbiguityFlag.NO_OWNER.value)

    # Deadline checks
    if item.deadline is not None:
        updated_flags.discard(AmbiguityFlag.VAGUE_DEADLINE.value)
        updated_flags.discard(AmbiguityFlag.NO_DEADLINE.value)

    # Persist updated flags
    item.flags_json = json.dumps(sorted(updated_flags))
    item.updated_at = datetime.now(timezone.utc)

    current_status = ItemStatus(item.status)

    # Auto-transition based on flag state
    if not updated_flags and current_status == ItemStatus.NEEDS_CLARIFICATION:
        logger.info("revalidate_flags: flags cleared, moving item %s to READY_FOR_REVIEW", item.id)
        _do_transition(db, item, ItemStatus.READY_FOR_REVIEW, actor,
                       reason="All ambiguity flags resolved")

    elif updated_flags and current_status == ItemStatus.READY_FOR_REVIEW:
        logger.info("revalidate_flags: flags re-added, moving item %s to NEEDS_CLARIFICATION", item.id)
        _do_transition(db, item, ItemStatus.NEEDS_CLARIFICATION, actor,
                       reason="Ambiguity flags re-introduced by edit")

    db.flush()


def transition(
    db: Session,
    item,
    new_status: ItemStatus,
    actor: str,
    reason: str | None = None,
) -> None:
    """
    Transition an item to a new status, enforcing all business rules.
    Writes an AuditLog row on every successful transition.

    Raises InvalidTransitionError on any rule violation.
    """
    current = ItemStatus(item.status)

    # ── 1. Check the transition is structurally allowed ───────────────────────
    allowed = ALLOWED_TRANSITIONS.get(current, set())
    if new_status not in allowed:
        raise InvalidTransitionError(
            f"Cannot transition item from {current.value} to {new_status.value}.",
            details={"current": current.value, "requested": new_status.value,
                     "allowed": [s.value for s in allowed]},
        )

    # ── 2. Approval-specific rules ────────────────────────────────────────────
    if new_status == ItemStatus.APPROVED:
        _validate_approval(item)

    # ── 3. SYNCED guard ───────────────────────────────────────────────────────
    if new_status == ItemStatus.SYNCED and current != ItemStatus.APPROVED:
        raise InvalidTransitionError(
            "Item must be APPROVED before it can be SYNCED.",
            details={"current": current.value},
        )

    # ── 4. Perform transition ─────────────────────────────────────────────────
    _do_transition(db, item, new_status, actor, reason)


# ═══════════════════════════════════════════════════════════════════════════════
# Private helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _validate_approval(item) -> None:
    """Raise InvalidTransitionError if this item cannot be approved."""
    flags = set(_get_flags(item))
    item_type = ItemType(item.type)
    commitment = CommitmentLevel(item.commitment_level)

    # Rule 1: Owner ambiguity flags must be cleared
    owner_flag_violations = flags & {f.value for f in _OWNER_FLAGS}
    if owner_flag_violations:
        raise InvalidTransitionError(
            "Cannot approve item with unresolved ownership ambiguity flags.",
            details={"flags": sorted(owner_flag_violations)},
        )

    # Rule 2: ACTION_ITEM and FOLLOW_UP must have a non-empty owner
    if item_type in _OWNER_REQUIRED_TYPES:
        if not (item.owner or "").strip():
            raise InvalidTransitionError(
                f"Cannot approve {item_type.value} without an assigned owner.",
                details={"type": item_type.value},
            )

    # Rule 3: SUGGESTION and OPEN_QUESTION can only be approved if the user
    # has converted them to an eligible type + CONFIRMED commitment level
    if item_type in (ItemType.SUGGESTION, ItemType.OPEN_QUESTION):
        raise InvalidTransitionError(
            f"Cannot approve a {item_type.value} directly. "
            "Edit the item type to ACTION_ITEM or FOLLOW_UP and set "
            "commitment_level to CONFIRMED first.",
            details={"type": item_type.value, "commitment_level": commitment.value},
        )

    # Rule 4: DECISION is exportable but not pushed — can still be APPROVED
    # for export purposes, but commitment must be CONFIRMED
    if item_type == ItemType.DECISION and commitment != CommitmentLevel.CONFIRMED:
        raise InvalidTransitionError(
            "DECISION items must have commitment_level=CONFIRMED to be approved.",
            details={"commitment_level": commitment.value},
        )


def _do_transition(
    db: Session,
    item,
    new_status: ItemStatus,
    actor: str,
    reason: str | None = None,
) -> None:
    """Write the new status and append an AuditLog row. No validation here."""
    from .models import AuditLog  # local import to avoid circular dependency at module level

    old_status = item.status
    item.status = new_status.value
    item.updated_at = datetime.now(timezone.utc)

    diff: dict = {"status": [old_status, new_status.value]}
    if reason:
        diff["reason"] = reason

    log = AuditLog(
        item_id=item.id,
        action="TRANSITION",
        actor=actor,
        diff_json=json.dumps(diff),
        ts=datetime.now(timezone.utc),
    )
    db.add(log)
    db.flush()  # make the row visible to subsequent queries in the same session

    logger.info(
        "Transition: item=%s  %s → %s  actor=%s",
        item.id, old_status, new_status.value, actor,
    )


def _get_flags(item) -> list[str]:
    """Safely parse flags_json from an Item model instance."""
    try:
        return json.loads(item.flags_json or "[]")
    except (json.JSONDecodeError, TypeError):
        return []
