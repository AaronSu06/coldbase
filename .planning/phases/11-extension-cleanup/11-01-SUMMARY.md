---
phase: 11-extension-cleanup
plan: 01
subsystem: extension
tags: [gmail, extension, testing, node-test]

# Dependency graph
requires: []
provides:
  - useOutreach hook fires load() once on mount with no polling interval
  - buildConversationPreview exported and uses extractBody-first priority over snippet
  - Unit tests for buildConversationPreview body-over-snippet and snippet-fallback behavior
affects: [extension, web]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "extractBody-first priority: extractBody(msg) || msg.snippet for full decoded body over truncated snippet"
    - "node:test unit tests for extension functions using named exports"

key-files:
  created:
    - extension/reply-checker.test.js
  modified:
    - web/src/hooks/useOutreach.js
    - extension/reply-checker.js

key-decisions:
  - "Remove setInterval polling from useOutreach — load() fires once on mount, manual refresh via refresh:load returned value"
  - "extractBody(msg) || msg.snippet priority ensures full decoded email body wins over Gmail 120-char truncated snippet"
  - "Export buildConversationPreview as named export to enable direct unit testing"
  - "Debug log slice updated from 120 to 300 to match per-message cap in buildConversationPreview"

patterns-established:
  - "TDD with node:test runner for extension code: test file imports named export, RED commit before GREEN commit"

requirements-completed: [EXT-01, EXT-02]

# Metrics
duration: 2min
completed: 2026-03-17
---

# Phase 11 Plan 01: Extension Cleanup Summary

**Removed dead 5-minute polling from useOutreach and fixed silent data-loss in buildConversationPreview where Gmail's truncated snippet always overwrote the full decoded email body**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-17T04:49:52Z
- **Completed:** 2026-03-17T04:51:29Z
- **Tasks:** 2
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments
- Eliminated unnecessary network traffic from 5-minute polling interval in useOutreach hook
- Fixed conversation previews to display full decoded email body text instead of Gmail's 100-120 char API snippet
- Added `export` keyword to `buildConversationPreview` and wrote 2 passing unit tests covering body-first and snippet-fallback paths
- Updated debug log slice from 120 to 300 chars to match the 300-char per-message cap

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove polling interval from useOutreach (EXT-01)** - `150bf16` (feat)
2. **Task 2 RED: Failing tests for buildConversationPreview** - `ae8c72e` (test)
3. **Task 2 GREEN: Fix buildConversationPreview body priority + export (EXT-02)** - `a388ef1` (feat)

_Note: TDD task has two commits (test RED → feat GREEN)_

## Files Created/Modified
- `web/src/hooks/useOutreach.js` - Removed setInterval polling; useEffect now calls load() once on mount
- `extension/reply-checker.js` - Exported buildConversationPreview, flipped to extractBody-first priority, updated debug log slice to 300
- `extension/reply-checker.test.js` - New: 2 unit tests for body-over-snippet and snippet-fallback behavior

## Decisions Made
- Remove polling interval entirely rather than increasing the interval — the hook already exposes `refresh: load` for manual refresh, so the safety-net poll was pure waste
- `extractBody(msg) || msg.snippet` instead of `msg.snippet || extractBody(msg)` — body extraction decodes the full base64 message body which can be hundreds of chars vs Gmail's 100-120 char snippet
- Export `buildConversationPreview` as named export rather than adding a test harness — simpler, consistent with other test files in the extension

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - server test failures (analytics, health, outreach, tracking) are pre-existing database connectivity issues unrelated to these changes. Confirmed by stashing changes and verifying same failures existed on the prior HEAD.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- EXT-01 and EXT-02 complete; extension cleanup phase 11 plan 01 finished
- All extension unit tests pass; server test failures are pre-existing DB issues not introduced here

## Self-Check: PASSED

All files confirmed present. All task commits confirmed in git log.

---
*Phase: 11-extension-cleanup*
*Completed: 2026-03-17*
