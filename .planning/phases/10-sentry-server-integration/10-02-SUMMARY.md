---
phase: 10-sentry-server-integration
plan: 02
subsystem: infra
tags: [sentry, observability, express, wiring]

requires:
  - phase: 10-sentry-server-integration
    plan: 01
    provides: server/instrument.js with initSentry and beforeSend exports

provides:
  - server/index.js with instrument.js as first import (Sentry initializes before Prisma migrate)
  - server/app.js with Sentry.setupExpressErrorHandler registered before global error handler
  - server/.env.example with documented SENTRY_DSN commented entry

affects:
  - production deployments needing SENTRY_DSN environment variable for active error monitoring

tech-stack:
  added: []
  patterns:
    - "instrument.js first import in index.js — side-effect import order guarantees Sentry.init() before execSync and dynamic app import"
    - "Sentry.setupExpressErrorHandler(app) placed before the global (err, req, res, next) handler — Express error middleware chain order ensures Sentry captures before local formatting"

key-files:
  created: []
  modified:
    - server/index.js
    - server/app.js
    - server/.env.example

key-decisions:
  - "import './instrument.js' as first line of index.js, before node:child_process and node:path imports, so Sentry captures errors during Prisma startup"
  - "Sentry.setupExpressErrorHandler(app) inserted immediately before global error handler comment block, not after — Sentry must see the error before the app formats the response"
  - "SENTRY_DSN kept commented out in .env.example so local dev works with no DSN (no-op path in instrument.js)"

requirements-completed: [MON-01]

duration: ~1min
completed: 2026-03-18
---

# Phase 10 Plan 02: Sentry Express Wiring Summary

**instrument.js wired as first import in index.js and Sentry.setupExpressErrorHandler registered in app.js — completes MON-01 Express error capture integration with 22/22 tests green**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-18T02:15:34Z
- **Completed:** 2026-03-18T02:16:33Z
- **Tasks:** 3 (2 code changes + 1 smoke test)
- **Files modified:** 3

## Accomplishments

- Added `import './instrument.js';` as the first line of `server/index.js` — Sentry.init() now runs before Prisma migrate deploy and before `app.js` dynamic import
- Added `import * as Sentry from '@sentry/node'` to `server/app.js` and registered `Sentry.setupExpressErrorHandler(app)` immediately before the global error handler
- Documented `SENTRY_DSN` as a commented optional entry in `server/.env.example`
- All 22 tests pass across all 5 test files with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add instrument.js as first import** — `6ff6a74` (feat)
2. **Task 2: Register Sentry error handler + .env.example** — `85c895c` (feat)
3. **Task 3: Full suite smoke test** — `d6132ec` (chore)

## Files Modified

- `server/index.js` — `import './instrument.js'` added as line 1
- `server/app.js` — Sentry import added; `Sentry.setupExpressErrorHandler(app)` registered before global error handler
- `server/.env.example` — Commented `SENTRY_DSN=` entry appended with explanatory comment

## Decisions Made

- `import './instrument.js'` placed before all other imports in `index.js` — ESM side-effect imports execute in declaration order, so this guarantees Sentry captures errors during Prisma startup
- `Sentry.setupExpressErrorHandler(app)` inserted before the global `(err, req, res, next)` handler — Express error middleware processes in registration order; Sentry must be first to capture the raw error
- `SENTRY_DSN` left commented out in `.env.example` — instrument.js no-op guard makes local dev safe without a DSN; operators uncomment and set the value when deploying to production

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Test Results

```
tests 22
suites 9
pass 22
fail 0
```

All 5 test files green:
- `analytics.test.js` — 2/2
- `observability.test.js` — 5/5
- `outreach.test.js` — 15/15
- `sentry.test.js` — 4/4
- `tracking.test.js` — 2/2

## User Setup Required

To enable Sentry error monitoring in production:
1. Set `SENTRY_DSN` environment variable to the DSN from sentry.io project settings
2. No code changes required — instrument.js reads the env var at startup

## Self-Check: PASSED

- server/index.js: FOUND
- server/app.js: FOUND
- server/.env.example: FOUND
- Commit 6ff6a74: FOUND
- Commit 85c895c: FOUND
- Commit d6132ec: FOUND

---
*Phase: 10-sentry-server-integration*
*Completed: 2026-03-18*
