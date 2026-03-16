---
phase: 05-test-coverage
plan: "01"
subsystem: infrastructure
tags: [testing, server, extension, web, esm]
dependency_graph:
  requires: []
  provides: [server-app-export, text-utils-pure, normalize-pure, root-test-script]
  affects: [server/app.js, server/index.js, extension/text-utils.js, extension/reply-checker.js, web/src/lib/normalize.js, package.json, server/.env.test]
tech_stack:
  added: []
  patterns: [app-listen-split, pure-utility-extraction, esm-root-package]
key_files:
  created:
    - server/app.js
    - extension/text-utils.js
    - web/src/lib/normalize.js
    - server/.env.test
  modified:
    - server/index.js
    - extension/reply-checker.js
    - package.json
decisions:
  - "server/app.js exports the Express app without listen(); server/index.js is the sole entry point that calls listen()"
  - "extension/text-utils.js has zero imports — safe to import in Node test runner without browser globals"
  - "web/src/lib/normalize.js defines COLUMNS inline rather than importing from @shared/constants to avoid Vite alias resolution in Node"
  - "root package.json type:module set so all .js files are treated as ESM by Node test runner"
  - "server/.env.test is gitignored via .env.* rule — intentional, not a gap"
metrics:
  duration: "8 minutes"
  completed_date: "2026-03-16"
  tasks_completed: 3
  files_modified: 7
requirements_satisfied: [TEST-01, TEST-02, TEST-03]
---

# Phase 5 Plan 01: Test Infrastructure Prerequisites Summary

**One-liner:** Split server entry point, extracted pure utility modules, and wired ESM root package for Node test runner.

## What Was Built

Three infrastructure changes that unblock all subsequent test plans:

1. **server/app.js + server/index.js split** — All Express configuration moved to `app.js` which exports `default app`. `index.js` now contains only the `listen()` call. Integration tests can `import app from './app.js'` without auto-starting the server.

2. **extension/text-utils.js** — `extractEmailAddress` and `normalizeForMatch` extracted from `reply-checker.js` into a zero-import file. `reply-checker.js` now imports them from `text-utils.js`. Tests can import these pure functions directly in Node without any browser dependency.

3. **web/src/lib/normalize.js** — `normalizeStatus` with inline `COLUMNS` array (not imported from `@shared/constants`). Avoids Vite alias resolution issues when running under `node --test`.

4. **Root package.json** — Added `"type": "module"` and `"test"` script with `--test-concurrency=1` to prevent parallel DB corruption across integration test files.

5. **server/.env.test** — Created with `REACH_SECRET=test-secret` and `DATABASE_URL=file:./test.db`. Gitignored via existing `.env.*` rule.

## Verification Results

- `server/app.js` exports typeof `function` (confirmed)
- `extension/text-utils.js` inline assertions pass (extractEmailAddress, normalizeForMatch)
- `web/src/lib/normalize.js` exports COLUMNS and normalizeStatus correctly
- `extension/classifier.test.js` regression: 6/6 tests pass — no regressions from reply-checker refactor
- `package.json` is valid JSON with `"type": "module"` and `"test"` script

## Commits

| Hash | Task | Description |
|------|------|-------------|
| 9a91fc5 | Task 1 | feat(05-01): split server/index.js into app.js + index.js |
| cf386ba | Task 2 | feat(05-01): extract text-utils.js and normalize.js; update callers |
| f01291c | Task 3 | feat(05-01): add type:module and test script to root package.json |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files confirmed present:
- server/app.js: FOUND
- server/index.js: FOUND (updated)
- extension/text-utils.js: FOUND
- extension/reply-checker.js: FOUND (updated)
- web/src/lib/normalize.js: FOUND
- package.json: FOUND (updated)
- server/.env.test: FOUND (gitignored, not committed)

Commits confirmed:
- 9a91fc5: FOUND
- cf386ba: FOUND
- f01291c: FOUND
