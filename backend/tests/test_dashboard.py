"""
Dashboard tests — T-45.

Covers:
- Status counts are correct
- Overdue items: deadline < today + not DONE/REJECTED are returned
- Overdue items: deadline in future are NOT returned
- Overdue items: DONE / REJECTED are excluded even if deadline is past
- Unassigned: ACTION_ITEM / FOLLOW_UP with no owner are returned
- Unassigned: DECISION items with no owner are NOT returned
- Unassigned: terminal items (REJECTED/DONE) are excluded
- Awaiting clarification count is correct
- Pending from previous meetings: APPROVED/SYNCED from OTHER meetings
- Pending from previous meetings: items from CURRENT meeting excluded
- Dashboard endpoint returns correct JSON shape
- Members CRUD endpoints
"""
import json
import pytest
from datetime import date, timedelta

from app.schemas import ItemStatus, ItemType, CommitmentLevel
from app.services.tracking import (
    get_status_counts,
    get_overdue_items,
    get_unassigned_items,
    get_awaiting_clarification_count,
    get_pending_from_previous_meetings,
)

from .conftest import make_meeting, make_item

TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)
LAST_WEEK = TODAY - timedelta(days=7)
TOMORROW = TODAY + timedelta(days=1)
NEXT_WEEK = TODAY + timedelta(days=7)


# ═══════════════════════════════════════════════════════════════════════════════
# Status counts
# ═══════════════════════════════════════════════════════════════════════════════

class TestStatusCounts:
    def test_counts_all_statuses(self, db):
        m = make_meeting(db)
        make_item(db, m, status=ItemStatus.READY_FOR_REVIEW, flags=[], owner="Alice")
        make_item(db, m, status=ItemStatus.READY_FOR_REVIEW, flags=[], owner="Bob")
        make_item(db, m, status=ItemStatus.APPROVED,         flags=[], owner="Carol")
        make_item(db, m, status=ItemStatus.NEEDS_CLARIFICATION, flags=["NO_OWNER"], owner=None)
        db.commit()

        counts = get_status_counts(db)
        assert counts[ItemStatus.READY_FOR_REVIEW.value] == 2
        assert counts[ItemStatus.APPROVED.value] == 1
        assert counts[ItemStatus.NEEDS_CLARIFICATION.value] == 1

    def test_counts_scoped_to_meeting(self, db):
        m1 = make_meeting(db, title="Meeting 1")
        m2 = make_meeting(db, title="Meeting 2")
        make_item(db, m1, status=ItemStatus.APPROVED, flags=[], owner="Alice")
        make_item(db, m1, status=ItemStatus.APPROVED, flags=[], owner="Bob")
        make_item(db, m2, status=ItemStatus.APPROVED, flags=[], owner="Carol")
        db.commit()

        counts_m1 = get_status_counts(db, m1.id)
        counts_m2 = get_status_counts(db, m2.id)
        assert counts_m1[ItemStatus.APPROVED.value] == 2
        assert counts_m2[ItemStatus.APPROVED.value] == 1

    def test_empty_meeting_returns_zero_counts(self, db):
        m = make_meeting(db)
        db.commit()
        counts = get_status_counts(db, m.id)
        for status in ItemStatus:
            assert counts[status.value] == 0


# ═══════════════════════════════════════════════════════════════════════════════
# Overdue items
# ═══════════════════════════════════════════════════════════════════════════════

class TestOverdueItems:
    def test_past_deadline_non_terminal_is_overdue(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Alice",
                         deadline=YESTERDAY)
        db.commit()

        overdue = get_overdue_items(db)
        assert any(i.id == item.id for i in overdue)

    def test_future_deadline_is_not_overdue(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Alice",
                         deadline=TOMORROW)
        db.commit()

        overdue = get_overdue_items(db)
        assert not any(i.id == item.id for i in overdue)

    def test_no_deadline_is_not_overdue(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Alice",
                         deadline=None)
        db.commit()

        overdue = get_overdue_items(db)
        assert not any(i.id == item.id for i in overdue)

    def test_done_item_excluded_even_if_overdue(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.DONE, flags=[], owner="Alice",
                         deadline=LAST_WEEK)
        db.commit()

        overdue = get_overdue_items(db)
        assert not any(i.id == item.id for i in overdue)

    def test_rejected_item_excluded_even_if_overdue(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.REJECTED, flags=[], owner="Alice",
                         deadline=LAST_WEEK)
        db.commit()

        overdue = get_overdue_items(db)
        assert not any(i.id == item.id for i in overdue)

    def test_needs_clarification_overdue_is_included(self, db):
        m = make_meeting(db)
        item = make_item(db, m, status=ItemStatus.NEEDS_CLARIFICATION,
                         flags=["NO_OWNER"], owner=None, deadline=YESTERDAY)
        db.commit()

        overdue = get_overdue_items(db)
        assert any(i.id == item.id for i in overdue)

    def test_overdue_scoped_to_meeting(self, db):
        m1 = make_meeting(db, title="Meeting 1")
        m2 = make_meeting(db, title="Meeting 2")
        item1 = make_item(db, m1, status=ItemStatus.APPROVED, flags=[], owner="A",
                          deadline=YESTERDAY)
        item2 = make_item(db, m2, status=ItemStatus.APPROVED, flags=[], owner="B",
                          deadline=YESTERDAY)
        db.commit()

        overdue_m1 = get_overdue_items(db, m1.id)
        assert any(i.id == item1.id for i in overdue_m1)
        assert not any(i.id == item2.id for i in overdue_m1)

    def test_multiple_overdue_items_all_returned(self, db):
        m = make_meeting(db)
        items = [
            make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="A",
                      deadline=LAST_WEEK, title=f"Overdue {i}")
            for i in range(3)
        ]
        db.commit()

        overdue = get_overdue_items(db, m.id)
        assert len(overdue) == 3


# ═══════════════════════════════════════════════════════════════════════════════
# Unassigned items
# ═══════════════════════════════════════════════════════════════════════════════

class TestUnassignedItems:
    def test_action_item_without_owner_is_unassigned(self, db):
        m = make_meeting(db)
        item = make_item(db, m, item_type=ItemType.ACTION_ITEM,
                         status=ItemStatus.READY_FOR_REVIEW,
                         flags=["NO_OWNER"], owner=None)
        db.commit()

        unassigned = get_unassigned_items(db)
        assert any(i.id == item.id for i in unassigned)

    def test_follow_up_without_owner_is_unassigned(self, db):
        m = make_meeting(db)
        item = make_item(db, m, item_type=ItemType.FOLLOW_UP,
                         status=ItemStatus.NEEDS_CLARIFICATION,
                         flags=["NO_OWNER"], owner=None)
        db.commit()

        unassigned = get_unassigned_items(db)
        assert any(i.id == item.id for i in unassigned)

    def test_decision_without_owner_is_not_unassigned(self, db):
        """DECISION items don't require owners — not tracked as unassigned."""
        m = make_meeting(db)
        item = make_item(db, m, item_type=ItemType.DECISION,
                         commitment=CommitmentLevel.CONFIRMED,
                         status=ItemStatus.READY_FOR_REVIEW,
                         flags=[], owner=None)
        db.commit()

        unassigned = get_unassigned_items(db)
        assert not any(i.id == item.id for i in unassigned)

    def test_action_item_with_owner_is_not_unassigned(self, db):
        m = make_meeting(db)
        item = make_item(db, m, item_type=ItemType.ACTION_ITEM,
                         status=ItemStatus.READY_FOR_REVIEW,
                         flags=[], owner="Alice")
        db.commit()

        unassigned = get_unassigned_items(db)
        assert not any(i.id == item.id for i in unassigned)

    def test_rejected_unassigned_not_tracked(self, db):
        m = make_meeting(db)
        item = make_item(db, m, item_type=ItemType.ACTION_ITEM,
                         status=ItemStatus.REJECTED,
                         flags=[], owner=None)
        db.commit()

        unassigned = get_unassigned_items(db)
        assert not any(i.id == item.id for i in unassigned)

    def test_done_unassigned_not_tracked(self, db):
        m = make_meeting(db)
        item = make_item(db, m, item_type=ItemType.ACTION_ITEM,
                         status=ItemStatus.DONE,
                         flags=[], owner=None)
        db.commit()

        unassigned = get_unassigned_items(db)
        assert not any(i.id == item.id for i in unassigned)


# ═══════════════════════════════════════════════════════════════════════════════
# Awaiting clarification
# ═══════════════════════════════════════════════════════════════════════════════

class TestAwaitingClarification:
    def test_count_needs_clarification_items(self, db):
        m = make_meeting(db)
        make_item(db, m, status=ItemStatus.NEEDS_CLARIFICATION, flags=["NO_OWNER"], owner=None)
        make_item(db, m, status=ItemStatus.NEEDS_CLARIFICATION, flags=["VAGUE_DEADLINE"])
        make_item(db, m, status=ItemStatus.READY_FOR_REVIEW, flags=[], owner="Alice")
        db.commit()

        count = get_awaiting_clarification_count(db)
        assert count == 2

    def test_zero_when_no_clarification_needed(self, db):
        m = make_meeting(db)
        make_item(db, m, status=ItemStatus.READY_FOR_REVIEW, flags=[], owner="Alice")
        db.commit()

        count = get_awaiting_clarification_count(db)
        assert count == 0

    def test_scoped_count(self, db):
        m1 = make_meeting(db, title="M1")
        m2 = make_meeting(db, title="M2")
        make_item(db, m1, status=ItemStatus.NEEDS_CLARIFICATION, flags=["NO_OWNER"], owner=None)
        make_item(db, m1, status=ItemStatus.NEEDS_CLARIFICATION, flags=["NO_OWNER"], owner=None)
        make_item(db, m2, status=ItemStatus.NEEDS_CLARIFICATION, flags=["NO_OWNER"], owner=None)
        db.commit()

        assert get_awaiting_clarification_count(db, m1.id) == 2
        assert get_awaiting_clarification_count(db, m2.id) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# Pending from previous meetings
# ═══════════════════════════════════════════════════════════════════════════════

class TestPendingFromPreviousMeetings:
    def test_approved_item_from_other_meeting_is_pending(self, db):
        m1 = make_meeting(db, title="Old Meeting")
        m2 = make_meeting(db, title="Current Meeting")
        old_item = make_item(db, m1, status=ItemStatus.APPROVED, flags=[], owner="Alice")
        db.commit()

        pending = get_pending_from_previous_meetings(db, current_meeting_id=m2.id)
        assert any(i.id == old_item.id for i in pending)

    def test_synced_item_from_other_meeting_is_pending(self, db):
        m1 = make_meeting(db, title="Old Meeting")
        m2 = make_meeting(db, title="Current Meeting")
        synced_item = make_item(db, m1, status=ItemStatus.SYNCED, flags=[], owner="Bob")
        db.commit()

        pending = get_pending_from_previous_meetings(db, current_meeting_id=m2.id)
        assert any(i.id == synced_item.id for i in pending)

    def test_current_meeting_items_excluded(self, db):
        m = make_meeting(db, title="Current Meeting")
        own_item = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Alice")
        db.commit()

        pending = get_pending_from_previous_meetings(db, current_meeting_id=m.id)
        assert not any(i.id == own_item.id for i in pending)

    def test_done_items_not_pending(self, db):
        m1 = make_meeting(db, title="Old Meeting")
        m2 = make_meeting(db, title="Current Meeting")
        done_item = make_item(db, m1, status=ItemStatus.DONE, flags=[], owner="Alice")
        db.commit()

        pending = get_pending_from_previous_meetings(db, current_meeting_id=m2.id)
        assert not any(i.id == done_item.id for i in pending)

    def test_rejected_items_not_pending(self, db):
        m1 = make_meeting(db, title="Old Meeting")
        m2 = make_meeting(db, title="Current Meeting")
        rejected = make_item(db, m1, status=ItemStatus.REJECTED, flags=[], owner="Alice")
        db.commit()

        pending = get_pending_from_previous_meetings(db, current_meeting_id=m2.id)
        assert not any(i.id == rejected.id for i in pending)

    def test_multiple_old_meetings_all_returned(self, db):
        m1 = make_meeting(db, title="Sprint 1")
        m2 = make_meeting(db, title="Sprint 2")
        current = make_meeting(db, title="Sprint 3")
        item1 = make_item(db, m1, status=ItemStatus.APPROVED, flags=[], owner="A")
        item2 = make_item(db, m2, status=ItemStatus.SYNCED,   flags=[], owner="B")
        db.commit()

        pending = get_pending_from_previous_meetings(db, current_meeting_id=current.id)
        ids = {i.id for i in pending}
        assert item1.id in ids
        assert item2.id in ids


# ═══════════════════════════════════════════════════════════════════════════════
# Dashboard HTTP endpoint
# ═══════════════════════════════════════════════════════════════════════════════

class TestDashboardEndpoint:
    def test_dashboard_returns_correct_shape(self, client, db):
        m = make_meeting(db)
        make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Alice",
                  deadline=TOMORROW)
        make_item(db, m, status=ItemStatus.NEEDS_CLARIFICATION, flags=["NO_OWNER"],
                  owner=None, deadline=YESTERDAY)
        make_item(db, m, item_type=ItemType.ACTION_ITEM,
                  status=ItemStatus.READY_FOR_REVIEW, flags=[], owner=None)
        db.commit()

        r = client.get(f"/dashboard?meeting_id={m.id}")
        assert r.status_code == 200
        body = r.json()

        assert "counts" in body
        assert "overdue" in body
        assert "unassigned" in body
        assert "awaiting_clarification" in body
        assert "pending_from_previous_meetings" in body

        assert body["counts"][ItemStatus.APPROVED.value] == 1
        assert body["counts"][ItemStatus.NEEDS_CLARIFICATION.value] == 1
        assert body["awaiting_clarification"] == 1
        assert len(body["overdue"]) == 1        # NEEDS_CLARIFICATION + past deadline
        assert len(body["unassigned"]) >= 1     # item with no owner

    def test_health_endpoint(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "version" in body

    def test_dashboard_global_no_meeting_id(self, client, db):
        m1 = make_meeting(db, title="M1")
        m2 = make_meeting(db, title="M2")
        make_item(db, m1, status=ItemStatus.APPROVED, flags=[], owner="Alice")
        make_item(db, m2, status=ItemStatus.APPROVED, flags=[], owner="Bob")
        db.commit()

        r = client.get("/dashboard")
        assert r.status_code == 200
        body = r.json()
        assert body["counts"][ItemStatus.APPROVED.value] == 2


# ═══════════════════════════════════════════════════════════════════════════════
# Members CRUD
# ═══════════════════════════════════════════════════════════════════════════════

class TestMembersCRUD:
    def test_create_member(self, client):
        r = client.post("/members", json={
            "name": "Alice Chen",
            "email": "alice@company.com",
            "trello_member_id": "trello123",
            "github_login": "alicechen",
        })
        assert r.status_code == 201
        body = r.json()
        assert body["name"] == "Alice Chen"
        assert body["trello_member_id"] == "trello123"
        assert "id" in body

    def test_create_duplicate_name_fails(self, client):
        client.post("/members", json={"name": "Bob"})
        r = client.post("/members", json={"name": "Bob"})
        assert r.status_code == 422

    def test_list_members(self, client):
        client.post("/members", json={"name": "Alice"})
        client.post("/members", json={"name": "Bob"})
        r = client.get("/members")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_update_member(self, client):
        created = client.post("/members", json={"name": "Carol"}).json()
        mid = created["id"]

        r = client.put(f"/members/{mid}", json={"trello_member_id": "trello456"})
        assert r.status_code == 200
        assert r.json()["trello_member_id"] == "trello456"

    def test_delete_member(self, client):
        created = client.post("/members", json={"name": "Dave"}).json()
        mid = created["id"]

        r = client.delete(f"/members/{mid}")
        assert r.status_code == 204

        r = client.get("/members")
        assert not any(m["id"] == mid for m in r.json())

    def test_get_member_not_found(self, client):
        r = client.put("/members/nonexistent", json={"name": "X"})
        assert r.status_code == 404
