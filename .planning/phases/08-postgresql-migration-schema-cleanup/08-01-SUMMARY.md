---
phase: 08-postgresql-migration-schema-cleanup
plan: "01"
subsystem: database
tags: [prisma, postgresql, neon, schema, sql]

# Dependency graph
requires: []
provides:
  - "PostgreSQL datasource declaration in schema.prisma with Neon dual-URL pattern"
  - "Removed aiSuggestion and draft fields from Outreach model"
  - "PostgreSQL-compatible raw SQL in analytics.js using EXTRACT(), quoted identifiers, boolean literal"
affects: [08-02, 08-03, analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Neon dual-URL datasource: url = DATABASE_URL (pooled), directUrl = DIRECT_URL (direct)"
    - "PostgreSQL raw SQL: EXTRACT(HOUR FROM \"column\")::INTEGER, quoted camelCase identifiers, boolean literals"

key-files:
  created: []
  modified:
    - server/prisma/schema.prisma
    - server/routes/analytics.js

key-decisions:
  - "Use Neon dual-URL pattern (DATABASE_URL pooled + DIRECT_URL direct) for connection pooling compatibility"
  - "Drop aiSuggestion and draft from schema before baseline migration — avoids carrying dead columns into PostgreSQL"
  - "Cast EXTRACT() and SUM() results to ::INTEGER explicitly to avoid bigint return type in PostgreSQL"

patterns-established:
  - "PostgreSQL raw SQL pattern: quote camelCase table/column names, use boolean literals, EXTRACT() for date parts"

requirements-completed: [DB-01, DATA-01]

# Metrics
duration: 1min
completed: 2026-03-17
---

# Phase 8 Plan 01: PostgreSQL Datasource + Schema Cleanup Summary

**schema.prisma migrated to PostgreSQL with Neon dual-URL pattern; aiSuggestion/draft columns dropped; analytics.js raw SQL updated from SQLite strftime/integer-bool to PostgreSQL EXTRACT/boolean**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-17T22:03:32Z
- **Completed:** 2026-03-17T22:04:46Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced SQLite datasource block with PostgreSQL Neon dual-URL configuration
- Removed dead `aiSuggestion` and `draft` fields from Outreach model
- Fixed analytics.js raw SQL: `strftime()` → `EXTRACT(HOUR FROM "sentDate")::INTEGER`, `archived = 0` → `archived = false`, unquoted identifiers → `"Outreach"`, `"sentDate"`, `"repliedAt"`

## Task Commits

Each task was committed atomically:

1. **Task 1: Update schema.prisma — postgresql datasource + drop dead columns** - `fb1c693` (feat)
2. **Task 2: Fix analytics.js raw SQL for PostgreSQL** - `2c557ac` (fix)

## Files Created/Modified

- `server/prisma/schema.prisma` - PostgreSQL datasource with dual-URL, Outreach model without aiSuggestion/draft
- `server/routes/analytics.js` - PostgreSQL-compatible $queryRaw with EXTRACT, boolean literal, quoted identifiers

## Decisions Made

- Neon dual-URL pattern chosen (DATABASE_URL pooled + DIRECT_URL direct) to support connection pooling alongside Prisma migrations
- Drop aiSuggestion/draft before generating baseline migration so they never enter the PostgreSQL schema
- Explicit `::INTEGER` casts on EXTRACT and SUM outputs prevent bigint surprise in JS

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required in this plan. DATABASE_URL and DIRECT_URL will be configured when Neon is provisioned in a later plan.

## Next Phase Readiness

- schema.prisma is in the correct state for Plan 03 to generate the baseline PostgreSQL migration
- analytics.js raw SQL is PostgreSQL-compatible and will work once the database is running
- No blockers for subsequent plans

---
*Phase: 08-postgresql-migration-schema-cleanup*
*Completed: 2026-03-17*
