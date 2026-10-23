"""
Item endpoints.

PATCH  /items/{id}              edit item fields
POST   /items/{id}/approve      approve
POST   /items/{id}/reject       reject
POST   /items/{id}/unapprove    send back to READY_FOR_REVIEW
POST   /items/{id}/clarify      answer an ambiguity flag
GET    /items/{id}/audit        full audit history
"""
import json
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Item, DuplicateLinkRow
from ..schemas import (
    ItemOut, ItemEditRequest, ApproveRequest, RejectRequest,
    ClarifyRequest, AuditLogOut, DuplicateLinkOut,
)
from ..services.item_service import (
    edit_item, approve_item, reject_item, unapprove_item,
    clarify_item, get_audit_log,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Serialisation helper (same pattern as meetings router) ────────────────────

def _serialize_item(item: Item, db: Session) -> ItemOut:
    flags = json.loads(item.flags_json or "[]")

    links_a = db.query(DuplicateLinkRow).filter(DuplicateLinkRow.item_a_id == item.id).all()
    links_b = db.query(DuplicateLinkRow).filter(DuplicateLinkRow.item_b_id == item.id).all()

    dup_links = [
        DuplicateLinkOut(
            id=lnk.id,
            relation=lnk.relation,
            score=lnk.score,
            explanation=lnk.explanation,
            resolution=lnk.resolution,
            item_a=None,
            item_b=None,
        )
        for lnk in links_a + links_b
    ]

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
        duplicate_links=dup_links,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@router.patch("/items/{item_id}", response_model=ItemOut)
def patch_item(
    item_id: str,
    body: ItemEditRequest,
    actor: str = Query(default="user"),
    db: Session = Depends(get_db),
):
    """
    Partially edit an item.
    Only send the fields you want to change.
    Editing owner/deadline automatically clears related ambiguity flags
    and may auto-transition the item to READY_FOR_REVIEW.
    """
    item = edit_item(item_id, body, actor=actor, db=db)
    return _serialize_item(item, db)


@router.post("/items/{item_id}/approve", response_model=ItemOut)
def approve(
    item_id: str,
    body: ApproveRequest,
    db: Session = Depends(get_db),
):
    """
    Approve an item (must be READY_FOR_REVIEW).
    Validates:
    - No unresolved owner ambiguity flags
    - ACTION_ITEM / FOLLOW_UP must have a non-empty owner
    - SUGGESTION / OPEN_QUESTION must be converted first
    """
    item = approve_item(item_id, actor=body.actor, db=db)
    return _serialize_item(item, db)


@router.post("/items/{item_id}/reject", response_model=ItemOut)
def reject(
    item_id: str,
    body: RejectRequest,
    db: Session = Depends(get_db),
):
    """Reject an item. Terminal — cannot be undone."""
    item = reject_item(item_id, actor=body.actor, reason=body.reason, db=db)
    return _serialize_item(item, db)


@router.post("/items/{item_id}/unapprove", response_model=ItemOut)
def unapprove(
    item_id: str,
    body: ApproveRequest,
    db: Session = Depends(get_db),
):
    """
    Send an APPROVED item back to READY_FOR_REVIEW.
    Use this if you approved something by mistake before pushing to Trello.
    """
    item = unapprove_item(item_id, actor=body.actor, db=db)
    return _serialize_item(item, db)


@router.post("/items/{item_id}/clarify", response_model=ItemOut)
def clarify(
    item_id: str,
    body: ClarifyRequest,
    db: Session = Depends(get_db),
):
    """
    Submit a clarification for an ambiguous field.
    
    Supported fields:
    - owner   → clears NO_OWNER / VAGUE_OWNER / MULTIPLE_OWNERS flags
    - deadline → clears VAGUE_DEADLINE / NO_DEADLINE flags (value must be YYYY-MM-DD)
    
    If all flags are cleared the item automatically moves to READY_FOR_REVIEW.
    """
    item = clarify_item(item_id, body=body, db=db)
    return _serialize_item(item, db)


@router.get("/items/{item_id}/audit", response_model=list[AuditLogOut])
def audit_log(
    item_id: str,
    db: Session = Depends(get_db),
):
    """
    Return the full audit history for an item in chronological order.
    Every status change, edit, and clarification is recorded here.
    """
    logs = get_audit_log(item_id, db=db)
    return [
        AuditLogOut(
            id=log.id,
            item_id=log.item_id,
            action=log.action,
            actor=log.actor,
            diff=json.loads(log.diff_json or "{}"),
            ts=log.ts,
        )
        for log in logs
    ]
