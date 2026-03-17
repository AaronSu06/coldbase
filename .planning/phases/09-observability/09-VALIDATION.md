---
phase: 9
slug: observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` |
| **Config file** | none — invoked directly via CLI |
| **Quick run command** | `node --test server/observability.test.js` |
| **Full suite command** | `node --test --test-concurrency=1 server/*.test.js` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test server/observability.test.js`
- **After every plan wave:** Run `node --test --test-concurrency=1 server/*.test.js`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | OBS-01, OBS-02 | tdd scaffold | `node --test server/observability.test.js` | ❌ W1 | ⬜ pending |
| 09-02-01 | 02 | 2 | OBS-01 | integration | `node --test server/observability.test.js` | ❌ W1 | ⬜ pending |
| 09-02-02 | 02 | 2 | OBS-02 | integration | `node --test server/observability.test.js` | ❌ W1 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/observability.test.js` — stubs for OBS-01 (logger output shape, redaction) and OBS-02 (health response shape, no-auth access)
- [ ] `server/middleware/` directory — must be created before requestLogger.js can be written

*Existing test infrastructure (node:test built-in, http helper pattern) covers all other needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `x-reach-secret` not present in log output at all | OBS-01 | Secondary confirmation via log review | Make a request with header set; grep logs for the secret value |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
