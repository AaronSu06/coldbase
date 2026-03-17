---
phase: 06-integration-fixes
plan: "01"
subsystem: web-dashboard
tags: [auth, api, error-handling, security]
dependency_graph:
  requires: [01-02-SUMMARY.md]
  provides: [x-reach-secret header on all web API calls, visible auth error banner]
  affects: [web/src/lib/api.js, web/src/hooks/useOutreach.js, web/src/App.jsx]
tech_stack:
  added: []
  patterns: [apiFetch helper pattern (mirrors extension/api-client.js::serverFetch), error state propagation from hook to component]
key_files:
  created: []
  modified:
    - web/src/lib/api.js
    - web/src/hooks/useOutreach.js
    - web/src/App.jsx
    - web/.env.example
    - server/outreach.test.js
decisions:
  - apiFetch guard throws early when VITE_REACH_SECRET is absent with a clear message rather than a confusing 401
  - deleteOutreach failures logged via console.error but not surfaced to user (404 on already-deleted is expected)
  - Error banner shown only when error is truthy and records.length === 0 (board empty due to error, not just filtered)
metrics:
  duration: 8min
  completed: "2026-03-17"
  tasks: 3
  files: 5
---

# Phase 6 Plan 1: Web Dashboard Auth Header Fix Summary

JWT-style secret header wired to all web dashboard API calls via a private apiFetch helper, matching the extension's serverFetch pattern; auth failures now surface as a visible error banner instead of a silent empty board.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add negative-auth test (TDD) | 5ddd8d2 | server/outreach.test.js |
| 2 | Rewrite api.js with apiFetch helper | 9ebae62 | web/src/lib/api.js, web/.env.example |
| 3 | Error state in useOutreach + banner in App.jsx | e67e4eb | web/src/hooks/useOutreach.js, web/src/App.jsx |

## What Was Built

**Task 1 — Negative-auth test:** Added an explicit integration test to `server/outreach.test.js` that sends `GET /api/outreach` with no `x-reach-secret` header and asserts a 401 response. Uses an inline `http.request` to bypass the helper's default auth header. Provides regression coverage for SEC-04.

**Task 2 — apiFetch helper:** Replaced the four ad-hoc `fetch()` calls in `web/src/lib/api.js` with a private `apiFetch` helper that:
- Reads `VITE_REACH_SECRET` from env and throws early with a clear message if absent
- Adds `'x-reach-secret': SECRET` to every request header (matching the extension's `serverFetch` pattern)
- Throws a descriptive error on any `!res.ok` response — aligns all four exports including previously-silent `deleteOutreach` and `fetchBestTime`
- Updated `web/.env.example` to include `VITE_REACH_SECRET=` alongside `VITE_API_URL`

**Task 3 — Error state and banner:** Modified `useOutreach.js` to:
- Track `error` state alongside `records`
- Clear error on each `load()` attempt (supports retry)
- Set `error` on catch instead of silently logging
- Catch `deleteOutreach` rejections to prevent unhandled promise rejections
- Expose `error` in the return object

Modified `App.jsx` to destructure `error` and render a centered `text-red-400 text-sm` error banner when `error && records.length === 0` — replacing the empty board with a visible failure message.

## Verification

All verification checks pass:
- `node --test --test-concurrency=1 server/outreach.test.js` — 9/9 tests pass
- `grep "apiFetch\|x-reach-secret" web/src/lib/api.js` — confirms helper and header present
- `grep "VITE_REACH_SECRET" web/.env.example` — confirms template entry added
- `grep "setError\|error.*records" web/src/hooks/useOutreach.js` — confirms error state wired
- `grep "error.*records.length" web/src/App.jsx` — confirms banner conditional

## Decisions Made

1. **apiFetch early-throw guard:** When `VITE_REACH_SECRET` is not set, `apiFetch` throws `'VITE_REACH_SECRET not configured — set it in web/.env'` before making any network request. This gives a clear diagnostic instead of a 401 from the server.

2. **deleteOutreach error handling:** 404 on an already-deleted record is a normal race condition. Errors are logged via `console.error('[Reach] deleteOutreach failed: ...')` but not surfaced as UI state — the optimistic removal has already updated the board.

3. **Error banner condition:** `error && records.length === 0` ensures the banner only appears when the board is effectively empty due to the error. If records were loaded and then an error occurs on a subsequent poll, the existing records remain visible (stale data is better than an error screen).

## Deviations from Plan

None — plan executed exactly as written.
