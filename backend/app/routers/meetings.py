"""
Meeting endpoints.

POST   /meetings                    create meeting
POST   /meetings/{id}/extract       trigger AI extraction (202 + background task)
GET    /meetings                    list all meetings
GET    /meetings/{id}               get single meeting with full detail
GET    /meetings/{id}/items         list items with optional type/status filters
POST   /meetings/{id}/approve-all-ready   bulk approve all READY_FOR_REVIEW items
GET    /meetings/{id}/export        export items as CSV or JSON
POST   /meetings/{id}/push          push to Trello / GitHub
"""
import json
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Meeting, Item, DuplicateLinkRow
from ..schemas import (
    MeetingIn, MeetingOut, MeetingDetailOut, ItemOut, ItemType,
    ItemStatus, MeetingStatus, ApproveAllResult, DuplicateLinkOut,
    PushResult, PushItemResult,
)
from ..errors import NotFoundError, InvalidTransitionError
from ..state_machine import transition, ItemStatus as IS
from ..services.extraction_job import run_extraction
from ..integrations.trello import TrelloClient, get_trello_client
from ..integrations.exporter import export_csv, export_json
from ..integrations.base import TaskSink

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_meeting_or_404(meeting_id: str, db: Session) -> Meeting:
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise NotFoundError(f"Meeting '{meeting_id}' not found.")
    return meeting


def _serialize_item(item: Item, db: Session) -> ItemOut:
    """Convert an ORM Item to ItemOut, including any duplicate links."""
    flags = json.loads(item.flags_json or "[]")

    # Gather duplicate links where this item appears on either side
    links_a = db.query(DuplicateLinkRow).filter(DuplicateLinkRow.item_a_id == item.id).all()
    links_b = db.query(DuplicateLinkRow).filter(DuplicateLinkRow.item_b_id == item.id).all()

    dup_links = []
    for link in links_a + links_b:
        dup_links.append(
            DuplicateLinkOut(
                id=link.id,
                relation=link.relation,
                score=link.score,
                explanation=link.explanation,
                resolution=link.resolution,
                item_a=None,  # avoid deep recursion in list views
                item_b=None,
            )
        )

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


def _serialize_meeting(m: Meeting) -> MeetingOut:
    participants = json.loads(m.participants_json or "[]")
    return MeetingOut(
        id=m.id,
        title=m.title,
        date=m.date,
        participants=participants,
        status=m.status,
        error_message=m.error_message,
        created_at=m.created_at,
    )


def _serialize_meeting_detail(m: Meeting) -> MeetingDetailOut:
    participants = json.loads(m.participants_json or "[]")
    return MeetingDetailOut(
        id=m.id,
        title=m.title,
        date=m.date,
        participants=participants,
        status=m.status,
        error_message=m.error_message,
        created_at=m.created_at,
        raw_text=m.raw_text,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/meetings", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
def create_meeting(body: MeetingIn, db: Session = Depends(get_db)):
    """Create a new meeting record. Does NOT trigger extraction yet."""
    meeting = Meeting(
        title=body.title,
        date=body.date,
        raw_text=body.raw_text,
        participants_json=json.dumps(body.participants),
        status=MeetingStatus.CREATED.value,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    logger.info("Created meeting '%s' (id=%s)", meeting.title, meeting.id)
    return _serialize_meeting(meeting)


@router.post("/meetings/{meeting_id}/extract", status_code=status.HTTP_202_ACCEPTED)
def extract_meeting(
    meeting_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Trigger AI extraction for a meeting.
    Returns 202 immediately; extraction runs in the background.
    Poll GET /meetings/{id} until status is EXTRACTED or FAILED.
    """
    meeting = _get_meeting_or_404(meeting_id, db)

    if meeting.status == MeetingStatus.EXTRACTING.value:
        raise HTTPException(status_code=409, detail="Extraction already in progress.")

    # Mark as extracting immediately so the client can start polling
    meeting.status = MeetingStatus.EXTRACTING.value
    meeting.error_message = None
    db.commit()

    # The background task gets its OWN db session (can't share across threads)
    def _run(mid: str):
        from ..db import SessionLocal
        bg_db = SessionLocal()
        try:
            run_extraction(mid, bg_db)
        finally:
            bg_db.close()

    background_tasks.add_task(_run, meeting_id)
    logger.info("Extraction triggered for meeting %s", meeting_id)

    return {"message": "Extraction started", "meeting_id": meeting_id}


@router.get("/meetings", response_model=list[MeetingOut])
def list_meetings(db: Session = Depends(get_db)):
    """List all meetings ordered by creation date descending."""
    meetings = db.query(Meeting).order_by(Meeting.created_at.desc()).all()
    return [_serialize_meeting(m) for m in meetings]


@router.get("/meetings/{meeting_id}", response_model=MeetingDetailOut)
def get_meeting(meeting_id: str, db: Session = Depends(get_db)):
    """Get a single meeting including raw_text and participants."""
    meeting = _get_meeting_or_404(meeting_id, db)
    return _serialize_meeting_detail(meeting)


@router.get("/meetings/{meeting_id}/items", response_model=list[ItemOut])
def list_items(
    meeting_id: str,
    type: Optional[ItemType] = Query(default=None, description="Filter by item type"),
    status: Optional[ItemStatus] = Query(default=None, description="Filter by status"),
    db: Session = Depends(get_db),
):
    """
    List items for a meeting.
    Optionally filter by type and/or status.
    """
    _get_meeting_or_404(meeting_id, db)

    query = db.query(Item).filter(Item.meeting_id == meeting_id)
    if type is not None:
        query = query.filter(Item.type == type.value)
    if status is not None:
        query = query.filter(Item.status == status.value)

    items = query.order_by(Item.created_at.asc()).all()
    return [_serialize_item(it, db) for it in items]


@router.post("/meetings/{meeting_id}/approve-all-ready", response_model=ApproveAllResult)
def approve_all_ready(
    meeting_id: str,
    actor: str = Query(default="user", description="Actor performing the approval"),
    db: Session = Depends(get_db),
):
    """
    Approve every READY_FOR_REVIEW item in this meeting.
    Items that fail validation are returned in the 'skipped' list with reasons.
    """
    _get_meeting_or_404(meeting_id, db)

    ready_items = (
        db.query(Item)
        .filter(
            Item.meeting_id == meeting_id,
            Item.status == ItemStatus.READY_FOR_REVIEW.value,
        )
        .all()
    )

    approved_ids: list[str] = []
    skipped: list[dict[str, str]] = []

    for item in ready_items:
        try:
            transition(db, item, ItemStatus.APPROVED, actor=actor)
            approved_ids.append(item.id)
        except InvalidTransitionError as exc:
            skipped.append({"id": item.id, "title": item.title, "reason": exc.message})

    db.commit()
    logger.info(
        "approve-all-ready: meeting=%s approved=%d skipped=%d",
        meeting_id, len(approved_ids), len(skipped),
    )
    return ApproveAllResult(approved=approved_ids, skipped=skipped)


@router.get("/meetings/{meeting_id}/export")
def export_items(
    meeting_id: str,
    format: str = Query(default="json", description="csv or json"),
    only: str = Query(default="approved", description="approved or all"),
    db: Session = Depends(get_db),
):
    """
    Export meeting items as CSV or JSON.

    - format=csv  → downloadable CSV file
    - format=json → downloadable JSON file
    - only=approved (default) → only APPROVED, SYNCED, DONE items
    - only=all → all items regardless of status
    """
    _get_meeting_or_404(meeting_id, db)
    only_approved = only.lower() != "all"

    if format.lower() == "csv":
        content, filename = export_csv(db, meeting_id, only_approved=only_approved)
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    else:
        content, filename = export_json(db, meeting_id, only_approved=only_approved)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


@router.post("/meetings/{meeting_id}/push", response_model=PushResult)
def push_to_integration(
    meeting_id: str,
    target: str = Query(default="trello", description="trello or github"),
    dry_run: bool = Query(default=True, description="Preview without creating cards"),
    actor: str = Query(default="user"),
    db: Session = Depends(get_db),
    trello_client: TrelloClient = Depends(get_trello_client),
):
    """
    Push APPROVED items to Trello (or GitHub).

    - dry_run=true  (default): returns what WOULD be pushed, no side effects
    - dry_run=false: creates cards, transitions items to SYNCED

    Only APPROVED items are pushed. One failure does not abort the others.
    """
    _get_meeting_or_404(meeting_id, db)

    # Select the right sink
    sink: TaskSink
    if target.lower() == "github":
        from ..integrations.github import GitHubClient
        sink = GitHubClient()
    else:
        sink = trello_client

    # Get all APPROVED items for this meeting
    approved_items = (
        db.query(Item)
        .filter(
            Item.meeting_id == meeting_id,
            Item.status == ItemStatus.APPROVED.value,
        )
        .all()
    )

    meeting = db.get(Meeting, meeting_id)
    pushed: list[PushItemResult] = []
    failed: list[PushItemResult] = []

    for item in approved_items:
        result = PushItemResult(
            item_id=item.id,
            title=item.title,
            owner=item.owner,
            deadline=item.deadline,
            trello_url=None,
            error=None,
        )

        if dry_run:
            pushed.append(result)
            continue

        # Real push
        try:
            ref = sink.create_task(item, meeting)
            item.external_id  = ref.external_id
            item.external_url = ref.external_url
            transition(db, item, ItemStatus.SYNCED, actor=actor,
                       reason=f"Pushed to {target}")
            result.trello_url = ref.external_url
            pushed.append(result)
            logger.info("Pushed item %s to %s → %s", item.id, target, ref.external_url)
        except Exception as exc:
            logger.error("Push failed for item %s: %s", item.id, exc)
            result.error = str(exc)
            failed.append(result)

    if not dry_run:
        db.commit()

    logger.info(
        "Push (%s) meeting=%s dry_run=%s pushed=%d failed=%d",
        target, meeting_id, dry_run, len(pushed), len(failed),
    )
    return PushResult(dry_run=dry_run, pushed=pushed, failed=failed)
