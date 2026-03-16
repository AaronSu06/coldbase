---
phase: 04-extension-refactor
plan: 01
subsystem: infra
tags: [logging, chrome-extension, es-module, content-script, dual-mode]

# Dependency graph
requires: []
provides:
  - "extension/logger.js — dual-mode logger factory (ES module + window.ReachLogger global)"
  - "extension/config.example.js — DEBUG constant template"
affects:
  - 04-extension-refactor

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-mode module: ES module export + window global for content script consumers"
    - "Self-contained DEBUG flag in logger.js avoids import constraint in classic scripts"

key-files:
  created:
    - extension/logger.js
  modified:
    - extension/config.example.js

key-decisions:
  - "logger.js self-contains its DEBUG flag — does NOT import from config.js — to avoid ES module import constraint in content script (classic script) context"
  - "config.js is gitignored (local only); DEBUG constant added to config.example.js as the committed template"
  - "makeLogger function exported as logger so callers write import { logger } from './logger.js'"

patterns-established:
  - "All modules import { logger } from './logger.js' and call logger('module-name') to get prefixed log methods"
  - "Content scripts use window.ReachLogger('module-name') instead of ES import"

requirements-completed: [EXT-03]

# Metrics
duration: 2min
completed: 2026-03-16
---

# Phase 4 Plan 01: Extension Logger + DEBUG Flag Summary

**Dual-mode logger factory (ES module + window.ReachLogger) with self-contained DEBUG flag, replacing 80+ raw console.log calls across background.js and content.js**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-16T06:59:03Z
- **Completed:** 2026-03-16T07:00:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created extension/logger.js with dual-mode export pattern (ES module + window global)
- Added DEBUG constant to extension/config.example.js as committed template
- Logger factory produces { debug, info, error } methods with [Reach/module] prefix
- debug/info suppressed when DEBUG=false; error always outputs regardless of flag

## Task Commits

Each task was committed atomically:

1. **Task 1: Add DEBUG to config.js** - `33dfddf` (feat)
2. **Task 2: Create extension/logger.js (dual-mode)** - `99d2774` (feat)

## Files Created/Modified

- `extension/logger.js` - Dual-mode logger factory; ES module export + window.ReachLogger global for content scripts
- `extension/config.example.js` - Added DEBUG constant (gitignored config.js updated locally too)

## Decisions Made

- **logger.js imports nothing from config.js.** The DEBUG flag is hardcoded in logger.js itself. This avoids a classic Manifest V3 pitfall: content scripts are loaded as classic scripts and cannot use ES module imports. If logger.js imported DEBUG from config.js, it would crash in content script context.
- **config.js is gitignored; config.example.js is the committed template.** The plan targeted config.js, but since it's in .gitignore the committed change goes into config.example.js. Both files were updated.
- **Export alias: `export { makeLogger as logger }`.** The internal function is named makeLogger for clarity, but the exported name is `logger` to match the caller API `import { logger } from './logger.js'`.

## Deviations from Plan

**1. [Rule 2 - Missing Critical] Updated config.example.js in addition to config.js**
- **Found during:** Task 1 (Add DEBUG to config.js)
- **Issue:** extension/config.js is gitignored (as expected — it contains secrets). The committed template is config.example.js. Adding DEBUG only to the gitignored file would mean new developers setting up the project would not get the DEBUG constant.
- **Fix:** Added DEBUG to both config.js (local) and config.example.js (committed template).
- **Files modified:** extension/config.example.js
- **Verification:** config.example.js includes `export const DEBUG = true;`
- **Committed in:** 33dfddf (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical)
**Impact on plan:** Necessary to ensure DEBUG is available to developers initializing from the example template. No scope creep.

## Issues Encountered

None — plan executed cleanly. Node.js `MODULE_TYPELESS_PACKAGE_JSON` warning appeared during verification but is a pre-existing project-wide config issue (no `"type": "module"` in package.json), not caused by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- extension/logger.js ready for import by all Phase 4 split modules (background-auth.js, background-outreach.js, etc.)
- window.ReachLogger available for content script modules once loaded via manifest content_scripts
- Plans 04-02, 04-03, 04-04 can now import { logger } from './logger.js'

---
*Phase: 04-extension-refactor*
*Completed: 2026-03-16*
