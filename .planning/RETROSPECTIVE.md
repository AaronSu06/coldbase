# Retrospective: Reach

## Milestone: v1.0 — Reach Refactor

**Shipped:** 2026-03-17
**Phases:** 7 | **Plans:** 21

### What Was Built

- Secret externalization and CORS/rate-limit hardening (Phase 1)
- Database schema hardening + bracket extraction bug fix (Phase 2)
- Express server decomposition into domain routes with Zod validation and pagination (Phase 3)
- Extension split into focused modules with structured logging (Phase 4)
- Full test suite from zero: classifier, utilities, server integration (Phase 5)
- Web dashboard auth header + extension response shape fixes (Phase 6)
- Tracking pixel SERVER_URL wiring + DEBUG config propagation (Phase 7)

### What Worked

- **Audit-driven gap closure:** Running `/gsd:audit-milestone` after Phase 5 uncovered 3 critical integration breaks (auth headers, response shapes, tracking URL). Adding Phases 6–7 closed them cleanly before shipping. Without the audit, v1.0 would have shipped broken at runtime.
- **Phase ordering:** Doing secrets first (Phase 1) meant no other phase had to handle secret migration mid-work. Clean dependency chain.
- **server/app.js split:** Separating the Express app from `listen()` was low-effort and made integration tests trivial to set up.
- **Decimal phase numbering:** Phases 6.x numbering approach (as integer phases 6–7) preserved milestone numbering without disruption.

### What Was Inefficient

- **ROADMAP.md progress table fell behind:** Phase 1 and 3 checkboxes were never updated to `[x]` during execution — the progress table showed stale state throughout the milestone.
- **Nyquist coverage gaps for Phases 01 and 07:** No automated tests exist for security hardening or debug config changes; these rely on human verification only.
- **STATE.md percent was wrong:** Showed 18% at end of milestone (likely a CLI calculation bug using old baseline).

### Patterns Established

- `server/app.js` exports app; `server/index.js` calls `listen()` — clean separation for tests
- `logger-esm.js` for ES module consumers, `logger.js` for classic script context
- `requireSecret` applied at `app.use('/api')` level — auth cannot be accidentally omitted from new routes
- Audit milestone before completing it — prevents shipping with silent runtime breaks

### Key Lessons

- **Audit before ship, not after.** The 3 breaks found by the audit were real and would have affected every user session.
- **Integration tests catch what unit tests miss.** Phase 6 fixes were only needed because the paginated response shape wasn't tested end-to-end.
- **Keep ROADMAP.md checkboxes updated during execution** — stale state creates confusion when auditing.

### Cost Observations

- Sessions: ~17 (one per day over 17 days)
- Model: Sonnet 4.6 (balanced profile)
- Notable: Phases 6–7 were each under 2 minutes execution time — gap-closure phases are fast when well-scoped

---

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 7 |
| Plans | 21 |
| LOC (JS) | 6,497 |
| Timeline | 17 days |
| Audit gaps found | 3 critical |
| Test coverage added | ~30 tests |
