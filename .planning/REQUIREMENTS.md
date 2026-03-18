# Requirements: Reach

**Defined:** 2026-03-17
**Core Value:** A reliable, maintainable codebase that real users can depend on: secure by default, easy to extend, and observable when things go wrong.

## v1.1 Requirements

### Database

- [x] **DB-01**: Prisma datasource migrated to PostgreSQL; `pg` driver installed; `analytics.js` raw SQL updated for PostgreSQL compatibility; `prisma migrate deploy` runs on server start
- [x] **DATA-01**: `aiSuggestion` and `draft` columns removed from Outreach schema; all code references removed before migration runs

### Observability

- [x] **OBS-01**: Request/response logging middleware emits structured JSON (method, path, status, duration) on every request; `x-reach-secret` header is redacted from logs
- [x] **OBS-02**: `GET /health` returns DB liveness status, uptime, version, and DB latency; mounted before `requireSecret` so no auth header is required

### Error Monitoring

- [x] **MON-01**: `@sentry/node` wired to Express via `instrument.js` as first server import; captures unhandled exceptions and promise rejections with `environment` and `release` tags; `beforeSend` strips PII from request data

### Extension Cleanup

- [ ] **EXT-01**: Unused 5-minute polling interval removed from `useOutreach` hook
- [ ] **EXT-02**: Hardcoded 120-char conversation preview truncation replaced with configurable/appropriate limit

## v1.2 Requirements

### Extension UX

- **EXT-V2-03**: User sees a visible error when Gmail OAuth token expires — currently fails silently

### Error Monitoring

- **MON-02**: Sentry manual fetch reporter in Chrome MV3 background service worker — captures auth failures and API timeouts

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-tenancy / user accounts | v1.2 milestone |
| SQLite data migration to PostgreSQL | Fresh start — no existing production data |
| Sentry in content scripts | CSP risk in Gmail page context; background SW alone covers high-value errors |
| Server deployment / hosting | User handling separately; will notify when stable URL is ready |
| Gmail token expiry UX | Depends on chrome.storage IPC pattern; better tackled in v1.2 with multi-tenancy |
| UI redesign | UI stays identical |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 8 | Complete |
| DATA-01 | Phase 8 | Complete |
| OBS-01 | Phase 9 | Complete |
| OBS-02 | Phase 9 | Complete |
| MON-01 | Phase 10 | Complete |
| EXT-01 | Phase 11 | Pending |
| EXT-02 | Phase 11 | Pending |

**Coverage:**
- v1.1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 — traceability updated after roadmap creation*
