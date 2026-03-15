---
phase: 03-server-restructure
plan: "02"
subsystem: server/routes
tags: [routes, email, analytics, smtp, zod, validation]
dependency_graph:
  requires: []
  provides:
    - server/routes/email.js (POST find-email, suggest-domains, draft-email)
    - server/routes/analytics.js (GET best-time)
    - server/emailFinder.js (parallel SMTP probes)
  affects:
    - server/index.js (will mount these routers in Plan 03)
tech_stack:
  added: []
  patterns:
    - Zod inline safeParse with standard 400 { error, message, statusCode } response shape
    - Promise.allSettled for parallel SMTP candidate probing
    - buildDraftPrompt co-located with its route handlers
key_files:
  created:
    - server/routes/email.js
    - server/routes/analytics.js
  modified:
    - server/emailFinder.js
decisions:
  - Zod safeParse 400 response includes statusCode field for consistency with SERV-02/SERV-03
  - Empty slug guard in suggest-domains uses same Validation Error shape for uniformity
  - buildDraftPrompt moved into routes/email.js (pure function, no dependencies outside file)
  - Promise.allSettled filter(fulfilled) is defensive but safe since smtpProbe always resolves
metrics:
  duration: 2min
  completed_date: "2026-03-15"
  tasks_completed: 3
  files_changed: 3
---

# Phase 03 Plan 02: Email and Analytics Routes Summary

Email routes (find-email, suggest-domains, draft-email) and analytics route (best-time) extracted into dedicated Router files; SMTP candidate probes parallelized with Promise.allSettled.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create routes/email.js with Zod validation and buildDraftPrompt | 179c7d5 | server/routes/email.js (created) |
| 2 | Create routes/analytics.js | 99e84e8 | server/routes/analytics.js (created) |
| 3 | Parallelize SMTP probes in emailFinder.js | e862bd3 | server/emailFinder.js (modified) |

## What Was Built

**server/routes/email.js** — Express Router with three POST handlers:
- `POST /find-email` — FindEmailSchema (company required), delegates to findEmails()
- `POST /suggest-domains` — SuggestDomainsSchema (company required), DNS parallel resolution
- `POST /draft-email` — DraftEmailSchema (draftType required), Gemini key guard + buildDraftPrompt

All three use `z.safeParse` with a uniform 400 response: `{ error: 'Validation Error', message, statusCode: 400 }`. All catch blocks use `next(e)`. No `expensiveRateLimit` definition — middleware applied at mount time in Plan 03.

`buildDraftPrompt` copied verbatim from index.js and co-located in this file.

**server/routes/analytics.js** — Express Router with one GET handler:
- `GET /best-time` — prisma count + raw SQL strftime query, catch uses `next(e)`

**server/emailFinder.js** — Sequential candidate probe loop replaced with `Promise.allSettled` parallel version. Fulfilled results filtered for defensiveness. catch-all probe above the loop remains sequential (single probe, unchanged).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing validation] Added empty-slug guard to suggest-domains**
- **Found during:** Task 1
- **Issue:** Original index.js had a `if (!slug)` guard after computing the slug from company name. This was missing from the plan's schema spec.
- **Fix:** Added `if (!slug) return res.status(400).json({ error: 'Validation Error', message: 'company resolves to empty slug', statusCode: 400 })` using the same standard error shape.
- **Files modified:** server/routes/email.js
- **Commit:** 179c7d5

## Verification Results

All plan verification checks passed:
1. Both route files exist
2. All three Zod schemas (FindEmailSchema, SuggestDomainsSchema, DraftEmailSchema) defined
3. Standard 400 shape appears 4 times (3 Zod + 1 slug guard)
4. No `{ ok: false, reason }` error shapes remain
5. No `expensiveRateLimit` or `rateLimit` code (only comments)
6. `buildDraftPrompt` defined and called in routes/email.js
7. `Promise.allSettled` present in emailFinder.js candidate probe loop
8. Sequential `for...of candidates` loop removed
9. `next(e)` in all catch blocks across both route files

## Self-Check: PASSED

Files confirmed on disk:
- /Users/aaron/Documents/GitHub/reach/server/routes/email.js
- /Users/aaron/Documents/GitHub/reach/server/routes/analytics.js
- /Users/aaron/Documents/GitHub/reach/server/emailFinder.js (modified)

Commits confirmed:
- 179c7d5 feat(03-02): create routes/email.js with Zod validation and buildDraftPrompt
- 99e84e8 feat(03-02): create routes/analytics.js with GET /best-time
- e862bd3 feat(03-02): parallelize SMTP candidate probes in emailFinder.js
