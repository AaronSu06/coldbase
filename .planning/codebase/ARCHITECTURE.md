# Architecture

**Analysis Date:** 2026-03-12

## Pattern Overview

**Overall:** Three-tier distributed system with Chrome extension as client, Express.js API as middleware, and SQLite as data store.

**Key Characteristics:**
- **Event-driven extension** detects cold outreach emails in Gmail via classifier heuristics
- **Optimistic UI mutations** in React client with automatic persistence to server
- **Real-time sync mechanisms** including visibility-based triggers and periodic polling
- **Modular feature separation** between core tracking, analytics, and AI-powered drafting

## Layers

**Extension Layer (Chrome Content & Background Scripts):**
- Purpose: Gmail interception, email classification, tracking pixel injection, OAuth authentication
- Location: `extension/background.js`, `extension/content.js`, `extension/sidebar.js`, `extension/panel.js`
- Contains: Message handlers, Gmail API calls, cold outreach classification, tracking pixel generation
- Depends on: Gmail API, Clearbit API (optional company lookups), local Express server
- Used by: User interacting with Gmail compose window and extension UI

**API Layer (Express.js Backend):**
- Purpose: Centralized data persistence, analytics computation, external service integration (Gemini AI, DNS lookups)
- Location: `server/index.js`, `server/emailFinder.js`
- Contains: RESTful CRUD endpoints for outreach records, tracking pixel registration, email finding, domain suggestion
- Depends on: Prisma ORM, SQLite, Gemini API, DNS library
- Used by: Extension background worker, React web dashboard

**Web Dashboard (React + Vite):**
- Purpose: Kanban board UI for managing tracked outreach, analytics visualization, manual record editing
- Location: `web/src/App.jsx`, `web/src/components/`, `web/src/hooks/`
- Contains: Kanban board with drag-drop, sidebar panel, insights charts, search/filter UI
- Depends on: useOutreach hook (state management), dnd-kit (drag-drop), local API client
- Used by: User reviewing and managing tracked outreach

## Data Flow

**Cold Email Tracking Flow:**

1. User composes email in Gmail
2. `content.js` detects Send button click, generates tracking pixel UUID
3. Tracking pixel (`<img>` tag) injected into draft with URL: `http://localhost:3001/track/[UUID].gif`
4. User sends email
5. `background.js` triggered by storage listener (from content script)
6. `background.js` fetches latest SENT message from Gmail API
7. Email classified via keyword-based `isColdOutreach()` function in `classifier.js`
8. Company extracted via: email body text → Clearbit API → email domain heuristics
9. POST `/api/outreach` record created in SQLite
10. Tracking pixel UUID registered via POST `/api/track`

**Reply Detection Flow:**

1. Chrome alarm fires every 30 minutes (`outreachiq-reply-check`)
2. `background.js` calls `checkReplies()` with Gmail API token
3. For each tracked thread: fetch full thread from Gmail API
4. Compare `messageCount` to DB; if increased, extract latest message
5. If latest message from contact (not self-sent): PATCH thread to status=Replied, set repliedAt timestamp
6. Update snippet with conversation preview (last 4 messages)
7. Self-sent bumps update metrics but preserve status

**Web Dashboard Data Flow:**

1. Page load: `useOutreach()` calls `fetchOutreach()` → GET `/api/outreach`
2. Local state renders kanban board with localStorage-persisted card order
3. User drags card between columns
4. `handleDragEnd()` calls `updateStatus(threadId, newStatus)`
5. Optimistic mutation updates local state immediately
6. PATCH `/api/outreach/[threadId]` persists in background
7. Error: rollback to previous values via catch handler
8. Polling every 5 minutes as safety net; visibility change triggers manual refresh

**Analytics Flow:**

1. User clicks "Insights" tab
2. `InsightsPanel` calls `fetchBestTime()` → GET `/api/insights/best-time`
3. Server executes raw SQL query grouping Outreach by hour sent
4. Returns aggregated sent count, reply count, reply rate per hour
5. Chart renders with hour-based breakdowns

**Email Draft Generation Flow:**

1. User clicks "Draft Follow-up" in sidebar
2. `generateConversationFeedback()` calls background.js via chrome.runtime.sendMessage
3. Message type `DRAFT_EMAIL` routed to background.js handler
4. Background.js POST `/api/draft-email` with context (company, name, subject snippet, notes)
5. Server builds prompt via `buildDraftPrompt()` and calls Gemini API
6. Gemini returns draft text
7. UI displays draft in textarea for user to copy/edit

**State Management:**

- **Extension**: chrome.storage.local (pending scan tracking), chrome.identity (OAuth token caching)
- **Web Dashboard**: React useState (records, UI state), localStorage (kanban card order)
- **Server**: SQLite via Prisma with 3 models: Outreach, TrackingPixel, OpenEvent
- **Persistence**: Optimistic local mutations with PATCH/POST fallback; no offline queueing

## Key Abstractions

**Cold Outreach Classifier:**
- Purpose: Distinguish cold outreach from personal/business emails
- Examples: `classifier.js` functions `isColdOutreach()`, `countKeywordMatches()`, `extractCompanyFromEmail()`
- Pattern: Keyword scoring + company extraction heuristics; keyword weights tuned for internship/job outreach

**Outreach Record:**
- Purpose: Single tracked email thread with full metadata
- Examples: Outreach model in `server/prisma/schema.prisma`
- Pattern: Single source of truth; extensions and web dashboard both read/write same records via API

**Kanban Column State:**
- Purpose: Group records by status for visual management
- Examples: `KanbanBoard` component in `web/src/components/KanbanBoard.jsx`
- Pattern: Local computed state from records + saved order in localStorage; drag-drop handler updates both

**Tracking Pixel:**
- Purpose: Detect when outreach email is opened by recipient
- Examples: `TrackingPixel` model, `/track/:trackingId` endpoint in `server/index.js`
- Pattern: 1x1 transparent GIF served from server; logs IP/user-agent; increments Outreach.openCount

## Entry Points

**Extension Install:**
- Location: `extension/background.js` - `chrome.runtime.onInstalled` handler
- Triggers: Extension first loaded, updated, or Chrome restart
- Responsibilities: Create 30-minute alarm for reply checking

**Email Sent Detection:**
- Location: `extension/content.js` - Send button click event
- Triggers: User clicks Send in Gmail compose
- Responsibilities: Store pending scan metadata to chrome.storage, inject tracking pixel

**Background Worker Triggers:**
- Location: `extension/background.js` - `chrome.storage.onChanged` listener and `chrome.alarms.onAlarm`
- Triggers: Storage write from content script OR 30-min alarm
- Responsibilities: Acquire OAuth token, classify latest sent email, create Outreach record, check replies

**Web Dashboard Load:**
- Location: `web/src/main.jsx` → `App.jsx`
- Triggers: Browser navigates to http://localhost:5173
- Responsibilities: Initialize useOutreach hook, render kanban board and sidebar

**API Server Start:**
- Location: `server/index.js`
- Triggers: `npm run dev` or `node index.js`
- Responsibilities: Mount Express routes, initialize Prisma, listen on port 3001

## Error Handling

**Strategy:** Graceful degradation with fallback mechanisms and logging.

**Patterns:**
- **Extension network errors**: Logged to console; operations are fire-and-forget or retry-once. Missing server doesn't block UI.
- **Gmail API 401**: Auto-refresh token once via `apiFetchRetry()` in background.js; if fails again, skip record and log
- **Database conflicts (P2002 unique violation)**: Return 409 Conflict; treated as idempotent in extension
- **PATCH failures in web dashboard**: Optimistic rollback: setRecords reverts to previousValues on error
- **API request validation**: No input validation in routes; Prisma schema enforcement only (threadId uniqueness, required fields)

## Cross-Cutting Concerns

**Logging:** Console.log with `[Reach]` prefix throughout extension, server, and React components. No structured logging. Error messages sent to console and sometimes to user UI (Sidebar shows error state for draft generation).

**Validation:**
- Extension: Manual hints normalized via `normalizeForMatch()` for comparison logic
- Server: Prisma validates threadId uniqueness and required fields
- Web: Records normalized via `normalizeStatus()` to ensure valid COLUMNS

**Authentication:**
- Extension: OAuth 2.0 with chrome.identity API; token cached by Chrome; manual revocation on 401
- Server: Optional `REACH_SECRET` header validation for `/find-email`, `/suggest-domains`, `/draft-email` endpoints
- Web dashboard: No auth; relies on localhost-only server access (no network isolation in dev)

**Rate Limiting:** None implemented; relies on Gmail API rate limits and Chrome alarm constraints.

---

*Architecture analysis: 2026-03-12*
