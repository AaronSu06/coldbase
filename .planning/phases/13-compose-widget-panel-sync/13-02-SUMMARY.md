---
phase: 13-compose-widget-panel-sync
plan: 02
subsystem: extension
tags: [sidebar, chrome-extension, shadow-dom, ui, tracking]
dependency_graph:
  requires: []
  provides: [three-tab-non-gmail-sidebar]
  affects: [extension/sidebar.js]
tech_stack:
  added: []
  patterns: [shadow-dom-closed-mode, chrome-storage-sync, chrome-runtime-message]
key_files:
  created: []
  modified:
    - extension/sidebar.js
decisions:
  - _updateTrackToggle exposed at module scope via let variable set inside buildSidebar so storage.onChanged handler can call it without closure issues
  - sidebar.js uses sb- prefixed IDs to avoid collisions with compose-widget.js cp- prefixed IDs
  - Draft tab permanently in disabled state — no form or event listeners, just status-msg div
  - loadRecent() called on sidebar open and on Overview tab switch for freshness without over-fetching
metrics:
  duration: ~7min
  completed_date: "2026-03-18"
  tasks_completed: 1
  files_modified: 1
---

# Phase 13 Plan 02: Non-Gmail Sidebar Three-Tab Panel Summary

Three-tab shadow DOM panel for non-Gmail pages using inline chrome.runtime.sendMessage to mirror the Gmail compose panel's visual design.

## What Was Built

Rewrote `extension/sidebar.js` from a minimal stats-only panel to a full three-tab sidebar matching the Gmail compose panel's visual design. The rewrite:

- **Overview tab** — stats (Sent/Replied/Reply Rate) loaded via GET_STATS, tracking toggle persisted to `chrome.storage.local` with On/Off buttons, Recent list loaded via GET_RECENT, Open Dashboard button
- **Find Contacts tab** — domain/name inputs wired to FIND_CONTACT message, results rendered as email rows with Copy buttons
- **Draft AI tab** — permanently disabled state, showing "Open a compose window to use this feature." — no form, no event listeners
- **Storage sync** — `chrome.storage.onChanged` handler calls `_updateTrackToggle` to keep the toggle in sync when Gmail tabs change the tracking mode

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewrite sidebar.js with three-tab panel | 8a4d34f | extension/sidebar.js |

## Deviations from Plan

None — plan executed exactly as written.

## Success Criteria Verification

- Non-Gmail sidebar renders three tabs that match the Gmail compose panel's visual design: YES
- Draft AI tab shows disabled state message, never the draft form: YES ("Open a compose window to use this feature.")
- Overview tracking toggle persists via chrome.storage and syncs with changes from Gmail tabs: YES (_updateTrackToggle + storage.onChanged)
- Find Contacts tab accepts input and sends FIND_CONTACT message: YES

## Self-Check: PASSED

- `extension/sidebar.js` — FOUND (8a4d34f)
- Key artifacts verified: `sb-panel-overview`, `Open a compose window to use this feature.`, `trackingDefault`, `_updateTrackToggle`, `TOGGLE_SIDEBAR`, `Find Emails` button, `position:fixed; right:0; top:72px`
