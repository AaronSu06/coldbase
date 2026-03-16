---
phase: 03-server-restructure
plan: "03"
subsystem: api
tags: [express, prisma, rate-limiting, error-handling, react]

# Dependency graph
requires:
  - phase: 03-01
    provides: route files (outreach, tracking, email, analytics) and server/lib/prisma.js singleton
  - phase: 03-02
    provides: Zod validation on outreach routes; next(e) pattern for global error handler
provides:
  - server/index.js refactored to pure mounting orchestrator (no business logic)
  - expensiveRateLimit defined in index.js and applied at mount time to 3 email POST routes
  - Global error handler (4-arg) as last app.use() — handles P2002 (409), P2025 (404), generic 500
  - web/src/hooks/useOutreach.js updated for { data, total } response shape
affects:
  - 04-extension-split (any new routes automatically get auth via app.use('/api', requireSecret))
  - future plans adding routes (pattern established: mount in index.js, logic in route files)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route mounting: app.use() for most routes; individual app.post() mounts for rate-limited email routes"
    - "Global error handler as last app.use() in index.js — route files use next(e) not inline status codes"
    - "Middleware ownership: expensiveRateLimit and requireSecret defined in index.js, never in route files"

key-files:
  created: []
  modified:
    - server/index.js
    - web/src/hooks/useOutreach.js

key-decisions:
  - "expensiveRateLimit applied via individual app.post() mounts in index.js (not inside route files) — middleware stays in orchestrator"
  - "trackingRoutes mounted at / with full prefixes preserved inside route file (not /api/tracking)"
  - "useOutreach.js destructures only { data } from fetchOutreach() response — total not used by hook at this time"

patterns-established:
  - "index.js is a pure orchestrator: imports, middleware, mounts, error handler, server start — no business logic"
  - "Any future rate-limited route: add app.post('/path', expensiveRateLimit, routeHandler) in index.js"

requirements-completed: [SERV-01, SERV-03, PERF-01]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 3 Plan 03: Server Wiring Summary

**server/index.js refactored to pure Express orchestrator: 4 route files mounted, expensiveRateLimit applied at mount time to 3 email POST routes, global error handler added, useOutreach.js updated for { data, total } response shape**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-15T21:57:00Z
- **Completed:** 2026-03-16T06:25:00Z
- **Tasks:** 3 of 3 (Task 3 human-verify checkpoint approved 2026-03-16)
- **Files modified:** 2

## Accomplishments
- Reduced server/index.js from 282 lines to 85 lines by removing all business logic into route files
- Applied expensiveRateLimit at mount time in index.js using per-path app.post() mounts for 3 email routes
- Added global 4-arg error handler as last app.use() — centralizes P2002 (409) and P2025 (404) responses
- Updated useOutreach.js to destructure { data } from GET /api/outreach response (was treating response as plain array)

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor server/index.js to mounting orchestrator with global error handler** - `f2b6bf9` (feat)
2. **Task 2: Update useOutreach.js to consume { data } from GET /api/outreach** - `d95503d` (feat)
3. **Task 3: Verify full Phase 3 server restructure end-to-end** - human-verify checkpoint approved (all 6 smoke tests passed)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `server/index.js` - Rewritten as pure orchestrator: CORS, requireSecret, expensiveRateLimit definition, 4 route mounts (3 email routes with rate limiter at mount time), global error handler, server start
- `web/src/hooks/useOutreach.js` - Single-line change: `.then(data => ...)` changed to `.then(({ data }) => ...)` to consume new { data, total } response shape

## Decisions Made
- expensiveRateLimit applied via individual `app.post()` mounts in index.js per locked user decision from plan — route files stay clean, middleware ownership stays in orchestrator
- trackingRoutes mounted at `/` (full paths preserved inside route file: `/track/:id` and `/api/track`) to preserve sent-email tracking pixel URLs
- useOutreach.js destructures only `{ data }` — `total` field not used by hook at this time (per plan spec)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 3 server restructure is fully wired: all 4 route files mounted, global error handler active, rate limiter applied
- Phase 4 extension split can proceed: any new /api/* routes automatically get requireSecret auth via existing middleware
- No blockers

---
*Phase: 03-server-restructure*
*Completed: 2026-03-15*
