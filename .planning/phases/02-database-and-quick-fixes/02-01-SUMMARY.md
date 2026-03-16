---
phase: 02-database-and-quick-fixes
plan: 01
subsystem: database
tags: [prisma, sqlite, schema, migration, gitignore]

# Dependency graph
requires:
  - phase: 03-server-restructure
    provides: Prisma singleton and route structure that queries Outreach and TrackingPixel models
provides:
  - Outreach model with three performance indices on status, sentDate, and archived
  - OpenEvent FK cascade delete tied to TrackingPixel via trackingId
  - *.db glob rule blocking all SQLite files from git tracking
affects: [05-ui-and-polish, any future query or migration work against Outreach or OpenEvent tables]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prisma @@index at model level for query-critical fields"
    - "onDelete: Cascade on FK relation to prevent orphaned rows"
    - "*.db root gitignore rule covers all SQLite files repo-wide"

key-files:
  created:
    - server/prisma/migrations/20260316213634_add_outreach_indices_and_open_event_fk/migration.sql
  modified:
    - server/prisma/schema.prisma
    - .gitignore

key-decisions:
  - "DB files untracked with git rm --cached (not deleted) — server/dev.db preserved on disk for local development"
  - "server/prisma/dev.db was also tracked (undocumented in plan) — untracked alongside server/dev.db to satisfy empty git ls-files check"

patterns-established:
  - "Cascade deletes: FK relations on child models use onDelete: Cascade to maintain referential integrity"
  - "Index placement: @@index block attributes go after all field definitions, inside the closing model brace"

requirements-completed: [DB-01, DB-02, DB-03]

# Metrics
duration: 5min
completed: 2026-03-16
---

# Phase 2 Plan 01: Database Schema Hardening Summary

**Prisma schema hardened with three Outreach query indices, OpenEvent FK cascade delete, and *.db gitignore rule preventing SQLite files from git tracking**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-16T21:29:42Z
- **Completed:** 2026-03-16T21:34:10Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added @@index([status]), @@index([sentDate]), @@index([archived]) to Outreach model for query performance
- Added TrackingPixel/OpenEvent FK relation with onDelete: Cascade to eliminate orphaned rows on pixel deletion
- Applied migration cleanly (20260316213634_add_outreach_indices_and_open_event_fk) with no pending changes
- Added *.db root-level gitignore rule and untracked all SQLite database files

## Task Commits

Each task was committed atomically:

1. **Task 1: Add @@index directives and FK cascade relation to schema.prisma** - `63eefc4` (feat)
2. **Task 2: Add *.db to .gitignore and untrack server/dev.db** - `baccc8b` (chore)

## Files Created/Modified

- `server/prisma/schema.prisma` - Three @@index on Outreach, openEvents back-reference on TrackingPixel, trackingPixel @relation with onDelete: Cascade on OpenEvent
- `server/prisma/migrations/20260316213634_add_outreach_indices_and_open_event_fk/migration.sql` - Applied migration SQL
- `.gitignore` - Added *.db glob rule after *.pfx line

## Decisions Made

- DB files untracked with `git rm --cached` rather than deleted — server/dev.db and server/prisma/dev.db remain on disk for local dev use
- `*.db` rule placed at root level (not subdirectory-scoped) so it catches any SQLite file anywhere in the repo

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Untracked server/prisma/dev.db in addition to server/dev.db**
- **Found during:** Task 2 (Add *.db to .gitignore and untrack server/dev.db)
- **Issue:** `git ls-files "*.db"` returned both `server/dev.db` and `server/prisma/dev.db`; the plan only mentioned server/dev.db but the success criterion required empty output from `git ls-files "*.db"`
- **Fix:** Ran `git rm --cached server/prisma/dev.db` in addition to the planned `git rm --cached server/dev.db`
- **Files modified:** None (index change only)
- **Verification:** `git ls-files "*.db"` returns empty output
- **Committed in:** `baccc8b` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — missing untrack)
**Impact on plan:** Necessary to satisfy the stated success criterion. No scope creep.

## Issues Encountered

None beyond the deviation documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Schema and migration applied; Prisma Client regenerated and ready for use
- All *.db files gitignored — no further git churn from database files
- Phase 02 Plan 02 (quick fixes) can proceed without schema concerns

---
*Phase: 02-database-and-quick-fixes*
*Completed: 2026-03-16*
