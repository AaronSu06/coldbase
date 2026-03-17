---
phase: 07-tracking-pixel-and-debug-config
plan: 01
subsystem: extension
tags: [chrome-extension, tracking-pixel, config, security]

# Dependency graph
requires:
  - phase: 01-security-hardening
    provides: GET_RUNTIME_CONFIG message handler in background.js
  - phase: 04-extension-refactor
    provides: tracking.js classic script structure with chrome.runtime.sendMessage
provides:
  - Tracking pixel URL reads from SERVER_URL config (not hardcoded localhost)
  - serverBase field in GET_RUNTIME_CONFIG response
  - _serverBase module-local variable in tracking.js with fallback for resilience
affects:
  - 07-02-debug-config (background.js GET_RUNTIME_CONFIG handler extended)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Config pre-fetch in init() with fallback — async config loaded once at module init, cached for synchronous use in hot paths

key-files:
  created: []
  modified:
    - extension/background.js
    - extension/tracking.js

key-decisions:
  - "07-01: serverBase computed as SERVER_URL.replace(/\\/api$/, '') to strip /api suffix — provides bare origin for pixel URL construction"
  - "07-01: _serverBase fallback 'http://localhost:3001' preserved in tracking.js so dev environment still works if GET_RUNTIME_CONFIG fetch fails"
  - "07-01: init() fires sendMessage async but pixel injection uses cached _serverBase synchronously — no async in send-button hot path"

patterns-established:
  - "Config pre-fetch pattern: init() fires sendMessage, callback updates module-local cache; fallback value set at declaration ensures safe operation before response arrives"

requirements-completed:
  - SEC-01

# Metrics
duration: 1min
completed: 2026-03-17
---

# Phase 7 Plan 01: Tracking Pixel and Debug Config Summary

**Tracking pixel URL wired to SERVER_URL via GET_RUNTIME_CONFIG pre-fetch — hardcoded localhost:3001/track/ removed from extension source (SEC-01)**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-17T06:36:38Z
- **Completed:** 2026-03-17T06:37:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended GET_RUNTIME_CONFIG response in background.js with `serverBase` field (SERVER_URL with /api suffix stripped)
- Added `_serverBase` module-local variable to tracking.js with fallback `http://localhost:3001` for resilience
- Updated `injectTrackingPixel` to build URL from `_serverBase` instead of hardcoded string
- Modified `init()` to pre-fetch config via sendMessage and cache `serverBase` on load

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend GET_RUNTIME_CONFIG response with serverBase** - `e0be551` (feat)
2. **Task 2: Pre-fetch serverBase in tracking.js init, use in injectTrackingPixel** - `524f5e6` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified
- `extension/background.js` - Added serverBase field to GET_RUNTIME_CONFIG config response object
- `extension/tracking.js` - Added _serverBase var, updated injectTrackingPixel, updated init() to pre-fetch config

## Decisions Made
- `serverBase` computed as `SERVER_URL.replace(/\/api$/, '')` — strips /api suffix to give tracking.js the bare origin needed for pixel URL construction
- Fallback `'http://localhost:3001'` preserved in `_serverBase` declaration so local development works without config fetch succeeding
- No async in the send-button hot path — `_serverBase` is read synchronously in `watchSendButton`; init() pre-fetches asynchronously so the value is ready before any emails are sent

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SEC-01 satisfied: no hardcoded localhost tracking URLs remain in extension source
- background.js GET_RUNTIME_CONFIG handler ready for plan 07-02 (debug config wiring)
- tracking.js config pre-fetch pattern established for any future config consumers

---
*Phase: 07-tracking-pixel-and-debug-config*
*Completed: 2026-03-17*
