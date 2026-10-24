# Antigravity Master Implementation Brief --- Frontend

## Meeting-to-Execution Automation Agent \| HACKNOVA'26 PS-4

> **This is an execution brief, not just a planning document.** Give
> this file and the user's accompanying prompt to Antigravity.
> Antigravity should inspect the existing repository, implement the
> frontend in `frontend/`, run available checks, fix errors, and report
> exactly what is complete and what depends on the backend. Do not stop
> after producing another plan or mockup.

------------------------------------------------------------------------

# 0. Instructions to the coding agent

You are the frontend engineer implementing the frontend for HACKNOVA'26
PS-4, **Meeting-to-Execution Automation Agent**.

## Mandatory repository rules

1.  Work only in the existing repository's `frontend/` directory, except
    where a root-level Git status check is necessary.
2.  Preserve `backend/`, `ai-service/`, and root files. Do not edit them
    to make the frontend work. If CORS or an API contract needs a
    backend change, report it as a handoff item for the backend
    teammate.
3.  Inspect the existing files before creating anything. The initial
    repository has `frontend/.gitkeep`; if the repository has changed
    since this brief was written, preserve and build on the current work
    rather than overwriting it.
4.  Do not change branches, commit, push, or rewrite Git history unless
    the user explicitly asks.
5.  Implement the application, not merely describe it. Do not stop to
    ask questions for details that can be resolved by inspecting
    repository files and the live API docs.
6.  Never invent backend fields or endpoints. Check
    `http://localhost:8000/docs` if the backend is running. Where it is
    unavailable, implement against the contract in this document,
    isolate uncertain fields in TypeScript adapters, and list the
    uncertainty in the final report.
7.  Do not add secrets to frontend files. Do not place Gemini, Trello,
    Slack, or other private integration credentials in Vite environment
    variables.
8.  Never trigger external side effects automatically. A real task-board
    push must require an explicit user action after a dry-run preview.
9.  Do not mark a task done just because it was approved or pushed.
10. After implementation, run available lint, type-check, build, and
    tests. Fix issues caused by your changes. Do not claim a check
    passed unless it actually ran successfully.

## Required outcome

A usable, polished, responsive React single-page application that is
connected to the provided FastAPI backend and supports this end-to-end
flow:

**Meeting transcript → AI extraction → evidence-backed review →
clarification/editing → approval → duplicate/conflict resolution →
dry-run preview → explicit Trello push or CSV/JSON export → dashboard
tracking.**

The core safety message must be visible in the UX: **AI proposes; a
human reviews and approves; only eligible approved work can be pushed.**

------------------------------------------------------------------------

# 1. Source of truth and scope

This brief consolidates the team's `frontend_spec.md` and
`requirements.md`. These two files describe the intended frontend and
backend contract. The overall problem statement requires a system that
extracts decisions, action items, owners, deadlines and follow-ups;
distinguishes confirmed commitments from suggestions and unresolved
questions; detects duplicates/conflicts; requires review and approval;
exports or integrates tasks; and tracks overdue/unassigned work.

The backend is a FastAPI server at `http://localhost:8000`. Interactive
API documentation should be available at `http://localhost:8000/docs`.
All documented endpoints are JSON except file exports; `204 No Content`
is used for member deletion. Hackathon scope has no frontend
authentication requirement.

## Frontend stack

Use: - React - TypeScript - Vite - Tailwind CSS - React Router for
navigation - TanStack Query for API fetching, cache invalidation and
polling - A lightweight icon library such as Lucide React if it can be
installed without conflict - A chart library only if useful; the
dashboard must remain useful without charts

Prefer the existing stack if files already exist. If no app exists,
initialize this stack inside `frontend/` only. Avoid unnecessary
dependencies and overengineering.

## API and CORS

-   API base: `http://localhost:8000`
-   Health: `GET /health`
-   Docs: `http://localhost:8000/docs`
-   Vite environment variable: `VITE_API_BASE_URL=http://localhost:8000`
-   The backend default CORS origin is `http://localhost:3000`. Vite
    commonly uses port `5173`; do not edit backend files to fix this.
    Report that the backend teammate must add the actual frontend origin
    to `FRONTEND_ORIGINS`, or configure the frontend port to match the
    backend contract if practical.

------------------------------------------------------------------------

# 2. Product behavior and information architecture

Implement these routes:

  -----------------------------------------------------------------------
  Route                   Page                    Purpose
  ----------------------- ----------------------- -----------------------
  `/`                     Meetings                Landing page and
                                                  meeting list

  `/meetings/new`         New Meeting             Create a meeting and
                                                  submit transcript

  `/meetings/:id`         Meeting Detail          Extraction, items,
                                                  review, duplicates,
                                                  push/export, audit

  `/dashboard`            Dashboard               Global status, overdue,
                                                  unassigned, pending
                                                  work

  `/members`              Members                 Manage team-member
                                                  mappings
  -----------------------------------------------------------------------

Add a shared application shell with: - Left sidebar or responsive
navigation for Meetings, Dashboard and Members. - Product name and short
tagline. - Clear active navigation state. - Main content area with
readable max width. - Consistent status/type badges, buttons, cards,
forms, dialogs and alerts. - Responsive behavior on desktop, tablet and
mobile.

Do not build a video-call application. The input is a transcript or
notes already available to the user.

## Visual design

Use a modern, clean B2B SaaS interface suitable for a hackathon judge
demo: - Neutral background, white/surface cards, strong readable
typography and restrained accent colors. - A clear page title, concise
helper text, and one primary action per screen. - Statuses must include
text labels; never rely on color alone. - Orange warning treatment for
ambiguity, red for overdue/destructive, green for approved/success, teal
for synced, and subtle gray for rejected. - Include loading
skeletons/spinners, empty states, inline validation, success feedback
and retryable errors. - Evidence quotes should be visually distinct and
easy to compare with the extracted task. - Do not use excessive
animation or decorative charts that distract from the review workflow. -
All controls need accessible labels, keyboard support, visible focus
states and meaningful button text.

------------------------------------------------------------------------

# 3. Functional requirements by page

## 3.1 Meetings list --- `/`

Implement: - Page heading "Meetings" and explanatory text. - "New
Meeting" primary button navigating to `/meetings/new`. - Fetch
`GET /meetings`. - Display a table or responsive card list with meeting
title, date, status, created date if returned, and action to open the
meeting. - Status badges for `CREATED`, `EXTRACTING`, `EXTRACTED`,
`FAILED`. - Loading, empty and error states. Empty state should guide
the user to create the first meeting. - Refresh/retry action when
loading fails. - Search/filter only if it can be implemented simply
without changing API assumptions. - Do not assume the meeting list
includes an item count; display it only if the API actually returns it
or a documented call safely supplies it.

## 3.2 New meeting --- `/meetings/new`

Form fields: - Title (required) - Meeting date (required,
`YYYY-MM-DD`) - Participants (tag input; allow add/remove names; submit
string array) - Transcript/notes (required large textarea; provide
paste-friendly UX and character count)

Submission sequence: 1. Validate fields before sending. 2. Disable
submit while pending and prevent duplicate requests. 3. Send
`POST /meetings` with exactly:
`json    {      "title": "Q3 Roadmap Planning",      "date": "2026-10-23",      "participants": ["Alice", "Bob"],      "raw_text": "Alice: We need to..."    }`
4. On successful create, use returned `id` and call
`POST /meetings/{id}/extract` once. 5. Navigate to `/meetings/:id` and
show extraction state. 6. If create succeeds but extraction fails, do
not silently create a second meeting. Show the meeting link and a
retry/start-extraction action if supported. 7. Keep user-entered values
if a request fails. 8. Add a cancel/back action.

The documented API does not define a multipart upload endpoint.
**Pasting text is the required working path.** Optional file convenience
may accept `.txt` and `.md`, read text in the browser and submit it as
`raw_text`; do not claim arbitrary PDF/Word transcription is supported.
If this optional feature creates risk or takes time, omit it.

## 3.3 Meeting detail --- `/meetings/:id`

This is the main product screen. Fetch `GET /meetings/{id}` and items
from `GET /meetings/{id}/items`.

Show: - Meeting title, date, participants, status, and collapsible
transcript. - If `CREATED`, show "Start Extraction". - If `EXTRACTING`,
show a prominent progress panel saying "AI is analyzing your meeting..."
and poll every 2 seconds. - If `EXTRACTED`, show the extracted item
workspace. - If `FAILED`, show the returned `error_message` and a safe
retry option only if backend supports it. - A back-to-meetings link.

Organize the workspace into tabs/sections: 1. **Items / Review** 2.
**Duplicates** 3. **Push & Export** 4. **Audit history** (can be a
per-item drawer/modal)

Provide filter controls for type and status. Filters should use the
exact enum strings and be included in query keys. Include "Approve All
Ready" only where appropriate, with a confirmation/summary if useful.

## 3.4 Item review UI

Create reusable components: - `ItemCard` - `ItemEditor` or edit dialog -
`ClarificationForm` - `StatusBadge` - `TypeBadge` - `CommitmentBadge` -
`AmbiguityChip` - `ConfidenceIndicator` - `EvidenceQuote` -
`ConfirmDialog` - `LoadingState`, `ErrorState`, `EmptyState`

Each item card should display all available data: - Title and
description - Type, commitment level and status - Owner and deadline -
Speaker - Confidence score - Ambiguity flags - Evidence quote -
Reasoning, in a collapsible "Why this was extracted" area - External
URL/ID when present - Links or indicators for duplicate/conflict
relations

Rules: - `NEEDS_CLARIFICATION`: orange border/warning and visible action
needed. - Confidence below `0.7`: warning badge/text; confidence should
also be visible as percentage or subtle progress bar. - Evidence quote:
render as plain text in a quote/callout. Do not inject transcript/AI
text as HTML. - `APPROVED`: green/locked-in state, disable Approve and
show Un-approve when supported. - `REJECTED`: muted and collapsed by
default, with a way to expand. - `SYNCED`: show external task link when
returned. - `DONE`: show completed state. - Do not imply a task was
created externally merely because it is approved.

### Item types --- exact API values

  API value         Label
  ----------------- ---------------
  `ACTION_ITEM`     Action Item
  `DECISION`        Decision
  `SUGGESTION`      Suggestion
  `OPEN_QUESTION`   Open Question
  `FOLLOW_UP`       Follow-up

### Commitment levels

  API value      Label
  -------------- ------------
  `CONFIRMED`    Confirmed
  `PROPOSED`     Proposed
  `UNRESOLVED`   Unresolved

### Item statuses

`EXTRACTED`, `NEEDS_CLARIFICATION`, `READY_FOR_REVIEW`, `APPROVED`,
`REJECTED`, `SYNCED`, `DONE`.

### Ambiguity flags and display text

  Flag                Label
  ------------------- ---------------------------
  `NO_OWNER`          No owner assigned
  `VAGUE_OWNER`       Owner is unclear
  `MULTIPLE_OWNERS`   Multiple owners mentioned
  `VAGUE_DEADLINE`    Deadline is vague
  `NO_DEADLINE`       No deadline mentioned

### Editing an item

Use `PATCH /items/{id}` and send only changed fields from the documented
set: - `title` - `description` - `owner` - `deadline` - `type` -
`commitment_level`

Use returned item data as authoritative and refresh/invalidate affected
queries. The backend re-evaluates ambiguity flags after edits.

### Clarification

Use `POST /items/{id}/clarify`:

``` json
{
  "field": "owner",
  "answer": "Alice Chen"
}
```

Provide a form for each outstanding flag, but verify the actual allowed
`field` names and flag-to-field mapping using `/docs`. Do not submit
made-up field values. If docs are unavailable, keep the mapping in one
clearly marked adapter/config file and report it as needing
confirmation.

### Approve / reject / un-approve

-   Approve: `POST /items/{id}/approve`, body
    `{"actor":"user@example.com"}`
-   Reject: `POST /items/{id}/reject`, body
    `{"actor":"user@example.com","reason":"Not relevant"}`
-   Un-approve: `POST /items/{id}/unapprove`, body
    `{"actor":"user@example.com"}`
-   Bulk approval: `POST /meetings/{id}/approve-all-ready`, body
    `{"actor":"user@example.com"}`

The example actor is not an authenticated identity. Define one
configurable demo actor (e.g. `demo-user`) in a frontend config file and
use it consistently. Do not build a fake login flow.

Eligibility behavior: - Required ambiguity flags must be resolved before
approval. - `ACTION_ITEM` and `FOLLOW_UP` need a non-empty owner for
approval. - Only `ACTION_ITEM` and `FOLLOW_UP` with `CONFIRMED`
commitment are eligible for task-board push. - `DECISION` is exportable
but not pushed as a task. - `SUGGESTION` and `OPEN_QUESTION` need user
edits to an eligible type/commitment and must pass backend validation
before approval. - Only `APPROVED` items can be pushed. - Frontend can
disable actions when obviously ineligible, but backend response is
authoritative. On 409, show the error message and details, then refresh
item state.

Reject action must include a reason input. Un-approve should clearly
communicate that the item returns to review. Bulk approve must show the
`approved` and `skipped` results returned by the backend, including skip
reasons.

## 3.5 Duplicates and conflicts

Fetch `GET /meetings/{id}/duplicates`.

A link may contain: - `id` - `relation`: `DUPLICATE`, `CONFLICT`,
`RELATED` - `score` - `explanation` - `resolution`: `PENDING`, `MERGED`,
`KEPT_BOTH`, `REJECTED_ONE` - `item_a`, `item_b`

Implement a duplicate review view: - Show relation label and similarity
score (percentage/progress bar). - Explain why the pair was linked. -
Compare both item cards side-by-side on desktop and stacked on mobile. -
For pending links, offer: - **Merge** --- user selects which item to
keep. - **Keep Both** - **Reject One** --- user selects which item to
keep. - Call `POST /duplicates/{id}/resolve` with request actions
exactly as documented: - `{"action":"merge","keep_item_id":"uuid"}` -
`{"action":"keep_both"}` -
`{"action":"reject_one","keep_item_id":"uuid"}` - After success, show
response resolution and refresh duplicate links and meeting items. - Do
not merge items in the browser; backend owns record mutation and audit
logging. - Disable resolution actions when a link is no longer pending
unless the backend allows otherwise.

## 3.6 Push to Trello and export

This section must make the approval boundary unmistakable.

### Dry-run preview is mandatory

1.  Button: **Preview Push**.
2.  Call `POST /meetings/{id}/push?target=trello&dry_run=true`.
3.  Render the returned `pushed` and `failed` arrays with title, owner,
    deadline and any reason/details.
4.  State clearly: "Preview only --- no Trello cards have been created."
5.  Only after preview, offer **Push to Trello** with a confirmation
    dialog that lists the number of proposed cards and warns that this
    creates external tasks.
6.  Call `POST /meetings/{id}/push?target=trello&dry_run=false`.
7.  Display successes and failures separately. Partial failures must not
    hide successful results.
8.  Display returned Trello URLs and refresh meeting items/dashboard.
9.  Disable the push button while the request is in flight and prevent
    duplicate clicks.
10. Do not auto-push on page load or after approval.

The frontend specification mentions `target=github`, but the
requirements describe Trello behavior. Use Trello as the primary
integration and do not expose GitHub push unless `/docs` confirms it
works.

### CSV and JSON export

Use `GET /meetings/{id}/export?format=csv&only=approved` and JSON
equivalent. - `format`: `csv` or `json` - `only`: `approved` or `all` -
Provide Download CSV and Download JSON buttons plus an Approved only /
All items selector. - Treat responses as file downloads; do not force
JSON parsing on CSV. - Derive filename from meeting title/date safely. -
Handle download errors and revoke any object URL created by the
browser. - Expected columns: title, type, commitment, owner, deadline,
status, evidence, meeting.

## 3.7 Dashboard --- `/dashboard`

Fetch `GET /dashboard` (omit `meeting_id` for global stats). Display: -
Status count cards for `EXTRACTED`, `NEEDS_CLARIFICATION`,
`READY_FOR_REVIEW`, `APPROVED`, `REJECTED`, `SYNCED`, `DONE`. - Number
awaiting clarification. - Overdue list with title, owner, deadline,
status and link to relevant meeting/item when available. - Unassigned
list. - Pending items from previous meetings with meeting title and
status. - Empty states when lists are empty. - Refresh action.

Call `POST /sync` only when the user clicks **Sync with Trello**. Show
`synced_to_done` and `items_checked` from the response, then refresh
dashboard data. Do not claim a background scheduler is active unless
backend configuration confirms it. Do not call Slack directly from the
browser.

Overdue comparison should use the backend-provided `overdue` list; do
not reimplement date business rules independently unless required. When
displaying a date-only field, avoid accidental timezone shifts caused by
parsing it as UTC then rendering in a different timezone.

## 3.8 Members --- `/members`

Implement: - List via `GET /members`. - Create via `POST /members`. -
Edit via `PUT /members/{id}`. - Delete via `DELETE /members/{id}`. -
Fields: `name`, `email`, `trello_member_id`, `github_login`. - Add/edit
form with validation and clear optionality for integration IDs. - Delete
confirmation dialog. - On `204 No Content`, do not try to parse a JSON
body. - Refresh member query after mutations and show errors/success. -
Never expose integration tokens here; member IDs/logins are mappings
only.

## 3.9 Audit history

For each item, load `GET /items/{id}/audit` when the user opens the
history panel, not necessarily for every item at page load. Render a
timeline with action, actor, timestamp and diff. Show an empty state if
there is no history and handle errors gracefully.

------------------------------------------------------------------------

# 4. Backend API contract

All paths are relative to `http://localhost:8000`.

  -------------------------------------------------------------------------------------------------------
  Method                  Path                                                Purpose
  ----------------------- --------------------------------------------------- ---------------------------
  GET                     `/health`                                           Health/version

  GET                     `/meetings`                                         List meetings

  POST                    `/meetings`                                         Create meeting

  GET                     `/meetings/{id}`                                    Get
                                                                              meeting/status/transcript

  POST                    `/meetings/{id}/extract`                            Trigger background
                                                                              extraction; returns 202

  GET                     `/meetings/{id}/items`                              Get items; optional `type`,
                                                                              `status` filters

  POST                    `/meetings/{id}/approve-all-ready`                  Bulk approve eligible ready
                                                                              items

  GET                     `/meetings/{id}/export?format=csv&only=approved`    Download export

  POST                    `/meetings/{id}/push?target=trello&dry_run=true`    Preview push

  POST                    `/meetings/{id}/push?target=trello&dry_run=false`   Execute push

  PATCH                   `/items/{id}`                                       Edit item

  POST                    `/items/{id}/approve`                               Approve item

  POST                    `/items/{id}/reject`                                Reject item

  POST                    `/items/{id}/unapprove`                             Return approved item to
                                                                              review

  POST                    `/items/{id}/clarify`                               Submit clarification

  GET                     `/items/{id}/audit`                                 Audit history

  GET                     `/meetings/{id}/duplicates`                         Duplicate/conflict links

  POST                    `/duplicates/{id}/resolve`                          Resolve link

  GET                     `/members`                                          List members

  POST                    `/members`                                          Create member

  PUT                     `/members/{id}`                                     Update member

  DELETE                  `/members/{id}`                                     Delete member

  GET                     `/dashboard`                                        Dashboard metrics; optional
                                                                              `meeting_id`

  POST                    `/sync`                                             Sync Trello completion
                                                                              status
  -------------------------------------------------------------------------------------------------------

### Typical item response from frontend specification

``` json
{
  "id": "uuid",
  "meeting_id": "uuid",
  "type": "ACTION_ITEM",
  "commitment_level": "CONFIRMED",
  "title": "Set up CI/CD pipeline",
  "description": "Description",
  "owner": "Bob",
  "deadline": "2026-11-01",
  "evidence_quote": "Bob said he would set up CI/CD by end of October",
  "speaker": "Bob",
  "confidence": 0.92,
  "flags": [],
  "status": "READY_FOR_REVIEW",
  "reasoning": "Reasoning",
  "external_id": null,
  "external_url": null,
  "created_at": "2026-10-23T10:00:00Z",
  "updated_at": "2026-10-23T10:00:00Z",
  "duplicate_links": []
}
```

### Error response

``` json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Cannot approve item with unresolved ambiguity flags",
    "details": {"flags": ["NO_OWNER"]}
  }
}
```

Common error codes: - `INVALID_TRANSITION` / 409: state machine
violation - `VALIDATION_ERROR` / 422: invalid request - `NOT_FOUND` /
404: record missing - `PIPELINE_ERROR` / 500: extraction failed -
`INTEGRATION_ERROR` / 502: integration failed

------------------------------------------------------------------------

# 5. API client and frontend architecture

## Suggested structure

Create or adapt this structure inside `frontend/`:

``` text
frontend/
├── .env.example
├── README.md
├── package.json
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/AppRoutes.tsx
│   ├── layouts/AppLayout.tsx
│   ├── pages/
│   │   ├── MeetingsPage.tsx
│   │   ├── NewMeetingPage.tsx
│   │   ├── MeetingDetailPage.tsx
│   │   ├── DashboardPage.tsx
│   │   └── MembersPage.tsx
│   ├── components/
│   │   ├── common/
│   │   ├── meetings/
│   │   ├── items/
│   │   ├── duplicates/
│   │   ├── dashboard/
│   │   └── members/
│   ├── api/
│   │   ├── client.ts
│   │   ├── meetings.ts
│   │   ├── items.ts
│   │   ├── duplicates.ts
│   │   ├── dashboard.ts
│   │   └── members.ts
│   ├── hooks/
│   ├── types/
│   │   └── api.ts
│   ├── config/
│   │   └── app.ts
│   ├── utils/
│   └── styles/
└── ...
```

The exact grouping may vary if the implementation remains understandable
and maintainable. Do not create giant single-file components. Keep API
calls out of presentational components.

## API client requirements

Implement a shared fetch/Axios client that: - Reads `VITE_API_BASE_URL`,
with a safe development default of `http://localhost:8000`. - Builds
URLs without double slashes and safely encodes IDs/query parameters. -
Adds JSON headers for JSON requests. - Parses JSON responses only when
appropriate. - Handles `204 No Content`. - Handles CSV/JSON file
downloads separately. - Normalizes backend errors from
`{error:{code,message,details}}`, with a fallback for framework errors,
text responses and network failures. - Never displays raw stack traces
to users. - Exposes typed functions for every endpoint used by the UI.

## Types

Define TypeScript unions for the exact item type, commitment, item
status, ambiguity flags, meeting status, duplicate relation and
duplicate resolution values. Define interfaces for Meeting, Item,
DuplicateLink, Member, DashboardResponse, AuditEntry, PushPreviewResult,
PushResult and API error. Fields known to differ between docs should be
optional at the raw API boundary and normalized in a single adapter; do
not scatter fallback guesses across components.

## Data fetching and mutation

Use TanStack Query: - Query keys must include meeting ID and active
filters. - Mutations invalidate/refetch relevant meetings, meeting
detail, items, duplicates, dashboard and members. - Show pending state
and prevent duplicate mutation submissions. - Keep server response as
source of truth; do not optimistically mark approval/push successful
unless rollback is implemented correctly. - Extraction polling must not
create overlapping loops. Poll `GET /meetings/{id}` every 2 seconds
while status is `CREATED`/`EXTRACTING` after extraction has been
triggered. Stop on `EXTRACTED` or `FAILED`, on unmount, and when meeting
ID changes. Add a reasonable timeout and manual refresh. - Only
auto-refetch item lists when relevant; avoid excessive polling of the
entire app.

------------------------------------------------------------------------

# 6. Known contract discrepancies --- verify, do not guess

The two project files do not perfectly align on every field. Inspect
live `/docs` and actual responses before coding against uncertain
fields.

1.  **Owner/deadline fields:** `frontend_spec.md` shows `owner` and
    `deadline`. `requirements.md` describes extraction fields
    `owner_raw`, `owner_resolved`, `deadline_raw`, and
    `deadline_resolved`. Confirm persisted response and PATCH field
    names.
2.  **Ambiguity field:** frontend spec example uses `flags`;
    requirements use `ambiguity_flags`. Confirm the API property.
    Normalize it once in the API adapter.
3.  **Duplicate resolution:** returned resolution values are uppercase
    (`MERGED`, `KEPT_BOTH`, `REJECTED_ONE`), while request action
    strings are lowercase (`merge`, `keep_both`, `reject_one`). Send
    lowercase actions exactly as documented.
4.  **Item count:** meeting list example has no item count. Do not
    fabricate it.
5.  **Transcript upload:** documented creation accepts `raw_text`; no
    multipart upload API is specified. Text paste is mandatory baseline.
6.  **Clarification mapping:** `field` and `answer` are documented, but
    accepted field values for every ambiguity flag are not fully
    specified. Verify.
7.  **GitHub push:** `target=github` appears in frontend spec, but
    requirements only detail Trello push behavior. Do not expose until
    verified.
8.  **Actor:** `user@example.com` is an example. Use a single demo actor
    agreed by the team and keep it configurable.
9.  **Extraction retry:** no dedicated retry endpoint is documented.
    Verify whether calling `/extract` again is supported.
10. **Backend stages:** endpoints may not all be implemented yet. Check
    `/docs` and make unavailable features show a clear message instead
    of breaking the entire app.
11. **CORS:** backend default origin is port 3000. Verify actual dev
    port; do not change backend files.
12. **Error shape:** docs promise a common error shape, but
    framework-generated validation errors may differ. Make error parsing
    tolerant.
13. **Export media type:** export may return CSV or JSON as a file;
    detect response headers where possible.
14. **Clarification semantics:** flags `VAGUE_DEADLINE` and
    `NO_DEADLINE` may need a date or a normalized deadline; do not
    assume the answer is always free text if API validation expects
    another type.

If the backend cannot be reached, continue using the supplied documented
contract and isolate the uncertain pieces. Do not block the entire
frontend because an optional endpoint is unavailable.

------------------------------------------------------------------------

# 7. Implementation sequence (execute this, not just document it)

## Step 1 --- Inspect and establish the app

-   Inspect current repository, `frontend/` files, package manager, and
    Git status.
-   Preserve existing work.
-   If the frontend is empty except `.gitkeep`, initialize Vite +
    React + TypeScript in `frontend/` only.
-   Install only required dependencies.
-   Configure Tailwind according to the version installed; do not mix
    incompatible setup instructions.
-   Add router and TanStack Query provider.
-   Add `.env.example` and local `.env` only if appropriate; never
    commit secrets.
-   Add a frontend README with run/build instructions and API/CORS
    notes.

## Step 2 --- Build shared app shell and design system

-   Create navigation, page container, headings, button variants, card,
    badge, form controls, confirmation dialog, alert/toast, loading,
    empty and error components.
-   Add responsive breakpoints and keyboard/focus support.
-   Ensure the page shell renders even if backend is offline.

## Step 3 --- Build API client and types

-   Add typed API methods.
-   Test `GET /health`.
-   Normalize errors and handle empty responses/downloads.
-   Confirm CORS behavior; if blocked, document the backend handoff.

## Step 4 --- Implement meetings list and create form

-   Connect `GET /meetings`.
-   Implement empty/loading/error states.
-   Build and validate the meeting form.
-   Connect `POST /meetings`, then `POST /meetings/{id}/extract`.
-   Navigate to meeting detail.

## Step 5 --- Implement extraction progress and items

-   Fetch meeting detail and items.
-   Add controlled 2-second polling and cleanup.
-   Render item cards, status, evidence, confidence, flags, filters,
    reasoning and transcript.
-   Handle failed extraction.

## Step 6 --- Implement review and clarification

-   Build edit form and send only changed fields.
-   Build clarification forms using verified API field mapping.
-   Implement approve/reject/un-approve and bulk approval.
-   Display backend validation details and refresh data after mutation.

## Step 7 --- Implement duplicate/conflict workflow

-   Fetch and compare pairs.
-   Implement merge/keep-both/reject-one actions with required keep-item
    selection.
-   Refresh items and links after resolving.

## Step 8 --- Implement push and export

-   Implement preview endpoint first.
-   Keep real push disabled until a preview has succeeded in the current
    UI session.
-   Show a confirmation dialog for real push.
-   Show per-item success/failure and external URLs.
-   Implement CSV and JSON downloads with correct handling of file
    responses.

## Step 9 --- Implement dashboard and members

-   Render all dashboard metrics and lists.
-   Implement explicit sync action and refresh.
-   Implement member list/create/edit/delete.
-   Add audit history view if time permits; prefer a complete core flow
    over unfinished optional polish.

## Step 10 --- End-to-end verification

-   Run lint/typecheck/build/test commands available in package scripts.
-   Fix errors.
-   Test all routes and responsive layouts.
-   Test API offline/error states.
-   Verify external push is never automatic.
-   Verify no files outside `frontend/` were changed.
-   Produce a concise final report with implemented features, files
    created, commands run/results, remaining backend dependencies, and
    exact commands to start the app.

------------------------------------------------------------------------

# 8. Extraction polling details

After `POST /meetings/{id}/extract`, expect HTTP 202 with a message and
meeting ID. Poll `GET /meetings/{id}` every 2 seconds: - `CREATED`: if
extraction has not been triggered in this UI flow, offer Start
Extraction; do not repeatedly trigger it. - `EXTRACTING`: show spinner
and "AI is analyzing your meeting...". - `EXTRACTED`: stop polling and
fetch items. - `FAILED`: stop polling and show `error_message`. -
Network failure: display retry/manual refresh rather than silently
looping.

Use query-library polling or an equivalent cleanup-safe mechanism. Do
not use an uncontrolled `while(true)` loop that survives route changes.
A reasonable timeout should stop background polling and present a manual
refresh option.

------------------------------------------------------------------------

# 9. State machine and action safety

Backend allowed transitions: - `EXTRACTED` → `NEEDS_CLARIFICATION` or
`READY_FOR_REVIEW` - `NEEDS_CLARIFICATION` → `READY_FOR_REVIEW` or
`REJECTED` - `READY_FOR_REVIEW` → `APPROVED`, `REJECTED`, or
`NEEDS_CLARIFICATION` - `APPROVED` → `SYNCED`, `READY_FOR_REVIEW`
(un-approve), or `REJECTED` - `SYNCED` → `DONE`

Every transition should be audit logged by the backend. The frontend
should: - Display the latest returned status. - Disable actions that are
clearly invalid for the current status. - Still handle server-side 409
responses because status may have changed elsewhere. - Ask confirmation
for rejection, member deletion, and real Trello push. - Avoid duplicate
clicks while a request is pending. - Never silently retry a
non-idempotent real push. - Show bulk action results, including skipped
item reasons.

------------------------------------------------------------------------

# 10. Quality, security and accessibility

-   Treat transcripts and AI output as untrusted user content. Render as
    text; never use unsafe HTML rendering.
-   No secrets in frontend bundle.
-   No fake successful API responses in production paths. Mock data, if
    used during development, must be clearly isolated and disabled by
    default.
-   No automatic task creation, assignment or notifications before
    approval.
-   Show evidence quote and confidence so users can verify the model's
    output.
-   Make unresolved ambiguity and conflicting tasks obvious.
-   Use labels, proper heading hierarchy, keyboard-accessible
    forms/dialogs, visible focus indicators and accessible names for
    icon buttons.
-   Do not rely on color alone for status.
-   Handle empty arrays, null fields and partial integration results.
-   Dates should not shift a date-only deadline by a day because of
    timezone parsing.
-   Keep the frontend usable when optional integrations or endpoints are
    unavailable.

------------------------------------------------------------------------

# 11. Acceptance checklist

The work is not complete until these are checked or explicitly marked
blocked by backend availability.

## App foundation

-   [ ] App starts using documented command.
-   [ ] Build succeeds.
-   [ ] Navigation and all primary routes render.
-   [ ] Responsive layout works at desktop and mobile widths.
-   [ ] API base URL is configurable.

## Meeting flow

-   [ ] Meetings list loads from API.
-   [ ] Empty/loading/error states exist.
-   [ ] Meeting form validates title/date/transcript and participants.
-   [ ] Create request uses `raw_text`.
-   [ ] Extraction is triggered once.
-   [ ] Polling runs every 2 seconds and stops at terminal status.
-   [ ] Failure message is visible.

## Review flow

-   [ ] All types, commitments, statuses and flags have readable labels.
-   [ ] Evidence and confidence are visible.
-   [ ] Low confidence warns below 0.7.
-   [ ] Edit submits only changed fields.
-   [ ] Clarification maps to verified fields.
-   [ ] Approve/reject/un-approve work and update UI.
-   [ ] Bulk approval shows approved and skipped items.
-   [ ] Rejected items are muted/collapsible.
-   [ ] Invalid transitions show backend errors.

## Duplicates, push and export

-   [ ] Duplicate/conflict comparison is readable.
-   [ ] Merge requires choosing item to keep.
-   [ ] Keep Both works.
-   [ ] Reject One requires choosing item to keep.
-   [ ] Dry-run preview is always available before real push.
-   [ ] Real push requires explicit confirmation.
-   [ ] Partial push failures and returned URLs display.
-   [ ] CSV and JSON exports download correctly.

## Dashboard, members and audit

-   [ ] Dashboard status counts, overdue, unassigned and pending lists
    render.
-   [ ] Sync action displays response counts and refreshes.
-   [ ] Member CRUD handles 204 delete.
-   [ ] Audit timeline displays action, actor, timestamp and diff when
    supported.

## Safety and maintainability

-   [ ] No backend or AI-service files modified.
-   [ ] No secrets in frontend.
-   [ ] No unsafe HTML rendering.
-   [ ] No auto-push.
-   [ ] No false claim that approval means done.
-   [ ] No fake completion claims in final report.

------------------------------------------------------------------------

# 12. Demo sequence

Use the backend-provided `data/demo_transcript.txt` if it exists;
otherwise use a short team-approved transcript pasted into the form.

1.  Open Meetings.
2.  Create a meeting with title, date, participants and transcript.
3.  Click Analyze Meeting.
4.  Show the processing state.
5.  Review generated action items and evidence.
6.  Resolve an ambiguous owner/deadline.
7.  Review a duplicate/conflict pair.
8.  Approve an eligible confirmed action item.
9.  Preview the Trello push.
10. Confirm push and show results/links, or demonstrate CSV/JSON
    fallback if Trello credentials are unavailable.
11. Show dashboard counts and overdue/unassigned items.
12. Optionally show audit history.

------------------------------------------------------------------------

# 13. Final report required from Antigravity

When finished, report: 1. Which frontend features are implemented. 2.
Important files created/changed inside `frontend/`. 3. Commands run and
actual results for install, lint, typecheck, test and build. 4. Whether
the backend was reachable and which endpoints were verified. 5. Any
backend teammate action needed (especially CORS or contract
discrepancies). 6. The exact command to start the frontend and the local
URL. 7. Confirmation that `backend/`, `ai-service/`, and root files were
not modified. 8. Any features left incomplete and why.

**Do not respond with another plan alone. Implement the frontend inside
`frontend/`, validate it, and then provide the report.**
