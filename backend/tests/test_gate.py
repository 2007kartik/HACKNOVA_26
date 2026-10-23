"""
Gate tests — T-26.

These tests prove the gate is unbreakable:
1. push(dry_run=false) calls fake Trello ONLY for APPROVED items
2. push(dry_run=true)  NEVER calls fake Trello regardless of status
3. Notifier send() raises GateError for non-APPROVED/SYNCED items
4. Notifier is never called for EXTRACTED, NEEDS_CLARIFICATION, READY_FOR_REVIEW, REJECTED items
5. Partial failure: one item failing does not abort the others
6. Items correctly transition to SYNCED after a successful push
"""
import json
import pytest
from datetime import date

from app.schemas import ItemStatus, ItemType, CommitmentLevel
from app.errors import GateError
from app.state_machine import transition

from .conftest import make_meeting, make_item, FakeTrelloClient, FakeNotifier


# ═══════════════════════════════════════════════════════════════════════════════
# Notifier gate unit tests (no HTTP)
# ═══════════════════════════════════════════════════════════════════════════════

class TestNotifierGate:
    """Test the notifier's own internal gate check."""

    @pytest.mark.parametrize("bad_status", [
        ItemStatus.EXTRACTED,
        ItemStatus.NEEDS_CLARIFICATION,
        ItemStatus.READY_FOR_REVIEW,
        ItemStatus.REJECTED,
        ItemStatus.DONE,
    ])
    def test_notifier_refuses_non_approved_status(self, db, bad_status):
        m = make_meeting(db)
        item = make_item(db, m, status=bad_status, flags=[], owner="Alice")
        notifier = FakeNotifier()

        with pytest.raises(GateError) as exc_info:
            notifier.send(item, "test message")
        assert bad_status.value in str(exc_info.value.details)
        assert notifier.call_count == 0

    def test_notifier_allows_approved(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Alice")
        notifier = FakeNotifier()

        result = notifier.send(item, "Reminder: please complete your task")
        assert result is True
        assert notifier.call_count == 1

    def test_notifier_allows_synced(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.SYNCED, flags=[], owner="Alice")
        notifier = FakeNotifier()

        result = notifier.send(item, "Task synced to Trello")
        assert result is True
        assert notifier.call_count == 1

    def test_overdue_reminder_respects_gate(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.READY_FOR_REVIEW, flags=[], owner="Alice")
        notifier = FakeNotifier()

        with pytest.raises(GateError):
            notifier.send_overdue_reminder(item, "Test Meeting")
        assert notifier.call_count == 0


# ═══════════════════════════════════════════════════════════════════════════════
# Trello client gate unit tests (no HTTP)
# ═══════════════════════════════════════════════════════════════════════════════

class TestTrelloGate:
    """Test the fake Trello client's own gate enforcement."""

    @pytest.mark.parametrize("bad_status", [
        ItemStatus.EXTRACTED,
        ItemStatus.NEEDS_CLARIFICATION,
        ItemStatus.READY_FOR_REVIEW,
        ItemStatus.REJECTED,
        ItemStatus.SYNCED,
        ItemStatus.DONE,
    ])
    def test_trello_refuses_non_approved_item(self, db, bad_status):
        m = make_meeting(db)
        item = make_item(db, m, status=bad_status, flags=[], owner="Alice")
        trello = FakeTrelloClient()

        with pytest.raises(GateError):
            trello.create_task(item, m)
        assert trello.call_count == 0

    def test_trello_accepts_approved_item(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Alice")
        trello = FakeTrelloClient()

        ref = trello.create_task(item, m)
        assert ref.system == "trello"
        assert trello.call_count == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Push endpoint gate tests (via HTTP TestClient)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPushEndpointGate:

    def _setup_meeting_with_items(self, db) -> tuple:
        """Create a meeting with items in various statuses."""
        m = make_meeting(db)

        approved1 = make_item(db, m, status=ItemStatus.APPROVED,
                              flags=[], owner="Alice", title="Approved task 1")
        approved2 = make_item(db, m, status=ItemStatus.APPROVED,
                              flags=[], owner="Bob", title="Approved task 2")
        ready     = make_item(db, m, status=ItemStatus.READY_FOR_REVIEW,
                              flags=[], owner="Carol", title="Ready task")
        needs_cla = make_item(db, m, status=ItemStatus.NEEDS_CLARIFICATION,
                              flags=["NO_OWNER"], owner=None, title="Needs clarification task")
        rejected  = make_item(db, m, status=ItemStatus.REJECTED,
                              flags=[], owner="Dave", title="Rejected task")
        synced    = make_item(db, m, status=ItemStatus.SYNCED,
                              flags=[], owner="Eve", title="Already synced task")
        db.commit()

        return m, approved1, approved2, ready, needs_cla, rejected, synced

    def test_dry_run_never_calls_trello(self, client_with_fakes, db, fake_trello):
        """dry_run=true must NEVER call create_task regardless of item statuses."""
        m, *_ = self._setup_meeting_with_items(db)

        r = client_with_fakes.post(
            f"/meetings/{m.id}/push",
            params={"target": "trello", "dry_run": "true"},
        )
        assert r.status_code == 200
        body = r.json()

        assert body["dry_run"] is True
        assert fake_trello.call_count == 0, "dry_run must not call Trello"
        # Only APPROVED items appear in pushed list
        assert len(body["pushed"]) == 2
        assert len(body["failed"]) == 0

    def test_push_only_fires_for_approved_items(self, client_with_fakes, db, fake_trello):
        """dry_run=false must call Trello ONLY for APPROVED items."""
        m, approved1, approved2, ready, needs_cla, rejected, synced = (
            self._setup_meeting_with_items(db)
        )

        r = client_with_fakes.post(
            f"/meetings/{m.id}/push",
            params={"target": "trello", "dry_run": "false"},
        )
        assert r.status_code == 200
        body = r.json()

        assert body["dry_run"] is False
        # Exactly 2 APPROVED items pushed
        assert fake_trello.call_count == 2
        pushed_ids = {p["item_id"] for p in body["pushed"]}
        assert approved1.id in pushed_ids
        assert approved2.id in pushed_ids
        # Non-APPROVED items NOT pushed
        all_pushed_ids = {c["item_id"] for c in fake_trello.calls}
        assert ready.id not in all_pushed_ids
        assert needs_cla.id not in all_pushed_ids
        assert rejected.id not in all_pushed_ids
        assert synced.id not in all_pushed_ids

    def test_pushed_items_transition_to_synced(self, client_with_fakes, db, fake_trello):
        """After a real push, items must be SYNCED in the DB."""
        m, approved1, approved2, *_ = self._setup_meeting_with_items(db)

        r = client_with_fakes.post(
            f"/meetings/{m.id}/push",
            params={"target": "trello", "dry_run": "false"},
        )
        assert r.status_code == 200

        db.refresh(approved1)
        db.refresh(approved2)
        assert approved1.status == ItemStatus.SYNCED.value
        assert approved2.status == ItemStatus.SYNCED.value
        assert approved1.external_id is not None
        assert approved1.external_url is not None

    def test_partial_failure_does_not_abort_others(self, client_with_fakes, db, fake_trello):
        """One item failing must not prevent other approved items from being pushed."""
        m = make_meeting(db)
        good1 = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Alice",
                          title="Good item 1")
        bad   = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Bob",
                          title="Will fail")
        good2 = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Carol",
                          title="Good item 2")
        db.commit()

        # Make the middle item fail
        fake_trello.fail_item_ids.add(bad.id)

        r = client_with_fakes.post(
            f"/meetings/{m.id}/push",
            params={"target": "trello", "dry_run": "false"},
        )
        assert r.status_code == 200
        body = r.json()

        pushed_ids = {p["item_id"] for p in body["pushed"]}
        failed_ids = {p["item_id"] for p in body["failed"]}

        assert good1.id in pushed_ids
        assert good2.id in pushed_ids
        assert bad.id in failed_ids
        assert len(body["pushed"]) == 2
        assert len(body["failed"]) == 1

        db.refresh(good1)
        db.refresh(good2)
        db.refresh(bad)
        assert good1.status == ItemStatus.SYNCED.value
        assert good2.status == ItemStatus.SYNCED.value
        assert bad.status == ItemStatus.APPROVED.value  # still APPROVED after failure

    def test_dry_run_true_items_remain_approved(self, client_with_fakes, db, fake_trello):
        """After dry_run=true, items must still be APPROVED (no state change)."""
        m, approved1, approved2, *_ = self._setup_meeting_with_items(db)

        client_with_fakes.post(
            f"/meetings/{m.id}/push",
            params={"target": "trello", "dry_run": "true"},
        )

        db.refresh(approved1)
        db.refresh(approved2)
        assert approved1.status == ItemStatus.APPROVED.value
        assert approved2.status == ItemStatus.APPROVED.value

    def test_push_with_no_approved_items_returns_empty(self, client_with_fakes, db, fake_trello):
        """Push on a meeting with no APPROVED items returns empty pushed list."""
        m = make_meeting(db)
        make_item(db, m, status=ItemStatus.READY_FOR_REVIEW, flags=[], owner="Alice")
        make_item(db, m, status=ItemStatus.NEEDS_CLARIFICATION, flags=["NO_OWNER"], owner=None)
        db.commit()

        r = client_with_fakes.post(
            f"/meetings/{m.id}/push",
            params={"target": "trello", "dry_run": "false"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["pushed"] == []
        assert body["failed"] == []
        assert fake_trello.call_count == 0


# ═══════════════════════════════════════════════════════════════════════════════
# Scheduler / reminder job gate tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestSchedulerGate:
    """
    Simulate the overdue reminder job and verify it only notifies
    APPROVED and SYNCED items.
    """

    def _run_fake_reminder_job(self, db, notifier: FakeNotifier) -> None:
        """
        Simulate what the scheduler does:
        find overdue approved/synced items and send reminders.
        """
        from datetime import date
        from app.models import Item, Meeting

        overdue_statuses = [ItemStatus.APPROVED.value, ItemStatus.SYNCED.value]
        items = (
            db.query(Item)
            .filter(Item.status.in_(overdue_statuses))
            .all()
        )
        for item in items:
            meeting = db.get(Meeting, item.meeting_id)
            notifier.send_overdue_reminder(item, meeting.title if meeting else "Unknown")

    def test_reminder_only_fires_for_approved_and_synced(self, db):
        m = make_meeting(db)

        # Create items in every status
        statuses = [
            ItemStatus.EXTRACTED,
            ItemStatus.NEEDS_CLARIFICATION,
            ItemStatus.READY_FOR_REVIEW,
            ItemStatus.APPROVED,
            ItemStatus.REJECTED,
            ItemStatus.SYNCED,
            ItemStatus.DONE,
        ]
        for s in statuses:
            make_item(db, m, status=s, flags=[], owner="Alice",
                      title=f"Item {s.value}")
        db.commit()

        notifier = FakeNotifier()
        self._run_fake_reminder_job(db, notifier)

        # Only APPROVED and SYNCED should have triggered a notification
        assert notifier.call_count == 2
        notified_statuses = {c["status"] for c in notifier.calls}
        assert notified_statuses == {ItemStatus.APPROVED.value, ItemStatus.SYNCED.value}

    def test_reminder_does_not_fire_for_extracted(self, db):
        m = make_meeting(db)
        make_item(db, m, status=ItemStatus.EXTRACTED, flags=[], owner="Alice")
        db.commit()

        notifier = FakeNotifier()
        self._run_fake_reminder_job(db, notifier)
        assert notifier.call_count == 0

    def test_reminder_does_not_fire_for_ready_for_review(self, db):
        m = make_meeting(db)
        make_item(db, m, status=ItemStatus.READY_FOR_REVIEW, flags=[], owner="Alice")
        db.commit()

        notifier = FakeNotifier()
        self._run_fake_reminder_job(db, notifier)
        assert notifier.call_count == 0
