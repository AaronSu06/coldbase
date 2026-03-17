---
phase: 8
slug: postgresql-migration-schema-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node:test`) |
| **Config file** | None — tests run directly with `node` |
| **Quick run command** | `cd server && node --test outreach.test.js` |
| **Full suite command** | `cd server && node --test outreach.test.js tracking.test.js` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server && node --test outreach.test.js`
- **After every plan wave:** Run `cd server && node --test outreach.test.js tracking.test.js`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | DB-01 | smoke | `cd server && node --test outreach.test.js` | ✅ | ⬜ pending |
| 08-01-02 | 01 | 1 | DB-01 | integration | `cd server && node --test outreach.test.js` | ✅ | ⬜ pending |
| 08-01-03 | 01 | 1 | DB-01 | integration | `cd server && node --test analytics.test.js` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 1 | DATA-01 | unit | `cd server && node --test outreach.test.js` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 1 | DATA-01 | integration | `cd server && node --test outreach.test.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/analytics.test.js` — analytics endpoint test covering DB-01 EXTRACT() correctness (describe `GET /api/insights/best-time`, handles `insufficient: true` response)
- [ ] Schema column absence assertion in `server/outreach.test.js` — verifies `aiSuggestion` and `draft` fields absent from POST response shape (covers DATA-01)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `prisma migrate deploy` runs without error on startup | DB-01 | Requires live PostgreSQL instance | Set `DATABASE_URL` to Neon connection string, run `node index.js`, observe startup logs |
| Server connects to PostgreSQL (not SQLite) | DB-01 | Requires live Neon instance | Run server, check logs for `Prisma connected` without SQLite fallback message |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
