"""
Dashboard endpoints.

GET  /dashboard?meeting_id=   aggregated stats, overdue, unassigned
POST /sync                    manually trigger Trello sync
GET  /health                  service health check
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Item, Meeting
from ..schemas import (
    DashboardOut, OverdueItem, ItemOut, SyncResult, HealthOut, ItemStatus,
)
from ..services.tracking import (
    get_status_counts,
    get_overdue_items,
    get_unassigned_items,
    get_awaiting_clarification_count,
    get_pending_from_previous_meetings,
)

logger = logging.getLogger(__name__)
settings = get_settings()
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


def _item_to_overdue(item: Item) -> OverdueItem:
    return OverdueItem(
        id=item.id,
        title=item.title,
        owner=item.owner,
        deadline=item.deadline,
        status=ItemStatus(item.status),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/health", response_model=HealthOut)
def health():
    """Service health check. Always returns 200 if the app is running."""
    return HealthOut(status="ok", version=settings.APP_VERSION)


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    meeting_id: Optional[str] = Query(
        default=None,
        description="Scope stats to a specific meeting. Omit for global stats.",
    ),
    db: Session = Depends(get_db),
):
    """
    Aggregated dashboard stats.

    - **counts**: item counts grouped by status
    - **overdue**: items with deadline < today (not DONE/REJECTED)
    - **unassigned**: ACTION_ITEM / FOLLOW_UP with no owner
    - **awaiting_clarification**: count of NEEDS_CLARIFICATION items
    - **pending_from_previous_meetings**: APPROVED/SYNCED items from older meetings
    """
    counts = get_status_counts(db, meeting_id)
    overdue = get_overdue_items(db, meeting_id)
    unassigned = get_unassigned_items(db, meeting_id)
    awaiting = get_awaiting_clarification_count(db, meeting_id)
    pending = get_pending_from_previous_meetings(db, meeting_id)

    return DashboardOut(
        counts=counts,
        overdue=[_item_to_overdue(i) for i in overdue],
        unassigned=[_item_to_out(i) for i in unassigned],
        awaiting_clarification=awaiting,
        pending_from_previous_meetings=[_item_to_out(i) for i in pending],
    )


@router.post("/sync", response_model=SyncResult)
def manual_sync(db: Session = Depends(get_db)):
    """
    Manually trigger a Trello sync.

    Checks all SYNCED items with an external_id against Trello.
    If a card is in the Done list, the item is transitioned to DONE.

    Returns the count of items checked and transitioned.
    """
    from ..services.scheduler import run_sync_now
    result = run_sync_now(db)
    return SyncResult(**result)
