---
phase: 13-compose-widget-panel-sync
verified: 2026-03-18T00:00:00Z
status: human_needed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "Open two Gmail compose windows and observe widget placement"
    expected: "Widget appears only on the most-recently-focused compose window; opening compose B causes widget to disappear from A"
    why_human: "Cannot execute Chrome extension content scripts in static analysis; requires live browser with unpacked extension"
  - test: "Close the most-recently-focused compose window"
    expected: "Widget reappears on the remaining open compose window automatically"
    why_human: "Requires live DOM removal event to trigger the promotion loop in updateWidget()"
  - test: "Open sidebar panel on an active compose, then open a new compose window"
    expected: "The tracking toggle in the already-open sidebar panel updates to reflect the new compose's mode without closing and reopening the panel"
    why_human: "Requires observing reactive syncTrackMode() call in a live browser session"
  - test: "On a non-Gmail page, click the Reach extension icon"
    expected: "Sidebar opens with three tabs: Overview, Find Contacts, Draft AI. Draft AI tab shows 'Open a compose window to use this feature.' with no form."
    why_human: "Requires live extension runtime on a non-Gmail page"
  - test: "Toggle tracking Off in the non-Gmail sidebar, close, reopen"
    expected: "Tracking toggle opens in Off state (chrome.storage persisted the choice)"
    why_human: "Requires live chrome.storage.local read across sidebar open/close cycles"
  - test: "Change tracking toggle on a Gmail tab; switch to a non-Gmail tab and open the sidebar"
    expected: "The non-Gmail sidebar tracking toggle reflects the mode set on Gmail tab (storage.onChanged sync)"
    why_human: "Requires cross-tab chrome.storage.onChanged propagation in a live browser"
---

# Phase 13: Compose Widget & Panel Sync — Verification Report

**Phase Goal:** Widget focus tracks the most-recent compose window, the sidebar tracking toggle syncs dynamically to new compose windows, and the non-Gmail sidebar matches the Gmail compose panel's three-tab layout
**Verified:** 2026-03-18
**Status:** human_needed — all automated checks passed; browser verification required
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Widget appears only on the most-recently-focused compose window | VERIFIED (automated) | `compose-widget.js:225-226` — `const isActive = (_state.lastActiveEditor === editorEl); w.style.display = isActive ? '' : 'none';` |
| 2 | Closing the active compose promotes the widget to the next live compose | VERIFIED (automated) | `compose-widget.js:200-209` — DOM-removal branch scans `_state.liveEditors`, sets `lastActiveEditor`, calls `updateWidget()` on promoted editor |
| 3 | Panel open + new compose opens → tracking toggle syncs without manual close/reopen | VERIFIED (automated) | `email-detector.js:31,35` — `state.lastActiveEditor = el` set before `update(el)`, then `window.ReachWidget.syncTrackMode()` called unconditionally |
| 4 | Non-Gmail sidebar shows three tabs: Overview, Find Contacts, Draft AI | VERIFIED (automated) | `sidebar.js:237-295` — three `<button class="tab">` elements and matching `<div class="tab-panel">` sections present in shadow DOM HTML |
| 5 | Draft AI tab shows disabled state; Overview tracking toggle persists; Find Contacts sends FIND_CONTACT | VERIFIED (automated) | `sidebar.js:291-295` (draft msg), `sidebar.js:347-357` (storage read/write), `sidebar.js:382-384` (FIND_CONTACT sendMessage) |

**Score:** 5/5 truths verified (automated static checks)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `extension/compose-widget.js` | Widget visibility gating; active-editor promotion | VERIFIED | `isActive` gating at line 225; promotion loop at lines 200-209; pattern `w.style.display.*isActive` confirmed |
| `extension/email-detector.js` | `lastActiveEditor` pre-set before `update()`; `syncTrackMode()` on attach | VERIFIED | `state.lastActiveEditor = el` at line 31 (before `update()` at line 34); `syncTrackMode()` at line 35 |
| `extension/sidebar.js` | Three-tab shadow DOM panel; `sb-panel-overview`; disabled draft tab; `trackingDefault` storage sync | VERIFIED | All elements present; uses `sb-` prefix (not `cp-`) per intentional decision documented in SUMMARY |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `email-detector.js attachToEditor()` | `compose-widget.js updateWidget()` | `state.lastActiveEditor = el` set at line 31, then `ReachWidget.update(el)` at line 34 | WIRED | Order is correct — visibility gating reads `lastActiveEditor` synchronously in `updateWidget()` |
| `email-detector.js attachToEditor()` | `compose-widget.js syncTrackMode()` | `ReachWidget.syncTrackMode()` called at line 35, unconditionally after `update()` | WIRED | Optional chaining in compose-widget.js makes this a safe no-op when panel is closed |
| `compose-widget.js updateWidget()` | widget DOM `display` property | `w.style.display = isActive ? '' : 'none'` at line 226 | WIRED | `isActive` derived from `_state.lastActiveEditor === editorEl` at line 225 |
| `sidebar.js TOGGLE_SIDEBAR handler` | `buildSidebar()` shadow DOM panel | `showSidebar()` at line 439 calls `buildSidebar()` on first open, then sets `host.style.display = ''` | WIRED | Handler at line 504-512 calls `showSidebar()` / `hideSidebar()` |
| `sidebar.js tracking toggle buttons` | `chrome.storage.local` | `chrome.storage.local.set({ trackingDefault: mode })` at line 355 | WIRED | Click handler wired at lines 351-357; initial state read at lines 347-349 |
| `sidebar.js chrome.storage.onChanged` | tracking toggle UI | `if ('trackingDefault' in changes)` at line 525; calls `_updateTrackToggle(...)` at line 527 | WIRED | `_updateTrackToggle` is a module-level variable set inside `buildSidebar()` at line 331 — safe call pattern confirmed |
| `sidebar.js Find Emails button` | `FIND_CONTACT` message | `chrome.runtime.sendMessage({ type: 'FIND_CONTACT', ... })` at line 382 | WIRED | Domain validation guard at line 372-377; results rendered at lines 400-422 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UI-SYNC-01 | 13-01-PLAN.md | Widget shows only on most-recently-focused compose window | SATISFIED | `isActive` display gating in `updateWidget()` (line 225-226); `lastActiveEditor` pre-set in `attachToEditor()` (line 31); active-editor promotion on close (lines 200-209) |
| UI-SYNC-02 | 13-01-PLAN.md | Sidebar tracking toggle auto-syncs when new compose opens while panel is open | SATISFIED | `syncTrackMode()` called unconditionally in `attachToEditor()` at line 35; `syncTrackMode` in `focus` listener at line 40 |
| UI-SYNC-03 | 13-02-PLAN.md | Non-Gmail sidebar shows three-tab panel matching Gmail compose panel design | SATISFIED | Full three-tab shadow DOM panel in `sidebar.js`; draft disabled state at line 293; storage sync at line 525-528 |

**Note on REQUIREMENTS.md traceability:** UI-SYNC-01, UI-SYNC-02, and UI-SYNC-03 are defined exclusively in ROADMAP.md Phase 13 — they do not appear in `.planning/REQUIREMENTS.md` which covers v1.1 requirements only (phases 8-12). This is consistent with Phase 13 being a post-v1.1 phase. No orphaned requirements found.

---

## Artifact Detail: `cp-panel-overview` vs `sb-panel-overview`

The PLAN artifact check specified `contains: "cp-panel-overview"`. The implementation uses `id="sb-panel-overview"`. This is an intentional and correct deviation: the SUMMARY documents the decision — "sidebar.js uses `sb-` prefixed IDs to avoid collisions with compose-widget.js `cp-` prefixed IDs." The functional requirement (Overview tab panel exists and is rendered) is fully satisfied. This is not a gap.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None | — | — | No TODO/FIXME/placeholder comments or empty implementations found in any of the three modified files |

---

## Human Verification Required

All automated static checks pass. The following behaviors require browser testing with the unpacked extension loaded in Chrome.

### 1. Widget Focus — Multi-Compose Visibility

**Test:** Open Gmail. Click Compose to open window A. Click Compose again to open window B. Observe which window shows the Reach widget.
**Expected:** Widget is visible on window B (most recently focused). Window A shows no widget.
**Why human:** Requires live Chrome extension context with DOM rendering — cannot simulate with static analysis.

### 2. Widget Promotion on Compose Close

**Test:** With two compose windows open (widget on the most recent), close the active compose.
**Expected:** Widget automatically reappears on the remaining compose window.
**Why human:** Requires the browser's MutationObserver + DOM removal event to fire the `updateWidget()` promotion loop.

### 3. Panel Tracking Toggle Auto-Sync

**Test:** Open one compose window. Click the Reach widget to open the panel. Open a second compose window without closing the panel.
**Expected:** The tracking toggle in the panel updates to reflect the new compose's mode, without requiring a panel close and reopen.
**Why human:** Requires live `syncTrackMode()` → `_composePanelSyncTrackMode?.()` call chain in a running extension.

### 4. Non-Gmail Three-Tab Sidebar

**Test:** Navigate to any non-Gmail page (e.g., google.com). Click the Reach extension icon.
**Expected:** Sidebar opens showing three tabs: Overview, Find Contacts, Draft AI. The Draft AI tab shows only "Open a compose window to use this feature." — no draft form.
**Why human:** Requires extension icon click routing from background.js to sidebar.js TOGGLE_SIDEBAR listener.

### 5. Tracking Toggle Persistence

**Test:** In the non-Gmail sidebar, toggle tracking to Off. Close the sidebar (click X). Click the extension icon to reopen.
**Expected:** Sidebar reopens with tracking toggle showing Off state.
**Why human:** Requires live chrome.storage.local.get() read on sidebar open.

### 6. Cross-Tab Tracking Sync

**Test:** Open Gmail and change tracking toggle to Off in the compose panel. Switch to a non-Gmail tab. Open the Reach sidebar.
**Expected:** The non-Gmail sidebar tracking toggle shows Off, matching the Gmail tab's setting.
**Why human:** Requires chrome.storage.onChanged to fire across tabs — cannot verify in static analysis.

---

## Summary

All five observable truths are structurally satisfied in the codebase:

- **UI-SYNC-01** (widget focus gating): The `isActive` display toggle in `updateWidget()` and the `lastActiveEditor` pre-set in `attachToEditor()` are both present and correctly ordered. The active-editor promotion loop is wired inside the DOM-removal branch.
- **UI-SYNC-02** (tracking toggle auto-sync): `syncTrackMode()` is called unconditionally after `update()` in `attachToEditor()`, covering the "panel already open" case.
- **UI-SYNC-03** (non-Gmail three-tab panel): `sidebar.js` has been completely rewritten with a full three-tab shadow DOM panel, matching the visual structure of the Gmail compose panel. The draft tab is permanently disabled. Tracking toggle reads/writes chrome.storage. storage.onChanged keeps it in sync across tabs.

No gaps or blockers found. Automated checks pass. Browser verification required to confirm the runtime behavior is correct.

---

_Verified: 2026-03-18_
_Verifier: Claude (gsd-verifier)_
