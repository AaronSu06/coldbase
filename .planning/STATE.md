---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Production Foundation
status: planning
stopped_at: Completed 13-compose-widget-panel-sync 13-02-PLAN.md
last_updated: "2026-03-18T19:58:43.298Z"
last_activity: 2026-03-17 — v1.1 roadmap created
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 12
  completed_plans: 12
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
| Phase 09-observability P03 | multi-session | 2 tasks | 2 files |
| Phase 10-sentry-server-integration P01 | 3min | 1 tasks | 4 files |
| Phase 10-sentry-server-integration P02 | 1min | 3 tasks | 3 files |
| Phase 11-extension-cleanup P01 | 2min | 2 tasks | 3 files |
| Phase 12-extension-panel-restore P01 | 1min | 2 tasks | 2 files |
| Phase 12-extension-panel-restore P01 | multi-session | 3 tasks | 3 files |
| Phase 13-compose-widget-panel-sync P01 | 3min | 1 tasks | 2 files |
| Phase 13-compose-widget-panel-sync P02 | 7min | 1 tasks | 1 files |

## Accumulated Context

### Roadmap Evolution

- Phase 13 added: Compose Widget & Panel Sync — fix widget focus to most-recent compose window, dynamic sidebar sync, unified non-Gmail sidebar matching Gmail layout

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
- [Phase 09-observability]: npm test script uses --env-file=.env.test so TEST_DATABASE_URL is available to Prisma without dotenv import in test files
- [Phase 10-sentry-server-integration]: Export beforeSend and initSentry as named functions for direct unit-test access, avoiding --experimental-test-module-mocks
- [Phase 10-sentry-server-integration]: initSentry() called as module side-effect so instrument.js can be first import in index.js for full startup error capture
- [Phase 10-sentry-server-integration]: SENTRY_DSN absent from .env.test — module-load side-effect is a no-op during tests, no Sentry network traffic
- [Phase 10-sentry-server-integration]: import './instrument.js' as first line of index.js guarantees Sentry captures Prisma startup errors
- [Phase 10-sentry-server-integration]: Sentry.setupExpressErrorHandler(app) placed before global error handler so Sentry captures raw errors before local formatting
- [Phase 11-extension-cleanup]: Remove setInterval polling from useOutreach — load() fires once on mount, manual refresh via refresh:load returned value
- [Phase 11-extension-cleanup]: extractBody(msg) || msg.snippet priority ensures full decoded email body wins over Gmail 120-char truncated snippet
- [Phase 11-extension-cleanup]: Export buildConversationPreview as named export to enable direct unit testing
- [Phase 12-extension-panel-restore]: tab.url.startsWith check in background.js onClicked — simple URL prefix is reliable for Gmail tab detection
- [Phase 12-extension-panel-restore]: msgType variable declared once at function scope, reused in both initial sendMessage and executeScript retry callback
- [Phase 12-extension-panel-restore]: extension/config.js is gitignored and must be manually synced — REACH_SECRET in config.js must match server .env REACH_SECRET
- [Phase 13-compose-widget-panel-sync]: lastActiveEditor set before update() in attachToEditor() — display gating in updateWidget() reads lastActiveEditor synchronously; setting after would hide widget on first attach
- [Phase 13-compose-widget-panel-sync]: syncTrackMode() called unconditionally in attachToEditor() — existing ?. guard in compose-widget.js makes it a safe no-op when panel is closed (UI-SYNC-02)
- [Phase 13-compose-widget-panel-sync]: _updateTrackToggle exposed at module scope so storage.onChanged can sync the toggle without closure issues
- [Phase 13-compose-widget-panel-sync]: Draft tab permanently disabled on non-Gmail sidebar — shows status-msg only, no form

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 8 pre-work: audit `server/routes/analytics.js` for `strftime()` calls — must be replaced with `EXTRACT()` before PostgreSQL migration runs
- Phase 8: confirm no `aiSuggestion`/`draft` field references remain in `web/src/` React components before schema drop

## Session Continuity

Last session: 2026-03-18T19:58:43.296Z
Stopped at: Completed 13-compose-widget-panel-sync 13-02-PLAN.md
Resume file: None
