# Frontend Specification — Meeting-to-Execution Automation Agent
> Hand this doc to your frontend teammate. Everything they need is here.

---

## 1. Project Overview

The backend is a FastAPI server running on `http://localhost:8000`.
All endpoints are JSON (except CSV export). OpenAPI docs are at `http://localhost:8000/docs` — use them to explore request/response shapes interactively.

The frontend is a **single-page app** that lets users:
1. Upload or paste a meeting transcript
2. Watch it get processed by AI
3. Review extracted tasks, decisions, and follow-ups
4. Clarify ambiguous items
5. Approve items and push them to Trello
6. Track completion via a dashboard

**Tech stack suggestion:** React + TypeScript + TailwindCSS + TanStack Query (React Query) for data fetching. But your teammate can use whatever they prefer — the backend is framework-agnostic.

---

## 2. Base URL & Headers

```
Base URL: http://localhost:8000
Content-Type: application/json   (for all POST/PATCH requests)
```

No authentication required (hackathon scope).

CORS is enabled for `http://localhost:3000` by default. If the frontend runs on a different port, tell the backend developer to update `FRONTEND_ORIGINS` in `.env`.

---

## 3. Enums (use these exact string values in the UI)

### ItemType
| Value | Display Label | Icon suggestion |
|---|---|---|
| `ACTION_ITEM` | Action Item | ✅ checkbox |
| `DECISION` | Decision | ⚖️ scales |
| `SUGGESTION` | Suggestion | 💡 bulb |
| `OPEN_QUESTION` | Open Question | ❓ question |
| `FOLLOW_UP` | Follow-up | 🔄 refresh |

### CommitmentLevel
| Value | Display Label | Badge color |
|---|---|---|
| `CONFIRMED` | Confirmed | Green |
| `PROPOSED` | Proposed | Yellow |
| `UNRESOLVED` | Unresolved | Gray |

### ItemStatus
| Value | Display Label | Badge color | Meaning |
|---|---|---|---|
| `EXTRACTED` | Extracted | Blue | Just came out of AI |
| `NEEDS_CLARIFICATION` | Needs Clarification | Orange | Has ambiguity flags — user must act |
| `READY_FOR_REVIEW` | Ready for Review | Purple | Clean, waiting for approval |
| `APPROVED` | Approved | Green | Approved by user |
| `REJECTED` | Rejected | Red | Rejected — terminal |
| `SYNCED` | Synced to Trello | Teal | Pushed to Trello |
| `DONE` | Done | Gray | Completed |

### AmbiguityFlags (shown as warning chips on items)
| Flag | User-friendly message |
|---|---|
| `NO_OWNER` | No owner assigned |
| `VAGUE_OWNER` | Owner is unclear ("the team", "someone") |
| `MULTIPLE_OWNERS` | Multiple owners mentioned |
| `VAGUE_DEADLINE` | Deadline is vague ("soon", "next week") |
| `NO_DEADLINE` | No deadline mentioned |

### MeetingStatus
| Value | Display | UI behavior |
|---|---|---|
| `CREATED` | Created | Show "Start Extraction" button |
| `EXTRACTING` | Processing... | Show spinner, poll every 2s |
| `EXTRACTED` | Ready | Show items list |
| `FAILED` | Failed | Show error message |

---

## 4. API Reference

### 4.1 Meetings

#### Create a Meeting
```
POST /meetings
Body:
{
  "title": "Q3 Roadmap Planning",
  "date": "2026-10-23",              // ISO date string YYYY-MM-DD
  "participants": ["Alice", "Bob", "Carol"],
  "raw_text": "Alice: We need to..."  // the full transcript text
}

Response 201:
{
  "id": "uuid",
  "title": "Q3 Roadmap Planning",
  "date": "2026-10-23",
  "participants": ["Alice", "Bob", "Carol"],
  "status": "CREATED",
  "error_message": null,
  "created_at": "2026-10-23T10:00:00Z"
}
```

#### Trigger AI Extraction
```
POST /meetings/{id}/extract
Body: (empty)

Response 202:
{
  "message": "Extraction started",
  "meeting_id": "uuid"
}
```
> After calling this, poll `GET /meetings/{id}` every 2 seconds until `status` is `EXTRACTED` or `FAILED`.

#### List All Meetings
```
GET /meetings

Response 200:
[
  {
    "id": "uuid",
    "title": "...",
    "date": "2026-10-23",
    "status": "EXTRACTED",
    "created_at": "..."
  },
  ...
]
```

#### Get Single Meeting
```
GET /meetings/{id}

Response 200:
{
  "id": "uuid",
  "title": "...",
  "date": "...",
  "participants": [...],
  "status": "EXTRACTED",
  "raw_text": "...",
  "error_message": null,
  "created_at": "..."
}
```

#### Get Meeting Items (with optional filters)
```
GET /meetings/{id}/items?type=ACTION_ITEM&status=NEEDS_CLARIFICATION

Query params (all optional):
  type   = ACTION_ITEM | DECISION | SUGGESTION | OPEN_QUESTION | FOLLOW_UP
  status = EXTRACTED | NEEDS_CLARIFICATION | READY_FOR_REVIEW | APPROVED | REJECTED | SYNCED | DONE

Response 200:
[
  {
    "id": "uuid",
    "meeting_id": "uuid",
    "type": "ACTION_ITEM",
    "commitment_level": "CONFIRMED",
    "title": "Set up CI/CD pipeline",
    "description": "...",
    "owner": "Bob",
    "deadline": "2026-11-01",
    "evidence_quote": "Bob said he would set up CI/CD by end of October",
    "speaker": "Bob",
    "confidence": 0.92,
    "flags": [],                      // ambiguity flags array
    "status": "READY_FOR_REVIEW",
    "reasoning": "...",
    "external_id": null,
    "external_url": null,
    "created_at": "...",
    "updated_at": "...",
    "duplicate_links": [...]          // linked duplicate/conflict items if any
  },
  ...
]
```

#### Approve All Ready Items
```
POST /meetings/{id}/approve-all-ready
Body: { "actor": "user@example.com" }

Response 200:
{
  "approved": ["uuid1", "uuid2"],
  "skipped": [
    { "id": "uuid3", "reason": "Owner required for ACTION_ITEM" }
  ]
}
```

#### Export Items
```
GET /meetings/{id}/export?format=csv&only=approved

Query params:
  format = csv | json    (default: json)
  only   = approved | all  (default: approved)

Response: file download (CSV or JSON)
```

#### Push to Trello
```
POST /meetings/{id}/push?target=trello&dry_run=true

Query params:
  target   = trello | github
  dry_run  = true | false   (default: true — ALWAYS show dry run first!)

Response 200:
{
  "dry_run": true,
  "pushed": [
    {
      "item_id": "uuid",
      "title": "Set up CI/CD pipeline",
      "owner": "Bob",
      "deadline": "2026-11-01",
      "trello_url": null    // null on dry_run=true, real URL on dry_run=false
    }
  ],
  "failed": []
}
```

---

### 4.2 Items

#### Edit an Item
```
PATCH /items/{id}
Body (all fields optional — only send what changed):
{
  "title": "Updated title",
  "description": "Updated description",
  "owner": "Alice",
  "deadline": "2026-11-15",
  "type": "ACTION_ITEM",
  "commitment_level": "CONFIRMED"
}

Response 200: updated Item object
```
> Editing owner/deadline automatically re-evaluates ambiguity flags. If flags are cleared, item moves to READY_FOR_REVIEW automatically.

#### Approve an Item
```
POST /items/{id}/approve
Body: { "actor": "user@example.com" }

Response 200: updated Item object
Error 409: if item has unresolved flags or is wrong type/commitment
```

#### Reject an Item
```
POST /items/{id}/reject
Body: { "actor": "user@example.com", "reason": "Not relevant" }

Response 200: updated Item object
```

#### Un-approve an Item (send back to review)
```
POST /items/{id}/unapprove
Body: { "actor": "user@example.com" }

Response 200: updated Item object
```

#### Submit Clarification
```
POST /items/{id}/clarify
Body:
{
  "field": "owner",         // which field is being clarified
  "answer": "Alice Chen"    // the clarified value
}

Response 200: updated Item object
```
> Use this when an item has `NEEDS_CLARIFICATION` status. Show a form for each ambiguity flag.

#### Get Audit History
```
GET /items/{id}/audit

Response 200:
[
  {
    "id": "uuid",
    "action": "TRANSITION",
    "actor": "system",
    "diff": { "status": ["EXTRACTED", "NEEDS_CLARIFICATION"] },
    "ts": "2026-10-23T10:01:00Z"
  },
  ...
]
```

---

### 4.3 Duplicates

#### List Duplicate/Conflict Links for a Meeting
```
GET /meetings/{id}/duplicates

Response 200:
[
  {
    "id": "uuid",
    "relation": "DUPLICATE",    // DUPLICATE | CONFLICT | RELATED
    "score": 0.87,
    "explanation": "Both items refer to setting up the deployment pipeline",
    "resolution": "PENDING",    // PENDING | MERGED | KEPT_BOTH | REJECTED_ONE
    "item_a": { ...full item object... },
    "item_b": { ...full item object... }
  }
]
```

#### Resolve a Duplicate Link
```
POST /duplicates/{id}/resolve
Body:
{
  "action": "merge",          // merge | keep_both | reject_one
  "keep_item_id": "uuid"      // required for merge and reject_one — which item to keep
}

Response 200:
{
  "resolution": "MERGED",
  "kept_item": { ...item object... },
  "rejected_item": { ...item object... }
}
```

---

### 4.4 Members

#### List Members
```
GET /members
Response 200: [{ "id", "name", "email", "trello_member_id", "github_login" }, ...]
```

#### Create Member
```
POST /members
Body: { "name": "Alice Chen", "email": "alice@company.com", "trello_member_id": "abc123", "github_login": "alicechen" }
Response 201: Member object
```

#### Update Member
```
PUT /members/{id}
Body: (same as create, all optional)
Response 200: Member object
```

#### Delete Member
```
DELETE /members/{id}
Response 204
```

---

### 4.5 Dashboard

#### Get Dashboard Stats
```
GET /dashboard?meeting_id=uuid   // meeting_id is optional — omit for global stats

Response 200:
{
  "counts": {
    "EXTRACTED": 2,
    "NEEDS_CLARIFICATION": 3,
    "READY_FOR_REVIEW": 4,
    "APPROVED": 2,
    "REJECTED": 1,
    "SYNCED": 1,
    "DONE": 0
  },
  "overdue": [
    { "id": "uuid", "title": "...", "owner": "Bob", "deadline": "2026-10-20", "status": "APPROVED" }
  ],
  "unassigned": [
    { "id": "uuid", "title": "...", "status": "READY_FOR_REVIEW" }
  ],
  "awaiting_clarification": 3,
  "pending_from_previous_meetings": [
    { "id": "uuid", "title": "...", "meeting_title": "Last Sprint", "status": "APPROVED" }
  ]
}
```

#### Trigger Trello Sync
```
POST /sync
Response 200:
{
  "synced_to_done": 2,
  "items_checked": 5
}
```

#### Health Check
```
GET /health
Response 200: { "status": "ok", "version": "1.0.0" }
```

---

### 4.6 Error Response Shape
All errors follow this shape:
```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Cannot approve item with unresolved ambiguity flags",
    "details": { "flags": ["NO_OWNER"] }
  }
}
```

Common error codes:
| Code | HTTP Status | When |
|---|---|---|
| `INVALID_TRANSITION` | 409 | State machine rule violation |
| `VALIDATION_ERROR` | 422 | Bad request body |
| `NOT_FOUND` | 404 | Item/meeting doesn't exist |
| `PIPELINE_ERROR` | 500 | AI extraction failed |
| `INTEGRATION_ERROR` | 502 | Trello/Slack call failed |

---

## 5. Suggested Pages / Views

### Page 1: Meetings List (`/`)
- Table of all meetings with title, date, status badge, item count
- "New Meeting" button → opens create form
- Click a row → goes to Meeting Detail

### Page 2: New Meeting (`/meetings/new`)
- Form: title, date, participants (tag input), transcript (large textarea)
- "Analyze Meeting" button → POST /meetings → POST /meetings/{id}/extract
- Redirect to Meeting Detail with polling spinner

### Page 3: Meeting Detail (`/meetings/:id`)
**This is the main work page. Split into tabs or sections:**

**Tab 1: Items**
- Filter bar: by type (pill buttons) and status (pill buttons)
- Item cards showing: title, type badge, commitment badge, status badge, owner, deadline
- Orange warning chips for ambiguity flags
- Action buttons per item: Approve / Reject / Edit / Clarify
- Items in `NEEDS_CLARIFICATION` status should be visually prominent (orange border)
- Bulk action: "Approve All Ready" button

**Tab 2: Duplicates**
- Side-by-side comparison cards for each duplicate/conflict pair
- Similarity score bar
- Resolve buttons: Merge (pick which to keep), Keep Both, Reject One

**Tab 3: Push to Trello**
- "Preview Push" button → dry_run=true → shows list of cards to be created
- "Push to Trello" button → dry_run=false → shows results with Trello links
- Export buttons: Download CSV, Download JSON

**Tab 4: Audit Log** (optional but impressive for judges)
- Timeline of all status changes with actor and timestamp

### Page 4: Dashboard (`/dashboard`)
- Stat cards: counts by status (donut chart or number tiles)
- Overdue items list (highlighted in red)
- Unassigned items list
- Pending from previous meetings list
- "Sync with Trello" button → POST /sync

### Page 5: Members (`/members`)
- Table of members with name, email, Trello ID, GitHub
- Add/Edit/Delete member forms

---

## 6. UX Rules (important for judge demo)

1. **Always show dry_run preview before pushing to Trello.** Never auto-push.
2. **Items in NEEDS_CLARIFICATION must be visually distinct** — orange border or warning icon.
3. **Approved items should look "locked in"** — green badge, approve button disabled/changed to "Un-approve".
4. **REJECTED items should be visually muted** — grayed out, collapsed by default.
5. **Show confidence score** on each item as a subtle progress bar or percentage. Low confidence (<0.7) should show a warning.
6. **Evidence quote** should be shown as a blockquote/callout so the user can verify the AI's extraction against the original transcript.
7. **Poll during extraction** — show a progress spinner with "AI is analyzing your meeting..." while status=EXTRACTING. Poll every 2 seconds.
8. **Show error message** clearly when meeting status=FAILED.

---

## 7. Polling Pattern (Important)

After calling `POST /meetings/{id}/extract`, the backend returns 202 immediately.
The frontend must poll until done:

```javascript
// Pseudocode
const pollExtraction = async (meetingId) => {
  while (true) {
    const meeting = await GET(`/meetings/${meetingId}`);
    if (meeting.status === 'EXTRACTED') {
      // fetch items and show them
      break;
    }
    if (meeting.status === 'FAILED') {
      // show error_message
      break;
    }
    await sleep(2000); // wait 2 seconds before next poll
  }
};
```

---

## 8. Environment Setup

The frontend should have a `.env` file:
```
VITE_API_BASE_URL=http://localhost:8000
```
(or `REACT_APP_API_BASE_URL` if using Create React App)

Use this as the base for all API calls so it's easy to switch to production URL.

---

## 9. What the Backend Developer Will Provide

- Running API at `http://localhost:8000`
- Live OpenAPI docs at `http://localhost:8000/docs` — use the "Try it out" button to test any endpoint
- `data/demo_transcript.txt` — a ready-made transcript to demo the full flow
- All endpoints listed above, in the exact order of the stages in `tasks.md`

The backend developer will build endpoints in stages. Here's the order so the frontend
developer can work incrementally:

| Available After | Endpoints Ready |
|---|---|
| Stage 1 complete | /health, /docs |
| Stage 2 complete | /meetings (CRUD), /meetings/{id}/extract, /meetings/{id}/items |
| Stage 3 complete | /items (PATCH, approve, reject, clarify), /meetings/{id}/approve-all-ready |
| Stage 5 complete | /meetings/{id}/export |
| Stage 6 complete | /meetings/{id}/duplicates, /duplicates/{id}/resolve |
| Stage 7 complete | /meetings/{id}/push |
| Stage 8 complete | /dashboard, /sync |
| Stage 10 complete | /members (CRUD) |
