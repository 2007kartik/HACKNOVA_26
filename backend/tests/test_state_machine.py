"""
State machine tests — T-23.

Covers:
- Every allowed transition succeeds
- Every disallowed transition raises InvalidTransitionError
- Approving a NEEDS_CLARIFICATION item fails
- Approving an ACTION_ITEM with no owner fails
- Approving an item with owner ambiguity flags fails
- Editing owner clears NO_OWNER flag and auto-transitions to READY_FOR_REVIEW
- Editing owner clears VAGUE_OWNER flag
- Editing deadline clears NO_DEADLINE / VAGUE_DEADLINE flags
- SUGGESTION / OPEN_QUESTION cannot be approved directly
- DECISION requires CONFIRMED commitment to be approved
- Every transition writes exactly one AuditLog row
- REJECTED and DONE are terminal (no further transitions)
"""
import json
import pytest
from datetime import date

from app.state_machine import transition, revalidate_flags, initial_status, ALLOWED_TRANSITIONS
from app.schemas import ItemStatus, ItemType, CommitmentLevel, AmbiguityFlag
from app.errors import InvalidTransitionError
from app.models import AuditLog

from .conftest import make_meeting, make_item


# ═══════════════════════════════════════════════════════════════════════════════
# initial_status()
# ═══════════════════════════════════════════════════════════════════════════════

class TestInitialStatus:
    def test_no_flags_gives_ready_for_review(self, db):
        m = make_meeting(db)
        item = make_item(db, m, flags=[], status=ItemStatus.EXTRACTED)
        assert initial_status(item) == ItemStatus.READY_FOR_REVIEW

    def test_any_flag_gives_needs_clarification(self, db):
        m = make_meeting(db)
        item = make_item(db, m, flags=["NO_OWNER"], status=ItemStatus.EXTRACTED)
        assert initial_status(item) == ItemStatus.NEEDS_CLARIFICATION

    def test_multiple_flags_gives_needs_clarification(self, db):
        m = make_meeting(db)
        item = make_item(db, m, flags=["NO_OWNER", "NO_DEADLINE"], status=ItemStatus.EXTRACTED)
        assert initial_status(item) == ItemStatus.NEEDS_CLARIFICATION


# ═══════════════════════════════════════════════════════════════════════════════
# Allowed transitions
# ═══════════════════════════════════════════════════════════════════════════════

class TestAllowedTransitions:
    def test_extracted_to_needs_clarification(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.EXTRACTED, flags=["NO_OWNER"], owner=None)
        transition(db, item, ItemStatus.NEEDS_CLARIFICATION, actor="system")
        assert item.status == ItemStatus.NEEDS_CLARIFICATION.value

    def test_extracted_to_ready_for_review(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.EXTRACTED, flags=[])
        transition(db, item, ItemStatus.READY_FOR_REVIEW, actor="system")
        assert item.status == ItemStatus.READY_FOR_REVIEW.value

    def test_needs_clarification_to_ready_for_review(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.NEEDS_CLARIFICATION, flags=[])
        transition(db, item, ItemStatus.READY_FOR_REVIEW, actor="user")
        assert item.status == ItemStatus.READY_FOR_REVIEW.value

    def test_needs_clarification_to_rejected(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.NEEDS_CLARIFICATION)
        transition(db, item, ItemStatus.REJECTED, actor="user")
        assert item.status == ItemStatus.REJECTED.value

    def test_ready_for_review_to_approved(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.READY_FOR_REVIEW, flags=[], owner="Alice")
        transition(db, item, ItemStatus.APPROVED, actor="user")
        assert item.status == ItemStatus.APPROVED.value

    def test_ready_for_review_to_rejected(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.READY_FOR_REVIEW)
        transition(db, item, ItemStatus.REJECTED, actor="user")
        assert item.status == ItemStatus.REJECTED.value

    def test_ready_for_review_to_needs_clarification(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.READY_FOR_REVIEW)
        transition(db, item, ItemStatus.NEEDS_CLARIFICATION, actor="user")
        assert item.status == ItemStatus.NEEDS_CLARIFICATION.value

    def test_approved_to_synced(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Alice")
        transition(db, item, ItemStatus.SYNCED, actor="system")
        assert item.status == ItemStatus.SYNCED.value

    def test_approved_to_unapproved(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Alice")
        transition(db, item, ItemStatus.READY_FOR_REVIEW, actor="user", reason="un-approve")
        assert item.status == ItemStatus.READY_FOR_REVIEW.value

    def test_approved_to_rejected(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Alice")
        transition(db, item, ItemStatus.REJECTED, actor="user")
        assert item.status == ItemStatus.REJECTED.value

    def test_synced_to_done(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.SYNCED, flags=[], owner="Alice")
        transition(db, item, ItemStatus.DONE, actor="system:scheduler")
        assert item.status == ItemStatus.DONE.value


# ═══════════════════════════════════════════════════════════════════════════════
# Disallowed transitions
# ═══════════════════════════════════════════════════════════════════════════════

class TestDisallowedTransitions:
    @pytest.mark.parametrize("from_status,to_status", [
        (ItemStatus.EXTRACTED,           ItemStatus.APPROVED),
        (ItemStatus.EXTRACTED,           ItemStatus.SYNCED),
        (ItemStatus.EXTRACTED,           ItemStatus.DONE),
        (ItemStatus.NEEDS_CLARIFICATION, ItemStatus.APPROVED),
        (ItemStatus.NEEDS_CLARIFICATION, ItemStatus.SYNCED),
        (ItemStatus.NEEDS_CLARIFICATION, ItemStatus.DONE),
        (ItemStatus.READY_FOR_REVIEW,    ItemStatus.SYNCED),
        (ItemStatus.READY_FOR_REVIEW,    ItemStatus.DONE),
        (ItemStatus.APPROVED,            ItemStatus.NEEDS_CLARIFICATION),
        (ItemStatus.APPROVED,            ItemStatus.EXTRACTED),
        (ItemStatus.SYNCED,              ItemStatus.APPROVED),
        (ItemStatus.SYNCED,              ItemStatus.REJECTED),
        (ItemStatus.REJECTED,            ItemStatus.READY_FOR_REVIEW),
        (ItemStatus.REJECTED,            ItemStatus.APPROVED),
        (ItemStatus.DONE,                ItemStatus.APPROVED),
        (ItemStatus.DONE,                ItemStatus.READY_FOR_REVIEW),
    ])
    def test_disallowed_raises(self, db, from_status, to_status):
        m = make_meeting(db)
        item = make_item(db, m, status=from_status, flags=[], owner="Alice")
        with pytest.raises(InvalidTransitionError):
            transition(db, item, to_status, actor="user")


# ═══════════════════════════════════════════════════════════════════════════════
# Approval gate rules
# ═══════════════════════════════════════════════════════════════════════════════

class TestApprovalGate:
    def test_needs_clarification_cannot_be_approved(self, db):
        """NEEDS_CLARIFICATION is not in READY_FOR_REVIEW allowed set."""
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.NEEDS_CLARIFICATION, flags=["NO_OWNER"], owner=None)
        with pytest.raises(InvalidTransitionError) as exc_info:
            transition(db, item, ItemStatus.APPROVED, actor="user")
        assert "NEEDS_CLARIFICATION" in exc_info.value.message

    def test_action_item_without_owner_cannot_be_approved(self, db):
        m = make_meeting(db)
        item = make_item(
            db, m,
            item_type=ItemType.ACTION_ITEM,
            status=ItemStatus.READY_FOR_REVIEW,
            owner=None,
            flags=[],
        )
        with pytest.raises(InvalidTransitionError) as exc_info:
            transition(db, item, ItemStatus.APPROVED, actor="user")
        assert "owner" in exc_info.value.message.lower()

    def test_follow_up_without_owner_cannot_be_approved(self, db):
        m = make_meeting(db)
        item = make_item(
            db, m,
            item_type=ItemType.FOLLOW_UP,
            status=ItemStatus.READY_FOR_REVIEW,
            owner=None,
            flags=[],
        )
        with pytest.raises(InvalidTransitionError):
            transition(db, item, ItemStatus.APPROVED, actor="user")

    def test_no_owner_flag_blocks_approval(self, db):
        m = make_meeting(db)
        item = make_item(
            db, m,
            status=ItemStatus.READY_FOR_REVIEW,
            owner="someone",
            flags=[AmbiguityFlag.NO_OWNER.value],
        )
        with pytest.raises(InvalidTransitionError) as exc_info:
            transition(db, item, ItemStatus.APPROVED, actor="user")
        assert "NO_OWNER" in str(exc_info.value.details)

    def test_vague_owner_flag_blocks_approval(self, db):
        m = make_meeting(db)
        item = make_item(
            db, m,
            status=ItemStatus.READY_FOR_REVIEW,
            owner="the team",
            flags=[AmbiguityFlag.VAGUE_OWNER.value],
        )
        with pytest.raises(InvalidTransitionError):
            transition(db, item, ItemStatus.APPROVED, actor="user")

    def test_multiple_owners_flag_blocks_approval(self, db):
        m = make_meeting(db)
        item = make_item(
            db, m,
            status=ItemStatus.READY_FOR_REVIEW,
            owner="Alice and Bob",
            flags=[AmbiguityFlag.MULTIPLE_OWNERS.value],
        )
        with pytest.raises(InvalidTransitionError):
            transition(db, item, ItemStatus.APPROVED, actor="user")

    def test_suggestion_cannot_be_approved_directly(self, db):
        m = make_meeting(db)
        item = make_item(
            db, m,
            item_type=ItemType.SUGGESTION,
            commitment=CommitmentLevel.PROPOSED,
            status=ItemStatus.READY_FOR_REVIEW,
            owner="Alice",
            flags=[],
        )
        with pytest.raises(InvalidTransitionError) as exc_info:
            transition(db, item, ItemStatus.APPROVED, actor="user")
        assert "SUGGESTION" in exc_info.value.message

    def test_open_question_cannot_be_approved_directly(self, db):
        m = make_meeting(db)
        item = make_item(
            db, m,
            item_type=ItemType.OPEN_QUESTION,
            commitment=CommitmentLevel.UNRESOLVED,
            status=ItemStatus.READY_FOR_REVIEW,
            owner="Alice",
            flags=[],
        )
        with pytest.raises(InvalidTransitionError) as exc_info:
            transition(db, item, ItemStatus.APPROVED, actor="user")
        assert "OPEN_QUESTION" in exc_info.value.message

    def test_decision_with_confirmed_commitment_can_be_approved(self, db):
        m = make_meeting(db)
        item = make_item(
            db, m,
            item_type=ItemType.DECISION,
            commitment=CommitmentLevel.CONFIRMED,
            status=ItemStatus.READY_FOR_REVIEW,
            owner=None,  # decisions don't require owner
            flags=[],
        )
        transition(db, item, ItemStatus.APPROVED, actor="user")
        assert item.status == ItemStatus.APPROVED.value

    def test_decision_without_confirmed_commitment_blocked(self, db):
        m = make_meeting(db)
        item = make_item(
            db, m,
            item_type=ItemType.DECISION,
            commitment=CommitmentLevel.PROPOSED,
            status=ItemStatus.READY_FOR_REVIEW,
            owner=None,
            flags=[],
        )
        with pytest.raises(InvalidTransitionError):
            transition(db, item, ItemStatus.APPROVED, actor="user")

    def test_synced_requires_approved_status(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.READY_FOR_REVIEW, flags=[], owner="Alice")
        with pytest.raises(InvalidTransitionError):
            transition(db, item, ItemStatus.SYNCED, actor="system")


# ═══════════════════════════════════════════════════════════════════════════════
# AuditLog written on every transition
# ═══════════════════════════════════════════════════════════════════════════════

class TestAuditLog:
    def test_every_transition_writes_audit_row(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.READY_FOR_REVIEW, flags=[], owner="Alice")

        before = db.query(AuditLog).filter(AuditLog.item_id == item.id).count()
        transition(db, item, ItemStatus.APPROVED, actor="test_user")
        after = db.query(AuditLog).filter(AuditLog.item_id == item.id).count()

        assert after == before + 1

    def test_audit_row_contains_correct_diff(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.READY_FOR_REVIEW, flags=[], owner="Alice")
        transition(db, item, ItemStatus.APPROVED, actor="alice@company.com")

        log = (
            db.query(AuditLog)
            .filter(AuditLog.item_id == item.id, AuditLog.action == "TRANSITION")
            .order_by(AuditLog.ts.desc())
            .first()
        )
        assert log is not None
        assert log.actor == "alice@company.com"
        diff = json.loads(log.diff_json)
        assert diff["status"][0] == ItemStatus.READY_FOR_REVIEW.value
        assert diff["status"][1] == ItemStatus.APPROVED.value

    def test_multiple_transitions_each_write_one_row(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.READY_FOR_REVIEW, flags=[], owner="Alice")

        transition(db, item, ItemStatus.APPROVED, actor="user")
        transition(db, item, ItemStatus.READY_FOR_REVIEW, actor="user", reason="changed mind")
        transition(db, item, ItemStatus.APPROVED, actor="user")
        transition(db, item, ItemStatus.SYNCED, actor="system")

        logs = db.query(AuditLog).filter(
            AuditLog.item_id == item.id,
            AuditLog.action == "TRANSITION"
        ).all()
        assert len(logs) == 4

    def test_terminal_state_rejected_writes_audit(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.READY_FOR_REVIEW)
        transition(db, item, ItemStatus.REJECTED, actor="pm", reason="Not relevant")

        log = db.query(AuditLog).filter(
            AuditLog.item_id == item.id,
            AuditLog.action == "TRANSITION"
        ).first()
        assert log is not None
        diff = json.loads(log.diff_json)
        assert diff["reason"] == "Not relevant"


# ═══════════════════════════════════════════════════════════════════════════════
# revalidate_flags() — auto-transition behaviour
# ═══════════════════════════════════════════════════════════════════════════════

class TestRevalidateFlags:
    def test_setting_owner_clears_no_owner_and_transitions(self, db):
        """Adding an owner to a NEEDS_CLARIFICATION item should move it to READY_FOR_REVIEW."""
        m = make_meeting(db)
        item = make_item(
            db, m,
            item_type=ItemType.ACTION_ITEM,
            status=ItemStatus.NEEDS_CLARIFICATION,
            owner=None,
            flags=[AmbiguityFlag.NO_OWNER.value],
        )
        # Simulate user editing the owner
        item.owner = "Alice"
        revalidate_flags(db, item, actor="user")

        assert item.status == ItemStatus.READY_FOR_REVIEW.value
        flags = json.loads(item.flags_json)
        assert AmbiguityFlag.NO_OWNER.value not in flags

    def test_setting_owner_clears_vague_owner(self, db):
        m = make_meeting(db)
        item = make_item(
            db, m,
            item_type=ItemType.ACTION_ITEM,
            status=ItemStatus.NEEDS_CLARIFICATION,
            owner="the team",
            flags=[AmbiguityFlag.VAGUE_OWNER.value],
        )
        item.owner = "James"
        revalidate_flags(db, item, actor="user")

        assert item.status == ItemStatus.READY_FOR_REVIEW.value
        flags = json.loads(item.flags_json)
        assert AmbiguityFlag.VAGUE_OWNER.value not in flags

    def test_setting_deadline_clears_no_deadline(self, db):
        from datetime import date as dt_date
        m = make_meeting(db)
        item = make_item(
            db, m,
            item_type=ItemType.ACTION_ITEM,
            status=ItemStatus.NEEDS_CLARIFICATION,
            owner="Alice",
            deadline=None,
            flags=[AmbiguityFlag.NO_DEADLINE.value],
        )
        item.deadline = dt_date(2026, 11, 15)
        revalidate_flags(db, item, actor="user")

        assert item.status == ItemStatus.READY_FOR_REVIEW.value
        flags = json.loads(item.flags_json)
        assert AmbiguityFlag.NO_DEADLINE.value not in flags

    def test_setting_deadline_clears_vague_deadline(self, db):
        from datetime import date as dt_date
        m = make_meeting(db)
        item = make_item(
            db, m,
            item_type=ItemType.FOLLOW_UP,
            status=ItemStatus.NEEDS_CLARIFICATION,
            owner="Sarah",
            deadline=None,
            flags=[AmbiguityFlag.VAGUE_DEADLINE.value],
        )
        item.deadline = dt_date(2026, 10, 30)
        revalidate_flags(db, item, actor="user")

        flags = json.loads(item.flags_json)
        assert AmbiguityFlag.VAGUE_DEADLINE.value not in flags

    def test_clearing_owner_re_adds_no_owner_for_action_item(self, db):
        """Removing owner from ACTION_ITEM should re-add NO_OWNER."""
        m = make_meeting(db)
        item = make_item(
            db, m,
            item_type=ItemType.ACTION_ITEM,
            status=ItemStatus.READY_FOR_REVIEW,
            owner="Alice",
            flags=[],
        )
        item.owner = None
        revalidate_flags(db, item, actor="user")

        assert item.status == ItemStatus.NEEDS_CLARIFICATION.value
        flags = json.loads(item.flags_json)
        assert AmbiguityFlag.NO_OWNER.value in flags

    def test_multiple_flags_all_cleared_transitions_once(self, db):
        """Clearing all flags at once should trigger exactly one transition."""
        from datetime import date as dt_date
        m = make_meeting(db)
        item = make_item(
            db, m,
            item_type=ItemType.ACTION_ITEM,
            status=ItemStatus.NEEDS_CLARIFICATION,
            owner=None,
            deadline=None,
            flags=[AmbiguityFlag.NO_OWNER.value, AmbiguityFlag.NO_DEADLINE.value],
        )
        # Fix both at once
        item.owner = "Bob"
        item.deadline = dt_date(2026, 11, 20)
        revalidate_flags(db, item, actor="user")

        assert item.status == ItemStatus.READY_FOR_REVIEW.value
        flags = json.loads(item.flags_json)
        assert flags == []

    def test_ready_for_review_item_not_re_transitioned_needlessly(self, db):
        """Calling revalidate on an already-READY item with no flags is a no-op."""
        m = make_meeting(db)
        item = make_item(
            db, m,
            status=ItemStatus.READY_FOR_REVIEW,
            owner="Alice",
            flags=[],
        )
        audit_before = db.query(AuditLog).filter(AuditLog.item_id == item.id).count()
        revalidate_flags(db, item, actor="user")
        audit_after = db.query(AuditLog).filter(AuditLog.item_id == item.id).count()

        # No new audit rows — no transition happened
        assert audit_after == audit_before
        assert item.status == ItemStatus.READY_FOR_REVIEW.value
