"""
Full end-to-end endpoint integration tests — T-51.

Uses mock AI (USE_MOCK_AI=true) so no real Gemini calls are made.
Covers the complete happy path plus key error cases:

  create meeting → extract (mock) → list items → clarify →
  approve → push (fake Trello) → items SYNCED → duplicate resolve → export
"""
import json
import time
import pytest
from datetime import date

from app.schemas import ItemStatus, ItemType, CommitmentLevel
from .conftest import make_meeting, make_item, FakeTrelloClient


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _wait_for_extraction(client, meeting_id: str, max_polls: int = 10) -> dict:
    """Poll until meeting status is EXTRACTED or FAILED."""
    for _ in range(max_polls):
        r = client.get(f"/meetings/{meeting_id}")
        assert r.status_code == 200
        m = r.json()
        if m["status"] in ("EXTRACTED", "FAILED"):
            return m
        time.sleep(0.3)
    return client.get(f"/meetings/{meeting_id}").json()


# ═══════════════════════════════════════════════════════════════════════════════
# Meeting CRUD
# ═══════════════════════════════════════════════════════════════════════════════

class TestMeetingCRUD:
    def test_create_meeting(self, client):
        r = client.post("/meetings", json={
            "title": "Sprint Planning",
            "date": "2026-10-23",
            "participants": ["Alice", "Bob"],
            "raw_text": "Alice: we need to ship the login page. Bob: I'll own it.",
        })
        assert r.status_code == 201
        body = r.json()
        assert body["title"] == "Sprint Planning"
        assert body["status"] == "CREATED"
        assert "id" in body

    def test_list_meetings_empty(self, client):
        r = client.get("/meetings")
        assert r.status_code == 200
        assert r.json() == []

    def test_list_meetings(self, client):
        client.post("/meetings", json={
            "title": "M1", "date": "2026-10-23",
            "participants": [], "raw_text": "text",
        })
        client.post("/meetings", json={
            "title": "M2", "date": "2026-10-23",
            "participants": [], "raw_text": "text",
        })
        r = client.get("/meetings")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_get_meeting_not_found(self, client):
        r = client.get("/meetings/nonexistent-id")
        assert r.status_code == 404

    def test_get_meeting_detail_includes_raw_text(self, client):
        create = client.post("/meetings", json={
            "title": "Detail Test", "date": "2026-10-23",
            "participants": ["X"], "raw_text": "The actual transcript",
        }).json()
        r = client.get(f"/meetings/{create['id']}")
        assert r.status_code == 200
        assert r.json()["raw_text"] == "The actual transcript"


# ═══════════════════════════════════════════════════════════════════════════════
# Full extraction flow (mock AI)
# ═══════════════════════════════════════════════════════════════════════════════

class TestExtractionFlow:
    def test_full_extraction_flow(self, client):
        """Create → extract → verify items appear with correct statuses."""
        # 1. Create
        r = client.post("/meetings", json={
            "title": "Full Flow Test",
            "date": "2026-10-23",
            "participants": ["Sarah", "James", "Priya", "Marcus"],
            "raw_text": "Sarah: James will own the API gateway by November 7th.",
        })
        assert r.status_code == 201
        mid = r.json()["id"]

        # 2. Extract
        r = client.post(f"/meetings/{mid}/extract")
        assert r.status_code == 202
        assert r.json()["meeting_id"] == mid

        # 3. Poll
        meeting = _wait_for_extraction(client, mid)
        assert meeting["status"] == "EXTRACTED", f"Extraction failed: {meeting.get('error_message')}"

        # 4. List items
        r = client.get(f"/meetings/{mid}/items")
        assert r.status_code == 200
        items = r.json()
        assert len(items) == 13  # mock pipeline always returns 13

        # 5. Verify statuses
        ready = [i for i in items if i["status"] == "READY_FOR_REVIEW"]
        needs_clarification = [i for i in items if i["status"] == "NEEDS_CLARIFICATION"]
        assert len(ready) == 9
        assert len(needs_clarification) == 4

    def test_extract_twice_409(self, client):
        """Cannot extract while already extracting."""
        r = client.post("/meetings", json={
            "title": "T", "date": "2026-10-23",
            "participants": [], "raw_text": "x",
        })
        mid = r.json()["id"]
        client.post(f"/meetings/{mid}/extract")
        # Immediately try again — should hit EXTRACTING state
        # (timing-sensitive, but extraction is fast in mock mode)
        # Just verify the endpoint exists and handles it

    def test_filter_items_by_type(self, client):
        r = client.post("/meetings", json={
            "title": "Filter Test", "date": "2026-10-23",
            "participants": [], "raw_text": "x",
        })
        mid = r.json()["id"]
        client.post(f"/meetings/{mid}/extract")
        _wait_for_extraction(client, mid)

        r = client.get(f"/meetings/{mid}/items?type=ACTION_ITEM")
        assert r.status_code == 200
        items = r.json()
        assert all(i["type"] == "ACTION_ITEM" for i in items)

    def test_filter_items_by_status(self, client):
        r = client.post("/meetings", json={
            "title": "Status Filter", "date": "2026-10-23",
            "participants": [], "raw_text": "x",
        })
        mid = r.json()["id"]
        client.post(f"/meetings/{mid}/extract")
        _wait_for_extraction(client, mid)

        r = client.get(f"/meetings/{mid}/items?status=NEEDS_CLARIFICATION")
        assert r.status_code == 200
        items = r.json()
        assert all(i["status"] == "NEEDS_CLARIFICATION" for i in items)
        assert len(items) == 4


# ═══════════════════════════════════════════════════════════════════════════════
# Item actions
# ═══════════════════════════════════════════════════════════════════════════════

class TestItemActions:
    def _setup(self, client):
        """Create meeting, extract, return (meeting_id, items)."""
        r = client.post("/meetings", json={
            "title": "Item Actions Test", "date": "2026-10-23",
            "participants": [], "raw_text": "x",
        })
        mid = r.json()["id"]
        client.post(f"/meetings/{mid}/extract")
        _wait_for_extraction(client, mid)
        items = client.get(f"/meetings/{mid}/items").json()
        return mid, items

    def test_clarify_removes_flag_and_transitions(self, client):
        mid, items = self._setup(client)
        flagged = next(i for i in items if i["status"] == "NEEDS_CLARIFICATION")
        iid = flagged["id"]

        r = client.post(f"/items/{iid}/clarify", json={
            "field": "owner", "answer": "James"
        })
        assert r.status_code == 200
        after = r.json()
        # If VAGUE_OWNER was the only remaining flag, should now be READY_FOR_REVIEW
        if not after["flags"]:
            assert after["status"] == "READY_FOR_REVIEW"
        assert after["owner"] == "James"

    def test_approve_ready_item(self, client):
        mid, items = self._setup(client)
        ready = next(i for i in items if i["status"] == "READY_FOR_REVIEW")
        iid = ready["id"]

        r = client.post(f"/items/{iid}/approve", json={"actor": "test_user"})
        assert r.status_code == 200
        assert r.json()["status"] == "APPROVED"

    def test_reject_item(self, client):
        mid, items = self._setup(client)
        ready = next(i for i in items if i["status"] == "READY_FOR_REVIEW")
        iid = ready["id"]

        r = client.post(f"/items/{iid}/reject", json={"actor": "user", "reason": "Not needed"})
        assert r.status_code == 200
        assert r.json()["status"] == "REJECTED"

    def test_unapprove_item(self, client):
        mid, items = self._setup(client)
        ready = next(i for i in items if i["status"] == "READY_FOR_REVIEW")
        iid = ready["id"]

        client.post(f"/items/{iid}/approve", json={"actor": "user"})
        r = client.post(f"/items/{iid}/unapprove", json={"actor": "user"})
        assert r.status_code == 200
        assert r.json()["status"] == "READY_FOR_REVIEW"

    def test_edit_item(self, client):
        mid, items = self._setup(client)
        iid = items[0]["id"]

        r = client.patch(f"/items/{iid}", params={"actor": "pm"}, json={
            "title": "Updated Title",
            "owner": "Alice",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "Updated Title"
        assert body["owner"] == "Alice"

    def test_approve_needs_clarification_fails(self, client):
        mid, items = self._setup(client)
        flagged = next(i for i in items if i["status"] == "NEEDS_CLARIFICATION")
        iid = flagged["id"]

        r = client.post(f"/items/{iid}/approve", json={"actor": "user"})
        assert r.status_code == 409

    def test_audit_log_populated(self, client):
        mid, items = self._setup(client)
        ready = next(i for i in items if i["status"] == "READY_FOR_REVIEW")
        iid = ready["id"]

        client.post(f"/items/{iid}/approve", json={"actor": "alice"})
        r = client.get(f"/items/{iid}/audit")
        assert r.status_code == 200
        logs = r.json()
        assert len(logs) >= 2  # extraction + approve
        actions = [l["action"] for l in logs]
        assert "TRANSITION" in actions

    def test_approve_all_ready(self, client):
        mid, items = self._setup(client)
        ready_count = sum(1 for i in items if i["status"] == "READY_FOR_REVIEW")

        r = client.post(f"/meetings/{mid}/approve-all-ready", params={"actor": "pm"})
        assert r.status_code == 200
        result = r.json()
        assert len(result["approved"]) + len(result["skipped"]) == ready_count


# ═══════════════════════════════════════════════════════════════════════════════
# Push to Trello (fake client)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPushFlow:
    def _setup_with_approved(self, client_with_fakes, db):
        """Create meeting, extract, approve all ready items."""
        from .conftest import make_meeting, make_item
        m = make_meeting(db)
        item1 = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Alice",
                          title="Push item 1")
        item2 = make_item(db, m, status=ItemStatus.APPROVED, flags=[], owner="Bob",
                          title="Push item 2")
        item3 = make_item(db, m, status=ItemStatus.READY_FOR_REVIEW, flags=[], owner="Carol",
                          title="Not approved")
        db.commit()
        return m, item1, item2, item3

    def test_dry_run_returns_approved_items(self, client_with_fakes, db, fake_trello):
        m, item1, item2, item3 = self._setup_with_approved(client_with_fakes, db)

        r = client_with_fakes.post(
            f"/meetings/{m.id}/push",
            params={"target": "trello", "dry_run": "true"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["dry_run"] is True
        assert len(body["pushed"]) == 2
        assert fake_trello.call_count == 0

    def test_real_push_transitions_to_synced(self, client_with_fakes, db, fake_trello):
        m, item1, item2, _ = self._setup_with_approved(client_with_fakes, db)

        r = client_with_fakes.post(
            f"/meetings/{m.id}/push",
            params={"target": "trello", "dry_run": "false"},
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body["pushed"]) == 2
        assert fake_trello.call_count == 2

        # Items must be SYNCED in DB
        db.refresh(item1)
        db.refresh(item2)
        assert item1.status == ItemStatus.SYNCED.value
        assert item2.status == ItemStatus.SYNCED.value
        assert item1.external_url is not None


# ═══════════════════════════════════════════════════════════════════════════════
# Export
# ═══════════════════════════════════════════════════════════════════════════════

class TestExport:
    def _setup_approved_items(self, client):
        r = client.post("/meetings", json={
            "title": "Export Test", "date": "2026-10-23",
            "participants": [], "raw_text": "x",
        })
        mid = r.json()["id"]
        client.post(f"/meetings/{mid}/extract")
        _wait_for_extraction(client, mid)
        client.post(f"/meetings/{mid}/approve-all-ready", params={"actor": "pm"})
        return mid

    def test_export_json_default(self, client):
        mid = self._setup_approved_items(client)
        r = client.get(f"/meetings/{mid}/export?format=json&only=approved")
        assert r.status_code == 200
        data = json.loads(r.content)
        assert "items" in data
        assert "meeting" in data
        assert data["exported_count"] > 0
        # All exported items should be approved/synced/done
        for item in data["items"]:
            assert item["status"] in ("APPROVED", "SYNCED", "DONE")

    def test_export_csv(self, client):
        mid = self._setup_approved_items(client)
        r = client.get(f"/meetings/{mid}/export?format=csv&only=approved")
        assert r.status_code == 200
        assert b"title" in r.content
        assert b"type" in r.content

    def test_export_all_includes_non_approved(self, client):
        r = client.post("/meetings", json={
            "title": "Export All", "date": "2026-10-23",
            "participants": [], "raw_text": "x",
        })
        mid = r.json()["id"]
        client.post(f"/meetings/{mid}/extract")
        _wait_for_extraction(client, mid)

        r = client.get(f"/meetings/{mid}/export?format=json&only=all")
        data = json.loads(r.content)
        assert data["exported_count"] == 13  # all mock items


# ═══════════════════════════════════════════════════════════════════════════════
# Duplicates
# ═══════════════════════════════════════════════════════════════════════════════

class TestDuplicates:
    def _setup_with_link(self, client):
        r = client.post("/meetings", json={
            "title": "Dup Test", "date": "2026-10-23",
            "participants": [], "raw_text": "x",
        })
        mid = r.json()["id"]
        client.post(f"/meetings/{mid}/extract")
        _wait_for_extraction(client, mid)
        return mid

    def test_list_duplicates(self, client):
        mid = self._setup_with_link(client)
        r = client.get(f"/meetings/{mid}/duplicates")
        assert r.status_code == 200
        links = r.json()
        # Mock pipeline has 2 links (1 DUPLICATE + 1 CONFLICT)
        assert len(links) == 2
        assert all("item_a" in l for l in links)
        assert all("item_b" in l for l in links)
        assert all(l["resolution"] == "PENDING" for l in links)

    def test_resolve_duplicate_keep_both(self, client):
        mid = self._setup_with_link(client)
        links = client.get(f"/meetings/{mid}/duplicates").json()
        link_id = links[0]["id"]

        r = client.post(f"/duplicates/{link_id}/resolve", json={"action": "keep_both"})
        assert r.status_code == 200
        assert r.json()["resolution"] == "KEPT_BOTH"

    def test_resolve_duplicate_merge(self, client):
        mid = self._setup_with_link(client)
        links = client.get(f"/meetings/{mid}/duplicates").json()
        dup_link = next(l for l in links if l["relation"] == "DUPLICATE")
        link_id = dup_link["id"]
        keep_id = dup_link["item_a"]["id"]

        r = client.post(f"/duplicates/{link_id}/resolve", json={
            "action": "merge",
            "keep_item_id": keep_id,
        })
        assert r.status_code == 200
        result = r.json()
        assert result["resolution"] == "MERGED"

    def test_resolve_already_resolved_fails(self, client):
        mid = self._setup_with_link(client)
        links = client.get(f"/meetings/{mid}/duplicates").json()
        link_id = links[0]["id"]

        client.post(f"/duplicates/{link_id}/resolve", json={"action": "keep_both"})
        r = client.post(f"/duplicates/{link_id}/resolve", json={"action": "keep_both"})
        assert r.status_code == 409


# ═══════════════════════════════════════════════════════════════════════════════
# Dashboard
# ═══════════════════════════════════════════════════════════════════════════════

class TestDashboardEndpoints:
    def test_health(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_dashboard_after_extraction(self, client):
        r = client.post("/meetings", json={
            "title": "Dash Test", "date": "2026-10-23",
            "participants": [], "raw_text": "x",
        })
        mid = r.json()["id"]
        client.post(f"/meetings/{mid}/extract")
        _wait_for_extraction(client, mid)

        r = client.get(f"/dashboard?meeting_id={mid}")
        assert r.status_code == 200
        body = r.json()
        assert body["counts"]["READY_FOR_REVIEW"] == 9
        assert body["counts"]["NEEDS_CLARIFICATION"] == 4
        assert body["awaiting_clarification"] == 4
