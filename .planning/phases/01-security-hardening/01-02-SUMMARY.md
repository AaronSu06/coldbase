---
phase: 01-security-hardening
plan: 02
subsystem: api
tags: [cors, express, rate-limiting, middleware, security]

# Dependency graph
requires: []
provides:
  - Origin-allowlist CORS via ALLOWED_ORIGINS env var (rejects unlisted origins)
  - requireSecret middleware applied globally to all /api/* routes (rejects missing/invalid x-reach-secret)
  - expensiveRateLimit (10 req/15min) on /api/find-email, /api/draft-email, /api/suggest-domains
  - GET /track/:trackingId remains public (no auth required)
affects: [all future server API work, extension callers, web callers]

# Tech tracking
tech-stack:
  added: [express-rate-limit v7]
  patterns: [Global middleware mount via app.use('/api', fn) before route definitions, Per-route rate limiter as inline middleware]

key-files:
  created: []
  modified:
    - server/index.js
    - server/.env.example
    - server/package.json
    - server/package-lock.json

key-decisions:
  - "chrome-extension:// origins checked via startsWith() in code, not listed literally in ALLOWED_ORIGINS"
  - "requireSecret returns 500 (not 401) when REACH_SECRET env var is absent — signals server misconfiguration"
  - "requireSecret applied globally via app.use('/api', requireSecret) rather than per-route — simpler, less error-prone"
  - "expensiveRateLimit applied only to the three AI/DNS routes, not all /api/ routes — other routes (outreach CRUD) don't warrant throttling"

patterns-established:
  - "Global middleware mount: app.use('/path', middleware) before all route definitions"
  - "Rate limiter as inline route middleware: app.post('/api/route', limiter, handler)"
  - "Env var validation at startup: check presence, return meaningful 500 if absent"

requirements-completed: [SEC-02, SEC-03, SEC-04]

# Metrics
duration: 2min
completed: 2026-03-13
---

# Phase 01 Plan 02: Server Security Hardening Summary

**Express server hardened with ALLOWED_ORIGINS CORS allowlist, global requireSecret middleware on all /api/* routes, and express-rate-limit (10 req/15min) on the three AI/DNS-intensive endpoints**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-13T18:26:49Z
- **Completed:** 2026-03-13T18:28:11Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced `app.use(cors())` wildcard with origin-allowlist CORS controlled by `ALLOWED_ORIGINS` env var
- Fixed `requireSecret` to reject (500) when `REACH_SECRET` absent and applied it globally via `app.use('/api', requireSecret)` before all routes
- Added `express-rate-limit` with a 10-request/15-minute window on `/api/find-email`, `/api/draft-email`, `/api/suggest-domains`
- `GET /track/:trackingId` (tracking pixel) confirmed public — not under `/api/` path

## Task Commits

Each task was committed atomically:

1. **Task 1: Install express-rate-limit** - `d2b323c` (chore)
2. **Task 2: Update server/index.js middleware** - `820f879` (feat)

## Files Created/Modified
- `server/index.js` - Added rateLimit import, ALLOWED_ORIGINS CORS, fixed requireSecret, global /api middleware mount, expensiveRateLimit on three routes
- `server/.env.example` - Added ALLOWED_ORIGINS with comment, documented REACH_SECRET and GEMINI_KEY
- `server/package.json` - Added express-rate-limit dependency
- `server/package-lock.json` - Lockfile updated

## Decisions Made
- `chrome-extension://` origins are matched via `startsWith()` in code rather than listed literally in `ALLOWED_ORIGINS` — extension IDs can change during development
- `requireSecret` returns 500 (not 401) when env var is absent — distinguishes server misconfiguration from client auth failure
- Global middleware mount (`app.use('/api', requireSecret)`) preferred over per-route to prevent future routes from accidentally missing auth
- Rate limiting applied only to the three expensive routes (AI + DNS), not all `/api/` routes — CRUD endpoints don't warrant throttling

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no new external services. Users with existing `.env` should add:
```
ALLOWED_ORIGINS=chrome-extension://,http://localhost:5173
```
The `.env.example` template has been updated to include this variable.

## Next Phase Readiness

- SEC-02, SEC-03, SEC-04 requirements satisfied
- Server is now hardened against CORS abuse, unauthenticated /api/ access, and AI/DNS endpoint hammering
- `REACH_SECRET` in `server/.env` is still the compromised value from 01-01 — user must rotate it

## Self-Check: PASSED

All created/modified files verified present. Both task commits verified in git log.

---
*Phase: 01-security-hardening*
*Completed: 2026-03-13*
