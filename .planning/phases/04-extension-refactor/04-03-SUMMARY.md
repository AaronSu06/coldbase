---
phase: 04-extension-refactor
plan: "03"
subsystem: extension
tags: [refactor, extension, content-scripts, modularization, logging]
dependency_graph:
  requires: [04-01]
  provides: [email-detector.js, compose-widget.js, tracking.js, content.js orchestrator]
  affects: [extension/manifest.json, extension/content.js]
tech_stack:
  added: []
  patterns: [classic-script IIFE namespace, window.Reach* module pattern, state-object injection]
key_files:
  created:
    - extension/email-detector.js
    - extension/compose-widget.js
    - extension/tracking.js
  modified:
    - extension/content.js
    - extension/manifest.json
decisions:
  - content.js state object exposes savedTrackingDefault and pendingTrackingId via getters/setters so modules can mutate primitives through the shared reference
  - clearEditorState delegated to compose-widget.js (ReachWidget.clearEditorState) since it only needs WeakMap access via state; content.js clearEditorMaps retained for internal use
  - fireSendToast kept in tracking.js; cross-module calls to ReachWidget.getComposeMetadata and ReachDetector.normalizeHint happen inside a 3-second setTimeout callback (safe post-init)
metrics:
  duration: 6min
  completed_date: "2026-03-16"
  tasks_completed: 2
  files_modified: 5
---

# Phase 04 Plan 03: Content Script Split Summary

Split content.js (1414 lines) into three focused classic-script modules exposing window.Reach* namespaces, with content.js reduced to a lean orchestrator owning shared state and boot sequencing.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create email-detector.js, compose-widget.js, tracking.js | cbff97c | +3 new files |
| 2 | Rewrite content.js as orchestrator and update manifest.json | b396183 | content.js, manifest.json |

## What Was Built

**email-detector.js (window.ReachDetector)**
- `normalizeHint`, `requestKeywordScore`, `attachToEditor`, `scanForEditors`
- `checkForSendToast`, `scanForSendToast`
- DOM observer, periodic scan interval, resize handler
- Extension context health check (setInterval after 10s)
- Public API: `{ init, scanForEditors, normalizeHint }`

**compose-widget.js (window.ReachWidget)**
- `_cpEscapeHtml`, `_cpRelativeDate` (silent catch fixed to `log.debug`)
- `injectStyles`, `getComposeContainer`, `getComposeMetadata`
- `detectNeighborRect`, `placeWidget`, `getOrCreateWidget`, `updateWidget`
- Full compose panel: `PANEL_STYLES`, `getPanelHTML`, `setupOverviewTab`, `setupFindTab`, `setupDraftTab`, `buildComposePanel`, `openComposePanel`
- `clearEditorState` (delegates WeakMap cleanup via state)
- Public API: `{ init, attach, update, openComposePanel, syncTrackMode, clearEditorState, getComposeContainer, getComposeMetadata, placeWidget }`

**tracking.js (window.ReachTracking)**
- `generateTrackingId`, `injectTrackingPixel`, `watchSendButton`
- `fireSendToast`, `showReloadBanner`
- Public API: `{ init, watchSendButton, fireSendToast, generateTrackingId, injectTrackingPixel, showReloadBanner }`

**content.js (orchestrator)**
- `window.__reachLoaded` guard at top
- `isEmailClient` check
- All shared WeakMaps, WeakSet, Set, primitive vars
- `state` object with getters/setters for primitive values
- `clearEditorMaps(el)` cleanup function
- `initStorageListeners()` — chrome.storage integration
- `chrome.runtime.onMessage` listener for OPEN_PANEL
- Boot: `ReachDetector.init(state); ReachWidget.init(state); ReachTracking.init(state);`

**manifest.json**
- Gmail content_scripts js array: `["logger.js", "email-detector.js", "compose-widget.js", "tracking.js", "content.js", "sidebar.js"]`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] State object extended with savedTrackingDefault and pendingTrackingId getters/setters**
- **Found during:** Task 1 implementation
- **Issue:** `savedTrackingDefault` and `pendingTrackingId` are primitives in content.js; passing them by value in the state object would break mutation from modules
- **Fix:** Added getter/setter pairs for both primitives in the state object so module writes are reflected in content.js scope
- **Files modified:** extension/content.js, extension/tracking.js, extension/compose-widget.js

**2. [Rule 1 - Bug] updateWidget called with no matchCount argument in storage listener**
- **Found during:** Task 2 rewrite of initStorageListeners
- **Issue:** Original `updateWidget(el, editorAutoScores.get(el) || 0)` always needed the current score; in the new module, `update(el)` with no score should use the stored score
- **Fix:** `updateWidget` in compose-widget.js treats `undefined` matchCount as "use stored score" — reads `editorAutoScores.get(editorEl)` when matchCount is not provided
- **Files modified:** extension/compose-widget.js

## Verification Results

All checks passed:
- No raw console.log/warn/error in any of the four files
- No silent catch {} blocks
- No ES module imports in content-script files
- manifest.json load order: logger.js → email-detector.js → compose-widget.js → tracking.js → content.js → sidebar.js
- window.ReachDetector, window.ReachWidget, window.ReachTracking all assigned
- content.js contains __reachLoaded guard, ReachDetector.init, ReachWidget.init, ReachTracking.init calls

## Self-Check: PASSED
