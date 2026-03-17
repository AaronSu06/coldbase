# Roadmap: Reach

## Milestones

- ✅ **v1.0 Reach Refactor** — Phases 1–7 (shipped 2026-03-17)
- 🚧 **v1.1 Production Foundation** — Phases 8–11 (in progress)

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

- [ ] **Phase 8: PostgreSQL Migration + Schema Cleanup** - Migrate Prisma from SQLite to PostgreSQL and drop unused columns
- [ ] **Phase 9: Observability** - Add request/response logging middleware and a public health endpoint
- [ ] **Phase 10: Sentry Server Integration** - Wire Sentry to Express for unhandled exception capture
- [ ] **Phase 11: Extension Cleanup** - Remove dead polling interval and fix preview truncation

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
**Plans**: TBD

Plans:
- [ ] 09-01: TBD

### Phase 10: Sentry Server Integration
**Goal**: Unhandled server exceptions and promise rejections are captured in Sentry with environment context and PII scrubbed
**Depends on**: Phase 9
**Requirements**: MON-01
**Success Criteria** (what must be TRUE):
  1. An unhandled exception thrown in any route handler appears as an event in the Sentry dashboard
  2. Sentry events include `environment` and `release` tags
  3. Request body data (which may contain email addresses) is stripped from Sentry event payloads
  4. Sentry is initialized before any application code runs — errors during Prisma startup are captured
**Plans**: TBD

Plans:
- [ ] 10-01: TBD

### Phase 11: Extension Cleanup
**Goal**: The extension no longer runs a dead polling interval and conversation previews display at an appropriate length
**Depends on**: Phase 8
**Requirements**: EXT-01, EXT-02
**Success Criteria** (what must be TRUE):
  1. The `useOutreach` hook does not register or fire a 5-minute polling interval
  2. Conversation preview text in the extension sidebar is not hard-capped at 120 characters
**Plans**: TBD

Plans:
- [ ] 11-01: TBD

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
| 8. PostgreSQL Migration + Schema Cleanup | v1.1 | 0/3 | Not started | - |
| 9. Observability | v1.1 | 0/? | Not started | - |
| 10. Sentry Server Integration | v1.1 | 0/? | Not started | - |
| 11. Extension Cleanup | v1.1 | 0/? | Not started | - |
