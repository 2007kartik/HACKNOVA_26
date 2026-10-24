# Flutter Mobile Companion — Lightweight Spec

**Backend base URL:** `http://10.75.138.96:8000`
**Purpose:** Quick-action companion. Not a replacement for the web app.
**Build time target:** ~2 hours using Cursor/Windsurf AI coding tools.

---

## What this app does (and nothing else)

| Feature | Description |
|---|---|
| Dashboard | Counts by status, overdue items, unassigned items |
| Meetings List | See recent meetings and their status |
| Inbox | Items waiting for approval — swipe to approve/reject |
| Push Notifications (stretch) | Alert when new items need review |

**Does NOT do:** transcript upload, AI extraction, duplicate resolution, member management, full editing, audit logs, Trello configuration.

---

## Stack (copy-paste this into your AI tool)

```
Flutter stable, Riverpod, Dio, go_router, json_serializable
```

---

## Connecting to the backend

| Device | URL |
|---|---|
| Android emulator | `http://10.0.2.2:8000` |
| iOS simulator | `http://localhost:8000` |
| Physical device | `http://10.75.138.96:8000` |

**Android** — add to `AndroidManifest.xml`:
```xml
<application android:usesCleartextTraffic="true" ...>
```

**iOS** — add to `Info.plist`:
```xml
<key>NSAppTransportSecurity</key>
<dict><key>NSAllowsArbitraryLoads</key><true/></dict>
```

API explorer: `http://10.75.138.96:8000/docs`

---

## 4 Screens

### Bottom nav
```
[ Meetings | Inbox | Dashboard | Settings ]
```

---

### Screen 1 — Meetings List

**API:** `GET /meetings`

**Shows:** title, date, status badge

**Status badge colors:**
- `CREATED` → grey
- `EXTRACTING` → blue + spinner (poll every 3s)
- `EXTRACTED` → green
- `FAILED` → red

**Tap a meeting** → goes to Inbox for that meeting

**Sample response:**
```json
[
  {
    "id": "25fbac60-07b7-4b81-81fe-df6334fff686",
    "title": "Q3 Roadmap Planning",
    "date": "2026-10-23",
    "status": "EXTRACTED",
    "error_message": null,
    "created_at": "2026-10-23T10:00:00+00:00"
  }
]
```

---

### Screen 2 — Inbox

**API:** `GET /meetings/{id}/items?status=READY_FOR_REVIEW`

**Shows per item:** title, owner, deadline, confidence %, type badge

**Swipe right → Approve:**
```
POST /items/{id}/approve
Body: { "actor": "mobile_user" }
```

**Swipe left → Reject:**
```
POST /items/{id}/reject
Body: { "actor": "mobile_user", "reason": "Not relevant" }
```

**Tap item → bottom sheet showing:**
- Evidence quote (what was actually said in the meeting)
- Confidence score
- Reasoning from AI
- Approve / Reject buttons

**Important rules (server enforces, just show the error):**
- Items with `flags` containing `NO_OWNER` or `VAGUE_OWNER` → approve will return 409 → show snackbar with error message
- `NEEDS_CLARIFICATION` items cannot be approved → show "Needs clarification first"
- `REJECTED` is terminal — no undo

**Sample item:**
```json
{
  "id": "item-001",
  "type": "ACTION_ITEM",
  "commitment_level": "CONFIRMED",
  "title": "Deliver API gateway by November 7th",
  "owner": "James",
  "deadline": "2026-11-07",
  "evidence_quote": "James said he would own the API gateway by November 7th.",
  "confidence": 0.97,
  "flags": [],
  "status": "READY_FOR_REVIEW",
  "reasoning": "Clear owner and deadline, confirmed by both parties."
}
```

---

### Screen 3 — Dashboard

**API:** `GET /dashboard`

**Shows 4 tiles + 2 lists:**

```
┌──────────┐ ┌──────────┐
│    4     │ │    9     │
│  Need    │ │  Ready   │
│  Action  │ │  Review  │
└──────────┘ └──────────┘
┌──────────┐ ┌──────────┐
│    2     │ │    1     │
│ Approved │ │  Synced  │
└──────────┘ └──────────┘

OVERDUE
• Friday sync · Sarah · Oct 24
• Accessibility report · Priya

UNASSIGNED
• Implement onboarding MVP
```

**Sample response:**
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
      "id": "item-013",
      "title": "Friday sync check",
      "owner": "Sarah",
      "deadline": "2026-10-24",
      "status": "NEEDS_CLARIFICATION"
    }
  ],
  "unassigned": [],
  "awaiting_clarification": 4,
  "pending_from_previous_meetings": []
}
```

---

### Screen 4 — Settings

**Stores in SharedPreferences:**
- Backend URL (default: `http://10.75.138.96:8000`)
- Actor name (used in approve/reject calls, default: `"mobile_user"`)

**Test Connection button** → `GET /health` → show "Connected ✓" or "Cannot connect ✗"

```json
{ "status": "ok", "version": "1.0.0" }
```

---

## Key Dart Models (copy these directly)

```dart
enum ItemStatus {
  extracted, needsClarification, readyForReview,
  approved, rejected, synced, done;

  static ItemStatus fromJson(String v) => switch (v) {
    'EXTRACTED'            => extracted,
    'NEEDS_CLARIFICATION'  => needsClarification,
    'READY_FOR_REVIEW'     => readyForReview,
    'APPROVED'             => approved,
    'REJECTED'             => rejected,
    'SYNCED'               => synced,
    'DONE'                 => done,
    _                      => extracted,
  };
}

enum MeetingStatus {
  created, extracting, extracted, failed;

  static MeetingStatus fromJson(String v) => switch (v) {
    'CREATED'    => created,
    'EXTRACTING' => extracting,
    'EXTRACTED'  => extracted,
    'FAILED'     => failed,
    _            => created,
  };
}

class Meeting {
  final String id, title, date, createdAt;
  final MeetingStatus status;
  final String? errorMessage;

  Meeting.fromJson(Map<String, dynamic> j)
    : id           = j['id'],
      title        = j['title'],
      date         = j['date'],
      createdAt    = j['created_at'],
      status       = MeetingStatus.fromJson(j['status']),
      errorMessage = j['error_message'];
}

class Item {
  final String id, meetingId, type, commitmentLevel;
  final String title, description, evidenceQuote, reasoning;
  final String? owner, deadline, speaker;
  final double confidence;
  final List<String> flags;
  final ItemStatus status;

  Item.fromJson(Map<String, dynamic> j)
    : id              = j['id'],
      meetingId       = j['meeting_id'],
      type            = j['type'],
      commitmentLevel = j['commitment_level'],
      title           = j['title'],
      description     = j['description'] ?? '',
      evidenceQuote   = j['evidence_quote'] ?? '',
      reasoning       = j['reasoning'] ?? '',
      owner           = j['owner'],
      deadline        = j['deadline'],
      speaker         = j['speaker'],
      confidence      = (j['confidence'] as num).toDouble(),
      flags           = List<String>.from(j['flags'] ?? []),
      status          = ItemStatus.fromJson(j['status']);

  bool get hasOwnerIssue =>
    flags.contains('NO_OWNER') ||
    flags.contains('VAGUE_OWNER') ||
    flags.contains('MULTIPLE_OWNERS');
}
```

---

## Error handling

Every error from the backend looks like:
```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Cannot approve item with unresolved ownership ambiguity flags.",
    "details": {}
  }
}
```

Just show `error.message` in a snackbar. Don't overthink it.

| HTTP status | What it means | What to show |
|---|---|---|
| 409 | Rule violation (approve blocked, etc.) | Snackbar with `error.message` |
| 404 | Item/meeting not found | "Not found" + go back |
| 422 | Bad request body | "Invalid input" |
| 5xx | Server error | "Something went wrong, try again" |

---

## Dio setup (copy this)

```dart
Dio createDio(String baseUrl) => Dio(
  BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 30),
    headers: {'Content-Type': 'application/json'},
  ),
)..interceptors.add(InterceptorsWrapper(
  onError: (e, handler) {
    // parse error.message from response body
    handler.next(e);
  },
));
```

---

## Build order for your AI tool (2h plan)

**30 min — Setup**
- New Flutter project, add dependencies, folder structure
- Settings screen + SharedPreferences
- Dio client using stored base URL
- `GET /health` on startup

**30 min — Meetings + Inbox**
- Meetings list with status badges
- `GET /meetings/{id}/items?status=READY_FOR_REVIEW`
- Swipe right → approve, swipe left → reject
- Bottom sheet with evidence quote

**30 min — Dashboard**
- 4 stat tiles from `counts` map
- Overdue list
- Unassigned list
- Pull to refresh

**30 min — Polish**
- Error snackbars
- Loading indicators
- Empty states
- Status badge colors
