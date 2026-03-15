---
phase: 3
slug: server-restructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None installed — Node 18+ built-in test runner (`node --test`) |
| **Config file** | none — Wave 0 creates `server/tests/` directory and infrastructure stubs |
| **Quick run command** | `cd server && node --test tests/` |
| **Full suite command** | `cd server && node --test tests/` |
| **Estimated runtime** | ~5 seconds (manual curl smoke tests; no automated suite in Phase 3) |

> **Note:** No test framework is installed in `server/package.json`. TEST-02 (integration tests) is Phase 5's responsibility. Phase 3 validation is manual smoke testing via curl. Wave 0 creates `server/lib/prisma.js` and `server/routes/` infrastructure — not test files.

---

## Sampling Rate

- **After every task commit:** Manual curl smoke test of the changed endpoint(s)
- **After every plan wave:** Full endpoint smoke test (all mounted routes respond correctly)
- **Before `/gsd:verify-work`:** All curl checks green
- **Max feedback latency:** ~30 seconds (manual curl round-trip)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | SERV-01 | manual | N/A — structural: `ls server/lib/prisma.js` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | SERV-01 | manual | `curl http://localhost:3001/api/outreach` (server starts) | ❌ W0 | ⬜ pending |
| 3-02-01 | 01 | 1 | SERV-01 | manual | `curl http://localhost:3001/api/outreach` returns 200 | ❌ W0 | ⬜ pending |
| 3-02-02 | 01 | 1 | SERV-01 | manual | `curl http://localhost:3001/track/test-id` returns 2xx/4xx (not 404 route) | ❌ W0 | ⬜ pending |
| 3-03-01 | 02 | 2 | SERV-02 | manual | `curl -X POST http://localhost:3001/api/outreach -H 'Content-Type: application/json' -d '{}'` → 400 `{ error, message, statusCode }` | ❌ W0 | ⬜ pending |
| 3-03-02 | 02 | 2 | SERV-02 | manual | `curl -X PATCH http://localhost:3001/api/outreach/bad-id -H 'Content-Type: application/json' -d '{"contactEmail":"not-an-email"}'` → 400 | ❌ W0 | ⬜ pending |
| 3-04-01 | 02 | 2 | SERV-03 | manual | Trigger a 404 (PATCH non-existent threadId) → response has `{ error, message, statusCode }` shape | ❌ W0 | ⬜ pending |
| 3-05-01 | 03 | 3 | PERF-01 | manual | `curl 'http://localhost:3001/api/outreach?limit=20&offset=40'` → `{ data: [...], total: N }` | ❌ W0 | ⬜ pending |
| 3-06-01 | 04 | 4 | PERF-02 | manual | Time a multi-candidate email find before/after → measurably faster | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/lib/` directory — must exist before `prisma.js` is created
- [ ] `server/lib/prisma.js` — Prisma singleton (infrastructure prerequisite for all route files)
- [ ] `server/routes/` directory — must exist before route files are created

*No automated test framework required for Phase 3 — TEST-02 (integration tests) is Phase 5's responsibility.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Routes mount correctly; index.js has no business logic | SERV-01 | Structural code review | Read `server/index.js` — only imports, middleware, `app.use()`, and `app.listen()` should remain |
| POST /api/outreach with missing required fields returns 400 | SERV-02 | No test suite in Phase 3 | `curl -X POST http://localhost:3001/api/outreach -H "Content-Type: application/json" -H "x-secret: $SECRET" -d '{}'` → `{ "error": "Validation Error", "message": "...", "statusCode": 400 }` |
| PATCH with invalid field type returns 400 | SERV-02 | No test suite in Phase 3 | `curl -X PATCH http://localhost:3001/api/outreach/abc -H "Content-Type: application/json" -H "x-secret: $SECRET" -d '{"contactEmail":"not-email"}'` → `{ "error": "Validation Error", ..., "statusCode": 400 }` |
| Unhandled route errors use consistent shape | SERV-03 | Error handler integration | PATCH non-existent threadId → `{ "error": "Not Found", "message": "Record not found", "statusCode": 404 }` |
| GET /api/outreach?limit=20&offset=40 returns paginated data | PERF-01 | No test suite in Phase 3 | `curl 'http://localhost:3001/api/outreach?limit=20&offset=40'` → `{ "data": [...], "total": N }` where data.length <= 20 |
| SMTP probes run in parallel | PERF-02 | Timing-based, not shape-based | Run an email find for a domain with 3+ candidates; observe wall-clock time is less than sum of individual probe times |
| /track/:trackingId still accessible at root (not /api/track/:id) | SERV-01 | URL breakage risk | `curl http://localhost:3001/track/test-tracking-id` → 302 redirect or pixel response (not 404) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
