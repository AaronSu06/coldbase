# Roadmap: Reach

## Milestones

- ✅ **v1.0 Reach Refactor** — Phases 1–7 (shipped 2026-03-17)
- 🚧 **v1.1 Production Foundation** — Phases 8–12 (in progress)

## Phases

<details>
<summary>✅ v1.0 Reach Refactor (Phases 1–7) — SHIPPED 2026-03-17</summary>

- [x] Phase 1: Security Hardening (2/2 plans) — completed 2026-03-17
- [x] Phase 2: Database and Quick Fixes (2/2 plans) — completed 2026-03-16
- [x] Phase 3: Server Restructure (3/3 plans) — completed 2026-03-15
- [x] Phase 4: Extension Refactor (6/6 plans) — completed 2026-03-16
- [x] Phase 5: Test Coverage (4/4 plans) — completed 2026-03-16
- [x] Phase 6: Integration Fixes (2/2 plans) — completed 2026-03-17
- [x] Phase 7: Tracking Pixel URL + Debug Config (2/2 plans) — completed 2026-03-17

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 🚧 v1.1 Production Foundation (In Progress)

**Milestone Goal:** Migrate to PostgreSQL, add observability, integrate error monitoring, and remove dead schema weight — building the production foundation before multi-tenancy.

- [x] **Phase 8: PostgreSQL Migration + Schema Cleanup** - Migrate Prisma from SQLite to PostgreSQL and drop unused columns (completed 2026-03-17)
- [x] **Phase 9: Observability** - Add request/response logging middleware and a public health endpoint (completed 2026-03-18)
- [x] **Phase 10: Sentry Server Integration** - Wire Sentry to Express for unhandled exception capture (completed 2026-03-18)
- [x] **Phase 11: Extension Cleanup** - Remove dead polling interval and fix preview truncation (completed 2026-03-18)
- [x] **Phase 12: Extension Panel Restore** - Reconnect the compose panel and restore all three tabs: overview (stats + tracking toggle), find contacts, and draft with AI (completed 2026-03-18)

## Phase Details

### Phase 8: PostgreSQL Migration + Schema Cleanup
**Goal**: The server runs on PostgreSQL with a clean schema — no dead columns, no SQLite leftovers
**Depends on**: Phase 7 (v1.0 complete)
**Requirements**: DB-01, DATA-01
**Success Criteria** (what must be TRUE):
  1. Server starts successfully with `DATABASE_URL` pointing to a PostgreSQL instance
  2. `prisma migrate deploy` runs without error on server startup
  3. `aiSuggestion` and `draft` columns no longer exist in the Outreach table
  4. All existing API endpoints return correct responses against the PostgreSQL database
  5. `analytics.js` raw SQL queries execute without error on PostgreSQL (no `strftime()` calls remain)
**Plans**: 3 plans

Plans:
- [ ] 08-01-PLAN.md — Update schema.prisma to PostgreSQL datasource + drop aiSuggestion/draft columns + fix analytics.js raw SQL
- [ ] 08-02-PLAN.md — Update test files to use TEST_DATABASE_URL; create analytics.test.js; update .env.example
- [ ] 08-03-PLAN.md — Delete SQLite migrations, wire prisma migrate deploy into index.js, generate PostgreSQL baseline migration

### Phase 9: Observability
**Goal**: Every HTTP request leaves a structured log entry and the server exposes a public health endpoint load balancers can poll
**Depends on**: Phase 8
**Requirements**: OBS-01, OBS-02
**Success Criteria** (what must be TRUE):
  1. Every request emits a structured JSON log line with method, path, status code, and duration
  2. `x-reach-secret` header value is redacted (not logged) in request logs
  3. `GET /health` returns HTTP 200 with `status`, `uptime`, `version`, and `dbLatencyMs` fields
  4. `GET /health` requires no authentication header and is accessible without a `REACH_SECRET` value
**Plans**: 2 plans

Plans:
- [ ] 09-01-PLAN.md — Observability test scaffold (failing tests for OBS-01 and OBS-02)
- [ ] 09-02-PLAN.md — Implement requestLogger middleware and /health route; wire both into app.js

### Phase 10: Sentry Server Integration
**Goal**: Unhandled server exceptions and promise rejections are captured in Sentry with environment context and PII scrubbed
**Depends on**: Phase 9
**Requirements**: MON-01
**Success Criteria** (what must be TRUE):
  1. An unhandled exception thrown in any route handler appears as an event in the Sentry dashboard
  2. Sentry events include `environment` and `release` tags
  3. Request body data (which may contain email addresses) is stripped from Sentry event payloads
  4. Sentry is initialized before any application code runs — errors during Prisma startup are captured
**Plans**: 2 plans

Plans:
- [ ] 10-01-PLAN.md — Create instrument.js with exported initSentry/beforeSend functions; write sentry.test.js (TDD)
- [ ] 10-02-PLAN.md — Wire instrument.js into index.js (first import) and app.js (setupExpressErrorHandler); update .env.example

### Phase 11: Extension Cleanup
**Goal**: The extension no longer runs a dead polling interval and conversation previews display at an appropriate length
**Depends on**: Phase 8
**Requirements**: EXT-01, EXT-02
**Success Criteria** (what must be TRUE):
  1. The `useOutreach` hook does not register or fire a 5-minute polling interval
  2. Conversation preview text in the extension sidebar is not hard-capped at 120 characters
**Plans**: 1 plan

Plans:
- [ ] 11-01-PLAN.md — Remove polling interval from useOutreach; fix buildConversationPreview body priority + export + tests

### Phase 12: Extension Panel Restore
**Goal**: The compose panel is accessible from the widget and extension icon, with all three tabs fully functional: Overview (stats + tracking toggle pill), Find Contacts (email finder), and Draft with AI (Gemini-powered drafts)
**Depends on**: Phase 11
**Requirements**: EXT-V2-01, EXT-V2-02, EXT-V2-03
**Success Criteria** (what must be TRUE):
  1. Clicking the widget or extension icon opens the compose panel with three tabs
  2. Overview tab shows live stats and the Auto/On/Off tracking toggle pill
  3. Find Contacts tab submits to the server and displays results with copy button
  4. Draft with AI tab generates a draft via server and offers insert-into-compose
**Plans**: 1 plan

Plans:
- [ ] 12-01-PLAN.md — Fix background.js icon-click routing (Gmail→OPEN_PANEL, other→TOGGLE_SIDEBAR); remove dead settings CSS from popup.html

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Security Hardening | v1.0 | 2/2 | Complete | 2026-03-17 |
| 2. Database and Quick Fixes | v1.0 | 2/2 | Complete | 2026-03-16 |
| 3. Server Restructure | v1.0 | 3/3 | Complete | 2026-03-15 |
| 4. Extension Refactor | v1.0 | 6/6 | Complete | 2026-03-16 |
| 5. Test Coverage | v1.0 | 4/4 | Complete | 2026-03-16 |
| 6. Integration Fixes | v1.0 | 2/2 | Complete | 2026-03-17 |
| 7. Tracking Pixel + Debug Config | v1.0 | 2/2 | Complete | 2026-03-17 |
| 8. PostgreSQL Migration + Schema Cleanup | 3/3 | Complete   | 2026-03-17 | - |
| 9. Observability | 3/3 | Complete   | 2026-03-18 | - |
| 10. Sentry Server Integration | 2/2 | Complete    | 2026-03-18 | - |
| 11. Extension Cleanup | 1/1 | Complete    | 2026-03-18 | - |
| 12. Extension Panel Restore | 1/1 | Complete   | 2026-03-18 | - |

### Phase 13: Compose Widget & Panel Sync

**Goal:** Widget focus tracks the most-recent compose window, the sidebar tracking toggle syncs dynamically to new compose windows, and the non-Gmail sidebar matches the Gmail compose panel's three-tab layout
**Requirements**: UI-SYNC-01, UI-SYNC-02, UI-SYNC-03
**Depends on:** Phase 12
**Plans:** 2/2 plans complete

Plans:
- [ ] 13-01-PLAN.md — Widget visibility gating (show only on active compose) + lastActiveEditor pre-set + syncTrackMode on attach
- [ ] 13-02-PLAN.md — Rewrite sidebar.js with three-tab panel (Overview, Find Contacts, Draft disabled)
