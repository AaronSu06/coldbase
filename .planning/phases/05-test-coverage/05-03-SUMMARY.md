---
phase: 05-test-coverage
plan: "03"
subsystem: testing
tags: [node-test-runner, unit-tests, utilities, date-utils, normalization, text-parsing]

requires:
  - phase: 05-test-coverage/05-01
    provides: "text-utils.js and normalize.js created as pure modules safe for Node test runner"

provides:
  - "27 unit tests across 5 suites covering all five utility functions"
  - "web/src/lib/utils.test.js: formatShortDate and getDaysSince tests"
  - "web/src/lib/normalize.test.js: normalizeStatus tests (all 9 cases)"
  - "extension/text-utils.test.js: normalizeForMatch and extractEmailAddress tests"

affects: [05-test-coverage]

tech-stack:
  added: []
  patterns:
    - "node:test + node:assert/strict for all utility tests (consistent with classifier.test.js pattern)"
    - "Locale-flexible date assertions using regex/includes instead of exact string match"
    - "Midnight-boundary tolerance for getDaysSince(today) — assert result >= 0 && result <= 1"
    - "Midday UTC timestamps (T12:00:00.000Z) for date tests to prevent timezone-shift failures"

key-files:
  created:
    - web/src/lib/utils.test.js
    - web/src/lib/normalize.test.js
    - extension/text-utils.test.js
  modified: []

key-decisions:
  - "Used T12:00:00.000Z (midday UTC) for June date test — '2024-06-01' without time shifted to May 31 in local timezone"
  - "getDaysSince today test uses >= 0 && <= 1 range to tolerate midnight boundary crossing"
  - "Locale-flexible assertions use regex (/Jun.*2024|2024.*Jun/) not exact string — toLocaleDateString output varies by Node locale"

patterns-established:
  - "Date utility tests: use midday UTC ISO strings to avoid timezone-boundary failures"
  - "Locale-sensitive assertions: use .includes() or regex, never exact string match on toLocaleDateString output"

requirements-completed: [TEST-03]

duration: 2min
completed: 2026-03-16
---

# Phase 5 Plan 03: Utility Function Unit Tests Summary

**27 unit tests across 5 suites covering formatShortDate, getDaysSince, normalizeStatus, normalizeForMatch, and extractEmailAddress using node:test runner**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-16T23:00:12Z
- **Completed:** 2026-03-16T23:01:29Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- utils.test.js: 4 formatShortDate tests (null guard, undefined guard, Jan 2024 locale-flexible, Jun 2024 locale-flexible) + 3 getDaysSince tests (today boundary, 1 day ago, 3 days ago)
- normalize.test.js: 9 normalizeStatus tests covering all COLUMNS passthrough, legacy 'Applied' mapping, unknown status, empty string, and undefined
- text-utils.test.js: 7 normalizeForMatch tests (lowercase, hyphen strip, underscore strip, special char/comma handling, whitespace collapse, null, undefined) + 4 extractEmailAddress tests (display name format, bare brackets, plain address, whitespace trim)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write web/src/lib/utils.test.js** - `a22f9a6` (feat)
2. **Task 2: Write normalize.test.js and text-utils.test.js** - `711923b` (feat)

## Files Created/Modified

- `web/src/lib/utils.test.js` - Tests for formatShortDate (null guard, locale-flexible date format) and getDaysSince (today, 1 day, 3 days)
- `web/src/lib/normalize.test.js` - Tests for normalizeStatus (9 cases: COLUMNS passthrough, Applied legacy, unknown/empty/undefined fallback)
- `extension/text-utils.test.js` - Tests for normalizeForMatch (null-safe, case/hyphen/underscore/special char/whitespace) and extractEmailAddress (bracket formats, plain, whitespace trim)

## Decisions Made

- Used T12:00:00.000Z (midday UTC) for the June date test after '2024-06-01' without a time rendered as May 31 in the local timezone, causing a test failure that was auto-fixed inline.
- getDaysSince "today" test uses `result >= 0 && result <= 1` to tolerate midnight boundary crossing during CI.
- All date format assertions use regex or `.includes()` not exact string comparison, since `toLocaleDateString(undefined, ...)` output varies by Node locale.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed timezone-shift failure in June date test**
- **Found during:** Task 1 (utils.test.js)
- **Issue:** `formatShortDate('2024-06-01')` rendered as "May 31, 2024" because the date string without a time component was interpreted in local timezone (UTC-X), shifting it to the previous day
- **Fix:** Changed input to `'2024-06-15T12:00:00.000Z'` (midday UTC, safe across all UTC-offset timezones)
- **Files modified:** web/src/lib/utils.test.js
- **Verification:** Test passes with exit 0
- **Committed in:** a22f9a6 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in test input)
**Impact on plan:** Single test input adjustment for timezone correctness. No scope creep.

## Issues Encountered

- The June date assertion initially failed because '2024-06-01' (no time) shifts to May 31 in timezones west of UTC. Fixed by using a midday UTC timestamp. This is a standard pattern for locale-safe date testing in Node.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All five utility functions tested with comprehensive coverage
- Three test files ready for inclusion in CI pipeline
- Pattern established: midday UTC timestamps for timezone-safe date tests

---
*Phase: 05-test-coverage*
*Completed: 2026-03-16*
