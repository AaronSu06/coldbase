---
phase: 5
slug: test-coverage
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node 20+ built-in) |
| **Config file** | none — flags in `npm test` script |
| **Quick run command** | `node --test extension/classifier.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test extension/classifier.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 0 | TEST-01 | unit | `node --test extension/classifier.test.js` | ✅ partial | ⬜ pending |
| 5-01-02 | 01 | 0 | TEST-01 | unit | `node --test extension/classifier.test.js` | ✅ partial | ⬜ pending |
| 5-01-03 | 01 | 0 | TEST-01 | unit | `node --test extension/classifier.test.js` | ✅ partial | ⬜ pending |
| 5-02-01 | 02 | 0 | TEST-02 | integration | `node --test server/outreach.test.js` | ❌ W0 | ⬜ pending |
| 5-02-02 | 02 | 0 | TEST-02 | integration | `node --test server/outreach.test.js` | ❌ W0 | ⬜ pending |
| 5-02-03 | 02 | 0 | TEST-02 | integration | `node --test server/tracking.test.js` | ❌ W0 | ⬜ pending |
| 5-03-01 | 03 | 0 | TEST-03 | unit | `node --test web/src/lib/utils.test.js` | ❌ W0 | ⬜ pending |
| 5-03-02 | 03 | 0 | TEST-03 | unit | `node --test web/src/hooks/useOutreach.test.js` | ❌ W0 | ⬜ pending |
| 5-03-03 | 03 | 0 | TEST-03 | unit | `node --test extension/reply-checker.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/app.js` — extract Express app without `listen()` call (prerequisite for integration tests)
- [ ] `server/outreach.test.js` — stubs for TEST-02 outreach routes
- [ ] `server/tracking.test.js` — stub for TEST-02 tracking pixel route
- [ ] `server/.env.test` — `REACH_SECRET=test-secret`, `DATABASE_URL=file:./test.db`
- [ ] `web/src/lib/utils.test.js` — stubs for TEST-03 date utilities
- [ ] `web/src/hooks/useOutreach.test.js` or `web/src/lib/normalize.js` + test — stubs for TEST-03 `normalizeStatus`
- [ ] `extension/reply-checker.test.js` or `extension/text-utils.js` + test — stubs for TEST-03 `normalizeForMatch` + `extractEmailAddress`
- [ ] Root `package.json` — add `"type":"module"` and `"test"` script with `--test-concurrency=1`
- [ ] `extension/reply-checker.js` — export `normalizeForMatch` and `extractEmailAddress`
- [ ] `web/src/hooks/useOutreach.js` — export `normalizeStatus`

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
