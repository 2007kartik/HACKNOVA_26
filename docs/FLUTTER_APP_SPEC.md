# Flutter Mobile Companion App — Handoff Spec

**Last verified against backend:** commit `297471f` (all routers, 139 tests passing)
**Sources:** `backend/app/schemas.py`, `backend/app/state_machine.py`, `backend/app/errors.py`,
`backend/app/routers/{meetings,items,duplicates,members,dashboard}.py`, `data/mock_pipeline_result.json`

---

## TL;DR — Build this first

1. **Project setup** — Riverpod + Dio + go_router + json_serializable, settings screen (base URL + actor name)
2. **Meetings list** — `GET /meetings`, tap to enter a meeting
3. **Inbox** — `GET /meetings/{id}/items?status=READY_FOR_REVIEW`, swipe approve/reject
4. **Clarification** — `GET /meetings/{id}/items?status=NEEDS_CLARIFICATION`, owner picker + date picker, `POST /items/{id}/clarify`
5. **Dashboard** — `GET /dashboard`, four stat tiles + overdue list

Everything else (push, stretch features) follows after the above five are working.

---

## 1. Overview and Purpose

### What the app is
A **lightweight mobile companion** to the Meeting-to-Execution Automation Agent.
The primary review tool is a React web app. The Flutter app lets users take quick action on their phone immediately after a meeting — approving action items, answering clarification questions, previewing Trello pushes, and checking the dashboard.

### What it does
- Shows recent meetings and their extraction status
- Inbox of items awaiting review (approve / reject by swipe)
- Clarification queue with owner picker and date picker
- Dashboard: overdue, unassigned, awaiting clarification, pending from previous meetings
- Push preview (dry-run) and confirm push to Trello
- Configurable backend URL and actor name

### What it does NOT do
- No transcript viewer or highlighting
- No duplicate/conflict side-by-side resolution
- No member management screens
- No full item editing (title, description, type — that's the web app)
- No audit log screens
- No authentication
- No local database
- No AI logic — all business rules enforced by the server

---

## 2. Architecture

### Pattern
Thin REST client. No local database. No offline mode in v1. All state lives on the server.
Pull-to-refresh to sync. Refetch after every mutation.

### Recommended stack

| Concern | Package |
|---|---|
| State management | `flutter_riverpod` ^2.x |
| HTTP client | `dio` ^5.x |
| Navigation | `go_router` ^13.x |
| JSON serialization | `freezed` + `json_serializable` (or hand-written `fromJson`) |
| Date picking | `flutter_datetime_picker_plus` or `showDatePicker` (built-in) |
| Swipe actions | `flutter_slidable` |
| Snackbar / toasts | `fluttertoast` or built-in `ScaffoldMessenger` |

### Suggested folder structure

```
lib/
├── core/
│   ├── api/
│   │   ├── api_client.dart          # Dio instance, base URL, interceptors
│   │   ├── api_exception.dart       # maps error JSON to typed exceptions
│   │   └── mock_api_client.dart     # mock for parallel development
│   └── models/                      # all Dart data classes and enums
│       ├── meeting.dart
│       ├── item.dart
│       ├── dashboard.dart
│       ├── push_result.dart
│       └── enums.dart
├── features/
│   ├── settings/
│   │   ├── settings_provider.dart
│   │   └── ui/settings_screen.dart
│   ├── meetings/
│   │   ├── data/meetings_repository.dart
│   │   ├── providers/meetings_provider.dart
│   │   └── ui/meetings_screen.dart
│   ├── inbox/
│   │   ├── data/inbox_repository.dart
│   │   ├── providers/inbox_provider.dart
│   │   └── ui/
│   │       ├── inbox_screen.dart
│   │       └── evidence_sheet.dart
│   ├── clarification/
│   │   ├── data/clarification_repository.dart
│   │   ├── providers/clarification_provider.dart
│   │   └── ui/clarification_screen.dart
│   ├── dashboard/
│   │   ├── data/dashboard_repository.dart
│   │   ├── providers/dashboard_provider.dart
│   │   └── ui/dashboard_screen.dart
│   └── push/
│       ├── data/push_repository.dart
│       ├── providers/push_provider.dart
│       └── ui/
│           ├── push_preview_screen.dart
│           └── push_confirm_sheet.dart
└── shared/
    ├── widgets/
    │   ├── status_badge.dart
    │   ├── flag_chip.dart
    │   ├── item_card.dart
    │   └── error_view.dart
    └── router.dart
```

---

## 3. Connecting to the Backend

### Base URL setting
Store the base URL in `SharedPreferences` via the settings screen. Default values:

| Environment | Default URL |
|---|---|
| Android Emulator | `http://10.0.2.2:8000` |
| iOS Simulator | `http://localhost:8000` |
| Physical device (LAN) | `http://<your-machine-LAN-IP>:8000` (e.g. `http://10.75.138.96:8000`) |
| Physical device (tunnel) | ngrok or Cloudflare tunnel URL |

### Starting the backend
```powershell
# On the host machine (Windows)
cd f:\Projects\HackNova\HACKNOVA_26\backend
.\venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
The `--host 0.0.0.0` flag is required — `127.0.0.1` rejects physical device connections.

### Android cleartext HTTP (development only)
In `android/app/src/main/AndroidManifest.xml`:
```xml
<application
    android:usesCleartextTraffic="true"
    ...>
```

### iOS ATS exception (development only)
In `ios/Runner/Info.plist`:
```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```
Remove both before App Store submission.

### CORS
CORS is **not needed** for mobile apps — they do not run in a browser. Skip any CORS configuration.

### API explorer
Once the backend is running: `http://<base-url>/docs` — interactive Swagger UI for every endpoint.
OpenAPI spec JSON: `http://<base-url>/openapi.json` — importable into Postman or Insomnia.

---

## 4. API Reference

All requests: `Content-Type: application/json`.
All IDs: UUID strings.
All dates: `"YYYY-MM-DD"` string.
All datetimes: ISO 8601 UTC string, e.g. `"2026-10-23T10:00:00+00:00"`.

---

### 4.1 Health Check
**Source:** `backend/app/routers/dashboard.py`

```
GET /health
```
**Response 200:**
```json
{ "status": "ok", "version": "1.0.0" }
```
Use on app startup to verify connectivity before showing any screen.

---

### 4.2 List Meetings
**Source:** `backend/app/routers/meetings.py`

```
GET /meetings
```
**Response 200:** array, ordered by `created_at` descending.
```json
[
  {
    "id": "25fbac60-07b7-4b81-81fe-df6334fff686",
    "title": "Q3 Roadmap Planning",
    "date": "2026-10-23",
    "participants": ["Sarah", "James", "Priya", "Marcus"],
    "status": "EXTRACTED",
    "error_message": null,
    "created_at": "2026-10-23T10:00:00+00:00"
  }
]
```
**Error:** none expected beyond 5xx.

---

### 4.3 Get Meeting Detail
**Source:** `backend/app/routers/meetings.py`

```
GET /meetings/{meeting_id}
```
**Response 200:** same as above plus `raw_text` field.
**Error:** 404 `NOT_FOUND` if meeting doesn't exist.

---

### 4.4 Get Meeting Items
**Source:** `backend/app/routers/meetings.py`

```
GET /meetings/{meeting_id}/items?type=ACTION_ITEM&status=READY_FOR_REVIEW
```
**Query params (both optional):**
- `type`: `ACTION_ITEM | DECISION | SUGGESTION | OPEN_QUESTION | FOLLOW_UP`
- `status`: `EXTRACTED | NEEDS_CLARIFICATION | READY_FOR_REVIEW | APPROVED | REJECTED | SYNCED | DONE`

**Response 200:**
```json
[
  {
    "id": "abc123",
    "meeting_id": "25fbac60-...",
    "type": "ACTION_ITEM",
    "commitment_level": "CONFIRMED",
    "title": "Deliver API gateway by November 7th",
    "description": "James to complete and merge the new API gateway.",
    "owner": "James",
    "deadline": "2026-11-07",
    "evidence_quote": "James said he would set up CI/CD by end of October",
    "speaker": "Sarah / James",
    "timestamp": "00:04:12",
    "confidence": 0.97,
    "flags": [],
    "status": "READY_FOR_REVIEW",
    "reasoning": "Clear owner (James), explicit deadline (November 7th).",
    "external_id": null,
    "external_url": null,
    "created_at": "2026-10-23T10:01:00+00:00",
    "updated_at": "2026-10-23T10:01:00+00:00",
    "duplicate_links": []
  }
]
```
**Note:** `duplicate_links[].item_a` and `item_b` are `null` in this view to avoid recursion.

---

### 4.5 Approve Item
**Source:** `backend/app/routers/items.py`

```
POST /items/{item_id}/approve
```
**Body:**
```json
{ "actor": "sarah@company.com" }
```
**Response 200:** updated `ItemOut` with `status: "APPROVED"`.

**Errors:**
- 409 `INVALID_TRANSITION` — item is not `READY_FOR_REVIEW` (e.g. still `NEEDS_CLARIFICATION`)
- 409 `INVALID_TRANSITION` — unresolved ownership flags (`NO_OWNER`, `VAGUE_OWNER`, `MULTIPLE_OWNERS`)
- 409 `INVALID_TRANSITION` — `ACTION_ITEM`/`FOLLOW_UP` with empty owner
- 409 `INVALID_TRANSITION` — `SUGGESTION`/`OPEN_QUESTION` cannot be approved directly
- 409 `INVALID_TRANSITION` — `DECISION` without `CONFIRMED` commitment level

---

### 4.6 Reject Item
**Source:** `backend/app/routers/items.py`

```
POST /items/{item_id}/reject
```
**Body:**
```json
{ "actor": "sarah@company.com", "reason": "Not relevant" }
```
**Response 200:** updated `ItemOut` with `status: "REJECTED"`.
**Note:** `REJECTED` is terminal — no undo.
**Error:** 409 if item is already in a terminal state.

---

### 4.7 Unapprove Item
**Source:** `backend/app/routers/items.py`

```
POST /items/{item_id}/unapprove
```
**Body:**
```json
{ "actor": "sarah@company.com" }
```
**Response 200:** updated `ItemOut` with `status: "READY_FOR_REVIEW"`.
Use this for the swipe-approve **undo** snackbar. Only works if item is currently `APPROVED`.
**Error:** 409 if item is not `APPROVED` (e.g. already `SYNCED`).

---

### 4.8 Clarify Item
**Source:** `backend/app/routers/items.py`

```
POST /items/{item_id}/clarify
```
**Body (owner clarification):**
```json
{ "field": "owner", "answer": "James" }
```
**Body (deadline clarification):**
```json
{ "field": "deadline", "answer": "2026-11-15" }
```
**Response 200:** updated `ItemOut`.
- If `field="owner"` → clears `NO_OWNER`, `VAGUE_OWNER`, `MULTIPLE_OWNERS` from `flags`
- If `field="deadline"` → clears `VAGUE_DEADLINE`, `NO_DEADLINE` from `flags`
- If all `flags` cleared → item auto-transitions to `READY_FOR_REVIEW`

**Error:** 404 if item not found.

---

### 4.9 Approve All Ready
**Source:** `backend/app/routers/meetings.py`

```
POST /meetings/{meeting_id}/approve-all-ready?actor=sarah@company.com
```
**No body.**
**Response 200:**
```json
{
  "approved": ["uuid1", "uuid2"],
  "skipped": [
    { "id": "uuid3", "title": "Implement onboarding MVP", "reason": "Owner required for ACTION_ITEM" }
  ]
}
```

---

### 4.10 List Members
**Source:** `backend/app/routers/members.py`

```
GET /members
```
**Response 200:**
```json
[
  {
    "id": "uuid",
    "name": "Alice Chen",
    "email": "alice@company.com",
    "trello_member_id": "abc123",
    "github_login": "alicechen"
  }
]
```
Use the `name` field to populate the owner picker in clarification. Combine with `meeting.participants` for a merged owner list.

---

### 4.11 Dashboard
**Source:** `backend/app/routers/dashboard.py`

```
GET /dashboard
GET /dashboard?meeting_id=25fbac60-07b7-4b81-81fe-df6334fff686
```
Omit `meeting_id` for global stats across all meetings.

**Response 200:**
```json
{
  "counts": {
    "EXTRACTED": 0,
    "NEEDS_CLARIFICATION": 4,
    "READY_FOR_REVIEW": 9,
    "APPROVED": 2,
    "REJECTED": 1,
    "SYNCED": 1,
    "DONE": 0
  },
  "overdue": [
    {
      "id": "uuid",
      "title": "Friday sync to check on sprint resource split",
      "owner": "Sarah",
      "deadline": "2026-10-24",
      "status": "NEEDS_CLARIFICATION"
    }
  ],
  "unassigned": [ /* List<ItemOut> */ ],
  "awaiting_clarification": 4,
  "pending_from_previous_meetings": [ /* List<ItemOut> */ ]
}
```

---

### 4.12 Push to Trello (Dry-run Preview)
**Source:** `backend/app/routers/meetings.py`

```
POST /meetings/{meeting_id}/push?target=trello&dry_run=true&actor=sarah
```
**No body.**
**Response 200:**
```json
{
  "dry_run": true,
  "pushed": [
    {
      "item_id": "uuid1",
      "title": "Deliver API gateway by November 7th",
      "owner": "James",
      "deadline": "2026-11-07",
      "trello_url": null
    }
  ],
  "failed": []
}
```
`trello_url` is always `null` on dry-run. Only APPROVED items appear.

---

### 4.13 Push to Trello (Real Push)
**Source:** `backend/app/routers/meetings.py`

```
POST /meetings/{meeting_id}/push?target=trello&dry_run=false&actor=sarah
```
**Response 200:**
```json
{
  "dry_run": false,
  "pushed": [
    {
      "item_id": "uuid1",
      "title": "Deliver API gateway by November 7th",
      "owner": "James",
      "deadline": "2026-11-07",
      "trello_url": "https://trello.com/c/fake/uuid1"
    }
  ],
  "failed": [
    {
      "item_id": "uuid2",
      "title": "Build export API",
      "owner": "James",
      "deadline": "2026-11-14",
      "trello_url": null,
      "error": "Trello API returned HTTP 429"
    }
  ]
}
```
One failed item does NOT abort the others. Check `failed` array and show per-item errors.
After real push, pushed items transition to `SYNCED` on the server.

---

### 4.14 Trigger Sync (optional)
**Source:** `backend/app/routers/dashboard.py`

```
POST /sync
```
**Response 200:**
```json
{ "synced_to_done": 2, "items_checked": 5 }
```
Checks SYNCED items on Trello; if card is in Done list, transitions item to DONE.

---

### 4.15 Create Meeting + Extract (STRETCH)
**Source:** `backend/app/routers/meetings.py`

```
POST /meetings
```
**Body:**
```json
{
  "title": "Sprint Planning",
  "date": "2026-10-23",
  "participants": ["Alice", "Bob"],
  "raw_text": "Alice: We need to ship the login page by Friday..."
}
```
**Response 201:** `MeetingOut` with `status: "CREATED"`.

Then trigger extraction:
```
POST /meetings/{id}/extract
```
**Response 202.** Poll `GET /meetings/{id}` every 2 seconds until `status` is `"EXTRACTED"` or `"FAILED"`. Show extraction progress spinner. On `"FAILED"`, show `error_message` from the meeting object.

---

## 5. Data Models

### 5.1 Enums

```dart
// lib/core/models/enums.dart

enum ItemType {
  actionItem('ACTION_ITEM'),
  decision('DECISION'),
  suggestion('SUGGESTION'),
  openQuestion('OPEN_QUESTION'),
  followUp('FOLLOW_UP');

  const ItemType(this.value);
  final String value;

  static ItemType fromJson(String v) =>
      values.firstWhere((e) => e.value == v);
}

enum CommitmentLevel {
  confirmed('CONFIRMED'),
  proposed('PROPOSED'),
  unresolved('UNRESOLVED');

  const CommitmentLevel(this.value);
  final String value;
  static CommitmentLevel fromJson(String v) =>
      values.firstWhere((e) => e.value == v);
}

enum ItemStatus {
  extracted('EXTRACTED'),
  needsClarification('NEEDS_CLARIFICATION'),
  readyForReview('READY_FOR_REVIEW'),
  approved('APPROVED'),
  rejected('REJECTED'),
  synced('SYNCED'),
  done('DONE');

  const ItemStatus(this.value);
  final String value;
  static ItemStatus fromJson(String v) =>
      values.firstWhere((e) => e.value == v);

  bool get isTerminal => this == rejected || this == done;
  bool get canApprove => this == readyForReview;
  bool get canReject =>
      this != rejected && this != done && this != synced;
  bool get canUnapprove => this == approved;
  bool get needsAction =>
      this == needsClarification || this == readyForReview;
}

enum MeetingStatus {
  created('CREATED'),
  extracting('EXTRACTING'),
  extracted('EXTRACTED'),
  failed('FAILED');

  const MeetingStatus(this.value);
  final String value;
  static MeetingStatus fromJson(String v) =>
      values.firstWhere((e) => e.value == v);
}

enum LinkRelation {
  duplicate('DUPLICATE'),
  conflict('CONFLICT'),
  related('RELATED');

  const LinkRelation(this.value);
  final String value;
  static LinkRelation fromJson(String v) =>
      values.firstWhere((e) => e.value == v);
}

enum LinkResolution {
  pending('PENDING'),
  merged('MERGED'),
  keptBoth('KEPT_BOTH'),
  rejectedOne('REJECTED_ONE');

  const LinkResolution(this.value);
  final String value;
  static LinkResolution fromJson(String v) =>
      values.firstWhere((e) => e.value == v);
}

// Ambiguity flags — stored as List<String> in ItemOut.flags
const kOwnerFlags = {'NO_OWNER', 'VAGUE_OWNER', 'MULTIPLE_OWNERS'};
const kDeadlineFlags = {'VAGUE_DEADLINE', 'NO_DEADLINE'};
```

---

### 5.2 Meeting Model

**Fields:**

| Field | Dart type | Nullable | Notes |
|---|---|---|---|
| `id` | `String` | no | UUID |
| `title` | `String` | no | |
| `date` | `String` | no | `"YYYY-MM-DD"` |
| `participants` | `List<String>` | no | may be empty |
| `status` | `MeetingStatus` | no | |
| `error_message` | `String?` | yes | set when status=FAILED |
| `created_at` | `String` | no | ISO datetime |

```dart
class Meeting {
  final String id;
  final String title;
  final String date;
  final List<String> participants;
  final MeetingStatus status;
  final String? errorMessage;
  final String createdAt;

  const Meeting({
    required this.id,
    required this.title,
    required this.date,
    required this.participants,
    required this.status,
    this.errorMessage,
    required this.createdAt,
  });

  factory Meeting.fromJson(Map<String, dynamic> j) => Meeting(
    id: j['id'] as String,
    title: j['title'] as String,
    date: j['date'] as String,
    participants: List<String>.from(j['participants'] ?? []),
    status: MeetingStatus.fromJson(j['status'] as String),
    errorMessage: j['error_message'] as String?,
    createdAt: j['created_at'] as String,
  );
}
```

---

### 5.3 Item Model

**Fields:**

| Field | Dart type | Nullable | Notes |
|---|---|---|---|
| `id` | `String` | no | UUID |
| `meeting_id` | `String` | no | |
| `type` | `ItemType` | no | |
| `commitment_level` | `CommitmentLevel` | no | |
| `title` | `String` | no | |
| `description` | `String` | no | may be empty string |
| `owner` | `String?` | yes | |
| `deadline` | `String?` | yes | `"YYYY-MM-DD"` |
| `evidence_quote` | `String` | no | may be empty string |
| `speaker` | `String?` | yes | |
| `timestamp` | `String?` | yes | free-form transcript timestamp |
| `confidence` | `double` | no | 0.0–1.0 |
| `flags` | `List<String>` | no | AmbiguityFlag values |
| `status` | `ItemStatus` | no | |
| `reasoning` | `String` | no | may be empty |
| `external_id` | `String?` | yes | Trello card ID |
| `external_url` | `String?` | yes | Trello card URL |
| `created_at` | `String` | no | |
| `updated_at` | `String` | no | |
| `duplicate_links` | `List<DuplicateLink>` | no | item_a/item_b are null here |

```dart
class Item {
  final String id;
  final String meetingId;
  final ItemType type;
  final CommitmentLevel commitmentLevel;
  final String title;
  final String description;
  final String? owner;
  final String? deadline;
  final String evidenceQuote;
  final String? speaker;
  final String? timestamp;
  final double confidence;
  final List<String> flags;
  final ItemStatus status;
  final String reasoning;
  final String? externalId;
  final String? externalUrl;
  final String createdAt;
  final String updatedAt;

  const Item({
    required this.id,
    required this.meetingId,
    required this.type,
    required this.commitmentLevel,
    required this.title,
    required this.description,
    this.owner,
    this.deadline,
    required this.evidenceQuote,
    this.speaker,
    this.timestamp,
    required this.confidence,
    required this.flags,
    required this.status,
    required this.reasoning,
    this.externalId,
    this.externalUrl,
    required this.createdAt,
    required this.updatedAt,
  });

  bool get hasOwnerFlags =>
      flags.any((f) => kOwnerFlags.contains(f));
  bool get hasDeadlineFlags =>
      flags.any((f) => kDeadlineFlags.contains(f));
  bool get canBeApproved =>
      status == ItemStatus.readyForReview && !hasOwnerFlags;

  factory Item.fromJson(Map<String, dynamic> j) => Item(
    id: j['id'] as String,
    meetingId: j['meeting_id'] as String,
    type: ItemType.fromJson(j['type'] as String),
    commitmentLevel: CommitmentLevel.fromJson(j['commitment_level'] as String),
    title: j['title'] as String,
    description: j['description'] as String? ?? '',
    owner: j['owner'] as String?,
    deadline: j['deadline'] as String?,
    evidenceQuote: j['evidence_quote'] as String? ?? '',
    speaker: j['speaker'] as String?,
    timestamp: j['timestamp'] as String?,
    confidence: (j['confidence'] as num).toDouble(),
    flags: List<String>.from(j['flags'] ?? []),
    status: ItemStatus.fromJson(j['status'] as String),
    reasoning: j['reasoning'] as String? ?? '',
    externalId: j['external_id'] as String?,
    externalUrl: j['external_url'] as String?,
    createdAt: j['created_at'] as String,
    updatedAt: j['updated_at'] as String,
  );
}
```

---

### 5.4 Dashboard Model

```dart
class DashboardData {
  final Map<String, int> counts;
  final List<OverdueItem> overdue;
  final List<Item> unassigned;
  final int awaitingClarification;
  final List<Item> pendingFromPreviousMeetings;

  const DashboardData({
    required this.counts,
    required this.overdue,
    required this.unassigned,
    required this.awaitingClarification,
    required this.pendingFromPreviousMeetings,
  });

  int get totalPending =>
      (counts['NEEDS_CLARIFICATION'] ?? 0) + (counts['READY_FOR_REVIEW'] ?? 0);

  factory DashboardData.fromJson(Map<String, dynamic> j) => DashboardData(
    counts: Map<String, int>.from(j['counts'] as Map),
    overdue: (j['overdue'] as List)
        .map((e) => OverdueItem.fromJson(e as Map<String, dynamic>))
        .toList(),
    unassigned: (j['unassigned'] as List)
        .map((e) => Item.fromJson(e as Map<String, dynamic>))
        .toList(),
    awaitingClarification: j['awaiting_clarification'] as int,
    pendingFromPreviousMeetings:
        (j['pending_from_previous_meetings'] as List)
            .map((e) => Item.fromJson(e as Map<String, dynamic>))
            .toList(),
  );
}

class OverdueItem {
  final String id;
  final String title;
  final String? owner;
  final String? deadline;
  final ItemStatus status;

  const OverdueItem({
    required this.id,
    required this.title,
    this.owner,
    this.deadline,
    required this.status,
  });

  factory OverdueItem.fromJson(Map<String, dynamic> j) => OverdueItem(
    id: j['id'] as String,
    title: j['title'] as String,
    owner: j['owner'] as String?,
    deadline: j['deadline'] as String?,
    status: ItemStatus.fromJson(j['status'] as String),
  );
}
```

---

### 5.5 Push Result Model

```dart
class PushItemResult {
  final String itemId;
  final String title;
  final String? owner;
  final String? deadline;
  final String? trelloUrl;
  final String? error;

  const PushItemResult({
    required this.itemId,
    required this.title,
    this.owner,
    this.deadline,
    this.trelloUrl,
    this.error,
  });

  bool get succeeded => error == null;

  factory PushItemResult.fromJson(Map<String, dynamic> j) => PushItemResult(
    itemId: j['item_id'] as String,
    title: j['title'] as String,
    owner: j['owner'] as String?,
    deadline: j['deadline'] as String?,
    trelloUrl: j['trello_url'] as String?,
    error: j['error'] as String?,
  );
}

class PushResult {
  final bool dryRun;
  final List<PushItemResult> pushed;
  final List<PushItemResult> failed;

  const PushResult({
    required this.dryRun,
    required this.pushed,
    required this.failed,
  });

  factory PushResult.fromJson(Map<String, dynamic> j) => PushResult(
    dryRun: j['dry_run'] as bool,
    pushed: (j['pushed'] as List)
        .map((e) => PushItemResult.fromJson(e as Map<String, dynamic>))
        .toList(),
    failed: (j['failed'] as List)
        .map((e) => PushItemResult.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}
```

---

## 6. Business Rules the UI Must Respect

Source: `backend/app/state_machine.py`

### Which statuses allow which actions

| Current status | Approve | Reject | Unapprove | Clarify |
|---|---|---|---|---|
| `EXTRACTED` | ❌ | ❌ | ❌ | ❌ |
| `NEEDS_CLARIFICATION` | ❌ | ✅ | ❌ | ✅ |
| `READY_FOR_REVIEW` | ✅ (with conditions) | ✅ | ❌ | ✅ |
| `APPROVED` | ❌ | ✅ | ✅ | ❌ |
| `SYNCED` | ❌ | ❌ | ❌ | ❌ |
| `REJECTED` | ❌ | ❌ | ❌ | ❌ (terminal) |
| `DONE` | ❌ | ❌ | ❌ | ❌ (terminal) |

### Why Approve is disabled for NEEDS_CLARIFICATION
`NEEDS_CLARIFICATION → APPROVED` is not an allowed transition. The state machine will return 409. The UI should disable the approve button and show a "Clarify first" message.

### Approval extra conditions (for READY_FOR_REVIEW items)
Even if status is `READY_FOR_REVIEW`, the server still rejects approval if:
1. Any of `NO_OWNER`, `VAGUE_OWNER`, `MULTIPLE_OWNERS` are in `flags`
2. `type` is `ACTION_ITEM` or `FOLLOW_UP` and `owner` is null/empty
3. `type` is `SUGGESTION` or `OPEN_QUESTION` (cannot approve directly — needs type conversion on web app)
4. `type` is `DECISION` and `commitment_level` is not `CONFIRMED`

**UI guidance:** In the inbox, visually grey-out or add a warning indicator on items that have ownership flags even if they are `READY_FOR_REVIEW`. Do not silently fail — show the server's error message.

### Clarify auto-transitions
When `POST /items/{id}/clarify` is called and all flags are cleared as a result, the server automatically transitions the item from `NEEDS_CLARIFICATION` to `READY_FOR_REVIEW`. The response reflects the new status — no extra call needed.

### Push only affects APPROVED items
`POST /meetings/{id}/push` queries the server for items where `status = "APPROVED"`. Items in any other status are silently ignored. The app does not need to filter — just show what the server returns.

### Partial push failures
`failed` array in `PushResult` may be non-empty even when `pushed` is also non-empty. Always render both. A non-empty `failed` is not an HTTP error — the response is still 200.

### Client-side enforcement vs server-side enforcement
The client **must rely on the server** for all enforcement. Never assume approval will succeed. Always handle 409 responses gracefully and display `error.message` from the response body.

---

## 7. Error Handling

### Error response shape (from `backend/app/errors.py`)
```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Cannot approve item with unresolved ownership ambiguity flags.",
    "details": { "flags": ["NO_OWNER"] }
  }
}
```

### Status codes and UI behaviour

| HTTP status | `error.code` | When | UI behaviour |
|---|---|---|---|
| 404 | `NOT_FOUND` | Item/meeting doesn't exist (deleted or wrong ID) | Show "Not found" and navigate back |
| 409 | `INVALID_TRANSITION` | State machine rule violation (approve blocked, etc.) | Show `error.message` as a snackbar/dialog; do NOT roll back optimistic update if used |
| 409 | `GATE_VIOLATION` | Push/notify attempted for non-APPROVED item (backend bug guard) | Show "This item is not approved yet" |
| 409 | `DUPLICATE_RESOLUTION_ERROR` | Resolving already-resolved duplicate | Show `error.message` |
| 422 | `VALIDATION_ERROR` | Missing/wrong field in request body | Show "Invalid input" with `details` if available |
| 500 | `PIPELINE_ERROR` | AI extraction failed | Show "Extraction failed. Try again." |
| 502 | `INTEGRATION_ERROR` | Trello/Slack call failed | Show "Could not reach Trello. Check your credentials." |
| 5xx | `INTERNAL_ERROR` | Unexpected server error | Show "Something went wrong. Please try again." |

### Dio error interceptor
```dart
// lib/core/api/api_exception.dart
class ApiException implements Exception {
  final String code;
  final String message;
  final Map<String, dynamic> details;
  final int statusCode;

  const ApiException({
    required this.code,
    required this.message,
    required this.details,
    required this.statusCode,
  });

  factory ApiException.fromDioError(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] != null) {
      final err = data['error'] as Map<String, dynamic>;
      return ApiException(
        code: err['code'] as String? ?? 'UNKNOWN',
        message: err['message'] as String? ?? 'An error occurred.',
        details: Map<String, dynamic>.from(err['details'] ?? {}),
        statusCode: e.response?.statusCode ?? 0,
      );
    }
    return ApiException(
      code: 'NETWORK_ERROR',
      message: e.message ?? 'Network error.',
      details: {},
      statusCode: e.response?.statusCode ?? 0,
    );
  }
}
```

### Timeouts
```dart
BaseOptions(
  connectTimeout: const Duration(seconds: 10),
  receiveTimeout: const Duration(seconds: 30), // extraction can take 15-30s
)
```

### Retry guidance
- 5xx errors: show retry button, do NOT auto-retry (could double-approve)
- 409 errors: do NOT retry — the server correctly rejected the action
- Network errors: show "No connection" with retry button

### Offline state
No offline mode. Show a banner when `GET /health` fails. Disable all action buttons.

---

## 8. Screen-by-Screen Spec

### Navigation
Bottom navigation bar with 4 tabs:

```
[  Meetings  |  Inbox  |  Dashboard  |  Settings  ]
```

---

### Screen 1: Meetings List

**Purpose:** Entry point. Shows recent meetings and lets users tap into a meeting's inbox.

**Layout:**
```
┌─────────────────────────────────┐
│  Meetings                    ⟳  │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ Q3 Roadmap Planning         │ │
│ │ Oct 23, 2026          [✓]   │ │
│ │ 9 ready · 4 need action     │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ Sprint Retrospective        │ │
│ │ Oct 20, 2026    [EXTRACTING]│ │
│ │ Processing...    ⟳          │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ Kickoff Meeting             │ │
│ │ Oct 15, 2026       [FAILED] │ │
│ │ Extraction failed           │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

**Data:** `GET /meetings`

**User actions:**
- Pull to refresh → re-fetches list
- Tap meeting card → navigate to inbox for that meeting
- EXTRACTING meetings → auto-poll every 3s until status changes

**Loading:** skeleton cards
**Empty:** "No meetings yet" illustration
**Error:** "Could not load meetings" + retry button

**Acceptance criteria:**
- Meetings sorted newest first
- Status badge visible on each card
- EXTRACTING shows spinner + polls automatically
- FAILED shows error_message in subtitle

---

### Screen 2: Inbox (Review Items)

**Purpose:** Primary action screen. Items awaiting approval for a selected meeting.

**Layout:**
```
┌─────────────────────────────────┐
│ ← Q3 Roadmap Planning    [ALL▼] │
├─────────────────────────────────┤
│  READY (9)  |  CLARIFY (4)      │
├─────────────────────────────────┤
│ ← Reject    [Card]   Approve →  │
│ ┌─────────────────────────────┐ │
│ │ ✅ ACTION_ITEM  CONFIRMED    │ │
│ │ Deliver API gateway          │ │
│ │ Owner: James · Nov 7         │ │
│ │ conf: 97%                    │ │
│ │                   [tap info] │ │
│ └─────────────────────────────┘ │
│                                 │
│ ← Reject    [Card]   Approve →  │
│ ┌─────────────────────────────┐ │
│ │ ✅ ACTION_ITEM  CONFIRMED    │ │
│ │ Build CSV and JSON export    │ │
│ │ Owner: James · Nov 14        │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│         [Approve All Ready]     │
└─────────────────────────────────┘
```

**Data:**
- READY tab: `GET /meetings/{id}/items?status=READY_FOR_REVIEW`
- CLARIFY tab: `GET /meetings/{id}/items?status=NEEDS_CLARIFICATION`

**User actions:**
- Swipe right → `POST /items/{id}/approve` with actor from settings → show green overlay → remove from list → show undo snackbar (5s)
- Undo snackbar tapped → `POST /items/{id}/unapprove` → add item back to list
- Swipe left → `POST /items/{id}/reject` → show red overlay → remove from list (no undo — REJECTED is terminal)
- Tap card → open Evidence Bottom Sheet
- "Approve All Ready" button → `POST /meetings/{id}/approve-all-ready?actor=...` → show result dialog with approved count and skipped list
- CLARIFY tab items → tap → navigate to Clarification Screen

**Loading:** skeleton cards
**Empty state (READY tab):** "All items reviewed 🎉"
**Empty state (CLARIFY tab):** "No items need clarification"
**Error on swipe:** show snackbar with `error.message`, put card back

**Note:** Do NOT show approve button for `SUGGESTION` or `OPEN_QUESTION` items. Show a "Cannot approve directly" chip instead.

**Acceptance criteria:**
- Swipe gesture with visual feedback (green/red tint)
- Undo for approve (calls unapprove endpoint)
- No undo for reject
- 409 response re-shows card with error message

---

### Screen 3: Evidence Bottom Sheet

**Purpose:** Show AI reasoning to help user decide whether to approve or reject.

**Layout:**
```
┌─────────────────────────────────┐
│          Item Details      ╳    │
│─────────────────────────────────│
│ Deliver API gateway by Nov 7th  │
│                                 │
│ TYPE        ACTION_ITEM         │
│ COMMITMENT  CONFIRMED           │
│ OWNER       James               │
│ DEADLINE    November 7, 2026    │
│ CONFIDENCE  ████████░░  97%     │
│                                 │
│ FLAGS       (none)              │
│                                 │
│ EVIDENCE                        │
│ ┌─────────────────────────────┐ │
│ │"James said he would set up  │ │
│ │ CI/CD by end of October"    │ │
│ └─────────────────────────────┘ │
│                                 │
│ REASONING                       │
│ Clear owner (James), explicit   │
│ deadline (November 7th),        │
│ confirmed by both parties.      │
│                                 │
│  [REJECT]              [APPROVE]│
└─────────────────────────────────┘
```

**Data:** already loaded from parent screen (no extra API call)

**User actions:**
- APPROVE / REJECT buttons → same endpoints as swipe, close sheet on success

---

### Screen 4: Clarification Screen

**Purpose:** Resolve ambiguous items by providing owner or deadline.

**Layout:**
```
┌─────────────────────────────────┐
│ ← Clarification                 │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ ⚠️  Implement onboarding MVP │ │
│ │ Flags: VAGUE_OWNER          │ │
│ │                             │ │
│ │ Who should own this?        │ │
│ │ ┌─────────────────────────┐ │ │
│ │ │ Select owner...       ▼ │ │ │
│ │ └─────────────────────────┘ │ │
│ │                             │ │
│ │              [Submit Owner] │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ⚠️  Friday sync check        │ │
│ │ Flags: VAGUE_DEADLINE       │ │
│ │                             │ │
│ │ What is the deadline?       │ │
│ │ ┌─────────────────────────┐ │ │
│ │ │ Pick a date...       📅 │ │ │
│ │ └─────────────────────────┘ │ │
│ │                             │ │
│ │           [Submit Deadline] │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

**Data:** `GET /meetings/{id}/items?status=NEEDS_CLARIFICATION`

**Owner picker source:**
```dart
// Merge meeting.participants + GET /members names, deduplicate
final owners = {...meeting.participants, ...members.map((m) => m.name)}.toList()..sort();
```

**Submit owner:** `POST /items/{id}/clarify` body `{"field": "owner", "answer": selectedName}`
**Submit deadline:** `POST /items/{id}/clarify` body `{"field": "deadline", "answer": "2026-11-15"}`

On success: if `flags` in response is empty and `status` is `READY_FOR_REVIEW`, show "Moved to inbox ✓" and remove from list.

**Acceptance criteria:**
- Each item shows only the relevant input (owner picker for owner flags, date picker for deadline flags)
- Items with both owner AND deadline flags show both inputs
- On successful clarify, item disappears from clarification list
- Date picker constrained to future dates

---

### Screen 5: Dashboard

**Purpose:** Overview of all pending work across meetings.

**Layout:**
```
┌─────────────────────────────────┐
│ Dashboard                    ⟳  │
├─────────────────────────────────┤
│ ┌────────┐ ┌────────┐          │
│ │   4    │ │   9    │          │
│ │ Need   │ │ Ready  │          │
│ │ Action │ │Review  │          │
│ └────────┘ └────────┘          │
│ ┌────────┐ ┌────────┐          │
│ │   2    │ │   1    │          │
│ │Approved│ │ Synced │          │
│ └────────┘ └────────┘          │
├─────────────────────────────────┤
│ OVERDUE (2)                     │
│ • Friday sync · Sarah · Oct 24  │
│ • Accessibility report · Priya  │
├─────────────────────────────────┤
│ UNASSIGNED (1)                  │
│ • Implement onboarding MVP      │
├─────────────────────────────────┤
│ FROM PREVIOUS MEETINGS (3)      │
│ • Deploy auth service · Nov 1   │
│ • Update API docs · Alice       │
└─────────────────────────────────┘
```

**Data:** `GET /dashboard` (global, no meeting_id)

**User actions:**
- Pull to refresh
- Tap overdue/unassigned item → navigate to that item's meeting inbox
- Tap "Sync with Trello" action → `POST /sync` → show snackbar with `synced_to_done` count

**Loading:** shimmer skeleton
**Empty overdue:** "No overdue items 🎉"

---

### Screen 6: Push Screen

**Purpose:** Preview and confirm push of approved items to Trello.

**Layout:**
```
┌─────────────────────────────────┐
│ ← Push to Trello                │
├─────────────────────────────────┤
│ 2 items ready to push           │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Deliver API gateway          │ │
│ │ James · Nov 7                │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ Create GitHub issues         │ │
│ │ James · Oct 27               │ │
│ └─────────────────────────────┘ │
│                                 │
│       [Preview Push]            │
│                                 │
│ ─── After Preview ───           │
│                                 │
│ ✓ Deliver API gateway           │
│   trello.com/c/fake/abc →       │
│                                 │
│       [Confirm Push ✓]          │
└─────────────────────────────────┘
```

**Flow:**
1. `POST /meetings/{id}/push?dry_run=true` → show preview list
2. User taps "Confirm Push" → `POST /meetings/{id}/push?dry_run=false`
3. Show results: green checkmarks for pushed (with Trello URL), red X for failed
4. Failed items show `error` message inline

**Acceptance criteria:**
- Always show dry-run preview before real push
- Never auto-push without user confirmation
- Partial failures shown per-item, not as a global error
- Trello URLs are tappable links

---

### Screen 7: Settings

**Purpose:** Configure backend URL and actor name.

**Layout:**
```
┌─────────────────────────────────┐
│ Settings                        │
├─────────────────────────────────┤
│ Backend URL                     │
│ ┌─────────────────────────────┐ │
│ │ http://10.75.138.96:8000    │ │
│ └─────────────────────────────┘ │
│                                 │
│ Your Name (actor)               │
│ ┌─────────────────────────────┐ │
│ │ sarah@company.com           │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Test Connection]  ● Connected  │
└─────────────────────────────────┘
```

**Actions:**
- Save URL → persist to SharedPreferences → re-initialize Dio client
- "Test Connection" → `GET /health` → show "Connected ✓ v1.0.0" or "Cannot connect ✗"

---

## 9. State Management Plan

### Providers per feature

```dart
// Settings
final settingsProvider = StateNotifierProvider<SettingsNotifier, Settings>(...);

// Meetings list
final meetingsProvider = FutureProvider<List<Meeting>>(
  (ref) => ref.read(meetingsRepoProvider).getMeetings(),
);

// Items for a meeting (parameterised by meetingId + optional status filter)
final itemsProvider = FutureProvider.family<List<Item>, ItemsParams>(
  (ref, params) => ref.read(itemsRepoProvider).getItems(params),
);

// Dashboard (global)
final dashboardProvider = FutureProvider<DashboardData>(
  (ref) => ref.read(dashboardRepoProvider).getDashboard(),
);

// Push state (per meeting)
final pushProvider = StateNotifierProvider.family<PushNotifier, PushState, String>(
  (ref, meetingId) => PushNotifier(ref.read(pushRepoProvider), meetingId),
);
```

### Cache and refresh rules
- Always refetch after a mutation — call `ref.invalidate(provider)`
- Pull-to-refresh → `ref.refresh(provider)`
- Polling for EXTRACTING meetings → use a timer inside a `StateNotifier`, cancel on dispose
- Do NOT cache items across navigations — always fresh

### Optimistic updates
**Do NOT use optimistic updates for approve/reject.** The server can return 409 with a rule violation. Show a loading indicator instead and wait for the server response before updating the UI.

The only safe optimistic update is **removing an item from the list after swipe** — but immediately restore it if the API call returns an error.

---

## 10. Mock Data for Parallel Development

### Abstract repository interface

```dart
// lib/core/api/meetings_repository.dart
abstract class MeetingsRepository {
  Future<List<Meeting>> getMeetings();
  Future<Meeting> getMeeting(String id);
  Future<List<Item>> getItems(String meetingId, {String? status, String? type});
  Future<Item> approveItem(String itemId, String actor);
  Future<Item> rejectItem(String itemId, String actor, {String? reason});
  Future<Item> unapproveItem(String itemId, String actor);
  Future<Item> clarifyItem(String itemId, String field, String answer);
  Future<DashboardData> getDashboard({String? meetingId});
  Future<PushResult> push(String meetingId, {bool dryRun = true, String actor = 'user'});
}
```

### Switch between real and mock
```dart
// lib/core/api/api_client.dart
final usesMock = bool.fromEnvironment('USE_MOCK', defaultValue: false);

final meetingsRepoProvider = Provider<MeetingsRepository>((ref) {
  if (usesMock) return MockMeetingsRepository();
  return RemoteMeetingsRepository(ref.read(dioProvider));
});
```

Run with: `flutter run --dart-define=USE_MOCK=true`

### Sample mock responses

**Meetings list:**
```json
[
  {
    "id": "25fbac60-07b7-4b81-81fe-df6334fff686",
    "title": "Q3 Roadmap Planning",
    "date": "2026-10-23",
    "participants": ["Sarah", "James", "Priya", "Marcus"],
    "status": "EXTRACTED",
    "error_message": null,
    "created_at": "2026-10-23T10:00:00+00:00"
  }
]
```

**Items (READY_FOR_REVIEW):**
```json
[
  {
    "id": "item-001",
    "meeting_id": "25fbac60-07b7-4b81-81fe-df6334fff686",
    "type": "ACTION_ITEM",
    "commitment_level": "CONFIRMED",
    "title": "Deliver API gateway by November 7th",
    "description": "James to complete and merge the new API gateway before mobile sync work can begin.",
    "owner": "James",
    "deadline": "2026-11-07",
    "evidence_quote": "James, can you own the API gateway delivery? I need it done by November 7th. Yeah, I can take that.",
    "speaker": "Sarah / James",
    "timestamp": "00:04:12",
    "confidence": 0.97,
    "flags": [],
    "status": "READY_FOR_REVIEW",
    "reasoning": "Clear owner (James), explicit deadline (November 7th), confirmed by both parties.",
    "external_id": null,
    "external_url": null,
    "created_at": "2026-10-23T10:01:00+00:00",
    "updated_at": "2026-10-23T10:01:00+00:00",
    "duplicate_links": []
  }
]
```

**Dashboard:**
```json
{
  "counts": {
    "EXTRACTED": 0, "NEEDS_CLARIFICATION": 4, "READY_FOR_REVIEW": 9,
    "APPROVED": 2, "REJECTED": 1, "SYNCED": 1, "DONE": 0
  },
  "overdue": [
    { "id": "item-013", "title": "Friday sync to check on sprint resource split",
      "owner": "Sarah", "deadline": "2026-10-24", "status": "NEEDS_CLARIFICATION" }
  ],
  "unassigned": [],
  "awaiting_clarification": 4,
  "pending_from_previous_meetings": []
}
```

**Push dry-run:**
```json
{
  "dry_run": true,
  "pushed": [
    { "item_id": "item-001", "title": "Deliver API gateway by November 7th",
      "owner": "James", "deadline": "2026-11-07", "trello_url": null, "error": null }
  ],
  "failed": []
}
```

---

## 11. Backend Status and Gaps

| Endpoint | Status | Notes |
|---|---|---|
| `GET /health` | IMPLEMENTED | |
| `GET /meetings` | IMPLEMENTED | |
| `GET /meetings/{id}` | IMPLEMENTED | |
| `POST /meetings` | IMPLEMENTED | |
| `POST /meetings/{id}/extract` | IMPLEMENTED | |
| `GET /meetings/{id}/items` | IMPLEMENTED | Supports `?type=` and `?status=` filters |
| `POST /items/{id}/approve` | IMPLEMENTED | |
| `POST /items/{id}/reject` | IMPLEMENTED | |
| `POST /items/{id}/unapprove` | IMPLEMENTED | |
| `POST /items/{id}/clarify` | IMPLEMENTED | supports `owner` and `deadline` fields only |
| `POST /meetings/{id}/approve-all-ready` | IMPLEMENTED | |
| `GET /members` | IMPLEMENTED | |
| `GET /dashboard` | IMPLEMENTED | |
| `POST /sync` | IMPLEMENTED | |
| `POST /meetings/{id}/push` | IMPLEMENTED | defaults to `dry_run=true` |
| `GET /meetings/{id}/export` | IMPLEMENTED | less useful for mobile |
| `GET /items/{id}/audit` | IMPLEMENTED | out of scope for mobile |

### Gaps and workarounds

| Gap | Impact | Workaround |
|---|---|---|
| No `GET /items/clarification-needed` across all meetings | Clarification screen needs per-meeting calls | Call `GET /dashboard` for `awaiting_clarification` count, then `GET /meetings` and `GET /meetings/{id}/items?status=NEEDS_CLARIFICATION` for each meeting |
| `POST /items/{id}/clarify` only supports `owner` and `deadline` fields | Cannot clarify `MULTIPLE_OWNERS` with more nuance | Use the owner picker to set a single resolved owner — this clears `MULTIPLE_OWNERS` flag |
| No pagination on any list endpoint | Large meeting item lists load all at once | Acceptable for hackathon; add `?limit=&offset=` as future enhancement |
| Push returns 200 even with partial failure | Client must always check `failed` array | Documented above — always render both arrays |

---

## 12. Run and Test Instructions

### Start the backend
```powershell
cd f:\Projects\HackNova\HACKNOVA_26\backend
.\venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Backend URL from physical device: `http://10.75.138.96:8000`

### Verify it's running
```
GET http://10.75.138.96:8000/health
→ { "status": "ok", "version": "1.0.0" }
```

### Seed data (mock AI)
The backend ships with `data/mock_pipeline_result.json` (13 items, 4 NEEDS_CLARIFICATION, 9 READY_FOR_REVIEW, 1 DUPLICATE link, 1 CONFLICT link).

To create a seeded meeting:
```bash
curl -X POST http://localhost:8000/meetings \
  -H "Content-Type: application/json" \
  -d '{"title":"Q3 Roadmap","date":"2026-10-23","participants":["Sarah","James","Priya","Marcus"],"raw_text":"test"}'

# Copy the returned id, then:
curl -X POST http://localhost:8000/meetings/{id}/extract
```
Poll `GET /meetings/{id}` until `status: "EXTRACTED"`. All 13 mock items are now in the DB.

### Manual test checklist
- [ ] App connects → `/health` returns "ok"
- [ ] Meetings list loads the seeded meeting
- [ ] Inbox shows 9 READY_FOR_REVIEW items
- [ ] Swipe right on item → item approved → undo snackbar appears
- [ ] Tap undo → item back in READY_FOR_REVIEW
- [ ] CLARIFY tab shows 4 items
- [ ] Submit owner on a VAGUE_OWNER item → item disappears from clarify tab
- [ ] Dashboard shows correct counts
- [ ] Push screen → "Preview Push" → list of approved items
- [ ] "Confirm Push" → items show SYNCED (with Trello if credentials set, else IntegrationError)

### Demo flow (judge demo)
1. App on phone, backend on laptop, Trello board open on tablet/second screen
2. Approve two items on the phone
3. Go to Push screen → Preview → Confirm
4. Show Trello board refreshing with new cards
5. Go to Dashboard → correct counts

---

## 13. Build Order for the Flutter Developer

### Phase 1 — Foundation (Day 1, ~4h)
- [ ] Flutter project setup (Riverpod, Dio, go_router)
- [ ] Settings screen + SharedPreferences for base URL and actor name
- [ ] `ApiClient` with Dio, base URL from settings, timeout config
- [ ] `ApiException` class and global error interceptor
- [ ] All Dart models and enums (copy from Section 5)
- [ ] `GET /health` call on startup with "no connection" banner
- [ ] MockApiClient for all endpoints

### Phase 2 — Meetings + Inbox (Day 1–2, ~5h)
- [ ] Meetings list screen with `GET /meetings`
- [ ] Meeting card with status badge
- [ ] Auto-polling for EXTRACTING meetings
- [ ] Inbox screen with two tabs (READY / CLARIFY)
- [ ] Item card widget
- [ ] Swipe right → approve + undo snackbar
- [ ] Swipe left → reject (no undo)
- [ ] "Approve All Ready" button

### Phase 3 — Evidence Sheet + Clarification (Day 2, ~3h)
- [ ] Evidence bottom sheet (confidence bar, flags, evidence quote, reasoning)
- [ ] Approve/reject from bottom sheet
- [ ] Clarification screen with `GET /meetings/{id}/items?status=NEEDS_CLARIFICATION`
- [ ] Owner picker (merged participants + members list)
- [ ] Date picker for deadline
- [ ] Submit clarification → auto-dismiss on success

### Phase 4 — Dashboard (Day 2–3, ~2h)
- [ ] Dashboard screen with `GET /dashboard`
- [ ] Stat tiles (counts by status)
- [ ] Overdue items list
- [ ] Unassigned items list
- [ ] Pending from previous meetings list
- [ ] Sync button → `POST /sync`

### Phase 5 — Push (Day 3, ~2h)
- [ ] Push screen for a meeting
- [ ] Preview (dry_run=true) list
- [ ] Confirm button → real push (dry_run=false)
- [ ] Per-item result display (success with Trello URL / error message)

### Phase 6 — Polish (Day 3, ~2h)
- [ ] Error states on every screen
- [ ] Loading skeletons / shimmer
- [ ] Empty state illustrations
- [ ] Status badges with correct colors
- [ ] Confidence progress bar
- [ ] Flag chips (orange warning pills)

### Stretch (if time allows)
- [ ] Paste/share transcript → create meeting → extract with polling
- [ ] Push notifications for new items requiring review
- [ ] Voice-to-text for transcript input

---

## 14. Definition of Done and Open Questions

### Mobile app definition of done
- [ ] All 6 core screens functional with real backend data
- [ ] Swipe approve/reject with undo works end-to-end
- [ ] Clarification submits and auto-transitions item
- [ ] Dashboard loads real counts
- [ ] Push dry-run preview and confirm works
- [ ] Settings screen saves and applies base URL
- [ ] `ApiException` surfaces server error messages as snackbars
- [ ] App tested on physical Android device over LAN

### Open questions for the backend owner

1. **Pagination:** Are there plans to add `?limit=&offset=` to `GET /meetings/{id}/items`? For meetings with 50+ items this could be slow.

2. **Global clarification list:** Is there a plan for `GET /items?status=NEEDS_CLARIFICATION` across all meetings? Currently the app must query per-meeting.

3. **Push target:** Is `github` push functional or still a stub? The `github.py` integration is marked "STRETCH GOAL" in the code.

4. **Actor validation:** The `actor` field is a free string. Is there any server-side validation that it matches a known member name? Currently any string is accepted.

5. **WebSocket / SSE for extraction polling:** Any plans for a push-based notification instead of the client polling `GET /meetings/{id}`? Polling every 3s is fine for now.

6. **Auth:** When authentication is added, what mechanism? JWT in Authorization header is the easiest to add to Dio.
