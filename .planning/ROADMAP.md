# Roadmap: Reach Refactor

## Overview

This milestone hardens the Reach codebase for production without changing any user-facing behavior. Five phases move from most-critical-to-least: secrets and security first (everything depends on clean env vars), database and quick fixes next (schema migrations are low-risk and unblock tests), then server restructure (route decomposition + validation + performance), then extension refactor (split monolithic files + structured logging), and finally automated tests that validate everything done before.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Security Hardening** - Remove hardcoded secrets, lock CORS, add rate limiting, validate REACH_SECRET on all protected endpoints
- [ ] **Phase 2: Database and Quick Fixes** - Harden SQLite schema with indices and FK constraints, fix .gitignore, fix bracket extraction bug
- [ ] **Phase 3: Server Restructure** - Decompose monolithic index.js into domain route files, add Zod validation, global error handler, pagination, and parallel SMTP
- [ ] **Phase 4: Extension Refactor** - Split background.js and content.js by concern, add structured logging module, replace silent error swallowing
- [ ] **Phase 5: Test Coverage** - Unit tests for classifier and utilities, integration tests for critical server routes

## Phase Details

### Phase 1: Security Hardening
**Goal**: The codebase contains no hardcoded secrets or endpoints; all sensitive values read from environment; server enforces CORS and rate limits; REACH_SECRET validated consistently
**Depends on**: Nothing (first phase)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. No hardcoded REACH_SECRET, localhost URLs, or API keys appear anywhere in committed source files
  2. Server rejects requests from unlisted origins with CORS 403; `ALLOWED_ORIGINS` env var controls the allowlist
  3. Repeated calls to `/api/find-email`, `/api/draft-email`, and `/api/suggest-domains` are rate-limited and return 429 after threshold
  4. Any protected endpoint called without a valid REACH_SECRET returns 401, not 200 or 5xx
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Extension config: remove hardcoded secrets from extension source, wire config.js, add generate-secret script (SEC-01)
- [ ] 01-02-PLAN.md — Server security: replace wildcard CORS, add rate limiting, harden requireSecret middleware (SEC-02, SEC-03, SEC-04)

### Phase 2: Database and Quick Fixes
**Goal**: SQLite schema enforces data integrity via indices and foreign key constraints; dev.db files cannot be accidentally committed; company name bracket extraction returns correct values
**Depends on**: Phase 1
**Requirements**: DB-01, DB-02, DB-03, BUG-01
**Success Criteria** (what must be TRUE):
  1. Prisma schema includes `@@index` on `status`, `sentDate`, and `archived`; migration applies cleanly
  2. Deleting a `TrackingPixel` cascades to its `OpenEvent` records; no orphaned events remain
  3. Running `git status` after setup shows no `dev.db` files tracked; `.gitignore` blocks them
  4. Subject `[Stripe] Internship` extracts company name `Stripe` (no trailing bracket)
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Schema hardening + gitignore: add @@index directives, FK cascade, *.db gitignore rule (DB-01, DB-02, DB-03)
- [ ] 02-02-PLAN.md — Bug fix: TDD bracket extraction in classifier.js (BUG-01)

### Phase 3: Server Restructure
**Goal**: Express server is decomposed into domain route files; all POST/PATCH endpoints validate input with Zod; errors propagate through a global handler with consistent shape; GET /api/outreach supports pagination; SMTP probes run in parallel
**Depends on**: Phase 1
**Requirements**: SERV-01, SERV-02, SERV-03, PERF-01, PERF-02
**Success Criteria** (what must be TRUE):
  1. `server/index.js` mounts routes from `routes/outreach.js`, `routes/tracking.js`, `routes/email.js`, `routes/analytics.js`; no business logic remains in index.js
  2. POST/PATCH endpoints with invalid or missing required fields return `{ error, message, statusCode }` with status 400
  3. All unhandled route errors propagate via `next(err)` and resolve to the same `{ error, message, statusCode }` shape
  4. `GET /api/outreach?limit=20&offset=40` returns the correct page slice and a `total` count field
  5. Email finder requests complete measurably faster because SMTP probes run concurrently via `Promise.allSettled()`
**Plans**: 3 plans

Plans:
- [ ] 03-01-PLAN.md — Foundation + outreach/tracking routes: lib/prisma.js singleton, routes/outreach.js (pagination + Zod), routes/tracking.js (SERV-01, SERV-02, SERV-03, PERF-01)
- [ ] 03-02-PLAN.md — Email/analytics routes + SMTP parallelization: routes/email.js, routes/analytics.js, emailFinder.js parallel probes (SERV-01, SERV-02, SERV-03, PERF-02)
- [ ] 03-03-PLAN.md — Wire index.js orchestrator + hook update: index.js mounting + global error handler, useOutreach.js response shape (SERV-01, SERV-03, PERF-01)

### Phase 4: Extension Refactor
**Goal**: background.js and content.js are split into focused single-responsibility modules; a structured logging module replaces raw console.log calls; silent catch blocks are replaced with explicit error handling
**Depends on**: Phase 1
**Requirements**: EXT-01, EXT-02, EXT-03, EXT-04
**Success Criteria** (what must be TRUE):
  1. `extension/background.js` is an orchestrator only; auth logic lives in `extension/auth.js`, API calls in `extension/api-client.js`, reply detection in `extension/reply-checker.js`
  2. `extension/content.js` is an orchestrator only; send detection in `extension/email-detector.js`, compose widget in `extension/compose-widget.js`, pixel injection in `extension/tracking.js`
  3. `extension/logger.js` exists with debug/info/error levels; verbose debug logs are suppressed when `NODE_ENV=production`; raw `console.log` calls eliminated from extension files
  4. No bare `catch {}` or `.catch(() => {})` blocks remain in extension code; all catch blocks log the error at minimum
**Plans**: 4 plans

Plans:
- [ ] 04-01-PLAN.md — Logger module: create extension/logger.js (dual-mode ES+global), add DEBUG to config.js (EXT-03)
- [ ] 04-02-PLAN.md — background.js split: create auth.js, api-client.js, reply-checker.js; rewrite background.js as orchestrator (EXT-01, EXT-03, EXT-04)
- [ ] 04-03-PLAN.md — content.js split: create email-detector.js, compose-widget.js, tracking.js; rewrite content.js as orchestrator; update manifest (EXT-02, EXT-03, EXT-04)
- [ ] 04-04-PLAN.md — Verification sweep + human smoke test: grep checks + extension reload in Chrome (EXT-01, EXT-02, EXT-03, EXT-04)

### Phase 5: Test Coverage
**Goal**: Automated tests exist for classifier logic, utility functions, and critical server routes; the test suite runs cleanly with no failures
**Depends on**: Phases 2, 3
**Requirements**: TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. `classifier.js` tests cover `isColdOutreach()`, `extractCompanyFromEmail()`, and `countKeywordMatches()` including bracket format, forwarded emails, HTML-only messages, and non-English names; all pass
  2. Integration tests cover `POST /api/outreach` (create and duplicate), `PATCH /api/outreach/:threadId`, `GET /api/outreach` with pagination, and `GET /track/:trackingId`; all pass
  3. Unit tests cover date formatting, `normalizeStatus()`, email address parsing, and `normalizeForMatch()`; all pass
  4. Running `npm test` exits 0 with no skipped or failing tests
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Hardening | 1/2 | In Progress|  |
| 2. Database and Quick Fixes | 0/2 | Not started | - |
| 3. Server Restructure | 2/3 | In Progress|  |
| 4. Extension Refactor | 3/4 | In Progress|  |
| 5. Test Coverage | 0/TBD | Not started | - |
