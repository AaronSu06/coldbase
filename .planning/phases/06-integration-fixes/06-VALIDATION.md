---
phase: 6
slug: integration-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in test runner (`node:test`) |
| **Config file** | None — root `package.json` `test` script |
| **Quick run command** | `node --test --test-concurrency=1 server/outreach.test.js` |
| **Full suite command** | `node --test --test-concurrency=1 extension/*.test.js web/src/**/*.test.js server/*.test.js` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test --test-concurrency=1 server/outreach.test.js`
- **After every plan wave:** Run `node --test --test-concurrency=1 extension/*.test.js web/src/**/*.test.js server/*.test.js`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | SEC-04 | integration | `node --test --test-concurrency=1 server/outreach.test.js` | ✅ | ⬜ pending |
| 6-01-02 | 01 | 1 | SEC-04 | integration (negative) | `node --test --test-concurrency=1 server/outreach.test.js` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 2 | PERF-01 | integration | `node --test --test-concurrency=1 server/outreach.test.js` | ✅ | ⬜ pending |
| 6-02-02 | 02 | 2 | PERF-01 | manual | Open extension sidebar on Gmail | N/A | ⬜ pending |
| 6-02-03 | 02 | 2 | PERF-01 | manual | Trigger RECHECK_REPLIES, observe console | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/outreach.test.js` — add negative test: `GET /api/outreach` without secret header returns 401 (covers SEC-04 explicitly)

*Existing infrastructure covers all other phase requirements. No new test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `background.js` GET_STATS returns correct counts from paginated response | PERF-01 | Extension background runs in MV3 service worker — no test harness available | Load extension in Chrome, open sidebar on Gmail, verify stat counts appear correctly |
| `reply-checker.js checkReplies` iterates `.data` array without TypeError | PERF-01 | Requires Gmail OAuth token and live extension environment | Trigger RECHECK_REPLIES message, observe browser console for absence of TypeError |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
