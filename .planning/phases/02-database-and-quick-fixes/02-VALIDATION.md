---
phase: 2
slug: database-and-quick-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in test runner (`node:test`) — no install needed (Node v22+) |
| **Config file** | none — Wave 0 creates `extension/classifier.test.js` |
| **Quick run command** | `node --test extension/classifier.test.js` |
| **Full suite command** | `node --test extension/classifier.test.js && git ls-files "*.db" && grep -c "@@index" server/prisma/schema.prisma` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test extension/classifier.test.js`
- **After every plan wave:** Run full suite (unit test + smoke checks)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-W0-01 | 01 | 0 | BUG-01 | unit stub | `node --test extension/classifier.test.js` | ❌ W0 | ⬜ pending |
| 2-01-01 | 01 | 1 | BUG-01 | unit | `node --test extension/classifier.test.js` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | DB-01 | smoke | `grep -c "@@index" server/prisma/schema.prisma` | ✅ | ⬜ pending |
| 2-02-02 | 02 | 1 | DB-02 | smoke | Schema review: `grep "onDelete: Cascade" server/prisma/schema.prisma` | ✅ | ⬜ pending |
| 2-02-03 | 02 | 1 | DB-01+DB-02 | smoke | `cd server && npx prisma migrate dev --name dry-run 2>&1 \| grep "No pending migrations"` | ✅ | ⬜ pending |
| 2-03-01 | 03 | 1 | DB-03 | smoke | `git ls-files "*.db"` (must return empty) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `extension/classifier.test.js` — failing test for BUG-01: `extractCompanyFromText('[Stripe] Internship', '')` must return `'Stripe'`; also covers other `extractCompanyFromText` patterns

*All other phase requirements (DB-01, DB-02, DB-03) are verified via shell one-liners that don't require test file creation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DB-02 cascade on delete | DB-02 | Cascade behavior requires a live DB session | After migration: insert a `TrackingPixel`, insert linked `OpenEvent`, delete `TrackingPixel`, verify `OpenEvent` record is gone via Prisma Studio or `sqlite3 server/dev.db "SELECT * FROM OpenEvent"` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
