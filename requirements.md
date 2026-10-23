# Requirements — Meeting-to-Execution Automation Agent

## 1. Functional Requirements

### 1.1 Meeting Input
- FR-01: Users can create a meeting by submitting a title, date, participant list, and raw transcript text via POST /meetings.
- FR-02: Users can trigger AI extraction on a meeting via POST /meetings/{id}/extract.
- FR-03: The system returns 202 immediately on extraction trigger; extraction runs as a background task.
- FR-04: Users can retrieve all meetings or a single meeting including its status, transcript, and participants.

### 1.2 AI Extraction Pipeline
- FR-05: The pipeline accepts raw meeting text and returns structured items (decisions, action items, suggestions, open questions, follow-ups).
- FR-06: Each extracted item carries: type, commitment_level, title, description, owner_raw, owner_resolved, deadline_raw, deadline_resolved, evidence_quote, speaker, timestamp, confidence score, ambiguity_flags, and reasoning.
- FR-07: Valid item types: ACTION_ITEM, DECISION, SUGGESTION, OPEN_QUESTION, FOLLOW_UP.
- FR-08: Valid commitment levels: CONFIRMED, PROPOSED, UNRESOLVED.
- FR-09: The pipeline uses Gemini as the LLM with structured JSON output enforced via response schema.
- FR-10: Two Gemini API keys are supported; if the primary key fails (rate limit / error), the system retries with the fallback key automatically.
- FR-11: When USE_MOCK_AI=true, the pipeline reads from data/mock_pipeline_result.json instead of calling Gemini.
- FR-12: The pipeline detects and returns duplicate and conflicting task pairs as DuplicateLinks with a similarity score and explanation.
- FR-13: The pipeline detects participants mentioned in the transcript and returns them.

### 1.3 Ambiguity Flags
- FR-14: The pipeline flags items with one or more of: NO_OWNER, VAGUE_OWNER, MULTIPLE_OWNERS, VAGUE_DEADLINE, NO_DEADLINE.
- FR-15: Items with any ambiguity flag are assigned initial status NEEDS_CLARIFICATION.
- FR-16: Items with no ambiguity flags are assigned initial status READY_FOR_REVIEW.

### 1.4 State Machine
- FR-17: Every item status change must go through the transition() function in state_machine.py.
- FR-18: Allowed transitions:
  - EXTRACTED → NEEDS_CLARIFICATION | READY_FOR_REVIEW
  - NEEDS_CLARIFICATION → READY_FOR_REVIEW | REJECTED
  - READY_FOR_REVIEW → APPROVED | REJECTED | NEEDS_CLARIFICATION
  - APPROVED → SYNCED | READY_FOR_REVIEW (un-approve) | REJECTED
  - SYNCED → DONE
- FR-19: Every transition writes an AuditLog row with actor, old status, new status, and timestamp.
- FR-20: An item cannot become APPROVED if it has unresolved ambiguity flags (NO_OWNER, VAGUE_OWNER, MULTIPLE_OWNERS must be cleared; owner must be non-empty for ACTION_ITEM and FOLLOW_UP).
- FR-21: Only ACTION_ITEM and FOLLOW_UP with commitment_level CONFIRMED may be pushed to a task board.
- FR-22: DECISION items are exportable but not pushed as tasks.
- FR-23: SUGGESTION and OPEN_QUESTION items can only be approved after user edits their type/commitment_level and passes FR-20.
- FR-24: An item cannot become SYNCED unless its current status is APPROVED.

### 1.5 Item Actions
- FR-25: Users can edit an item's title, description, owner, deadline, type, and commitment_level via PATCH /items/{id}.
- FR-26: Editing an item triggers revalidate_flags() which re-computes ambiguity flags and moves the item between NEEDS_CLARIFICATION and READY_FOR_REVIEW automatically.
- FR-27: Users can approve, reject, or un-approve an item individually.
- FR-28: Users can submit a clarification for a specific field via POST /items/{id}/clarify.
- FR-29: Users can bulk-approve all READY_FOR_REVIEW items in a meeting via POST /meetings/{id}/approve-all-ready.
- FR-30: Users can view the full audit history for any item.

### 1.6 Duplicate and Conflict Management
- FR-31: The system exposes duplicate/conflict links with both items expanded.
- FR-32: Users can resolve a link via: merge (keep one item, reject the other, copy missing fields), keep_both, or reject_one.
- FR-33: Merge audits both affected items.

### 1.7 Members
- FR-34: Users can manage a member directory mapping display names to emails, Trello member IDs, and GitHub logins.
- FR-35: The Trello client uses this directory to map item owners to Trello member IDs when creating cards.

### 1.8 Export
- FR-36: Users can export meeting items as CSV or JSON via GET /meetings/{id}/export?format=csv|json.
- FR-37: Export supports an `only` filter: approved (default) or all.
- FR-38: Export columns: title, type, commitment, owner, deadline, status, evidence, meeting.

### 1.9 Trello Push
- FR-39: POST /meetings/{id}/push?target=trello&dry_run=true returns the exact list of cards that would be created with no side effects.
- FR-40: POST /meetings/{id}/push?target=trello&dry_run=false pushes ONLY items with status APPROVED to Trello, stores external_id/external_url, and transitions each to SYNCED.
- FR-41: One failed item during push must not abort the others; partial results are returned.
- FR-42: Trello cards carry: name=title, desc=(description + evidence quote + meeting title), due=deadline, idMembers=[mapped trello_member_id].
- FR-43: If an owner has no Trello mapping, the card is still created with "Owner: <name>" in the description.

### 1.10 Dashboard and Tracking
- FR-44: GET /dashboard returns: counts by status, overdue items, unassigned action items, items awaiting clarification, and pending items from previous meetings.
- FR-45: POST /sync checks Trello card lists for SYNCED items and transitions any in the "Done" list to DONE.
- FR-46: GET /health returns service health status.

### 1.11 Background Scheduler
- FR-47: APScheduler runs on startup (if ENABLE_SCHEDULER=true).
- FR-48: Every SYNC_INTERVAL_MINUTES, the scheduler runs Trello sync and the overdue check.
- FR-49: The overdue reminder notifier sends Slack messages only for APPROVED or SYNCED items.

### 1.12 Notifications
- FR-50: The Slack notifier sends to SLACK_WEBHOOK_URL via httpx.
- FR-51: The notifier is a no-op if SLACK_WEBHOOK_URL is not configured.
- FR-52: The notifier MUST refuse to send for any item whose status is not APPROVED or SYNCED.

---

## 2. Non-Functional Requirements

- NFR-01: All timestamps are UTC ISO 8601 strings.
- NFR-02: All error responses follow the shape {error: {code, message, details}}.
- NFR-03: CORS is configured via FRONTEND_ORIGINS env var.
- NFR-04: Database sessions, Trello client, and notifier are dependency-injected (testable).
- NFR-05: Tables are created automatically on startup (no Alembic migrations needed).
- NFR-06: The API exposes OpenAPI docs at /docs.
- NFR-07: The system runs via `docker compose up` and serves on :8000.
- NFR-08: Python 3.13, FastAPI, Pydantic v2, SQLAlchemy 2.x, httpx, APScheduler.
- NFR-09: SQLite by default; DATABASE_URL env var allows switching to Postgres.

---

## 3. Environment Variables

| Variable | Description | Default |
|---|---|---|
| DATABASE_URL | SQLAlchemy DB URL | sqlite:///./meeting_agent.db |
| USE_MOCK_AI | Use mock pipeline instead of Gemini | true |
| GEMINI_API_KEY_1 | Primary Gemini API key | (blank) |
| GEMINI_API_KEY_2 | Fallback Gemini API key | (blank) |
| GEMINI_MODEL | Gemini model name | gemini-2.0-flash |
| TRELLO_KEY | Trello API key | (blank) |
| TRELLO_TOKEN | Trello API token | (blank) |
| TRELLO_BOARD_ID | Target Trello board ID | (blank) |
| SLACK_WEBHOOK_URL | Slack incoming webhook URL | (blank) |
| FRONTEND_ORIGINS | Comma-separated CORS origins | http://localhost:3000 |
| ENABLE_SCHEDULER | Enable APScheduler background jobs | false |
| SYNC_INTERVAL_MINUTES | How often scheduler runs | 5 |
