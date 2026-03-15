---
phase: 03-server-restructure
plan: "01"
subsystem: api
tags: [prisma, zod, express, routing, pagination]

# Dependency graph
requires: []
provides:
  - Prisma singleton at server/lib/prisma.js shared by all route files
  - Outreach routes (GET/POST/PATCH/DELETE) with Zod validation and limit/offset pagination
  - Tracking routes (pixel serve and register) at original URL paths
affects:
  - 03-server-restructure (remaining plans mount these routers from index.js)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Prisma singleton exported from server/lib/prisma.js; route files never instantiate PrismaClient directly
    - Zod safeParse inline above handlers; 400 response with error/message/statusCode on failure
    - All async route catch blocks call next(e) instead of inline res.status(500); global error handler in index.js handles Prisma codes
    - Pagination via limit/offset query params with 500-row max cap

key-files:
  created:
    - server/lib/prisma.js
    - server/routes/outreach.js
    - server/routes/tracking.js
  modified: []

key-decisions:
  - "Prisma singleton in server/lib/prisma.js — route files import, never instantiate"
  - "GET /api/outreach returns { data, total } pagination shape (not flat array)"
  - "All outreach catch blocks use next(e) — global handler in index.js owns P2002/P2025 responses"
  - "GET /track/:trackingId intentionally swallows tracking errors (non-fatal); pixel always delivered"
  - "POST /api/track P2002 returns 200 (idempotent register), not an error"
  - "Tracking router mounted at / with full /track and /api prefixes to preserve sent-email URLs"

patterns-established:
  - "Prisma singleton pattern: import { prisma } from '../lib/prisma.js' in every route file"
  - "Zod validation pattern: safeParse → 400 with { error, message, statusCode } on failure"
  - "Error propagation pattern: next(e) in every catch block; no inline res.status(500)"
  - "Pagination pattern: limit/offset query params, Promise.all for data+count, { data, total } response"

requirements-completed: [SERV-01, SERV-02, SERV-03, PERF-01]

# Metrics
duration: 8min
completed: 2026-03-15
---

# Phase 3 Plan 01: Server Restructure — Prisma Singleton + Outreach/Tracking Routes Summary

**Prisma singleton, paginated outreach CRUD with Zod validation, and tracking pixel routes extracted from index.js to dedicated route files**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-15T21:05:51Z
- **Completed:** 2026-03-15T21:13:00Z
- **Tasks:** 3
- **Files modified:** 3 created

## Accomplishments

- Created server/lib/prisma.js — single PrismaClient instance preventing connection pool exhaustion
- Created routes/outreach.js — GET with limit/offset pagination returning { data, total }, POST/PATCH with inline Zod validation returning 400 on missing/invalid fields, DELETE; all catch blocks call next(e)
- Created routes/tracking.js — GET /track/:trackingId serves 1x1 GIF with non-fatal error handling, POST /api/track registers pixels idempotently; routes at original URLs to preserve open-tracking in sent emails

## Task Commits

Each task was committed atomically:

1. **Task 1: Create server/lib/prisma.js singleton** - `0be0f4c` (feat)
2. **Task 2: Create routes/outreach.js — GET (pagination), POST/PATCH (Zod), DELETE** - `b22523a` (feat)
3. **Task 3: Create routes/tracking.js — pixel serve and register** - `61a88ce` (feat)

## Files Created/Modified

- `server/lib/prisma.js` — Exports single PrismaClient instance; shared by all route files
- `server/routes/outreach.js` — 4 routes: GET (paginated), POST (Zod), PATCH (Zod partial), DELETE; all errors via next(e)
- `server/routes/tracking.js` — GET /track/:trackingId (pixel delivery, non-fatal tracking), POST /api/track (idempotent register)

## Decisions Made

- Tracking router uses full URL paths (/track/:trackingId, /api/track) so it can be mounted at '/' in index.js without URL changes — critical for preserving open-tracking in already-sent emails
- GET /track/:trackingId swallows all tracking errors in the inner try/catch; pixel delivery is always guaranteed regardless of DB failures
- POST /api/track returns 200 (not 201) on P2002 to make pixel registration idempotent

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- server/lib/prisma.js and both route files are ready to be imported and mounted in index.js (Phase 3 Plan 02)
- index.js still contains the original inline handlers; they will be removed when the routers are wired in
- No blockers

---
*Phase: 03-server-restructure*
*Completed: 2026-03-15*
