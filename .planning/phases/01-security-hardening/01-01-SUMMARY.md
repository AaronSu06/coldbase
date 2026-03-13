---
phase: 01-security-hardening
plan: 01
subsystem: infra
tags: [extension, secrets, config, vite, env-vars]

# Dependency graph
requires: []
provides:
  - extension/config.js (git-ignored) with SERVER_URL, DASH_URL, REACH_SECRET exports
  - extension/config.example.js template committed to git with CHANGE_ME values
  - background.js imports secrets from config.js (no hardcoded values)
  - web/src/lib/api.js reads BASE from VITE_API_URL env var
  - Root package.json with generate-secret script for secret rotation
affects: [02-input-validation, 03-error-handling, 04-extension-refactor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Git-ignored extension/config.js for runtime secrets; config.example.js as committed template"
    - "Vite VITE_API_URL env var with localhost fallback for web dashboard API base URL"
    - "generate-secret npm script using Node.js built-in crypto for 64-char hex secret generation"

key-files:
  created:
    - extension/config.js
    - extension/config.example.js
    - package.json
    - web/.env.example
    - web/.env
  modified:
    - extension/background.js
    - web/src/lib/api.js

key-decisions:
  - "Keep GET_RUNTIME_CONFIG message type (not GET_CONFIG) to match existing panel.js, sidebar.js, popup.js callers"
  - "Keep DEFAULT_CONFIG fallback in panel.js and sidebar.js — they serve as safe localhost defaults if messaging fails, not committed secrets"
  - "web/.env gitignored via existing .env.* rule; web/.env.example committed with VITE_API_URL placeholder"

patterns-established:
  - "Config pattern: git-ignored config.js + committed config.example.js for extension secrets"
  - "Env var pattern: import.meta.env.VITE_API_URL ?? fallback for Vite web app config"

requirements-completed: [SEC-01]

# Metrics
duration: 8min
completed: 2026-03-13
---

# Phase 01 Plan 01: Secrets Externalization Summary

**Hardcoded REACH_SECRET and localhost URLs removed from extension and web dashboard; replaced with git-ignored config.js, Vite env vars, and a generate-secret rotation script**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-13T02:43:30Z
- **Completed:** 2026-03-13T02:51:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Removed burned REACH_SECRET (`f824a42ea...`) and all hardcoded localhost URLs from background.js
- Created git-ignored `extension/config.js` pattern with committed `config.example.js` template
- Wired `web/src/lib/api.js` to `import.meta.env.VITE_API_URL` with localhost fallback
- Added root `package.json` with `generate-secret` script for future secret rotation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create config.js, config.example.js, and generate-secret script** - `5f305fb` (feat)
2. **Task 2: Wire background.js to config.js; update GET_CONFIG handler; fix web/src/lib/api.js** - `44e09a8` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `extension/config.js` - Git-ignored runtime config; exports SERVER_URL, DASH_URL, REACH_SECRET
- `extension/config.example.js` - Committed template with CHANGE_ME placeholder values
- `extension/background.js` - Imports from config.js; removed RUNTIME_CONFIG object and hardcoded secret
- `web/src/lib/api.js` - Reads BASE from import.meta.env.VITE_API_URL with localhost fallback
- `web/.env.example` - Committed Vite env template with VITE_API_URL
- `web/.env` - Git-ignored local Vite env with localhost default
- `package.json` - Root package.json with generate-secret npm script

## Decisions Made

- Kept `GET_RUNTIME_CONFIG` message type (not `GET_CONFIG` as plan suggested) — panel.js, sidebar.js, and popup.js all use `GET_RUNTIME_CONFIG`; renaming would break them without benefit
- Kept `DEFAULT_CONFIG` fallback objects in panel.js and sidebar.js unchanged — they are safe localhost defaults used only when messaging fails, not secrets
- `web/.env` created with localhost default and is git-ignored via the existing `.env.*` rule in .gitignore

## Deviations from Plan

None - plan executed exactly as written (minor: used GET_RUNTIME_CONFIG instead of GET_CONFIG per plan suggestion — matched actual codebase, not a deviation from intent).

## Issues Encountered

None.

## User Setup Required

After cloning, users must:

1. Copy `extension/config.example.js` to `extension/config.js`
2. Run `npm run generate-secret` and paste the output as `REACH_SECRET` in `extension/config.js`
3. Copy `web/.env.example` to `web/.env` (or `web/.env.local`) and set `VITE_API_URL`

## Next Phase Readiness

- SEC-01 satisfied: no hardcoded secrets remain in extension/ or web/
- Secret rotation path established via generate-secret script
- Ready for Phase 1 Plan 02 (input validation / SEC-02 through SEC-05)

---
*Phase: 01-security-hardening*
*Completed: 2026-03-13*
