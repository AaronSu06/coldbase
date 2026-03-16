---
phase: 04-extension-refactor
plan: 02
subsystem: extension
tags: [es-modules, refactor, chrome-extension, logging, error-handling]

# Dependency graph
requires:
  - "extension/logger.js (from 04-01)"
  - "extension/config.js"
  - "extension/classifier.js"
provides:
  - "extension/auth.js — getAuthToken() with EXT-04 log+rethrow"
  - "extension/api-client.js — Gmail transport + server call helpers"
  - "extension/reply-checker.js — reply detection, parsing, outreach tracking"
  - "extension/background.js — lean orchestrator with only chrome.* listeners"
affects:
  - 04-extension-refactor

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ES module decomposition: background.js → auth.js + api-client.js + reply-checker.js"
    - "apiFetchRetry accepts getAuthToken callback to avoid circular import"
    - "serverFetch() base helper attaches REACH_SECRET header — callers stay clean"

key-files:
  created:
    - extension/auth.js
    - extension/api-client.js
    - extension/reply-checker.js
  modified:
    - extension/background.js
    - extension/logger.js

key-decisions:
  - "apiFetchRetry takes getAuthToken as a 3rd parameter to avoid circular dependency (api-client.js must not import auth.js)"
  - "fetchOutreach() returns raw Response (not parsed JSON) so GET_STATS and GET_RECENT can call .json() themselves"
  - "GMAIL_API constant duplicated in api-client.js and reply-checker.js — preferred over cross-module constant re-export"
  - "Unused classifier and api-client imports removed from background.js; only countKeywordMatches, SERVER_URL, DASH_URL remain"
  - "logger.warn() added to logger.js — was missing but referenced by the plan (Rule 1 auto-fix)"

requirements-completed: [EXT-01, EXT-03, EXT-04]

# Metrics
duration: ~3min
completed: 2026-03-16
---

# Phase 4 Plan 02: background.js Module Split Summary

**Split 563-line background.js into three ES modules (auth.js, api-client.js, reply-checker.js) and reduced background.js to a lean orchestrator with no function definitions**

## Performance

- **Duration:** ~3 min
- **Completed:** 2026-03-16
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 rewritten)

## Accomplishments

- Created extension/auth.js — getAuthToken() with EXT-04 log.error + rethrow on failure
- Created extension/api-client.js — apiFetch, apiFetchRetry, getFullMessage, serverFetch, postOutreach, postTrackingPixel, fetchOutreach
- Created extension/reply-checker.js — all 9 parsing helpers, trackLatestSent + _trackLatestSent, checkReplies, scanInProgress flag
- Rewrote extension/background.js as pure orchestrator: imports, const log, chrome.* listeners, onMessage dispatcher only — zero function definitions
- Fixed all 4 EXT-04 silent catches across the four files
- Replaced all raw console.log/warn/error with structured log.* calls across all four files
- Added missing logger.warn() method to logger.js (was referenced by plan but not yet defined)

## Task Commits

1. **Task 1: Create auth.js and api-client.js** — `d2eccfc`
2. **Task 2: Create reply-checker.js and rewrite background.js as orchestrator** — `2804772`

## Files Created/Modified

- `extension/auth.js` — getAuthToken() wrapping chrome.identity; log.error + rethrow on failure
- `extension/api-client.js` — Gmail API transport (apiFetch, apiFetchRetry, getFullMessage) + server helpers (serverFetch, postOutreach, postTrackingPixel, fetchOutreach)
- `extension/reply-checker.js` — Parsing helpers, trackLatestSent, checkReplies; imports auth.js and api-client.js
- `extension/background.js` — Reduced to orchestrator: only imports, logger, chrome.* event listeners, and onMessage handler
- `extension/logger.js` — Added warn() method (maps to console.warn, always enabled like error)

## Decisions Made

- **apiFetchRetry callback pattern.** auth.js imports nothing from api-client.js; api-client.js must not import from auth.js (would create a circular dep via reply-checker.js). Solution: apiFetchRetry(url, token, getAuthToken) — callers pass getAuthToken as a function. Avoids circular dependency without introducing a separate token manager module.

- **fetchOutreach returns raw Response.** The GET_STATS and GET_RECENT handlers in background.js each do their own .json() + transformation. A fetch wrapper that parses JSON would constrain callers; returning the raw Response gives them the .json() call where they own the error handling.

- **GMAIL_API constant duplicated.** api-client.js and reply-checker.js both define `const GMAIL_API`. Alternatives (exporting from api-client.js, shared constants file) add indirection for a one-liner string constant. Duplication accepted.

- **Unused imports removed from background.js.** The classifier functions (isColdOutreach etc.) moved entirely to reply-checker.js. REACH_SECRET moved to api-client.js (serverFetch). background.js now imports only what it directly calls.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing warn() method to logger.js**
- **Found during:** Task 1 (creating api-client.js which calls log.warn)
- **Issue:** logger.js only defined debug, info, error — no warn. The plan's apiFetchRetry replacement calls log.warn on TOKEN_EXPIRED, which would silently fail (calling undefined as a function).
- **Fix:** Added `warn: (...a) => console.warn(prefix, ...a)` to the makeLogger return object. Always enabled (like error), not gated by DEBUG.
- **Files modified:** extension/logger.js
- **Commit:** d2eccfc

---

**Total deviations:** 1 auto-fixed (Rule 1 — missing method that would cause runtime crash)
**Impact on plan:** Required for correctness. No scope creep.

## Verification Results

Post-completion checks all pass:

1. `grep -rn "catch {" ...` — 0 results
2. `grep -rn "\.catch(() =>" ...` — 0 results
3. `grep -rn "console\.log|console\.warn|console\.error" ...` — 0 results
4. All four files exist
5. background.js has zero standalone function definitions

## Self-Check: PASSED

- extension/auth.js — FOUND
- extension/api-client.js — FOUND
- extension/reply-checker.js — FOUND
- extension/background.js — FOUND
- .planning/phases/04-extension-refactor/04-02-SUMMARY.md — FOUND
- Commit d2eccfc — FOUND
- Commit 2804772 — FOUND
