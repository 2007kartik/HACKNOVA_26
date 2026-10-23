"""
Duplicate / conflict resolution service.

Handles the three resolution actions:
  merge      — keep one item, reject the other, copy missing fields
  keep_both  — mark the link resolved, leave both items untouched
  reject_one — reject the specified item
"""
import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models import Item, DuplicateLinkRow, AuditLog
from ..schemas import ItemStatus, LinkResolution
from ..errors import NotFoundError, DuplicateResolutionError
from ..state_machine import transition

logger = logging.getLogger(__name__)


def get_link_or_404(link_id: str, db: Session) -> DuplicateLinkRow:
    link = db.get(DuplicateLinkRow, link_id)
    if not link:
        raise NotFoundError(f"Duplicate link '{link_id}' not found.")
    return link


def resolve_link(
    link_id: str,
    action: str,
    keep_item_id: str | None,
    actor: str,
    db: Session,
) -> DuplicateLinkRow:
    """
    Resolve a duplicate/conflict link.

    Args:
        link_id:      The DuplicateLinkRow ID
        action:       "merge" | "keep_both" | "reject_one"
        keep_item_id: ID of the item to keep (required for merge / reject_one)
        actor:        Who is performing this action
        db:           DB session

    Returns:
        Updated DuplicateLinkRow

    Raises:
        DuplicateResolutionError: if action is invalid or already resolved
        NotFoundError: if link or items not found
    """
    link = get_link_or_404(link_id, db)

    if link.resolution != LinkResolution.PENDING.value:
        raise DuplicateResolutionError(
            f"This link has already been resolved as '{link.resolution}'.",
            details={"resolution": link.resolution},
        )

    item_a: Item = db.get(Item, link.item_a_id)
    item_b: Item = db.get(Item, link.item_b_id)

    if not item_a or not item_b:
        raise NotFoundError("One or both items in this link no longer exist.")

    action = action.lower()

    if action == "merge":
        link.resolution = LinkResolution.MERGED.value
        _do_merge(link, item_a, item_b, keep_item_id, actor, db)

    elif action == "keep_both":
        link.resolution = LinkResolution.KEPT_BOTH.value
        _write_link_audit(item_a, item_b, "DUPLICATE_KEPT_BOTH", actor, db)
        logger.info("Duplicate link %s: kept both items", link_id)

    elif action == "reject_one":
        if not keep_item_id:
            raise DuplicateResolutionError(
                "keep_item_id is required for reject_one action.",
                details={"action": action},
            )
        link.resolution = LinkResolution.REJECTED_ONE.value
        _do_reject_one(link, item_a, item_b, keep_item_id, actor, db)

    else:
        raise DuplicateResolutionError(
            f"Unknown action '{action}'. Must be one of: merge, keep_both, reject_one.",
            details={"action": action},
        )

    db.commit()
    db.refresh(link)
    return link


# ── Merge ─────────────────────────────────────────────────────────────────────

def _do_merge(
    link: DuplicateLinkRow,
    item_a: Item,
    item_b: Item,
    keep_item_id: str | None,
    actor: str,
    db: Session,
) -> None:
    """Keep one item, reject the other, copy any non-empty fields from the rejected one."""
    if not keep_item_id:
        raise DuplicateResolutionError(
            "keep_item_id is required for merge action.",
            details={"item_a": item_a.id, "item_b": item_b.id},
        )

    if keep_item_id == item_a.id:
        kept, discarded = item_a, item_b
    elif keep_item_id == item_b.id:
        kept, discarded = item_b, item_a
    else:
        raise DuplicateResolutionError(
            f"keep_item_id '{keep_item_id}' is not one of the linked items.",
            details={"item_a": item_a.id, "item_b": item_b.id},
        )

    diff: dict = {}

    # Copy non-empty fields from discarded → kept (only fill gaps)
    if not kept.owner and discarded.owner:
        diff["owner"] = [kept.owner, discarded.owner]
        kept.owner = discarded.owner

    if not kept.deadline and discarded.deadline:
        diff["deadline"] = [str(kept.deadline), str(discarded.deadline)]
        kept.deadline = discarded.deadline

    if not kept.description and discarded.description:
        diff["description"] = ["", discarded.description[:50] + "..."]
        kept.description = discarded.description

    kept.updated_at = datetime.now(timezone.utc)

    # Reject the discarded item (only if not already rejected/done)
    if discarded.status not in (ItemStatus.REJECTED.value, ItemStatus.DONE.value):
        transition(db, discarded, ItemStatus.REJECTED, actor=actor,
                   reason=f"Merged into item {kept.id}")

    # Audit both items
    _write_audit(kept, "DUPLICATE_MERGE_KEPT", actor,
                 {"merged_from": discarded.id, "fields_copied": list(diff.keys())}, db)
    _write_audit(discarded, "DUPLICATE_MERGE_REJECTED", actor,
                 {"merged_into": kept.id}, db)

    db.flush()
    logger.info("Merge: kept=%s rejected=%s fields_copied=%s", kept.id, discarded.id, list(diff.keys()))


# ── Reject one ────────────────────────────────────────────────────────────────

def _do_reject_one(
    link: DuplicateLinkRow,
    item_a: Item,
    item_b: Item,
    keep_item_id: str,
    actor: str,
    db: Session,
) -> None:
    if keep_item_id == item_a.id:
        kept, discarded = item_a, item_b
    elif keep_item_id == item_b.id:
        kept, discarded = item_b, item_a
    else:
        raise DuplicateResolutionError(
            f"keep_item_id '{keep_item_id}' is not one of the linked items."
        )

    if discarded.status not in (ItemStatus.REJECTED.value, ItemStatus.DONE.value):
        transition(db, discarded, ItemStatus.REJECTED, actor=actor,
                   reason=f"Rejected as duplicate of item {kept.id}")

    _write_audit(kept, "DUPLICATE_REJECT_ONE_KEPT", actor, {"rejected": discarded.id}, db)
    _write_audit(discarded, "DUPLICATE_REJECT_ONE_DISCARDED", actor, {"kept": kept.id}, db)
    db.flush()
    logger.info("Reject-one: kept=%s rejected=%s", kept.id, discarded.id)


# ── Audit helpers ─────────────────────────────────────────────────────────────

def _write_audit(item: Item, action: str, actor: str, diff: dict, db: Session) -> None:
    log = AuditLog(
        item_id=item.id,
        action=action,
        actor=actor,
        diff_json=json.dumps(diff),
        ts=datetime.now(timezone.utc),
    )
    db.add(log)


def _write_link_audit(
    item_a: Item, item_b: Item, action: str, actor: str, db: Session
) -> None:
    for item in (item_a, item_b):
        _write_audit(item, action, actor, {"linked_item": item_b.id if item is item_a else item_a.id}, db)
