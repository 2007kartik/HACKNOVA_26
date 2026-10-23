"""
SQLAlchemy ORM models.
All IDs are UUIDs stored as strings (works for both SQLite and Postgres).
All timestamps are UTC.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Float, Boolean, DateTime,
    Date, ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import relationship

from .db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


# ── Enums (stored as VARCHAR in DB) ──────────────────────────────────────────
import enum

class MeetingStatusEnum(str, enum.Enum):
    CREATED     = "CREATED"
    EXTRACTING  = "EXTRACTING"
    EXTRACTED   = "EXTRACTED"
    FAILED      = "FAILED"

class ItemTypeEnum(str, enum.Enum):
    ACTION_ITEM   = "ACTION_ITEM"
    DECISION      = "DECISION"
    SUGGESTION    = "SUGGESTION"
    OPEN_QUESTION = "OPEN_QUESTION"
    FOLLOW_UP     = "FOLLOW_UP"

class CommitmentLevelEnum(str, enum.Enum):
    CONFIRMED  = "CONFIRMED"
    PROPOSED   = "PROPOSED"
    UNRESOLVED = "UNRESOLVED"

class ItemStatusEnum(str, enum.Enum):
    EXTRACTED            = "EXTRACTED"
    NEEDS_CLARIFICATION  = "NEEDS_CLARIFICATION"
    READY_FOR_REVIEW     = "READY_FOR_REVIEW"
    APPROVED             = "APPROVED"
    REJECTED             = "REJECTED"
    SYNCED               = "SYNCED"
    DONE                 = "DONE"

class LinkRelationEnum(str, enum.Enum):
    DUPLICATE = "DUPLICATE"
    CONFLICT  = "CONFLICT"
    RELATED   = "RELATED"

class LinkResolutionEnum(str, enum.Enum):
    PENDING      = "PENDING"
    MERGED       = "MERGED"
    KEPT_BOTH    = "KEPT_BOTH"
    REJECTED_ONE = "REJECTED_ONE"


# ── Meeting ───────────────────────────────────────────────────────────────────
class Meeting(Base):
    __tablename__ = "meetings"

    id                = Column(String, primary_key=True, default=_uuid)
    title             = Column(String, nullable=False)
    date              = Column(Date, nullable=False)
    raw_text          = Column(Text, nullable=False)
    participants_json = Column(Text, nullable=False, default="[]")  # JSON array string
    status            = Column(
        SAEnum(MeetingStatusEnum, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=MeetingStatusEnum.CREATED,
    )
    error_message     = Column(Text, nullable=True)
    created_at        = Column(DateTime(timezone=True), nullable=False, default=_now)

    # Relationships
    items  = relationship("Item", back_populates="meeting", cascade="all, delete-orphan")
    links  = relationship("DuplicateLinkRow", back_populates="meeting", cascade="all, delete-orphan")


# ── Item ──────────────────────────────────────────────────────────────────────
class Item(Base):
    __tablename__ = "items"

    id               = Column(String, primary_key=True, default=_uuid)
    meeting_id       = Column(String, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)

    type             = Column(
        SAEnum(ItemTypeEnum, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    commitment_level = Column(
        SAEnum(CommitmentLevelEnum, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    title            = Column(String, nullable=False)
    description      = Column(Text, nullable=False, default="")
    owner            = Column(String, nullable=True)
    deadline         = Column(Date, nullable=True)
    evidence_quote   = Column(Text, nullable=False, default="")
    speaker          = Column(String, nullable=True)
    timestamp        = Column(String, nullable=True)   # free-form string from transcript
    confidence       = Column(Float, nullable=False, default=0.0)
    flags_json       = Column(Text, nullable=False, default="[]")  # JSON array of flag strings
    status           = Column(
        SAEnum(ItemStatusEnum, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=ItemStatusEnum.EXTRACTED,
    )
    reasoning        = Column(Text, nullable=False, default="")
    external_id      = Column(String, nullable=True)   # Trello card ID
    external_url     = Column(String, nullable=True)   # Trello card URL
    created_at       = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at       = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)

    # Relationships
    meeting        = relationship("Meeting", back_populates="items")
    clarifications = relationship("Clarification", back_populates="item", cascade="all, delete-orphan")
    audit_logs     = relationship("AuditLog", back_populates="item", cascade="all, delete-orphan")

    # Duplicate links where this item is on either side
    links_as_a = relationship(
        "DuplicateLinkRow",
        foreign_keys="DuplicateLinkRow.item_a_id",
        back_populates="item_a",
        cascade="all, delete-orphan",
    )
    links_as_b = relationship(
        "DuplicateLinkRow",
        foreign_keys="DuplicateLinkRow.item_b_id",
        back_populates="item_b",
        cascade="all, delete-orphan",
    )


# ── DuplicateLinkRow ──────────────────────────────────────────────────────────
class DuplicateLinkRow(Base):
    __tablename__ = "duplicate_links"

    id         = Column(String, primary_key=True, default=_uuid)
    meeting_id = Column(String, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    item_a_id  = Column(String, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    item_b_id  = Column(String, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    relation   = Column(
        SAEnum(LinkRelationEnum, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    score       = Column(Float, nullable=False, default=0.0)
    explanation = Column(Text, nullable=False, default="")
    resolution  = Column(
        SAEnum(LinkResolutionEnum, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=LinkResolutionEnum.PENDING,
    )

    # Relationships
    meeting = relationship("Meeting", back_populates="links")
    item_a  = relationship("Item", foreign_keys=[item_a_id], back_populates="links_as_a")
    item_b  = relationship("Item", foreign_keys=[item_b_id], back_populates="links_as_b")


# ── Clarification ─────────────────────────────────────────────────────────────
class Clarification(Base):
    __tablename__ = "clarifications"

    id       = Column(String, primary_key=True, default=_uuid)
    item_id  = Column(String, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    field    = Column(String, nullable=False)   # e.g. "owner", "deadline"
    question = Column(Text, nullable=False, default="")
    answer   = Column(Text, nullable=True)
    resolved = Column(Boolean, nullable=False, default=False)

    # Relationship
    item = relationship("Item", back_populates="clarifications")


# ── AuditLog ──────────────────────────────────────────────────────────────────
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id        = Column(String, primary_key=True, default=_uuid)
    item_id   = Column(String, ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    action    = Column(String, nullable=False)   # e.g. "TRANSITION", "EDIT", "CLARIFY"
    actor     = Column(String, nullable=False, default="system")
    diff_json = Column(Text, nullable=False, default="{}")  # JSON: {field: [old, new]}
    ts        = Column(DateTime(timezone=True), nullable=False, default=_now)

    # Relationship
    item = relationship("Item", back_populates="audit_logs")


# ── Member ────────────────────────────────────────────────────────────────────
class Member(Base):
    __tablename__ = "members"

    id               = Column(String, primary_key=True, default=_uuid)
    name             = Column(String, nullable=False, unique=True)
    email            = Column(String, nullable=True)
    trello_member_id = Column(String, nullable=True)
    github_login     = Column(String, nullable=True)
