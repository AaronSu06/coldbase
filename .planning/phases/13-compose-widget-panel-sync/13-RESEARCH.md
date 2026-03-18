# Phase 13: Compose Widget & Panel Sync - Research

**Researched:** 2026-03-18
**Domain:** Chrome Extension MV3 — Content Script DOM observation, multi-compose focus tracking, cross-context message sync
**Confidence:** HIGH

---

## Summary

Phase 13 fixes three distinct but related synchronization bugs in the Gmail extension. All three live entirely within the extension's content-script layer (`compose-widget.js`, `email-detector.js`, `sidebar.js`) and the background service worker (`background.js`). No server-side or React web-app changes are required.

**Problem 1 (Widget focus):** `lastActiveEditor` in `content.js` shared state is set correctly on `focus` and `input` events, but the widget itself is rendered on ALL live editors via `editorWidgets` WeakMap. There is no mechanism to show the widget only on the most-recently-focused compose window and hide it on the others. The fix is a visibility rule: only the widget belonging to `lastActiveEditor` is fully visible; all others are hidden (or shown with reduced opacity/pointer-events:none so they do not interfere).

**Problem 2 (Sidebar tracking toggle not syncing to new compose):** `sidebar.js` sends `TOGGLE_SIDEBAR` which triggers `showSidebar()` / `hideSidebar()`. The sidebar's tracking toggle is inside the compose panel (`compose-widget.js`) — NOT in `sidebar.js`. The actual issue is that when the sidebar is already open and a new compose editor attaches, `syncTrackMode()` in `compose-widget.js` is never called for that new editor because `lastActiveEditor` does not get propagated to the open panel. The fix is: inside `attachToEditor()` in `email-detector.js`, after setting `lastActiveEditor`, call `window.ReachWidget.syncTrackMode()` if the compose panel is already visible.

**Problem 3 (Non-Gmail sidebar):** On non-Gmail pages, `background.js` sends `TOGGLE_SIDEBAR` which triggers `sidebar.js`. The current `sidebar.js` renders a minimal stats-only panel (header + 3 stats + "Open Dashboard" button). It does NOT match the full three-tab compose panel in `compose-widget.js`. The fix is to replace the non-Gmail sidebar HTML with a full three-tab layout identical to the Gmail compose panel, except the "Draft with AI" tab shows a disabled/greyed state with the message "Open a compose window to use this feature."

**Primary recommendation:** Make targeted, surgical edits to three files — `email-detector.js`, `compose-widget.js`, and `sidebar.js` — with no architecture changes. The existing state model (`liveEditors`, `lastActiveEditor`, `editorWidgets`, shadow DOM panels) is sound.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-SYNC-01 | Widget appears only on the most-recent (active) compose window; when that compose is closed/minimized, widget moves to the next most-recent | Widget visibility logic in `compose-widget.js` `updateWidget()` + `liveEditors` Set iteration |
| UI-SYNC-02 | When sidebar panel is already open and a new compose opens, tracking toggle in sidebar syncs without manual close/reopen | `attachToEditor()` must call `syncTrackMode()` when compose panel is visible; `syncTrackMode()` already reads `lastActiveEditor` correctly |
| UI-SYNC-03 | Non-Gmail sidebar is identical to Gmail sidebar layout (Overview + Find Contacts + Draft with AI), with Draft tab showing disabled state when no compose window is available | Replace `sidebar.js` panel HTML with the three-tab layout from `compose-widget.js` getPanelHTML; disable Draft tab |
</phase_requirements>

---

## Standard Stack

### Core (no new dependencies needed)

| Component | Current | Purpose | Notes |
|-----------|---------|---------|-------|
| `compose-widget.js` | Existing | Widget rendering + compose panel | All three issues touch this file |
| `email-detector.js` | Existing | DOM observation + editor attachment | UI-SYNC-02 fix lives here |
| `sidebar.js` | Existing | Non-Gmail sidebar panel | UI-SYNC-03 requires full rewrite of panel HTML |
| `content.js` | Existing | Shared state owner | Read-only for this phase |
| Shadow DOM (closed) | Existing | Style isolation | Already used correctly |

**No npm installs required.** All fixes are vanilla JS DOM manipulation within the existing classic-script content-script pattern.

### Constraints from the project's content script pattern

- No ES module imports in content scripts — everything must use `window.ReachXxx` namespaces.
- Scripts execute in manifest order: `logger.js` → `email-detector.js` → `compose-widget.js` → `tracking.js` → `content.js` → `sidebar.js`.
- `sidebar.js` runs last; it can reference `window.ReachWidget` safely.
- The background service worker (`background.js`) uses ES modules — it is NOT modified for this phase.

---

## Architecture Patterns

### Recommended Project Structure (no change needed)

```
extension/
├── logger.js            # Logging namespace (read-only)
├── email-detector.js    # DOM scan + attachToEditor (UI-SYNC-02 fix here)
├── compose-widget.js    # Widget + panel (UI-SYNC-01 fix here)
├── tracking.js          # Pixel injection (read-only)
├── content.js           # Shared state (read-only)
└── sidebar.js           # Non-Gmail sidebar (UI-SYNC-03 full rewrite of panel HTML)
```

### Pattern 1: Widget Visibility via lastActiveEditor (UI-SYNC-01)

**What:** In `updateWidget(editorEl)`, only the widget for `_state.lastActiveEditor` is made fully visible (`pointer-events: auto`, full opacity). All other editor widgets are hidden (`display: none` or `visibility: hidden`, `pointer-events: none`).

**When to use:** Called every time an editor gets focus, every time `scanForEditors` attaches to a new editor, and whenever `lastActiveEditor` changes.

**Key insight:** `liveEditors` is a `Set` of all currently live editor elements. Iterating `liveEditors` in `updateWidget` lets us enforce the "only active editor shows widget" invariant on every render pass.

**Revised `updateWidget` logic:**

```javascript
// Source: analysis of compose-widget.js getOrCreateWidget + updateWidget
function updateWidget(editorEl) {
  if (!_state) return;
  if (!document.body.contains(editorEl)) {
    if (_state.editorWidgets.has(editorEl)) {
      _state.editorWidgets.get(editorEl).remove();
      clearEditorState(editorEl);
    }
    return;
  }

  const w = getOrCreateWidget(editorEl);
  const manualMode = _state.editorManualModes.get(editorEl) || 'force_track';

  if (manualMode === 'force_track') {
    w.classList.add('oiq-tracking-on');
    w.title = 'Reach: tracking ON';
  } else {
    w.classList.remove('oiq-tracking-on');
    w.title = 'Reach: tracking OFF';
  }

  // NEW: Show widget ONLY on the most-recent active editor.
  const isActive = (_state.lastActiveEditor === editorEl);
  w.style.display = isActive ? '' : 'none';
}
```

**When a compose closes:** The MutationObserver in `email-detector.js` already handles DOM removals. When a child node is removed, `updateWidget` is called and the stale element is cleaned from `liveEditors`. The next `lastActiveEditor` is the last editor that fired a `focus` event — no explicit stack is needed because `liveEditors` iteration + focus events already maintain the right state.

**Edge case — first compose opened:** When the first editor attaches, `lastActiveEditor` is null. `attachToEditor` in `email-detector.js` calls `update(el)` AND sets `lastActiveEditor = el`. We must ensure `lastActiveEditor` is set BEFORE `updateWidget` is called, or the widget will be hidden on the only open compose. Fix: set `state.lastActiveEditor = el` inside `attachToEditor` before calling `window.ReachWidget.update(el)`.

### Pattern 2: Sync tracking toggle when panel already open (UI-SYNC-02)

**What:** Inside `attachToEditor()` in `email-detector.js`, after updating `lastActiveEditor`, call `window.ReachWidget.syncTrackMode()` only if the compose panel is currently visible.

**Current flow (broken):**
1. Panel open → `ctx.currentEditorEl` = editor A
2. New compose B opens → `attachToEditor(B)` → sets `lastActiveEditor = B`
3. Panel toggle button clicked → resolves `liveEditor` from `lastActiveEditor` (B) — this lookup IS correct
4. But: the toggle is never called unless the user clicks it — the panel's displayed mode still shows editor A's mode

**Fixed flow:**
1. `attachToEditor(B)` sets `lastActiveEditor = B`
2. Calls `window.ReachWidget.syncTrackMode()` — which reads `lastActiveEditor` (B), updates `ctx.currentEditorEl = B`, refreshes the toggle display

```javascript
// In email-detector.js attachToEditor(), add after state.lastActiveEditor = el:
window.ReachWidget.syncTrackMode(); // refresh panel if already open
```

`syncTrackMode()` in `compose-widget.js` already guards against `_composePanelSyncTrackMode` being null (it uses optional chaining). So calling it before a panel is created is safe.

### Pattern 3: Non-Gmail sidebar with full three-tab layout (UI-SYNC-03)

**What:** Replace the current `sidebar.js` panel HTML with the full three-tab compose panel layout. The Draft tab renders its "no compose window" state by default (showing `cp-draft-empty` and hiding `cp-draft-form`).

**Key differences from the Gmail compose panel:**
- The sidebar does NOT have access to a `currentEditorEl` — it is always null on non-Gmail pages.
- The Draft tab's `prefillDraftTab()` / `setEditor()` logic can be simplified: always show the disabled state ("Open a compose window to use this feature").
- The Find Contacts tab works identically — no compose required.
- The Overview tab works identically — stats are fetched from background.
- The tracking toggle in Overview behaves as a global default setter (no editor to attach it to) — this is fine, `savedTrackingDefault` is what gets persisted.

**Sidebar positioning:** Current `sidebar.js` uses `position: fixed; right: 0; top: 72px`. The Gmail compose panel uses `position: fixed; top: 16px; right: 16px`. For non-Gmail pages, the right-edge panel style (top: 72px, right: 0) is more appropriate since there is no compose window to anchor to. This can be kept.

**Implementation approach:** The simplest path is to replace `buildSidebar()` in `sidebar.js` to inject shadow DOM with the same CSS + HTML as `getPanelHTML()` in `compose-widget.js`, then wire up the same tab switching, tracking toggle, and stats loading. The Draft tab is permanently in "no compose" state.

### Anti-Patterns to Avoid

- **Adding a stack/array to track compose history:** Not needed. `lastActiveEditor` + `liveEditors` Set is sufficient. The focus event listener already updates `lastActiveEditor` on every editor focus.
- **Calling `syncTrackMode()` from a MutationObserver callback directly:** MutationObserver batches mutations — already handled. The call from `attachToEditor()` is the right hook point.
- **Duplicating `setupOverviewTab` / `setupFindTab` / `setupDraftTab` into `sidebar.js`:** These are closures over `_state` which does not exist in `sidebar.js`. Instead, `sidebar.js` should inline equivalent logic using `chrome.runtime.sendMessage` directly (which it already does for stats). The sidebar does not need access to editor state.
- **Modifying `content.js`:** All changes should be confined to the three files above. `content.js` is the shared-state owner; the current state model is correct.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Editor activity ordering | Custom timestamp stack / linked list of editors | `lastActiveEditor` primitive + `focus` event | Single focused editor at a time; no ordering beyond "most recent focus" needed |
| Panel visibility across contexts | Message passing bus | `chrome.storage.onChanged` (already in use) | Already used for scan notifications; no new IPC needed for this phase |
| Non-Gmail sidebar UI framework | React component | Inline shadow DOM HTML (same as `compose-widget.js`) | Consistent with existing pattern; no bundler available in content scripts |

---

## Common Pitfalls

### Pitfall 1: `lastActiveEditor` is null when first editor attaches

**What goes wrong:** `attachToEditor` calls `window.ReachWidget.update(el)` before setting `state.lastActiveEditor = el`. The new `display: none` logic hides the widget because `lastActiveEditor !== editorEl`.

**Why it happens:** Current `attachToEditor` sets `lastActiveEditor` via the `focus` event listener registered on the editor — but the focus event fires asynchronously, after `update(el)` has already run.

**How to avoid:** Set `state.lastActiveEditor = el` at the top of `attachToEditor`, before calling `window.ReachWidget.update(el)`. This is safe because `attachToEditor` is only called for genuinely new editors.

**Warning signs:** Widget invisible when a single compose window is open.

### Pitfall 2: Widget hidden when compose window is minimized (not closed)

**What goes wrong:** Gmail minimizes compose windows but keeps the editor element in the DOM. `document.body.contains(editorEl)` returns true. The widget is hidden because `lastActiveEditor` switched to a different editor (or null).

**Why it happens:** Minimized editors do not fire blur/focus in all Gmail views.

**How to avoid:** The current behavior is actually correct for this phase's requirements: "widget appears only on the most recent active compose." Minimized composes correctly get no widget. If the user re-focuses a minimized compose, the `focus` event updates `lastActiveEditor` and re-shows the widget. No special handling needed.

**Warning signs:** Widget disappears when the user minimizes and reactivates a compose — this is expected behavior.

### Pitfall 3: `syncTrackMode()` called before `_composePanelSyncTrackMode` is set

**What goes wrong:** `syncTrackMode()` in `compose-widget.js` public API does `_composePanelSyncTrackMode?.()`. If the panel has never been opened, `_composePanelSyncTrackMode` is null. The optional-chain makes this a no-op.

**Why it happens:** This is actually safe. The `?.()` guard is already in place.

**How to avoid:** Nothing to do — just rely on the existing guard. Call `window.ReachWidget.syncTrackMode()` from `attachToEditor` without a precondition check.

### Pitfall 4: `sidebar.js` calling `setupOverviewTab` / `setupFindTab` functions that close over `_state`

**What goes wrong:** Those functions are defined inside `compose-widget.js` IIFE and close over `_state` (which is the Gmail compose state). `sidebar.js` cannot access them.

**Why it happens:** Classic script IIFE pattern — no exports.

**How to avoid:** `sidebar.js` must implement its own tab logic inline. It already sends `GET_STATS` via `chrome.runtime.sendMessage`. The same pattern applies to the tracking toggle (persist `trackingDefault` via `chrome.storage.local.set`) and Find Contacts (send `FIND_CONTACT` message). These are ~30–40 lines each, not complex.

### Pitfall 5: Shadow DOM closed mode and the non-Gmail sidebar's tab elements

**What goes wrong:** `shadow = host.attachShadow({ mode: 'closed' })` — element references must be stored at shadow creation time. External `getElementById` calls on the main document will not find shadow-internal elements.

**Why it happens:** Closed shadow DOM is intentional for style isolation.

**How to avoid:** Store references to key elements (`sentEl`, `repliedEl`, `rateEl`, `trackToggleBtns`, etc.) at the time the shadow is constructed. This is already done in `sidebar.js` for stats elements — extend the same pattern to the new tabs.

### Pitfall 6: Non-Gmail sidebar Draft tab insertion button

**What goes wrong:** The `Insert` button in Draft tab references `ctx.currentEditorEl` to insert text. On non-Gmail pages, there is no compose editor.

**Why it happens:** The Draft tab was designed for the Gmail compose panel context.

**How to avoid:** On non-Gmail sidebar: hide the `Insert` button entirely (or disable it permanently). Only show `Copy` button. Alternatively, show the whole Draft tab in permanently-disabled state (just show the "Open a compose window" message). Either approach satisfies UI-SYNC-03.

---

## Code Examples

Verified patterns from existing codebase:

### Setting lastActiveEditor in attachToEditor (fix for UI-SYNC-01 + UI-SYNC-02)

```javascript
// In email-detector.js attachToEditor()
// Source: email-detector.js lines 19-43 (current code)
function attachToEditor(el, state) {
  if (state.observedEditors.has(el)) {
    const existing = state.editorWidgets.get(el);
    if (existing && document.body.contains(existing)) return;
    state.observedEditors.delete(el);
    window.ReachWidget.clearEditorState(el);
  }
  state.observedEditors.add(el);

  // FIX: set lastActiveEditor before update so widget visibility logic sees it
  state.lastActiveEditor = el;                    // NEW LINE

  state.editorManualModes.set(el, state.savedTrackingDefault || 'force_track');
  window.ReachWidget.update(el);
  window.ReachWidget.syncTrackMode();             // NEW LINE — sync panel if open
  window.ReachTracking.watchSendButton(el);

  el.addEventListener('focus', () => {
    state.lastActiveEditor = el;
    window.ReachWidget.syncTrackMode();
  });

  el.addEventListener('input', () => {
    state.lastActiveEditor = el;
  });
}
```

### Widget visibility gating (fix for UI-SYNC-01)

```javascript
// In compose-widget.js updateWidget() — add after building/retrieving widget w
// Source: compose-widget.js updateWidget() (current lines ~189-212)

// Show widget ONLY on the most-recently-focused editor
const isActive = (_state.lastActiveEditor === editorEl);
w.style.display = isActive ? '' : 'none';
```

### Sidebar tracking toggle (for sidebar.js rewrite, UI-SYNC-03)

```javascript
// Pattern: persist trackingDefault the same way compose-widget.js does
// Source: compose-widget.js setupOverviewTab tracking toggle handler (line ~660)
btn.addEventListener('click', () => {
  const mode = btn.dataset.mode;
  updateTrackToggle(mode);
  try { chrome.storage.local.set({ trackingDefault: mode }); } catch (e) {}
});
```

### Non-Gmail sidebar stats load (already in sidebar.js)

```javascript
// Source: sidebar.js loadStats() (current lines ~223-235)
// This pattern is reusable for the new sidebar's Overview tab
function loadStats() {
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      sentEl.textContent = repliedEl.textContent = '—';
      rateEl.textContent = 'unreachable';
      return;
    }
    sentEl.textContent    = response.sent;
    repliedEl.textContent = response.replied;
    rateEl.textContent    = response.rate;
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | Status | Impact |
|--------------|------------------|--------|--------|
| Widget on all editors | Widget only on active editor | Phase 13 target | Users with 2+ composes no longer see clutter |
| Sidebar requires close/reopen to sync | Sidebar syncs on new editor attach | Phase 13 target | Tracking toggle works correctly without restart |
| Non-Gmail sidebar (stats only, different layout) | Non-Gmail sidebar matches Gmail three-tab layout | Phase 13 target | Consistent UX on all pages |

---

## Open Questions

1. **Should the widget on non-active editors be `display:none` or `opacity:0.1/pointer-events:none`?**
   - What we know: `display:none` fully removes it from visual/interaction space. Reduced opacity would hint at inactive state but could still confuse users.
   - What's unclear: Gmail's own layout does not guarantee widget position stability when display is toggled — Gmail sometimes uses `overflow:hidden` containers.
   - Recommendation: Use `display:none`. The widget is position:fixed and appended to `document.body`, bypassing Gmail's overflow. Toggle is instantaneous. This is cleanest.

2. **Should `lastActiveEditor` be set to the next live editor when the active editor is removed from DOM?**
   - What we know: Currently, when an editor is removed and cleaned up via `updateWidget`, `lastActiveEditor` may still point to the removed element. The next `updateWidget` call for remaining editors will show them as `isActive = false` (since `lastActiveEditor !== el`).
   - What's unclear: Does Gmail fire a `focus` event on the remaining compose when a sibling compose closes? Usually yes, but not guaranteed.
   - Recommendation: In `updateWidget`, after removing a stale editor: if `_state.lastActiveEditor === editorEl`, set `_state.lastActiveEditor` to the next live editor in `_state.liveEditors` (if any), then call `update` on that editor. This ensures the widget reappears on the remaining compose automatically.

3. **Non-Gmail sidebar: should the tracking toggle be wired to `chrome.storage.onChanged` so it reacts to changes made in Gmail tabs?**
   - What we know: `sidebar.js` already listens to `chrome.storage.onChanged` for `outreachiq_scan_complete`. Adding `trackingDefault` to this listener would keep the non-Gmail sidebar in sync.
   - Recommendation: Include this — it is one `if ('trackingDefault' in changes)` branch, low cost, good consistency.

---

## Validation Architecture

`nyquist_validation` is enabled. However, this phase involves **only DOM manipulation in vanilla JS content scripts**. There is no test framework currently configured for the extension scripts (no jest/vitest/mocha config found targeting `extension/*.js`). Manual browser testing is the validation path.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — extension content scripts (not testable with Node test runners without browser env) |
| Config file | None |
| Quick run command | Manual: load extension in Chrome, open Gmail, open 2+ composes |
| Full suite command | Manual: verify all three requirements in Chrome |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-SYNC-01 | Widget visible only on active compose | manual | N/A — requires browser | N/A |
| UI-SYNC-02 | Tracking toggle syncs when panel open + new compose added | manual | N/A — requires browser | N/A |
| UI-SYNC-03 | Non-Gmail sidebar shows three-tab layout with Draft disabled | manual | N/A — requires browser | N/A |

### Sampling Rate

- **Per task commit:** Load unpacked extension in Chrome, spot-check the specific behavior changed
- **Per wave merge:** Run full manual checklist (all three requirements)
- **Phase gate:** All three manual checks pass before `/gsd:verify-work`

### Wave 0 Gaps

None — no automated test infrastructure is needed or expected for vanilla JS extension content scripts in this project's current setup.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis — `extension/compose-widget.js` (1135 lines, fully read)
- Direct codebase analysis — `extension/email-detector.js` (174 lines, fully read)
- Direct codebase analysis — `extension/sidebar.js` (257 lines, fully read)
- Direct codebase analysis — `extension/content.js` (115 lines, fully read)
- Direct codebase analysis — `extension/background.js` (217 lines, fully read)
- Direct codebase analysis — `extension/tracking.js` (195 lines, fully read)
- Direct codebase analysis — `extension/manifest.json` (64 lines, fully read)

### Secondary (MEDIUM confidence)

- Chrome MV3 content script documentation patterns — shadow DOM closed mode, message passing, storage.onChanged as IPC mechanism

---

## Metadata

**Confidence breakdown:**

- Bug root causes: HIGH — all three bugs identified by direct code reading; no ambiguity
- Fix strategies: HIGH — all fixes are additive or small surgical edits; existing architecture supports them
- Non-Gmail sidebar scope: HIGH — confirmed `sidebar.js` is the only file managing non-Gmail sidebar; confirmed no React component is involved
- Edge cases (minimize, null lastActiveEditor): MEDIUM — browser focus event behavior in Gmail can vary; two open questions documented

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable — no external dependencies, pure DOM logic)
