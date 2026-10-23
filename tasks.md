# Tasks — Meeting-to-Execution Automation Agent

Build order: each stage must be complete and tested before the next begins.

---

## Stage 1 — Foundation
> Goal: The app starts, DB tables exist, schemas compile, errors are typed.

- [ ] T-01: Create full folder structure with all __init__.py files
- [ ] T-02: Write requirements.txt (all pinned versions)
- [ ] T-03: Write config.py (pydantic-settings, all env vars)
- [ ] T-04: Write db.py (SQLAlchemy engine, session factory, get_db dependency)
- [ ] T-05: Write models.py (Meeting, Item, DuplicateLinkRow, Clarification, AuditLog, Member)
- [ ] T-06: Write schemas.py (all enums + Pydantic models including PipelineResult contract)
- [ ] T-07: Write errors.py (typed exceptions, HTTP error response shape)
- [ ] T-08: Write main.py (FastAPI app, CORS, router registration, table creation on startup)
- [ ] T-09: Create data/demo_transcript.txt (product roadmap meeting, ~60 lines)
- [ ] T-10: Create data/mock_pipeline_result.json (~10 items, all types, ambiguity flags, 1 DUPLICATE, 1 CONFLICT)
- [ ] T-11: Verify: `uvicorn app.main:app` starts and /docs loads

---

## Stage 2 — Meetings Flow
> Goal: Full meeting CRUD + extraction background task works end-to-end with mock AI.

- [ ] T-12: Write services/ai/mock.py (load and validate mock_pipeline_result.json)
- [ ] T-13: Write services/ai/pipeline.py (USE_MOCK_AI branch calls mock; real branch is a stub for now)
- [ ] T-14: Write state_machine.py initial_status() only (no transitions yet)
- [ ] T-15: Write services/extraction_job.py (full background task: call pipeline, persist items + links, set statuses)
- [ ] T-16: Write routers/meetings.py (POST /meetings, POST /meetings/{id}/extract, GET /meetings, GET /meetings/{id}, GET /meetings/{id}/items)
- [ ] T-17: Verify: create meeting → extract → GET items shows ~10 items with correct statuses

---

## Stage 3 — State Machine + Item Actions
> Goal: All status transitions enforced; items can be reviewed and approved.

- [ ] T-18: Write state_machine.py transition() with all rules and AuditLog writes
- [ ] T-19: Write state_machine.py revalidate_flags()
- [ ] T-20: Write services/item_service.py (edit, approve, reject, unapprove, clarify logic)
- [ ] T-21: Write routers/items.py (PATCH /items/{id}, POST approve/reject/unapprove/clarify, GET audit)
- [ ] T-22: Write POST /meetings/{id}/approve-all-ready in meetings router
- [ ] T-23: Write tests/test_state_machine.py (all transitions, disallowed raises, audit row written, flag revalidation)
- [ ] T-24: Run tests — all pass

---

## Stage 4 — Gate Tests
> Goal: Prove the gate is unbreakable before building real integrations.

- [ ] T-25: Write fake TrelloClient and fake Notifier in tests/conftest.py
- [ ] T-26: Write tests/test_gate.py:
  - push(dry_run=false) only calls fake Trello for APPROVED items
  - push(dry_run=true) never calls fake Trello
  - notifier only fires for APPROVED/SYNCED items
  - scheduler reminder job respects the same gate
- [ ] T-27: Run gate tests (they will fail until push endpoint exists — keep as pending)

---

## Stage 5 — Export
> Goal: CSV and JSON export work before Trello.

- [ ] T-28: Write integrations/exporter.py (CSV + JSON, columns as specified)
- [ ] T-29: Write GET /meetings/{id}/export endpoint in meetings router
- [ ] T-30: Verify: export approved items returns correct CSV/JSON

---

## Stage 6 — Duplicates
> Goal: Duplicate links visible; resolution workflow complete.

- [ ] T-31: Write services/dedupe_service.py (merge, keep_both, reject_one logic)
- [ ] T-32: Write routers/duplicates.py (GET /meetings/{id}/duplicates, POST /duplicates/{id}/resolve)
- [ ] T-33: Verify: resolve DUPLICATE as merge → one item REJECTED, fields copied, both audited

---

## Stage 7 — Trello Push
> Goal: Real Trello integration + dry_run + partial failure handling.

- [ ] T-34: Write integrations/base.py (TaskSink Protocol, ExternalRef dataclass)
- [ ] T-35: Write integrations/trello.py (TrelloClient: list resolution, create_card, get_card_list, member mapping)
- [ ] T-36: Write POST /meetings/{id}/push endpoint in meetings router (dry_run, partial failure, APPROVED → SYNCED)
- [ ] T-37: Write integrations/github.py (stub implementing TaskSink, clearly marked stretch)
- [ ] T-38: Run test_gate.py — all pass with fake Trello
- [ ] T-39: Manually verify with real Trello keys (optional in hackathon — dry_run=true is sufficient for demo)

---

## Stage 8 — Dashboard + Scheduler + Notifier
> Goal: Full observability and background automation.

- [ ] T-40: Write services/tracking.py (overdue, unassigned, awaiting clarification, pending from previous meetings)
- [ ] T-41: Write routers/dashboard.py (GET /dashboard, POST /sync, GET /health)
- [ ] T-42: Write integrations/notifier.py (Slack webhook, gate check, no-op if not configured)
- [ ] T-43: Write services/scheduler.py (APScheduler, sync job + overdue reminder job)
- [ ] T-44: Wire scheduler into main.py startup/shutdown
- [ ] T-45: Write tests/test_dashboard.py (overdue counts, unassigned counts, pending-from-previous-meetings)
- [ ] T-46: Run all tests — all pass

---

## Stage 9 — AI Pipeline (Real Gemini)
> Goal: Replace mock with real Gemini calls.

- [ ] T-47: Write services/ai/prompts.py (extraction prompt + duplicate detection prompt)
- [ ] T-48: Write services/ai/gemini.py (Gemini client with structured output, two-key fallback)
- [ ] T-49: Update services/ai/pipeline.py to call gemini.py when USE_MOCK_AI=false
- [ ] T-50: Write tests/test_endpoints.py (full flow with mock AI: create → extract → list → clarify → approve → push → SYNCED)
- [ ] T-51: Manual test with real transcript + Gemini API

---

## Stage 10 — Members
> Goal: Owner-to-Trello mapping works.

- [ ] T-52: Write routers/members.py (GET/POST/PUT/DELETE /members)
- [ ] T-53: Wire member lookup into Trello push

---

## Stage 11 — Docker + README
> Goal: `docker compose up` works; README is judge-ready.

- [ ] T-54: Write backend/Dockerfile
- [ ] T-55: Write docker-compose.yml
- [ ] T-56: Write .env.example (all variables documented)
- [ ] T-57: Write README.md (setup, env vars, mock vs real AI, Trello setup, demo flow)
- [ ] T-58: Final end-to-end run: docker compose up → demo transcript → Trello push → dashboard

---

## Priority for demo day (if time runs short)

Must have (judges will test these):
- Stage 1, 2, 3 complete (full extraction + review flow)
- Stage 5 (export — Trello fallback)
- Stage 6 (duplicate resolution)
- Stage 9 (real Gemini — this is what impresses judges)

Good to have:
- Stage 7 (Trello push)
- Stage 8 (dashboard)
- Stage 11 (Docker)

Nice to have:
- Slack notifier
- GitHub stub
- APScheduler
