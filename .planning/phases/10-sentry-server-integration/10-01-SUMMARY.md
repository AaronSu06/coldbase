---
phase: 10-sentry-server-integration
plan: 01
subsystem: infra
tags: [sentry, observability, pii-filter, node:test, tdd]

requires:
  - phase: 09-observability
    provides: readFileSync/package.json version pattern used in instrument.js

provides:
  - server/instrument.js with exported initSentry and beforeSend functions
  - @sentry/node installed in server/package.json
  - PII filter: strips request body and x-reach-secret header before Sentry events are sent
  - Conditional Sentry.init (no-op when SENTRY_DSN absent)

affects:
  - 10-sentry-server-integration (subsequent plans that import instrument.js in index.js)

tech-stack:
  added: ["@sentry/node"]
  patterns:
    - "Export testable functions (initSentry, beforeSend) rather than relying on module-level Sentry side effects — enables direct unit testing without --experimental-test-module-mocks"
    - "beforeSend PII filter: set request.data = '[Filtered]', delete x-reach-secret header"
    - "initSentry: guard on SENTRY_DSN presence so import in tests is always a no-op"

key-files:
  created:
    - server/instrument.js
    - server/sentry.test.js
  modified:
    - server/package.json
    - server/package-lock.json

key-decisions:
  - "Export beforeSend and initSentry as named functions for direct unit-test access — avoids --experimental-test-module-mocks flag"
  - "initSentry() called as module side-effect so instrument.js can be first import in index.js for full error capture coverage"
  - "SENTRY_DSN absent in .env.test — side-effect initSentry() on test import is a no-op, no Sentry network traffic during tests"

patterns-established:
  - "TDD RED/GREEN/REFACTOR with node:test built-in — fail on missing module, pass after implementation"
  - "PII filter pattern: mutate event.request in place before returning event to Sentry pipeline"

requirements-completed: [MON-01]

duration: 3min
completed: 2026-03-17
---

# Phase 10 Plan 01: Sentry instrument.js with PII filter Summary

**Testable Sentry init module with beforeSend PII filter stripping request body and x-reach-secret header, verified via 4-test TDD suite using node:test built-in**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-17T20:33:01Z
- **Completed:** 2026-03-17T20:36:00Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 4

## Accomplishments
- Created `server/instrument.js` exporting `beforeSend` and `initSentry` as named functions
- `beforeSend` strips `event.request.data` to `'[Filtered]'` and deletes `x-reach-secret` from headers
- `initSentry` is a no-op when `SENTRY_DSN` is absent; calls `Sentry.init()` with release version and PII filter when DSN is set
- Installed `@sentry/node` dependency
- 4/4 tests pass via `node --env-file=.env.test --test sentry.test.js`

## Task Commits

Each task was committed atomically:

1. **RED: failing tests** - `a6e1b61` (test)
2. **GREEN: instrument.js implementation + @sentry/node install** - `2e0b643` (feat)

_Note: TDD tasks may have multiple commits (test -> feat -> refactor)_

## Files Created/Modified
- `server/instrument.js` - Sentry init + PII filter with exported testable functions
- `server/sentry.test.js` - 4 unit tests for beforeSend and initSentry behaviors
- `server/package.json` - Added @sentry/node dependency
- `server/package-lock.json` - Lock file updated

## Decisions Made
- Exported `beforeSend` and `initSentry` as named functions for direct unit testing — avoids the `--experimental-test-module-mocks` Node.js flag
- `initSentry()` called as module side-effect so placing `instrument.js` as first import in `index.js` captures all startup errors
- `SENTRY_DSN` intentionally absent from `.env.test` — the module-load side-effect is a harmless no-op during the test run

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required at this step. SENTRY_DSN will be wired up in a subsequent plan when instrument.js is imported in index.js.

## Next Phase Readiness

- `server/instrument.js` is ready to be imported as the first line of `server/index.js`
- `@sentry/node` is installed
- PII filter is tested and verified
- SENTRY_DSN environment variable will need to be added to production environment in the next plan

---
*Phase: 10-sentry-server-integration*
*Completed: 2026-03-17*
