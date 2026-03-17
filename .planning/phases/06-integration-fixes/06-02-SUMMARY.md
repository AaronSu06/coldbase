---
phase: 06-integration-fixes
plan: "02"
subsystem: extension
tags: [bug-fix, extension, api-client, auth, pagination]
dependency_graph:
  requires: []
  provides: [fetchOutreach-auth-header, background-data-destructure, reply-checker-data-destructure, sidebar-error-indicator]
  affects: [extension/api-client.js, extension/background.js, extension/reply-checker.js, extension/sidebar.js]
tech_stack:
  added: []
  patterns: [serverFetch-delegation, paginated-response-destructure]
key_files:
  created: []
  modified:
    - extension/api-client.js
    - extension/background.js
    - extension/reply-checker.js
    - extension/sidebar.js
decisions:
  - fetchOutreach returns raw Response (not parsed JSON) — contract preserved, callers still call .json() themselves
  - rateEl shows 'unreachable' as the visible error indicator; sentEl/repliedEl keep '—' since they have no meaning when server is down
metrics:
  duration: 66s
  completed_date: "2026-03-17"
  tasks_completed: 3
  files_modified: 4
---

# Phase 6 Plan 02: Extension API Auth and Pagination Fix Summary

**One-liner:** Fixed fetchOutreach() to attach the x-reach-secret auth header via serverFetch, and corrected all three callers that treated the paginated { data, total } response as a flat array.

## Objective

Phase 3 built GET /api/outreach returning `{ data: [...], total: N }`. Phase 4 missed adding the auth header to fetchOutreach(), and all three consumers in background.js and reply-checker.js treated the response object as a flat array — causing TypeError on .length and .filter(). This plan closed both gaps.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix fetchOutreach in api-client.js to use serverFetch | 9c4d7d1 | extension/api-client.js |
| 2 | Fix .data destructure in background.js GET_STATS and GET_RECENT | 76e1488 | extension/background.js |
| 3 | Fix .data destructure in reply-checker.js and add error indicator to sidebar.js | 83f34a8 | extension/reply-checker.js, extension/sidebar.js |

## Changes Made

### Task 1 — api-client.js
- `fetchOutreach()` now delegates to `serverFetch('/outreach')` instead of calling bare `fetch()` without auth
- The x-reach-secret header is now attached automatically to outreach fetches
- Return contract preserved: still returns the raw Response object

### Task 2 — background.js
- GET_STATS handler: `.then(records => {...})` changed to `.then(({ data: records }) => {...})`
- GET_RECENT handler: same destructure pattern applied
- Fixes TypeError on `records.length` and `records.filter()` — was calling array methods on the `{ data, total }` wrapper object

### Task 3 — reply-checker.js + sidebar.js
- `checkReplies()`: `records = await res.json()` changed to `records = (await res.json()).data`
- Fixes the for-of loop that was iterating object keys ('data', 'total') instead of actual records
- `loadStats()` error branch: `rateEl.textContent` set to `'unreachable'` instead of silent `'—'`

## Verification

All grep checks confirm:
- `grep -n "serverFetch('/outreach')" extension/api-client.js` → line 101
- `grep -n "data: records" extension/background.js` → lines 89, 132
- `grep -n "res.json()).data" extension/reply-checker.js` → line 252
- `grep -n "unreachable" extension/sidebar.js` → line 228

Full test suite: 9/9 passing (`node --test --test-concurrency=1 server/outreach.test.js`)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Checking files and commits exist...

## Self-Check: PASSED

- extension/api-client.js: FOUND
- extension/background.js: FOUND
- extension/reply-checker.js: FOUND
- extension/sidebar.js: FOUND
- .planning/phases/06-integration-fixes/06-02-SUMMARY.md: FOUND
- Commit 9c4d7d1: FOUND
- Commit 76e1488: FOUND
- Commit 83f34a8: FOUND
