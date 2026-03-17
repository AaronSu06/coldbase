# Requirements: Reach Refactor

**Defined:** 2026-03-12
**Core Value:** A reliable, maintainable codebase that real users can depend on: secure by default, easy to extend, and observable when things go wrong.

## v1 Requirements

### Server Structure

- [x] **SERV-01**: Server routes decomposed into separate files by domain — `routes/outreach.js`, `routes/tracking.js`, `routes/email.js`, `routes/analytics.js`; `index.js` becomes mounting orchestrator
- [x] **SERV-02**: Zod validation middleware applied to all POST and PATCH endpoints with consistent 400 response on invalid input
- [x] **SERV-03**: Global error handler middleware added; all route errors propagate via `next(err)`; consistent error response shape `{ error, message, statusCode }` across all routes

### Security

- [x] **SEC-01**: All hardcoded localhost endpoints and REACH_SECRET removed from extension source; values read from extension config or environment
- [x] **SEC-02**: CORS configured with explicit allowed origins via `ALLOWED_ORIGINS` environment variable; wildcard disabled
- [x] **SEC-03**: Rate limiting applied to expensive endpoints: `/api/find-email`, `/api/draft-email`, `/api/suggest-domains` (express-rate-limit)
- [x] **SEC-04**: REACH_SECRET validated consistently on every protected server endpoint; missing or invalid secret returns 401

### Extension Cleanup

- [x] **EXT-01**: `background.js` split into focused modules — `extension/auth.js` (OAuth token management), `extension/api-client.js` (server API calls), `extension/reply-checker.js` (reply detection logic); `background.js` becomes orchestrator
- [x] **EXT-02**: `content.js` split into focused modules — `extension/email-detector.js` (send detection), `extension/compose-widget.js` (UI widget), `extension/tracking.js` (pixel injection); `content.js` becomes orchestrator
- [ ] **EXT-03**: Structured logging module created (`extension/logger.js`) with debug/info/error levels; replaces 80+ raw `console.log` calls throughout extension; verbose logs suppressed in production
- [x] **EXT-04**: All silent `catch {}` and `.catch(() => {})` error swallowing replaced with proper error handling that logs failures and propagates where appropriate

### Testing

- [x] **TEST-01**: Unit tests for `classifier.js` covering `isColdOutreach()`, `extractCompanyFromEmail()`, `countKeywordMatches()` — including edge cases: bracket format `[Company]`, non-English names, HTML-only messages, forwarded emails
- [x] **TEST-02**: Integration tests for critical server routes: `POST /api/outreach` (create + duplicate handling), `PATCH /api/outreach/:threadId` (update), `GET /api/outreach` (pagination), `GET /track/:trackingId` (pixel logging)
- [x] **TEST-03**: Unit tests for utility functions: date formatting, `normalizeStatus()`, email address parsing, `normalizeForMatch()`

### Performance

- [x] **PERF-01**: `GET /api/outreach` supports `limit` and `offset` query params; response includes `total` count; default limit of 100 records
- [x] **PERF-02**: SMTP email verification probes in `emailFinder.js` run in parallel using `Promise.allSettled()`; sequential blocking eliminated

### Database

- [x] **DB-01**: Prisma schema adds `@@index` directives on `status`, `sentDate`, and `archived` fields in `Outreach` model
- [x] **DB-02**: `OpenEvent` model adds `@relation` to `TrackingPixel` with `onDelete: Cascade` foreign key constraint
- [x] **DB-03**: `*.db` added to `.gitignore`; empty root-level `dev.db` file removed from working tree

### Bug Fixes

- [x] **BUG-01**: Company name extraction in `classifier.js` fixed to handle bracket format — `[Stripe] Internship` correctly extracts `Stripe` not `Stripe]`

## v2 Requirements

### Observability

- **OBS-01**: Request/response logging middleware (structured JSON logs)
- **OBS-02**: Server health check endpoint (`GET /api/health`)
- **OBS-03**: Gemini API error differentiation (rate limits vs network errors)

### Extension

- **EXT-V2-01**: Remove unused 5-minute polling interval from `useOutreach` hook (low risk, low value)
- **EXT-V2-02**: Fix conversation preview truncation (hardcoded 120-char limit)
- **EXT-V2-03**: Fix token expiry silent failure — surface error to user when Gmail token expires

### Data

- **DATA-01**: Remove unused `aiSuggestion` and `draft` fields from Outreach schema
- **DATA-02**: Data export endpoint for user portability
- **DATA-03**: Undo/history for status changes and deletions

## Out of Scope

| Feature | Reason |
|---------|--------|
| UI redesign or component moves | UI stays identical per user requirement |
| PostgreSQL migration | User wants SQLite; schema improvements sufficient |
| TypeScript migration | Would dominate refactor scope; JS stays |
| Real-time push / WebSockets | Current polling approach is adequate |
| Audit log / compliance features | Future milestone |
| Mobile app | Out of scope |
| OAuth login for web dashboard | Web dashboard is localhost-only; no auth needed |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 7 | Complete |
| SEC-02 | Phase 1 | Complete |
| SEC-03 | Phase 1 | Complete |
| SEC-04 | Phase 6 | Complete |
| DB-01 | Phase 2 | Complete |
| DB-02 | Phase 2 | Complete |
| DB-03 | Phase 2 | Complete |
| BUG-01 | Phase 2 | Complete |
| SERV-01 | Phase 3 | Complete |
| SERV-02 | Phase 3 | Complete |
| SERV-03 | Phase 3 | Complete |
| PERF-01 | Phase 6 | Complete |
| PERF-02 | Phase 3 | Complete |
| EXT-01 | Phase 4 | Complete |
| EXT-02 | Phase 4 | Complete |
| EXT-03 | Phase 7 | Pending |
| EXT-04 | Phase 4 | Complete |
| TEST-01 | Phase 5 | Complete |
| TEST-02 | Phase 5 | Complete |
| TEST-03 | Phase 5 | Complete |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0
- Pending (gap closure): SEC-01 (Phase 7), SEC-04 (Phase 6), PERF-01 (Phase 6), EXT-03 (Phase 7)

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 — traceability filled by roadmap*
