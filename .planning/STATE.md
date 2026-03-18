---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Production Foundation
status: planning
stopped_at: Completed 09-02-PLAN.md
last_updated: "2026-03-18T00:08:51.971Z"
last_activity: 2026-03-17 — v1.1 roadmap created
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-17)

**Core value:** A reliable, maintainable codebase that real users can depend on: secure by default, easy to extend, and observable when things go wrong.
**Current focus:** Phase 8 — PostgreSQL Migration + Schema Cleanup

## Current Position

Phase: 8 of 11 (PostgreSQL Migration + Schema Cleanup)
Plan: —
Status: Ready to plan
Last activity: 2026-03-17 — v1.1 roadmap created

Progress: [░░░░░░░░░░] 0% (v1.1)

## Performance Metrics

**Velocity (v1.0 reference):**
- Total plans completed: 21
- Average duration: ~5 min
- Total execution time: ~1.75 hours

**v1.1 By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans (v1.0): 1min, 1min, 66s, 8min, 8min
- Trend: Stable

*Updated after each plan completion*
| Phase 08-postgresql-migration-schema-cleanup P01 | 1min | 2 tasks | 2 files |
| Phase 08 P02 | 49s | 2 tasks | 4 files |
| Phase 08-postgresql-migration-schema-cleanup P03 | multi-session | 3 tasks | 2 files |
| Phase 09-observability P01 | 4min | 1 tasks | 1 files |
| Phase 09-observability P02 | 5min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.1 research]: Drop `aiSuggestion`/`draft` as two-phase — remove code refs before schema migration runs
- [v1.1 research]: Fresh Postgres baseline migration — delete existing SQLite migrations, run `prisma migrate dev --name init-postgres` once
- [v1.1 research]: Health endpoint at `/health` (no `/api` prefix) to bypass `requireSecret` auth guard at `app.use('/api', requireSecret)`
- [v1.1 research]: `instrument.js` as first import in `index.js` — guarantees Sentry captures errors during Prisma startup
- [Phase 08-postgresql-migration-schema-cleanup]: Neon dual-URL pattern for PostgreSQL datasource: DATABASE_URL (pooled) + DIRECT_URL (direct)
- [Phase 08-postgresql-migration-schema-cleanup]: Drop aiSuggestion/draft from schema before baseline migration to avoid carrying dead columns into PostgreSQL
- [Phase 08]: Tests use TEST_DATABASE_URL/TEST_DIRECT_URL env vars pointing at Neon test branch; no fallback so missing vars fail clearly
- [Phase 08]: analytics.test.js covers only the insufficient data path — seeding for sufficient path deferred
- [Phase 08-postgresql-migration-schema-cleanup]: Delete all SQLite migrations and generate fresh PostgreSQL baseline — cleaner than converting migration history
- [Phase 08-postgresql-migration-schema-cleanup]: Dynamic import('./app.js') required in index.js — static ESM imports are hoisted before execSync migrate deploy runs
- [Phase 08-postgresql-migration-schema-cleanup]: execSync prisma migrate deploy with process.exit(1) on failure — server never starts against unmigrated DB
- [Phase 09-observability]: Test helper omits x-reach-secret by default in observability.test.js — opposite of outreach.test.js — because /health is public
- [Phase 09-observability]: No prisma migrate reset in observability test before() — health check is read-only SELECT 1
- [Phase 09-observability]: req.path not req.url in requestLogger — logs path only, no query string duplication in path field
- [Phase 09-observability]: GET /health placed before app.use('/api', requireSecret) — public endpoint, no auth required
- [Phase 09-observability]: version read via readFileSync at module load time in app.js — avoids repeated filesystem I/O in handler

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 8 pre-work: audit `server/routes/analytics.js` for `strftime()` calls — must be replaced with `EXTRACT()` before PostgreSQL migration runs
- Phase 8: confirm no `aiSuggestion`/`draft` field references remain in `web/src/` React components before schema drop

## Session Continuity

Last session: 2026-03-18T00:08:51.968Z
Stopped at: Completed 09-02-PLAN.md
Resume file: None
