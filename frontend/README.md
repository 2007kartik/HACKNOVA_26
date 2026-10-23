# MeetingFlow — Meeting-to-Execution Automation Agent

> **HACKNOVA'26 PS-4** | Built with React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, and React Router.

## Core Philosophy
> **"AI proposes; a human reviews and approves; only eligible approved work can be pushed."**

This frontend delivers an evidence-backed meeting-to-execution workflow designed for precision, accountability, and seamless team delivery.

---

## Features Implemented

1. **Meetings Management (`/`)**
   - Meeting list with status badges (`CREATED`, `EXTRACTING`, `EXTRACTED`, `FAILED`).
   - Search by title and participants, plus status filtering.
   - Resilient error handling with retry and empty state guidance.

2. **Meeting Creation (`/meetings/new`)**
   - Clean meeting form with title, date, tag-based participant input, and text area for transcript.
   - One-click **Load Demo Sample** button with complete hackathon dialogue.
   - Text file upload convenience (`.txt`, `.md`).
   - Two-step submission sequence (`POST /meetings` followed by `POST /meetings/{id}/extract`).

3. **Meeting Workspace (`/meetings/:id`)**
   - Controlled 2-second extraction polling with animated multi-stage progress indicator.
   - Full transcript collapsible view.
   - **Items Review Tab**:
     - Action items, decisions, suggestions, open questions, and follow-ups.
     - Evidence quotes with speaker attribution (rendered securely as plain text).
     - Confidence indicators with automatic warnings when confidence is below 70%.
     - Ambiguity flag chips with one-click resolution.
     - Edit modal sending only modified fields via `PATCH /items/{id}`.
     - Clarification modal submitting `{ field, answer }` to `POST /items/{id}/clarify`.
     - Human approval, un-approval, and audit-logged rejection with required reason.
     - Bulk approval for all eligible ready items with detailed skipped reasons.
     - Collapsible reasoning drawer ("Why this was extracted").
     - Synced external task links (Trello cards).
     - Audit trail slide-over drawer with actor, action, timestamp, and field diffs.
   - **Duplicates & Conflicts Tab**:
     - Side-by-side comparison of duplicate and conflicting pairs.
     - Canonical item selection for **Merge** and **Reject Other** actions.
     - Non-destructive **Keep Both** resolution.
   - **Push to Trello & Export Tab**:
     - **Mandatory Dry-run Preview** before any cards are created.
     - Explicit user confirmation dialog with card counts and warnings.
     - Separate reporting of created cards and partial failures with direct Trello links.
     - Direct CSV and JSON file exports with "Approved only" or "All items" filters.

4. **Dashboard (`/dashboard`)**
   - Global status metrics (`EXTRACTED`, `NEEDS_CLARIFICATION`, `READY_FOR_REVIEW`, `APPROVED`, `REJECTED`, `SYNCED`, `DONE`).
   - Overdue commitment tracking with safe timezone handling.
   - Unassigned action items list with quick assign links.
   - Pending carry-over items from previous meetings.
   - **Sync with Trello** action to poll completion states.

5. **Team Members (`/members`)**
   - Member management with email, Trello member ID, and GitHub username mappings.
   - Full CRUD with modal dialogs and `204 No Content` delete handling.

---

## Getting Started

### 1. Prerequisites
- Node.js >= 18 (Tested on Node.js 24)
- npm >= 9

### 2. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default content:
```env
VITE_API_BASE_URL=http://localhost:8000
```

### 3. Run Development Server
```bash
npm run dev
```
The frontend starts on **`http://localhost:3000`** (matching the backend's default allowed CORS origin).

### 4. Production Build & Typecheck
```bash
# Typecheck
npm run lint

# Build for production
npm run build
```

---

## Backend Integration & Handoff Notes

- **CORS Notice:** The backend default allowed origin is `http://localhost:3000`. The frontend is configured to run on port 3000 by default. If running Vite on another port (e.g. 5173), ensure `FRONTEND_ORIGINS` in backend configuration includes `http://localhost:5173`.
- **API Base:** The frontend communicates with the FastAPI backend at `http://localhost:8000`. When the backend is offline, the UI displays clear connection diagnostics without crashing.
- **Safety First:** Tasks are never pushed automatically. All external integrations require dry-run preview and explicit human confirmation.
