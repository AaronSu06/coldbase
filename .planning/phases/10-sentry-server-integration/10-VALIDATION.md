---
phase: 10
slug: sentry-server-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in, Node 22.17.0) |
| **Config file** | none — `npm test` runs `node --env-file=.env.test --test *.test.js` |
| **Quick run command** | `cd server && node --env-file=.env.test --test sentry.test.js` |
| **Full suite command** | `cd server && npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server && node --env-file=.env.test --test sentry.test.js`
- **After every plan wave:** Run `cd server && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 0 | MON-01 | unit | `cd server && node --env-file=.env.test --test sentry.test.js` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | MON-01 | unit | `cd server && node --env-file=.env.test --test sentry.test.js` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | MON-01 | unit | `cd server && node --env-file=.env.test --test sentry.test.js` | ❌ W0 | ⬜ pending |
| 10-01-04 | 01 | 1 | MON-01 | integration smoke | `cd server && node --env-file=.env.test --test observability.test.js` | ✅ | ⬜ pending |
| 10-01-05 | 01 | 1 | MON-01 | manual-only | Throw in route, verify Sentry dashboard | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/sentry.test.js` — stubs for MON-01 (beforeSend and initSentry unit tests)
- [ ] `server/instrument.js` — must export `initSentry` and `beforeSend` for testability

*Wave 0 creates test stubs and the exportable instrument.js structure before implementation tasks run.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Unhandled exception in route handler appears in Sentry dashboard | MON-01 | Requires real SENTRY_DSN and live Sentry project | 1. Set SENTRY_DSN in .env. 2. Add `throw new Error('test')` to any route. 3. Make a request. 4. Check Sentry dashboard for event with environment + release tags. |
| Sentry events include `environment` and `release` tags | MON-01 | Requires real Sentry event to verify tag presence in dashboard | Inspect event from manual throw test above — verify tags are present. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
