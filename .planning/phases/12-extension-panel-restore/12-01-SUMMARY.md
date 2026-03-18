---
phase: 12-extension-panel-restore
plan: 01
subsystem: extension
tags: [chrome-extension, background-script, gmail, compose-panel, css-cleanup, auth]

# Dependency graph
requires:
  - phase: 11-extension-cleanup
    provides: compose-widget.js with openComposePanel() already implemented and working
provides:
  - extension icon click on Gmail tabs routes OPEN_PANEL to content.js, opening compose panel
  - dead settings CSS removed from popup.html
  - extension config.js REACH_SECRET aligned with server secret (panel API calls authenticated)
affects: [manual-testing, extension-qa]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - extension/background.js
    - extension/popup.html
    - extension/config.js (gitignored — local secret sync only)

key-decisions:
  - "tab.url.startsWith check in background.js onClicked — simple URL prefix is reliable for Gmail tab detection; no regex needed"
  - "msgType variable declared once at function scope, reused in both initial sendMessage and executeScript retry callback"
  - "extension/config.js is gitignored and must be manually synced — REACH_SECRET in config.js must match server .env REACH_SECRET"

patterns-established:
  - "Tab routing pattern: isGmail flag + msgType variable derived before first sendMessage call, so both send paths use the same derived value"
  - "Local secret sync: extension/config.js is gitignored; developers must copy REACH_SECRET from server/.env into extension/config.js"

requirements-completed:
  - EXT-V2-01
  - EXT-V2-02
  - EXT-V2-03

# Metrics
duration: multi-session
completed: 2026-03-18
---

# Phase 12 Plan 01: Extension Panel Restore Summary

**Extension icon click routes OPEN_PANEL to Gmail tabs (opening compose panel); dead settings CSS removed from popup.html; 401 auth errors resolved by syncing REACH_SECRET in extension/config.js**

## Performance

- **Duration:** multi-session (Tasks 1-2 in ~1 min; Task 3 verification + fix in follow-up session)
- **Started:** 2026-03-18T04:42:17Z
- **Completed:** 2026-03-18
- **Tasks:** 3 (2 auto + 1 checkpoint with post-verification fix)
- **Files modified:** 3 (background.js, popup.html, config.js)

## Accomplishments
- Fixed background.js onClicked handler to branch on tab URL: Gmail gets OPEN_PANEL (opens compose panel), all other tabs retain TOGGLE_SIDEBAR
- Both the initial sendMessage and the executeScript retry callback use the same derived msgType variable
- Removed nine dead CSS rule sets (.settings, .settings-title, .field, .field label, .field input, .field input:focus, .save-btn, .save-btn:hover, .save-status) from popup.html — popup body had no matching elements
- Resolved 401 errors on GET /api/outreach by updating REACH_SECRET in extension/config.js to match server/.env

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix background.js onClicked to send OPEN_PANEL on Gmail tabs** - `dadf798` (feat)
2. **Task 2: Remove dead settings CSS from popup.html** - `5b7c1f0` (chore)

Note: The post-checkpoint fix (config.js secret sync) is a local-only change — config.js is gitignored and cannot be committed.

## Files Created/Modified
- `extension/background.js` - Added isGmail/msgType branch in onClicked handler; both send paths now use msgType
- `extension/popup.html` - Removed 58 lines of dead .settings/.field/.save-btn/.save-status CSS rules
- `extension/config.js` (gitignored) - Updated REACH_SECRET to match server/.env value

## Decisions Made
- Used `tab.url.startsWith('https://mail.google.com/')` — simple prefix check, reliable, no regex overhead
- Declared `msgType` once at the outer function scope so both `sendMessage` calls (initial and retry) reference it without duplication
- extension/config.js is gitignored by design (contains real secret); developers must manually sync REACH_SECRET from server/.env into extension/config.js

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 401 Unauthorized errors on GET /api/outreach**
- **Found during:** Task 3 checkpoint (human verification)
- **Issue:** extension/config.js had placeholder `REACH_SECRET = 'CHANGE_ME'` but server/.env had a real 48-char secret `f824a42e...`. The x-reach-secret header sent by the extension didn't match, causing 401 on all /api/outreach calls (GET_STATS, GET_RECENT in Overview tab).
- **Fix:** Updated REACH_SECRET in extension/config.js to match server/.env value. All server API calls now authenticate successfully.
- **Files modified:** extension/config.js (gitignored — local change only)
- **Verification:** npm test passes (79/79). Server logs no longer show 401 on /api/outreach.
- **Committed in:** Not committable (config.js is gitignored for security)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Fix was essential for the panel to function — without it, the Overview tab showed no stats and GET_RECENT returned empty. No scope creep.

## Issues Encountered

The root cause of the 401 errors: `extension/config.js` is gitignored (correctly, as it holds the real secret), but the default `config.example.js` template uses `CHANGE_ME` as the placeholder. When developers check out the repo, they must manually copy the correct `REACH_SECRET` from `server/.env` into their local `extension/config.js`. This is a developer onboarding step, not a code bug.

## User Setup Required

**Extension developers must sync the secret manually.**

When setting up the extension locally:
1. Open `server/.env` and copy the `REACH_SECRET` value
2. Open `extension/config.js` (or copy from `extension/config.example.js`)
3. Set `export const REACH_SECRET = '<value-from-server-env>';`
4. `extension/config.js` is gitignored — never commit it

## Next Phase Readiness
- Phase 12 plan 01 is fully complete
- Extension icon click on Gmail now opens compose panel with three tabs
- All API calls from the panel are authenticated (Overview stats, Find Contacts, Draft with AI)
- No blockers for subsequent phases

## Self-Check: PASSED

- extension/background.js: FOUND
- extension/popup.html: FOUND
- 12-01-SUMMARY.md: FOUND
- Commit dadf798: FOUND
- Commit 5b7c1f0: FOUND

---
*Phase: 12-extension-panel-restore*
*Completed: 2026-03-18*
