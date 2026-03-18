# Phase 12: Extension Panel Restore - Research

**Researched:** 2026-03-17
**Domain:** Chrome MV3 content script — DOM panel mounting, message passing, shadow DOM
**Confidence:** HIGH

## Summary

The compose panel is almost entirely already built. `compose-widget.js` contains a complete, working implementation: `openComposePanel()` creates a shadow-DOM panel lazily and mounts it to `document.documentElement`, handles tab switching, wires up all three tabs (Overview, Find Contacts, Draft AI), and exposes the function publicly via `window.ReachWidget.openComposePanel`. The widget click handler in `getOrCreateWidget` (line 181–184) already calls `openComposePanel(editorEl)` directly.

The disconnect is that `content.js`'s `chrome.runtime.onMessage` listener handles `OPEN_PANEL` messages and calls `window.ReachWidget.openComposePanel(editor)` — but `background.js`'s `chrome.action.onClicked` handler (line 46–66) sends `TOGGLE_SIDEBAR`, not `OPEN_PANEL`. So clicking the extension icon opens the sidebar (`sidebar.js`) instead of the compose panel. The widget click path (line 181–184 in `compose-widget.js`) is fully wired already — that part works.

The three tab implementations are complete and correct. The background.js handlers for `FIND_CONTACT` (line 149) and `DRAFT_EMAIL` (line 170) are working. Server endpoints `/find-email` and `/draft-email` are live. The only work for this phase is: (1) decide what the extension icon click should do on Gmail vs. non-Gmail pages, (2) clean up the dead `.settings` CSS in `popup.html`, and (3) confirm the widget click path works end-to-end with the panel visible.

**Primary recommendation:** Wire `chrome.action.onClicked` in `background.js` to send `OPEN_PANEL` (not `TOGGLE_SIDEBAR`) on Gmail tabs, keeping `TOGGLE_SIDEBAR` for non-Gmail tabs. No new code needed in `compose-widget.js` — the panel is already built and connected to widget clicks.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXT-V2-01 | Compose panel is mountable from widget click and extension icon click; panel renders with three tabs (Overview, Find Contacts, Draft with AI) | Widget click already calls `openComposePanel` (line 181-184 in compose-widget.js). Extension icon needs `background.js` `onClicked` to send `OPEN_PANEL` on Gmail tabs. Panel HTML, CSS, and tab wiring exist in `buildComposePanel()` / `getPanelHTML()`. |
| EXT-V2-02 | Overview tab shows live sent/replied/rate stats and a functional Auto/On/Off tracking toggle pill that persists across tabs | `setupOverviewTab()` sends `GET_STATS` + `GET_RECENT` to background.js (handlers exist at lines 75-88, 118-131). Toggle pill updates `editorManualModes` and persists via `chrome.storage.local.set({ trackingDefault })`. All logic present. |
| EXT-V2-03 | Find Contacts tab calls server `/find-email` and displays results; Draft with AI tab calls server `/draft-email` and inserts generated text into compose window | `setupFindTab()` sends `FIND_CONTACT` msg; `setupDraftTab()` sends `DRAFT_EMAIL` msg. Both handlers exist in `background.js` (lines 149, 170) and call `serverFetch`. Insert uses `execCommand('insertText')`. All wired. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Chrome MV3 APIs | MV3 | `chrome.runtime.onMessage`, `chrome.action.onClicked`, `chrome.scripting` | Extension platform |
| Shadow DOM | Web standard | Panel isolation from Gmail page styles | Prevents CSS collision with Gmail |
| `chrome.storage.local` | MV3 | Persist `trackingDefault` across panel open/close | Already used for tracking state |

### No New Dependencies
This phase adds no new npm packages or external libraries. All required browser APIs are already in use.

## Architecture Patterns

### How the Existing Panel System Works

```
chrome.action.onClicked (background.js)
  └── sendMessage({ type: 'TOGGLE_SIDEBAR' }) → sidebar.js  [current — wrong for Gmail]

chrome.runtime.onMessage (content.js, line 99-105)
  └── msg.type === 'OPEN_PANEL'
      └── window.ReachWidget.openComposePanel(editor)  [already handles the message]

widget click (compose-widget.js, line 181-184)
  └── openComposePanel(editorEl)  [already wired correctly]
```

### Fix Pattern: Branch on Tab URL in `background.js`

The `chrome.action.onClicked` handler must detect whether the active tab is a Gmail tab and send `OPEN_PANEL` vs. `TOGGLE_SIDEBAR` accordingly:

```javascript
// In background.js chrome.action.onClicked handler:
const isGmail = tab.url && tab.url.startsWith('https://mail.google.com/');
const msgType = isGmail ? 'OPEN_PANEL' : 'TOGGLE_SIDEBAR';
chrome.tabs.sendMessage(tab.id, { type: msgType }, () => { ... });
```

The `executeScript` fallback injection (lines 53-65) also needs to send `OPEN_PANEL` vs. `TOGGLE_SIDEBAR` based on the same condition.

### Panel Lifecycle

```
openComposePanel(editorEl) [compose-widget.js line 1081]
  ├── If no host: buildComposePanel() → appended to document.documentElement
  ├── If visible AND same editor: hide (toggle off)
  └── Else: setEditor(editorEl) + show
      ├── updateTrackToggle(current mode)
      ├── loadOverviewData() [GET_STATS + GET_RECENT]
      └── prefillDraftTab() [if draft tab active]
```

### Shadow DOM Isolation Pattern
```javascript
// compose-widget.js line 1003-1006
const host = document.createElement('div');
host.id = 'reach-compose-panel-host';
host.style.display = 'none';
const shadow = host.attachShadow({ mode: 'closed' });
```
Gmail's aggressive CSP and style overrides require shadow DOM. The panel uses `mode: 'closed'` — consistent with `panel.js` which uses the same pattern. Key Gmail input interception is handled at lines 1009-1011 (stopPropagation on keydown/keyup/keypress).

### Anti-Patterns to Avoid
- **Rebuilding the panel**: `buildComposePanel()` is called once; subsequent `openComposePanel()` calls reuse the existing host. Don't rebuild on each click.
- **Using `innerHTML` for user content**: The panel uses `_cpEscapeHtml()` for all user-derived values. Continue this pattern.
- **Appending to `document.body`**: The panel appends to `document.documentElement` (not body) to survive Gmail's DOM mutations. Don't change the mount point.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab URL detection | Custom tab query | `tab.url` from `onClicked` callback | `tab` object provided directly by Chrome |
| Gmail key blocking | Custom event proxy | Existing `stopPropagation` on host | Already in `buildComposePanel` lines 1009-1011 |
| Favicon fetching | Custom favicon service | `https://www.google.com/s2/favicons?domain=X&sz=64` | Already used in `setupFindTab` line 722 |
| Draft insert | `innerHTML` injection | `execCommand('insertText')` | Already implemented, preserves Gmail composer state |

## Common Pitfalls

### Pitfall 1: Sending Wrong Message Type for Gmail vs. Non-Gmail
**What goes wrong:** `TOGGLE_SIDEBAR` sent on a Gmail tab tries to toggle `sidebar.js`; since both `sidebar.js` and `compose-widget.js` are injected, it opens the sidebar instead of the compose panel.
**Why it happens:** The current `onClicked` handler sends `TOGGLE_SIDEBAR` unconditionally.
**How to avoid:** Check `tab.url.startsWith('https://mail.google.com/')` before choosing message type. Note `tab.url` requires the tab object from the callback — it's available because `onClicked` provides the active tab.
**Warning signs:** Extension icon click opens sidebar list instead of the floating compose panel.

### Pitfall 2: Stale `lastActiveEditor` Reference
**What goes wrong:** Panel opens with `null` editor if no compose window is open; Draft AI tab shows "Open a compose window" empty state.
**Why it happens:** `lastActiveEditor` in `content.js` is set on widget click (line 182) but may be null if extension icon is clicked without a compose window open.
**How to avoid:** The existing `content.js` message handler already handles this correctly (lines 101-104): it checks `document.body.contains(lastActiveEditor)` and passes `null` if stale. The panel's `setEditor(null)` path shows the empty state in Draft tab — this is correct behavior.
**Warning signs:** JavaScript error accessing `editorEl.closest()` on null.

### Pitfall 3: `_state` is null During Panel Build
**What goes wrong:** `openComposePanel` is called before `ReachWidget.init()` sets `_state`, causing null-pointer errors in `updateTrackToggle`.
**Why it happens:** Could happen if `OPEN_PANEL` message arrives before `initStorageListeners` completes.
**How to avoid:** The existing `getOrCreateWidget` guard (lines 172-174) returns null if `_state` is null. `openComposePanel` must similarly guard — it calls `buildComposePanel` which calls `_state.editorManualModes.get(...)`. In practice `init()` always runs synchronously before any message can arrive, but this is worth verifying.
**Warning signs:** `TypeError: Cannot read properties of null (reading 'editorManualModes')`.

### Pitfall 4: Dead CSS in popup.html Not Removed
**What goes wrong:** `.settings`, `.field`, `.save-btn`, `.save-status` CSS classes (popup.html lines 107-165) reference functionality that was removed when the server took over Hunter/Gemini key storage. The HTML body has no corresponding elements, so the CSS is inert dead weight.
**Why it happens:** The settings HTML was removed from the body but the style block was left in `<head>`.
**How to avoid:** Remove the `.settings`, `.field`, `.save-btn`, `.save-status`, and related CSS rules from popup.html. The `<body>` has no settings HTML, so this is a CSS-only cleanup.
**Warning signs:** Code review noting unused CSS rules; popup.html style block still contains `.settings` class definitions.

## Code Examples

### Current `onClicked` Handler (background.js lines 46-66)
```javascript
// Source: /extension/background.js
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' }, () => {
    const err = chrome.runtime.lastError;
    if (!err?.message?.includes('Could not establish connection')) return;
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        files: ['logger.js', 'email-detector.js', 'compose-widget.js', 'tracking.js', 'content.js', 'sidebar.js'],
      },
      () => {
        if (chrome.runtime.lastError) return;
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' }, () => {
          void chrome.runtime.lastError;
        });
      }
    );
  });
});
```

### `OPEN_PANEL` Message Handler (content.js lines 99-105)
```javascript
// Source: /extension/content.js — already handles OPEN_PANEL correctly
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'OPEN_PANEL') return;
  const editor = lastActiveEditor && document.body.contains(lastActiveEditor)
    ? lastActiveEditor
    : null;
  window.ReachWidget.openComposePanel(editor);
});
```

### Widget Click Already Calls Panel (compose-widget.js lines 181-184)
```javascript
// Source: /extension/compose-widget.js — widget click path is already correct
w.addEventListener('click', () => {
  _state.lastActiveEditor = editorEl;
  openComposePanel(editorEl);
});
```

### `openComposePanel` Entry Point (compose-widget.js lines 1081-1101)
```javascript
// Source: /extension/compose-widget.js
function openComposePanel(editorEl) {
  if (!_composePanelHost) {
    const panel = buildComposePanel();
    _composePanelHost          = panel.host;
    _composePanelSetEditor     = panel.setEditor;
    _composePanelSyncTrackMode = panel.syncTrackMode;
    document.documentElement.appendChild(_composePanelHost);
  }
  const alreadyVisible = _composePanelHost.style.display !== 'none';
  const sameEditor     = _composePanelCurrentEditor === editorEl;
  if (alreadyVisible && sameEditor) {
    _composePanelHost.style.display = 'none';
    return;
  }
  _composePanelCurrentEditor = editorEl;
  _composePanelSetEditor(editorEl);
  _composePanelHost.style.display = '';
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hunter.io key stored in extension popup | Server holds `HUNTER_KEY` in `.env`; popup settings removed | Phase 4 refactor | Dead settings CSS in popup.html must be removed |
| `TOGGLE_SIDEBAR` for all icon clicks | Must branch: `OPEN_PANEL` for Gmail, `TOGGLE_SIDEBAR` elsewhere | Phase 4 (b396183) | Extension icon click broken on Gmail |
| Compose panel mounted from entry point | Panel self-mounts via `openComposePanel` in compose-widget.js | Phase 4 (b396183) | Widget click works; icon click does not |

**Deprecated/outdated:**
- Dead `.settings` CSS block in popup.html: The HTML body no longer has settings inputs since the server took over key management. The CSS is inert but should be cleaned up.

## Open Questions

1. **Does the extension icon click on a non-Gmail page still need to open the sidebar?**
   - What we know: `background.js` currently sends `TOGGLE_SIDEBAR` unconditionally; `sidebar.js` is injected on Gmail only.
   - What's unclear: If the user is on a non-Gmail page when they click the icon, `sidebar.js` may not be injected.
   - Recommendation: The `onClicked` handler already handles "could not establish connection" via script injection fallback. For non-Gmail pages, `TOGGLE_SIDEBAR` behavior is already working or gracefully failing. The branch logic only needs to apply when `tab.url` is Gmail.

2. **Should `panel.js` (the non-Gmail floating stats panel) be affected?**
   - What we know: `panel.js` is injected by the `executeScript` fallback for non-Gmail tabs. It uses `TOGGLE_SIDEBAR` to determine injection path.
   - What's unclear: Whether `panel.js` is still needed now that the compose panel handles Gmail.
   - Recommendation: Leave `panel.js` alone — it serves non-Gmail tabs (quick stats panel). Only Gmail tabs should route to `OPEN_PANEL`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) |
| Config file | none — tests discovered via glob in package.json `test` script |
| Quick run command | `node --env-file=server/.env.test --test extension/compose-widget.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXT-V2-01 | `openComposePanel` builds host + appends to document; panel has three tabs | manual-only | — | N/A — DOM-dependent |
| EXT-V2-02 | Tracking toggle persists mode to `chrome.storage.local` | manual-only | — | N/A — requires Chrome runtime |
| EXT-V2-03 | `FIND_CONTACT` message dispatched with correct payload; `DRAFT_EMAIL` dispatched with correct payload | manual-only | — | N/A — requires Chrome runtime |

**Note on test coverage for this phase:** The compose panel code relies entirely on `chrome.runtime.sendMessage`, `chrome.storage.local`, Shadow DOM APIs, and the Gmail DOM — none of which are available in the Node.js test environment. The existing extension tests (classifier, reply-checker, text-utils) only cover pure utility functions that have no browser dependencies. This phase's behavior is verified through manual end-to-end testing in the extension, not automated unit tests.

### Sampling Rate
- **Per task commit:** Manual smoke test: load extension on Gmail, open compose window, click widget, verify panel appears with three tabs
- **Per wave merge:** Full `npm test` (ensures no regressions in pure utility tests)
- **Phase gate:** Manual end-to-end confirmation of all four success criteria before `/gsd:verify-work`

### Wave 0 Gaps
- None — no new test files needed. Existing `npm test` suite covers unrelated utilities and will continue to pass. Panel behavior is manual-only due to Chrome API dependency.

## Sources

### Primary (HIGH confidence)
- Direct code reading: `/extension/compose-widget.js` (complete file, 1131 lines) — panel build, tab setup, openComposePanel API
- Direct code reading: `/extension/content.js` — OPEN_PANEL message handler, boot sequence
- Direct code reading: `/extension/background.js` — onClicked handler, FIND_CONTACT/DRAFT_EMAIL/GET_STATS/GET_RECENT message handlers
- Direct code reading: `/extension/panel.js` — reference non-Gmail panel structure
- Direct code reading: `/extension/popup.html` — dead settings CSS confirmed (body has no settings elements)
- Direct code reading: `/extension/manifest.json` — content script injection order, permissions

### Secondary (MEDIUM confidence)
- Git history reference: commit `b396183` "feat(04-03): rewrite content.js as orchestrator" identified as the disconnect point (from pre-investigated findings)

## Metadata

**Confidence breakdown:**
- What's broken: HIGH — direct code reading confirms widget click works; icon click sends wrong message type
- Fix scope: HIGH — `background.js` onClicked is a 2-line change; popup.html CSS cleanup is mechanical
- Tab implementations: HIGH — all three tabs fully implemented and internally consistent in compose-widget.js
- Background handlers: HIGH — FIND_CONTACT, DRAFT_EMAIL, GET_STATS, GET_RECENT all present and working

**Research date:** 2026-03-17
**Valid until:** Stable — this is a self-contained codebase with no external versioning risk
