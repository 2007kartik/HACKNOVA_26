# Design — Meeting-to-Execution Automation Agent

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  FastAPI Application                 │
│                                                     │
│  Routers                                            │
│  ├── /meetings      (create, extract, list, export) │
│  ├── /items         (edit, approve, clarify, audit) │
│  ├── /duplicates    (list, resolve)                 │
│  ├── /members       (CRUD)                          │
│  └── /dashboard     (counts, sync, health)          │
│                                                     │
│  Services                                           │
│  ├── extraction_job.py  (BackgroundTask runner)     │
│  ├── item_service.py    (item CRUD + revalidation)  │
│  ├── dedupe_service.py  (duplicate resolution)      │
│  ├── tracking.py        (overdue / unassigned)      │
│  └── scheduler.py       (APScheduler jobs)          │
│                                                     │
│  AI Layer                                           │
│  ├── pipeline.py    (entry point, key fallback)     │
│  ├── prompts.py     (Gemini prompt templates)       │
│  ├── gemini.py      (Gemini API client)             │
│  └── mock.py        (reads mock_pipeline_result)    │
│                                                     │
│  Integrations                                       │
│  ├── base.py        (TaskSink Protocol)             │
│  ├── trello.py      (Trello REST client)            │
│  ├── exporter.py    (CSV + JSON export)             │
│  ├── notifier.py    (Slack webhook)                 │
│  └── github.py      (stub — stretch goal)           │
│                                                     │
│  Core                                               │
│  ├── models.py      (SQLAlchemy ORM)                │
│  ├── schemas.py     (Pydantic v2 contracts)         │
│  ├── state_machine.py (transition engine)           │
│  ├── errors.py      (typed exceptions)              │
│  ├── config.py      (pydantic-settings)             │
│  └── db.py          (engine, session factory)       │
└─────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
    SQLite / Postgres           Gemini API
                                Trello REST API
                                Slack Webhook
```

---

## 2. Data Flow

### 2.1 Meeting Creation + Extraction
```
POST /meetings
  → validate MeetingIn schema
  → insert Meeting(status=CREATED)
  → return meeting

POST /meetings/{id}/extract
  → set Meeting(status=EXTRACTING)
  → enqueue BackgroundTask(extraction_job)
  → return 202

extraction_job runs:
  → load existing items from DB (for duplicate context)
  → call run_pipeline(meeting, existing_tasks)
      if USE_MOCK_AI=true → read mock JSON
      else → call Gemini with structured prompt
             if primary key fails → retry with fallback key
  → persist all ExtractedItems as Item rows
  → persist all DuplicateLinks as DuplicateLinkRow rows
  → compute initial_status() for each item
  → transition() each item to its initial status
  → set Meeting(status=EXTRACTED)
  → on any exception: Meeting(status=FAILED, error_message=...)
```

### 2.2 Human Review Flow
```
GET /meetings/{id}/items
  → user sees items grouped by status

PATCH /items/{id}  (edit owner/deadline/etc.)
  → update fields
  → revalidate_flags()  → may auto-transition
  → write AuditLog

POST /items/{id}/clarify
  → store Clarification row
  → apply answer to item field
  → revalidate_flags()

POST /items/{id}/approve
  → transition(READY_FOR_REVIEW → APPROVED)
  → validates: owner non-empty for ACTION_ITEM/FOLLOW_UP
               no unresolved ambiguity flags
               type/commitment_level eligible

POST /meetings/{id}/approve-all-ready
  → iterate READY_FOR_REVIEW items
  → attempt transition for each
  → return approved[] and skipped[{id, reason}]
```

### 2.3 Push Flow (THE GATE)
```
POST /meetings/{id}/push?target=trello&dry_run=false
  → query items WHERE status=APPROVED AND meeting_id={id}
  → for each item:
      if dry_run=true: add to would_create list, skip
      if dry_run=false:
        → look up owner in Member table → trello_member_id
        → TrelloClient.create_card(item, meeting)
        → store external_id, external_url on item
        → transition(APPROVED → SYNCED)
        → if Trello call fails: mark item as error, continue
  → return {pushed: [...], failed: [...], dry_run: bool}

GATE INVARIANT: Nothing in integrations/ may call create_card
or notifier.send() for an item whose status ≠ APPROVED.
The notifier enforces this itself. The push endpoint enforces
this by only querying APPROVED items.
```

---

## 3. Database Schema

```
Meeting
  id            UUID PK
  title         TEXT
  date          DATE
  raw_text      TEXT
  participants_json  TEXT (JSON array)
  status        ENUM(CREATED, EXTRACTING, EXTRACTED, FAILED)
  error_message TEXT nullable
  created_at    DATETIME UTC

Item
  id            UUID PK
  meeting_id    FK → Meeting
  type          ENUM(ACTION_ITEM, DECISION, SUGGESTION, OPEN_QUESTION, FOLLOW_UP)
  commitment_level ENUM(CONFIRMED, PROPOSED, UNRESOLVED)
  title         TEXT
  description   TEXT
  owner         TEXT nullable
  deadline      DATE nullable
  evidence_quote TEXT
  speaker       TEXT nullable
  timestamp     TEXT nullable
  confidence    FLOAT
  flags_json    TEXT (JSON array of ambiguity flags)
  status        ENUM(EXTRACTED, NEEDS_CLARIFICATION, READY_FOR_REVIEW,
                     APPROVED, REJECTED, SYNCED, DONE)
  reasoning     TEXT
  external_id   TEXT nullable  (Trello card ID)
  external_url  TEXT nullable  (Trello card URL)
  created_at    DATETIME UTC
  updated_at    DATETIME UTC

DuplicateLinkRow
  id            UUID PK
  meeting_id    FK → Meeting
  item_a_id     FK → Item
  item_b_id     FK → Item
  relation      ENUM(DUPLICATE, CONFLICT, RELATED)
  score         FLOAT
  explanation   TEXT
  resolution    ENUM(PENDING, MERGED, KEPT_BOTH, REJECTED_ONE) default PENDING

Clarification
  id            UUID PK
  item_id       FK → Item
  field         TEXT
  question      TEXT
  answer        TEXT nullable
  resolved      BOOL default false

AuditLog
  id            UUID PK
  item_id       FK → Item
  action        TEXT  (e.g. "TRANSITION", "EDIT", "CLARIFY")
  actor         TEXT
  diff_json     TEXT (JSON: {field: [old, new], ...})
  ts            DATETIME UTC

Member
  id            UUID PK
  name          TEXT unique
  email         TEXT nullable
  trello_member_id  TEXT nullable
  github_login  TEXT nullable
```

---

## 4. State Machine

```
                    ┌──────────────────────────┐
                    │         EXTRACTED         │  (set by extraction_job only)
                    └──────────┬───────────────┘
                               │ initial_status()
               ┌───────────────┴──────────────┐
               ▼                              ▼
  ┌─────────────────────┐        ┌──────────────────────┐
  │  NEEDS_CLARIFICATION │◄──────│   READY_FOR_REVIEW   │
  └──────────┬──────────┘        └──────────┬───────────┘
             │                              │ approve
             │ clarify/edit                 ▼
             │ (auto-transition)  ┌──────────────────────┐
             └──────────────────►│       APPROVED        │◄─┐
                                 └──────────┬────────────┘  │ un-approve
                                            │               │
                                            ▼               │
                                 ┌──────────────────────┐   │
                                 │        SYNCED         │───┘ (cannot un-approve once synced)
                                 └──────────┬────────────┘
                                            │ sync job
                                            ▼
                                 ┌──────────────────────┐
                                 │         DONE          │
                                 └──────────────────────┘

REJECTED can be reached from: NEEDS_CLARIFICATION, READY_FOR_REVIEW, APPROVED
REJECTED is terminal.
```

---

## 5. AI Pipeline Design

### 5.1 Gemini Structured Output Strategy

We use `google-generativeai` SDK with `response_mime_type="application/json"` and a
response schema that maps 1:1 to PipelineResult. This forces Gemini to output valid
structured JSON matching our Pydantic schema every time.

### 5.2 Prompt Strategy (Two-Pass)

**Pass 1 — Extraction:**
System: You are an expert meeting analyst. Extract all actionable content from this transcript.
For each item classify: type (ACTION_ITEM / DECISION / SUGGESTION / OPEN_QUESTION / FOLLOW_UP),
commitment_level (CONFIRMED / PROPOSED / UNRESOLVED), owner, deadline, evidence quote, confidence.
Flag ambiguities: NO_OWNER, VAGUE_OWNER, MULTIPLE_OWNERS, VAGUE_DEADLINE, NO_DEADLINE.

**Pass 2 — Duplicate Detection:**
System: Given this list of extracted items, identify any pairs that are duplicates (same task
expressed differently), conflicts (contradictory deadlines/owners for same task), or related.
Return as DuplicateLink pairs with score and explanation.

This two-pass approach gives better duplicate detection because Gemini can reason across the
full item list in isolation.

### 5.3 Key Fallback Logic

```python
async def run_pipeline(meeting, existing_tasks):
    for key in [settings.GEMINI_API_KEY_1, settings.GEMINI_API_KEY_2]:
        if not key:
            continue
        try:
            return await _call_gemini(key, meeting, existing_tasks)
        except (ResourceExhausted, APIError):
            continue
    raise PipelineError("All Gemini keys exhausted")
```

---

## 6. Key Design Decisions

### Decision 1: State machine as the single source of truth
All item status changes go through one function. This makes the gate guarantee testable:
you can prove in tests that no item reaches Trello without going through APPROVED.

### Decision 2: BackgroundTask for extraction
Extraction can take 5-15 seconds (LLM call). We return 202 immediately and let the client
poll GET /meetings/{id} until status=EXTRACTED. This prevents HTTP timeouts.

### Decision 3: Pydantic v2 + SQLAlchemy 2.x
Pydantic v2 model_validate() works cleanly with SQLAlchemy 2.x row objects. We keep
schemas.py as the shared contract — it defines what the AI pipeline returns AND what
the API sends to clients.

### Decision 4: Dependency injection for all external clients
TrelloClient and Notifier are injected via FastAPI Depends(). Tests override them with
fakes. This is how we prove the gate works without making real HTTP calls.

### Decision 5: Two-key Gemini fallback
Gemini Flash has rate limits per key. In a live demo, hitting a rate limit is fatal.
The fallback key is a safety net that costs nothing extra to implement.

### Decision 6: Mock AI behind a flag
USE_MOCK_AI=true is the default so the full flow can be tested and demonstrated without
spending API credits or requiring network access. The mock returns the same PipelineResult
shape, so swapping to real Gemini is a one-line env var change.

---

## 7. Folder Structure

```
HACKNOVA_26/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── state_machine.py
│   │   ├── errors.py
│   │   ├── routers/
│   │   │   ├── meetings.py
│   │   │   ├── items.py
│   │   │   ├── duplicates.py
│   │   │   ├── members.py
│   │   │   └── dashboard.py
│   │   ├── services/
│   │   │   ├── ai/
│   │   │   │   ├── pipeline.py
│   │   │   │   ├── gemini.py
│   │   │   │   ├── prompts.py
│   │   │   │   └── mock.py
│   │   │   ├── extraction_job.py
│   │   │   ├── item_service.py
│   │   │   ├── dedupe_service.py
│   │   │   ├── tracking.py
│   │   │   └── scheduler.py
│   │   └── integrations/
│   │       ├── base.py
│   │       ├── trello.py
│   │       ├── exporter.py
│   │       ├── notifier.py
│   │       └── github.py
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_state_machine.py
│   │   ├── test_gate.py
│   │   ├── test_endpoints.py
│   │   └── test_dashboard.py
│   ├── requirements.txt
│   └── Dockerfile
├── data/
│   ├── demo_transcript.txt
│   └── mock_pipeline_result.json
├── .env.example
├── docker-compose.yml
├── requirements.md
├── design.md
└── tasks.md
```
