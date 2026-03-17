# Reach

## What This Is

Reach is a Chrome extension + web dashboard for tracking cold outreach emails sent via Gmail. It auto-detects sent emails, injects tracking pixels to detect opens, monitors for replies, and surfaces analytics. The web dashboard provides a kanban view of all tracked threads with AI-powered follow-up drafting.

Being built as a SaaS product for strangers to sign up, connect their Gmail, and track outreach — with potential paid tiers for more features.

## Current Milestone: v1.1 Production Foundation

**Goal:** Migrate to PostgreSQL, clean up schema, add observability, and fix silent UX failures — building the production foundation before multi-tenancy.

**Target features:**
- PostgreSQL migration via Prisma (replace SQLite)
- Schema cleanup: drop unused `aiSuggestion` and `draft` columns
- Request/response logging middleware + `/api/health` endpoint
- Surface Gmail token expiry errors to the user
- Error monitoring (Sentry)

## Core Value

A reliable, maintainable codebase that real users can depend on: secure by default, easy to extend, and observable when things go wrong.

## Requirements

### Validated

- ✓ Cold outreach email detection via Gmail API — existing
- ✓ Tracking pixel injection and open event recording — existing
- ✓ Reply detection via 30-minute Chrome alarm polling — existing
- ✓ Kanban board web dashboard with drag-drop status management — existing
- ✓ AI-powered follow-up draft generation via Gemini — existing
- ✓ Email finder with SMTP verification and domain suggestions — existing
- ✓ Analytics (best time to send, open rates) — existing
- ✓ Server routes decomposed into domain files (outreach, tracking, email, analytics) — v1.0
- ✓ Zod validation on all POST/PATCH endpoints; consistent `{error, message, statusCode}` error shape — v1.0
- ✓ Rate limiting on expensive endpoints (find-email, draft-email, suggest-domains) — v1.0
- ✓ CORS locked to ALLOWED_ORIGINS env var; wildcard disabled — v1.0
- ✓ All secrets and endpoints moved to environment variables; no hardcoded values in source — v1.0
- ✓ REACH_SECRET validated on every protected endpoint; missing/invalid returns 401 — v1.0
- ✓ background.js decomposed into auth.js, api-client.js, reply-checker.js — v1.0
- ✓ content.js decomposed into email-detector.js, compose-widget.js, tracking.js — v1.0
- ✓ Structured logging module (logger.js) with debug/info/error levels; 80+ console.log calls replaced — v1.0
- ✓ Silent catch blocks replaced with proper error handling — v1.0
- ✓ Unit tests for classifier.js and utility functions; integration tests for server routes; `npm test` exits 0 — v1.0
- ✓ Database schema hardened: FK cascade, indices on status/sentDate/archived — v1.0
- ✓ Pagination on GET /api/outreach (limit/offset with total count) — v1.0
- ✓ Parallel SMTP probes in emailFinder.js via Promise.allSettled() — v1.0
- ✓ dev.db files gitignored; bracket extraction bug fixed ([Stripe] → Stripe) — v1.0

### Active

- [ ] Migrate database from SQLite to PostgreSQL via Prisma — DB-01
- [ ] Remove unused `aiSuggestion` and `draft` columns from Outreach schema — DATA-01
- [ ] Request/response logging middleware (structured JSON logs) — OBS-01
- [ ] Server health check endpoint (GET /api/health) — OBS-02
- [ ] Surface Gmail token expiry error to user — EXT-V2-03
- [ ] Integrate error monitoring (Sentry) on server and extension — MON-01

### Out of Scope

- UI redesign or component restructuring — UI stays identical
- Multi-tenancy / user accounts — v1.2 milestone
- Real-time push / WebSockets — polling/visibility refresh is sufficient
- Audit log / undo history — future milestone
- Data export — future milestone
- Mobile app — out of scope
- Server deployment / hosting — user handling separately; will notify when stable URL is ready

## Context

Chrome Extension (Manifest V3) + Express 4 + React 18 + Prisma/SQLite stack.

**Shipped v1.0 (2026-03-17):** 7 phases, 21 plans, 6,497 LOC JavaScript.
All v1.0 refactor goals complete. Codebase is now production-hardened.

**Known tech debt (deferred):**
- setTimeout fire-and-forget timer in App.jsx visibility handler (intentional design, pre-existing)
- Human-verified items require running server: CORS rejection, rate limit 429, extension sidebar stats
- Nyquist validation partial for phases 01, 07 (no automated tests for these phases)

## Constraints

- **Tech Stack**: JavaScript only — no TypeScript migration in this milestone
- **UI Freeze**: No visual changes to web dashboard or extension UI; component reorganization (splitting large files) is fine
- **Database**: SQLite stays; no ORM swap; Prisma schema improvements only
- **Extension Compatibility**: Must remain Manifest V3 compliant; no breaking changes to Chrome extension behavior
- **Backwards Compatibility**: All existing API endpoints keep same URLs and response shapes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep SQLite | User wants simplicity; schema fixes + indices get most of the benefit without infra change | ✓ Good — schema improvements sufficient |
| JS not TS | Scope control; TypeScript migration would dominate refactor time | ✓ Good — kept scope focused |
| Zod for validation | Already used in emailFinder.js; consistent pattern across all routes | ✓ Good — consistent validation throughout |
| Split by concern not file size | Decompose based on responsibility boundaries, not line count | ✓ Good — clear module boundaries emerged |
| logger.js self-contained DEBUG flag | Avoids ES module import constraint in classic script (content.js) context | ✓ Good — logger.js and logger-esm.js serve different consumers |
| requireSecret via app.use('/api') | Applied globally before route definitions to prevent future routes missing auth | ✓ Good — no auth gaps possible |
| Tracking router mounted at / | Preserves sent-email pixel URLs from previously deployed emails | ✓ Good — backwards compatible |
| server/app.js split from index.js | Enables integration tests to import app without calling listen() | ✓ Good — clean test setup |
| Decimal phase numbering for gap closure | Phases 6-7 inserted after audit without renumbering original 1-5 | ✓ Good — clear insertion semantics |

---
*Last updated: 2026-03-17 after v1.1 milestone start*
