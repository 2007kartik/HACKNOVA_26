"""
CSV and JSON exporter.

Exports meeting items to a structured file.
This is the fallback when Trello is not configured and the primary
way to hand off tasks to any external tool via file download.
"""
import csv
import io
import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

from ..models import Item, Meeting
from ..schemas import ItemStatus

logger = logging.getLogger(__name__)

# Columns in export order
EXPORT_COLUMNS = [
    "id", "title", "type", "commitment_level", "owner",
    "deadline", "status", "evidence_quote", "meeting_title", "meeting_date",
    "confidence", "reasoning",
]


def _item_to_row(item: Item, meeting: Meeting) -> dict:
    """Convert an ORM Item to a flat export row."""
    return {
        "id":               item.id,
        "title":            item.title,
        "type":             item.type,
        "commitment_level": item.commitment_level,
        "owner":            item.owner or "",
        "deadline":         str(item.deadline) if item.deadline else "",
        "status":           item.status,
        "evidence_quote":   item.evidence_quote or "",
        "meeting_title":    meeting.title,
        "meeting_date":     str(meeting.date),
        "confidence":       round(item.confidence, 3),
        "reasoning":        item.reasoning or "",
    }


def _get_items(
    db: Session,
    meeting_id: str,
    only_approved: bool,
) -> tuple[list[Item], Optional[Meeting]]:
    """Load items and meeting from DB with optional status filter."""
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        return [], None

    query = db.query(Item).filter(Item.meeting_id == meeting_id)
    if only_approved:
        # Export approved + synced + done (all "past the gate")
        query = query.filter(
            Item.status.in_([
                ItemStatus.APPROVED.value,
                ItemStatus.SYNCED.value,
                ItemStatus.DONE.value,
            ])
        )
    items = query.order_by(Item.created_at.asc()).all()
    return items, meeting


def export_csv(
    db: Session,
    meeting_id: str,
    only_approved: bool = True,
) -> tuple[str, str]:
    """
    Export items as CSV.

    Returns:
        (csv_content_string, filename)
    """
    items, meeting = _get_items(db, meeting_id, only_approved)
    if not meeting:
        return "", "export.csv"

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=EXPORT_COLUMNS)
    writer.writeheader()
    for item in items:
        writer.writerow(_item_to_row(item, meeting))

    filename = f"{meeting.title.replace(' ', '_')}_tasks.csv"
    logger.info("Exported %d items as CSV for meeting %s", len(items), meeting_id)
    return output.getvalue(), filename


def export_json(
    db: Session,
    meeting_id: str,
    only_approved: bool = True,
) -> tuple[str, str]:
    """
    Export items as JSON.

    Returns:
        (json_content_string, filename)
    """
    items, meeting = _get_items(db, meeting_id, only_approved)
    if not meeting:
        return "[]", "export.json"

    rows = [_item_to_row(item, meeting) for item in items]
    content = json.dumps(
        {
            "meeting": {
                "id":    meeting.id,
                "title": meeting.title,
                "date":  str(meeting.date),
            },
            "exported_count": len(rows),
            "items": rows,
        },
        indent=2,
        default=str,
    )

    filename = f"{meeting.title.replace(' ', '_')}_tasks.json"
    logger.info("Exported %d items as JSON for meeting %s", len(items), meeting_id)
    return content, filename
