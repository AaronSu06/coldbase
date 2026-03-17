---
phase: 08-postgresql-migration-schema-cleanup
plan: "02"
subsystem: testing
tags: [postgresql, neon, testing, env-vars]
dependency_graph:
  requires: []
  provides: [test-database-url-pattern, analytics-test-coverage]
  affects: [server/outreach.test.js, server/tracking.test.js, server/analytics.test.js, server/.env.example]
tech_stack:
  added: []
  patterns: [neon-test-branch-pattern, node-test-runner-integration-test]
key_files:
  created:
    - server/analytics.test.js
  modified:
    - server/outreach.test.js
    - server/tracking.test.js
    - server/.env.example
decisions:
  - "Tests use TEST_DATABASE_URL / TEST_DIRECT_URL env vars pointing at Neon test branch; no fallback so missing vars fail clearly"
  - "analytics.test.js covers only the insufficient data path — seeding for sufficient path deferred due to complexity"
metrics:
  duration: 49s
  completed_date: "2026-03-17"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 8 Plan 02: Test Infrastructure Update for PostgreSQL — Summary

**One-liner:** Rewired test env setup from hardcoded SQLite file URL to Neon test branch env vars, and added analytics endpoint integration test covering the insufficient data path.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Update test files to use TEST_DATABASE_URL / TEST_DIRECT_URL | 7695091 | server/outreach.test.js, server/tracking.test.js |
| 2 | Create analytics.test.js + update .env.example | feb4c12 | server/analytics.test.js, server/.env.example |

## What Was Built

Both `outreach.test.js` and `tracking.test.js` previously set `process.env.DATABASE_URL = 'file:./test.db'` — a hardcoded SQLite path that breaks after the PostgreSQL migration. Both files now read from `process.env.TEST_DATABASE_URL` and `process.env.TEST_DIRECT_URL`, which will be populated from `.env.test` pointing at the Neon test branch.

`analytics.test.js` is a new integration test file following the exact same structure as `outreach.test.js`. It starts an HTTP server, runs `prisma migrate reset` on the test branch, and verifies:
1. `GET /api/insights/best-time` returns `{ insufficient: true, sent: <number>, replied: <number> }` when the database is empty
2. The route returns 401 when `x-reach-secret` is wrong

`.env.example` now documents all four PostgreSQL env vars with comments distinguishing the pooled connection (used at runtime) from the direct connection (required for migrations).

## Decisions Made

- No fallback for `DIRECT_URL` — if `TEST_DIRECT_URL` is undefined, Prisma errors clearly rather than silently using a wrong URL
- Analytics test covers only the insufficient path; sufficient-path test deferred (requires seeding 20+ sent + 5+ replied records, which adds complexity without meaningful verification gain at this stage)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Checked files exist and commits exist.
