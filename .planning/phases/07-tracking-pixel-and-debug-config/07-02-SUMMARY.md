---
phase: 07-tracking-pixel-and-debug-config
plan: 02
subsystem: extension
tags: [chrome-extension, logger, debug-config, es-modules]

# Dependency graph
requires:
  - phase: 07-01
    provides: serverBase in GET_RUNTIME_CONFIG; config.js shape with DEBUG export
  - phase: 04-01
    provides: logger-esm.js ES module wrapper; config.js gitignored with DEBUG constant
provides:
  - logger-esm.js reads DEBUG from config.js (not hardcoded)
  - background.js imports makeLogger from logger-esm.js (no inline duplicate)
  - Single config.js source of truth for DEBUG flag across all ES module consumers
affects: [extension, background.js, auth.js, api-client.js, reply-checker.js, classifier.js]

# Tech tracking
tech-stack:
  added: []
  patterns: [config.js as single source of truth for DEBUG; ES module import chain for logger factory]

key-files:
  created: []
  modified:
    - extension/logger-esm.js
    - extension/background.js

key-decisions:
  - "logger-esm.js imports DEBUG from config.js — setting DEBUG=false in config.js now silences debug/info logs in all ES module consumers automatically"
  - "logger.js (classic script) unchanged — self-contained DEBUG flag preserved per Phase 04-01 decision"

patterns-established:
  - "Debug flag pattern: ES modules import DEBUG from config.js; classic scripts self-contain their DEBUG const"

requirements-completed: [EXT-03]

# Metrics
duration: 1min
completed: 2026-03-17
---

# Phase 7 Plan 02: Debug Config Wiring Summary

**DEBUG flag centralized in config.js — logger-esm.js imports it and background.js delegates to shared makeLogger factory, eliminating duplicate inline definitions**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-17T06:39:34Z
- **Completed:** 2026-03-17T06:40:29Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `logger-esm.js` now imports `DEBUG` from `./config.js` instead of hardcoding `const DEBUG = true`
- `background.js` imports `makeLogger` from `./logger-esm.js` and removes its 11-line inline duplicate
- Setting `DEBUG = false` in `config.js` now suppresses debug/info logs across all ES module consumers: background.js, auth.js, api-client.js, reply-checker.js, classifier.js

## Task Commits

Each task was committed atomically:

1. **Task 1: Import DEBUG from config.js in logger-esm.js** - `266814d` (feat)
2. **Task 2: Import makeLogger from logger-esm.js in background.js** - `80f89e1` (feat)

## Files Created/Modified
- `extension/logger-esm.js` - Replaced `const DEBUG = true` with `import { DEBUG } from './config.js'`
- `extension/background.js` - Added import of makeLogger from logger-esm.js; removed inline const DEBUG and function makeLogger block

## Decisions Made
- logger.js (classic script) left untouched — cannot use ES module imports; per Phase 04-01 decision, its DEBUG flag stays self-contained

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 07 complete: tracking pixel serverBase fix (07-01) and debug config centralization (07-02) both done
- To suppress verbose debug logs before publishing to Chrome Web Store: set `DEBUG = false` in `extension/config.js`

---
*Phase: 07-tracking-pixel-and-debug-config*
*Completed: 2026-03-17*
