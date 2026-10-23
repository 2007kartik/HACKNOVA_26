"""
Pydantic v2 schemas.

This file is the shared contract between:
  - The AI pipeline (input: MeetingIn, output: PipelineResult)
  - The API layer (request/response models for every endpoint)

Nothing outside this file should define its own item/meeting shapes.
"""
from __future__ import annotations

import enum
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


# ═══════════════════════════════════════════════════════════════════════════════
# Enums
# ═══════════════════════════════════════════════════════════════════════════════

class ItemType(str, enum.Enum):
    ACTION_ITEM   = "ACTION_ITEM"
    DECISION      = "DECISION"
    SUGGESTION    = "SUGGESTION"
    OPEN_QUESTION = "OPEN_QUESTION"
    FOLLOW_UP     = "FOLLOW_UP"


class CommitmentLevel(str, enum.Enum):
    CONFIRMED  = "CONFIRMED"
    PROPOSED   = "PROPOSED"
    UNRESOLVED = "UNRESOLVED"


class ItemStatus(str, enum.Enum):
    EXTRACTED           = "EXTRACTED"
    NEEDS_CLARIFICATION = "NEEDS_CLARIFICATION"
    READY_FOR_REVIEW    = "READY_FOR_REVIEW"
    APPROVED            = "APPROVED"
    REJECTED            = "REJECTED"
    SYNCED              = "SYNCED"
    DONE                = "DONE"


class MeetingStatus(str, enum.Enum):
    CREATED    = "CREATED"
    EXTRACTING = "EXTRACTING"
    EXTRACTED  = "EXTRACTED"
    FAILED     = "FAILED"


class LinkRelation(str, enum.Enum):
    DUPLICATE = "DUPLICATE"
    CONFLICT  = "CONFLICT"
    RELATED   = "RELATED"


class LinkResolution(str, enum.Enum):
    PENDING      = "PENDING"
    MERGED       = "MERGED"
    KEPT_BOTH    = "KEPT_BOTH"
    REJECTED_ONE = "REJECTED_ONE"


class AmbiguityFlag(str, enum.Enum):
    NO_OWNER        = "NO_OWNER"
    VAGUE_OWNER     = "VAGUE_OWNER"
    MULTIPLE_OWNERS = "MULTIPLE_OWNERS"
    VAGUE_DEADLINE  = "VAGUE_DEADLINE"
    NO_DEADLINE     = "NO_DEADLINE"


# ═══════════════════════════════════════════════════════════════════════════════
# AI Pipeline contract  (shared with AI pipeline — do NOT change without
# coordinating with the pipeline implementation)
# ═══════════════════════════════════════════════════════════════════════════════

class ExtractedItem(BaseModel):
    """One item as returned by the AI pipeline."""
    type:               ItemType
    commitment_level:   CommitmentLevel
    title:              str
    description:        str = ""
    owner_raw:          Optional[str] = None   # verbatim from transcript
    owner_resolved:     Optional[str] = None   # normalised display name
    deadline_raw:       Optional[str] = None   # verbatim ("next Friday")
    deadline_resolved:  Optional[date] = None  # ISO date if parseable
    evidence_quote:     str = ""
    speaker:            Optional[str] = None
    timestamp:          Optional[str] = None
    confidence:         float = Field(ge=0.0, le=1.0)
    ambiguity_flags:    List[AmbiguityFlag] = Field(default_factory=list)
    reasoning:          str = ""


class DuplicateLink(BaseModel):
    """A pair of items the AI believes are duplicate/conflicting."""
    item_a_idx:  int          # index into PipelineResult.items
    item_b_idx:  int
    relation:    LinkRelation
    score:       float = Field(ge=0.0, le=1.0)
    explanation: str = ""


class MeetingIn(BaseModel):
    """What the user submits to create a meeting."""
    title:        str
    date:         date
    participants: List[str] = Field(default_factory=list)
    raw_text:     str


class ExistingTask(BaseModel):
    """A task from a previous meeting, supplied to the pipeline for dedup context."""
    id:         str
    title:      str
    owner:      Optional[str] = None
    deadline:   Optional[date] = None
    status:     ItemStatus
    meeting_id: str


class PipelineResult(BaseModel):
    """What the AI pipeline returns."""
    items:                List[ExtractedItem]
    links:                List[DuplicateLink] = Field(default_factory=list)
    participants_detected: List[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
# API response models
# ═══════════════════════════════════════════════════════════════════════════════

class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:            str
    title:         str
    date:          date
    participants:  List[str] = Field(default_factory=list)
    status:        MeetingStatus
    error_message: Optional[str] = None
    created_at:    datetime


class MeetingDetailOut(MeetingOut):
    raw_text: str


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:               str
    meeting_id:       str
    type:             ItemType
    commitment_level: CommitmentLevel
    title:            str
    description:      str
    owner:            Optional[str] = None
    deadline:         Optional[date] = None
    evidence_quote:   str
    speaker:          Optional[str] = None
    timestamp:        Optional[str] = None
    confidence:       float
    flags:            List[str] = Field(default_factory=list)
    status:           ItemStatus
    reasoning:        str
    external_id:      Optional[str] = None
    external_url:     Optional[str] = None
    created_at:       datetime
    updated_at:       datetime
    duplicate_links:  List["DuplicateLinkOut"] = Field(default_factory=list)


class DuplicateLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:         str
    relation:   LinkRelation
    score:      float
    explanation: str
    resolution: LinkResolution
    item_a:     Optional[ItemOut] = None
    item_b:     Optional[ItemOut] = None


class ClarificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:       str
    item_id:  str
    field:    str
    question: str
    answer:   Optional[str] = None
    resolved: bool


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:        str
    item_id:   str
    action:    str
    actor:     str
    diff:      Dict[str, Any] = Field(default_factory=dict)
    ts:        datetime


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:               str
    name:             str
    email:            Optional[str] = None
    trello_member_id: Optional[str] = None
    github_login:     Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# API request bodies
# ═══════════════════════════════════════════════════════════════════════════════

class ItemEditRequest(BaseModel):
    title:            Optional[str] = None
    description:      Optional[str] = None
    owner:            Optional[str] = None
    deadline:         Optional[date] = None
    type:             Optional[ItemType] = None
    commitment_level: Optional[CommitmentLevel] = None


class ApproveRequest(BaseModel):
    actor: str = "user"


class RejectRequest(BaseModel):
    actor:  str = "user"
    reason: Optional[str] = None


class ClarifyRequest(BaseModel):
    field:  str
    answer: str


class ResolveDuplicateRequest(BaseModel):
    action:       str  # "merge" | "keep_both" | "reject_one"
    keep_item_id: Optional[str] = None


class MemberCreateRequest(BaseModel):
    name:             str
    email:            Optional[str] = None
    trello_member_id: Optional[str] = None
    github_login:     Optional[str] = None


class MemberUpdateRequest(BaseModel):
    name:             Optional[str] = None
    email:            Optional[str] = None
    trello_member_id: Optional[str] = None
    github_login:     Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# Dashboard
# ═══════════════════════════════════════════════════════════════════════════════

class OverdueItem(BaseModel):
    id:       str
    title:    str
    owner:    Optional[str]
    deadline: Optional[date]
    status:   ItemStatus


class DashboardOut(BaseModel):
    counts:                         Dict[str, int]
    overdue:                        List[OverdueItem]
    unassigned:                     List[ItemOut]
    awaiting_clarification:         int
    pending_from_previous_meetings: List[ItemOut]


class SyncResult(BaseModel):
    synced_to_done: int
    items_checked:  int


class HealthOut(BaseModel):
    status:  str
    version: str


# ═══════════════════════════════════════════════════════════════════════════════
# Push / Export
# ═══════════════════════════════════════════════════════════════════════════════

class PushItemResult(BaseModel):
    item_id:    str
    title:      str
    owner:      Optional[str]
    deadline:   Optional[date]
    trello_url: Optional[str] = None
    error:      Optional[str] = None


class PushResult(BaseModel):
    dry_run: bool
    pushed:  List[PushItemResult]
    failed:  List[PushItemResult]


class ApproveAllResult(BaseModel):
    approved: List[str]
    skipped:  List[Dict[str, str]]


# ── Rebuild forward references ────────────────────────────────────────────────
ItemOut.model_rebuild()
DuplicateLinkOut.model_rebuild()
