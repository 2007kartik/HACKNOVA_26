"""
Duplicate / conflict link endpoints.

GET  /meetings/{id}/duplicates          list links for a meeting
POST /duplicates/{id}/resolve           resolve a link
"""
import json
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import DuplicateLinkRow, Item
from ..schemas import ItemOut, DuplicateLinkOut, ItemStatus
from ..errors import NotFoundError
from ..services.dedupe_service import resolve_link

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Serialise helpers ─────────────────────────────────────────────────────────

def _item_to_out(item: Item) -> ItemOut:
    flags = json.loads(item.flags_json or "[]")
    return ItemOut(
        id=item.id,
        meeting_id=item.meeting_id,
        type=item.type,
        commitment_level=item.commitment_level,
        title=item.title,
        description=item.description or "",
        owner=item.owner,
        deadline=item.deadline,
        evidence_quote=item.evidence_quote or "",
        speaker=item.speaker,
        timestamp=item.timestamp,
        confidence=item.confidence,
        flags=flags,
        status=item.status,
        reasoning=item.reasoning or "",
        external_id=item.external_id,
        external_url=item.external_url,
        created_at=item.created_at,
        updated_at=item.updated_at,
        duplicate_links=[],
    )


def _link_to_out(link: DuplicateLinkRow, expand: bool = True) -> DuplicateLinkOut:
    return DuplicateLinkOut(
        id=link.id,
        relation=link.relation,
        score=link.score,
        explanation=link.explanation,
        resolution=link.resolution,
        item_a=_item_to_out(link.item_a) if expand and link.item_a else None,
        item_b=_item_to_out(link.item_b) if expand and link.item_b else None,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

from ..schemas import ResolveDuplicateRequest


@router.get("/meetings/{meeting_id}/duplicates", response_model=list[DuplicateLinkOut])
def list_duplicates(
    meeting_id: str,
    db: Session = Depends(get_db),
):
    """
    List all duplicate/conflict links for a meeting.
    Both items are expanded inline so the frontend can show a side-by-side comparison.
    """
    from ..models import Meeting
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise NotFoundError(f"Meeting '{meeting_id}' not found.")

    links = (
        db.query(DuplicateLinkRow)
        .filter(DuplicateLinkRow.meeting_id == meeting_id)
        .all()
    )
    return [_link_to_out(link, expand=True) for link in links]


@router.post("/duplicates/{link_id}/resolve", response_model=DuplicateLinkOut)
def resolve_duplicate(
    link_id: str,
    body: ResolveDuplicateRequest,
    actor: str = Query(default="user"),
    db: Session = Depends(get_db),
):
    """
    Resolve a duplicate/conflict link.

    Actions:
    - **merge**: Keep one item, reject the other. Copies missing fields (owner, deadline)
      from the discarded item to the kept item. Requires keep_item_id.
    - **keep_both**: Mark as resolved but keep both items active.
    - **reject_one**: Reject one specific item. Requires keep_item_id.
    """
    link = resolve_link(
        link_id=link_id,
        action=body.action,
        keep_item_id=body.keep_item_id,
        actor=actor,
        db=db,
    )
    return _link_to_out(link, expand=True)
