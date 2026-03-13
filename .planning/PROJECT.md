# Reach — Codebase Refactor

## What This Is

Reach is a Chrome extension + web dashboard for tracking cold outreach emails sent via Gmail. It auto-detects sent emails, injects tracking pixels to detect opens, monitors for replies, and surfaces analytics. The web dashboard provides a kanban view of all tracked threads with AI-powered follow-up drafting.

This milestone is a full-stack refactor focused on code quality, security, test coverage, and production readiness — without changing the UI.

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

### Active

- [ ] Server routes decomposed into separate route files by domain (outreach, tracking, email, analytics)
- [ ] Request validation middleware (Zod) applied to all POST/PATCH endpoints
- [ ] Structured error handling with consistent error response shape across all routes
- [ ] Rate limiting on expensive endpoints (find-email, draft-email, suggest-domains)
- [ ] CORS locked to specific allowed origins via environment variable
- [ ] All secrets and endpoints moved to environment variables — no hardcoded values in source
- [ ] REACH_SECRET rotated and properly validated on all protected endpoints
- [ ] Extension split: background.js decomposed into auth, api-client, reply-checker, classifier modules
- [ ] Extension split: content.js decomposed into email-detector, compose-widget, tracking modules
- [ ] Silent error swallowing replaced with structured logging (debug/info/error levels)
- [ ] Unit tests for classifier.js, utility functions, and server route handlers
- [ ] Integration tests for critical server endpoints (POST /api/outreach, PATCH, tracking pixel)
- [ ] Database schema hardened: foreign key constraints, indices on status/sentDate/archived
- [ ] Pagination added to GET /api/outreach (limit/offset)
- [ ] Async parallel SMTP probes in emailFinder.js (no more sequential blocking)
- [ ] Unused polling interval removed from useOutreach hook
- [ ] dev.db files added to .gitignore; empty root dev.db cleaned up
- [ ] Company name bracket extraction bug fixed ([Stripe] → Stripe)

### Out of Scope

- UI redesign or component restructuring — UI stays identical
- PostgreSQL migration — keep SQLite with schema improvements
- Real-time push / WebSockets — polling/visibility refresh is sufficient
- Audit log / undo history — future milestone
- Data export — future milestone
- Mobile app — out of scope

## Context

This is an existing Chrome Extension (Manifest V3) + Express 4 + React 18 + Prisma/SQLite stack. The codebase map lives in `.planning/codebase/`. Key existing concerns documented there:

- Hardcoded secrets and localhost endpoints throughout extension files
- Three monolithic files (content.js at 1,414 lines, background.js at 567 lines, Sidebar.jsx at 645 lines)
- Zero automated tests
- No input validation on server routes
- Silent error handling swallowing failures
- No rate limiting on Gemini/SMTP endpoints
- SQLite schema missing indices and foreign key constraints

The refactor preserves all existing behavior and UI while restructuring internals for production quality.

## Constraints

- **Tech Stack**: JavaScript only — no TypeScript migration in this milestone
- **UI Freeze**: No visual changes to web dashboard or extension UI; component reorganization (splitting large files) is fine
- **Database**: SQLite stays; no ORM swap; Prisma schema improvements only
- **Extension Compatibility**: Must remain Manifest V3 compliant; no breaking changes to Chrome extension behavior
- **Backwards Compatibility**: All existing API endpoints keep same URLs and response shapes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep SQLite | User wants simplicity; schema fixes + indices get most of the benefit without infra change | — Pending |
| JS not TS | Scope control; TypeScript migration would dominate refactor time | — Pending |
| Zod for validation | Already used in emailFinder.js; consistent pattern across all routes | — Pending |
| Split by concern not by file size | Decompose based on responsibility boundaries, not line count | — Pending |

---
*Last updated: 2026-03-12 after initialization*
