---
status: verifying
trigger: "reach-widget-sidepanel-broken: After Phase 4 refactor, compose widget and side panel silently broken"
created: 2026-03-16T00:00:00Z
updated: 2026-03-16T00:06:00Z
---

## Current Focus

hypothesis: After extension reload with Gmail tab open, window.__reachLoaded=true causes content.js to throw before calling init() on any module, leaving _state=null in all modules. With _state=null, email-detector.js _isEmailClient stays false and no scan interval is created, so attachToEditor/updateWidget/getOrCreateWidget never runs and widget is never created.
test: Human confirmed — bottom-left diagnostic widget not visible = widget DOM element never created at all.
expecting: After fix (guard allows re-init, init() made idempotent, placeWidget uses viewport-relative coordinates), widget appears at correct position when Compose is opened.
next_action: Human verification of fix on extension reload + fresh tab.

## Symptoms

expected: (1) Reach compose widget appears when clicking Compose in Gmail. (2) Side panel displays when clicking the extension icon.
actual: (1) No widget in compose window. (2) Side panel doesn't display.
errors: No errors visible in Chrome DevTools console (neither Gmail tab nor Service Worker).
reproduction: Load extension in Chrome, navigate to mail.google.com, click Compose.
started: After Phase 4 refactor commits (04-02, 04-03). Extension was working before.

## Eliminated

- hypothesis: manifest load order wrong (modules not available when content.js runs)
  evidence: manifest.json correctly lists logger.js, email-detector.js, compose-widget.js, tracking.js BEFORE content.js
  timestamp: 2026-03-16T00:01:00Z

- hypothesis: window.Reach* namespace init functions not called by orchestrator
  evidence: content.js lines 86-88 call ReachDetector.init(state), ReachWidget.init(state), ReachTracking.init(state) using bare names (same as window.X in content scripts)
  timestamp: 2026-03-16T00:01:00Z

- hypothesis: timing issue (ReachWidget._state null when first scan runs)
  evidence: Initial sync scanForEditors at document_idle fires with no compose window open (Gmail loads with inbox, not compose). By the time user clicks Compose (1500ms+ later), all three inits are done.
  timestamp: 2026-03-16T00:01:00Z

- hypothesis: compose widget creation broken in new module
  evidence: compose-widget.js exports correct public API (init, update, openComposePanel, clearEditorState, placeWidget, etc.). getOrCreateWidget appends widget to DOM correctly. Logic is identical to old content.js.
  timestamp: 2026-03-16T00:01:00Z

## Evidence

- timestamp: 2026-03-16T00:01:00Z
  checked: background.js chrome.action.onClicked handler (line 46-63)
  found: sends { type: 'OPEN_PANEL' } to the active tab
  implication: This message goes to content.js which opens the compose analysis panel, NOT the sidebar

- timestamp: 2026-03-16T00:01:00Z
  checked: sidebar.js chrome.runtime.onMessage listener (line 237)
  found: only handles message.type === 'TOGGLE_SIDEBAR', does nothing for OPEN_PANEL
  implication: Sidebar NEVER opens when action icon is clicked — mismatch on message type

- timestamp: 2026-03-16T00:01:00Z
  checked: content.js chrome.runtime.onMessage listener (line 93-98)
  found: handles 'OPEN_PANEL' by calling window.ReachWidget.openComposePanel(editor)
  implication: Action icon click opens the compose analysis panel (correct UX), but sidebar must use TOGGLE_SIDEBAR

- timestamp: 2026-03-16T00:01:00Z
  checked: git log for sidebar.js (b4fc5dd = creation commit)
  found: sidebar.js has used TOGGLE_SIDEBAR since creation; background.js at that time injected panel.js via scripting (no sendMessage). In ed71989, background.js was changed to send OPEN_PANEL — never wired to TOGGLE_SIDEBAR.
  implication: Sidebar was never correctly wired to the action button. The mismatch predates Phase 4 and survived it.

- timestamp: 2026-03-16T00:01:00Z
  checked: background.js scripting fallback (line 53-58 in old version)
  found: fallback injected ONLY content.js (not email-detector.js, compose-widget.js, tracking.js)
  implication: If action fires on a tab where manifest scripts haven't loaded, the fallback would inject content.js alone — crashing on undefined ReachDetector/ReachWidget/ReachTracking. Fixed in the same change.

- timestamp: 2026-03-16T00:01:00Z
  checked: compose widget auto-appearance flow (email-detector.js + compose-widget.js)
  found: DOM observer + 1500ms interval scan detect compose editors. When user clicks Compose, widget is created and appended to the editor container. Module load order in manifest is correct.
  implication: Compose widget should appear automatically without any action button interaction. Widget auto-appearance logic is intact.

- timestamp: 2026-03-16T00:03:00Z
  checked: getOrCreateWidget container selection and positioning strategy (compose-widget.js lines 162-196)
  found: Widget is appended to editorEl.closest('[role="dialog"]') or .nH or document.body. Widget uses position:absolute with top/right values computed relative to the container's bounding rect. If Mailtrack wraps the compose dialog content in a div with overflow:hidden, any child with position:absolute that overflows that boundary will be clipped.
  implication: If Mailtrack adds overflow:hidden anywhere in the ancestor chain between the widget and its positioning container, the widget is invisibly clipped.

- timestamp: 2026-03-16T00:03:00Z
  checked: detectNeighborRect guard logic (compose-widget.js lines 124-129)
  found: Guard skips any element where editorEl.contains(el) OR el.contains(editorEl). If Mailtrack injects a wrapper div that contains the editor (e.g. wraps the entire contenteditable area), then el.contains(editorEl) is true, the element is skipped, and neighborRect stays null. This causes fallback placement: topPx = editorRect.top - containerRect.top - 6. If editorRect.top is less than 6px below the container top (e.g. editor is near the top of the dialog), this yields a negative top value, placing the widget above the dialog's top edge — outside its visible/clipping bounds.
  implication: The neighborRect probe is blind to Mailtrack wrappers that contain the editor. This is the code bug causing incorrect placement when Mailtrack is present.

- timestamp: 2026-03-16T00:03:00Z
  checked: PANEL_STYLES for the compose analysis panel (compose-widget.js line 236)
  found: The compose ANALYSIS panel (the floating card) uses position:fixed in its Shadow DOM. The small icon widget (oiq-w) uses position:absolute. There is an inconsistency: the panel uses fixed positioning to escape any overflow clipping, but the icon widget does not.
  implication: Changing oiq-w to position:fixed appended to document.body (instead of position:absolute inside the dialog) would make the widget immune to Mailtrack's overflow:hidden, matching the strategy already used by the compose panel itself.

- timestamp: 2026-03-16T00:03:00Z
  checked: scanForEditors selectors (email-detector.js lines 75-80)
  found: Primary selector is div[contenteditable="true"].Am — Gmail's compose editor class. Two fallbacks: [role="dialog"] div[contenteditable="true"] and div[contenteditable="true"][aria-multiline="true"]. These selectors are correct for Gmail's current DOM and are unaffected by Mailtrack.
  implication: Selector is not the problem. The editor element IS being found. The widget IS being created. The problem is it is either clipped or placed out of bounds.

- timestamp: 2026-03-16T00:05:00Z
  checked: Human verified diagnostic commit (bottom-left, red border)
  found: Widget NOT visible at bottom-left = DOM element never created. document.body.appendChild(w) in getOrCreateWidget was never reached.
  implication: The init chain is broken. scanForEditors or attachToEditor or updateWidget is never called.

- timestamp: 2026-03-16T00:06:00Z
  checked: content.js __reachLoaded guard (line 4) and module init order
  found: On extension reload while Gmail tab open, Chrome re-injects ALL content scripts. Module IIFEs re-execute resetting _state=null. content.js sees window.__reachLoaded=true and throws BEFORE calling ReachDetector.init/ReachWidget.init/ReachTracking.init. All modules stay with _state=null. email-detector.js _isEmailClient stays false (never set by init). No scan interval created. scanForEditors never called. Widget never created.
  implication: This is the root cause for the reload-then-test scenario (most likely developer testing flow).

- timestamp: 2026-03-16T00:06:00Z
  checked: email-detector.js init() for idempotency
  found: setInterval called unconditionally on init — multiple calls create duplicate intervals. domObserver.observe() called without disconnect — duplicate observe calls are handled by Chrome but disconnect+re-observe is cleaner.
  implication: After re-init fix in content.js, init() must be made idempotent to prevent duplicate intervals on re-injection.

## Resolution

root_cause: |
  Bug #2 (sidebar, FIXED): background.js chrome.action.onClicked sent { type: 'OPEN_PANEL' }
  but sidebar.js only listens for { type: 'TOGGLE_SIDEBAR' }. Fixed in prior session.

  Bug #1 (compose widget, ROOT CAUSE CONFIRMED): After extension reload while Gmail tab is
  open, Chrome re-injects all content scripts. Module IIFEs (email-detector.js,
  compose-widget.js, tracking.js) re-execute, resetting _state = null in each module.
  content.js then runs, sees window.__reachLoaded = true, and throws
  'Already loaded — skipping re-injection.' before calling ReachDetector.init(),
  ReachWidget.init(), or ReachTracking.init(). Result: _state stays null in all modules,
  email-detector.js _isEmailClient stays false, no scan interval is created, scanForEditors
  never runs, attachToEditor never called, widget never created.

  Secondary fix applied: change widget from position:absolute (container-relative) to
  position:fixed (viewport-relative, immune to Mailtrack overflow:hidden clipping).

fix: |
  1. extension/content.js: Changed __reachLoaded guard from throw to allow re-init.
     window.__reachLoaded = false before setting = true, so on re-injection the module
     init() calls always run. Added comment explaining idempotent init strategy.

  2. extension/email-detector.js: Made init() idempotent.
     - Added _scanInterval and _healthInterval tracking variables.
     - clearInterval(_scanInterval) before creating new interval.
     - domObserver.disconnect() before domObserver.observe() to clear stale callbacks.
     - Removed container-relative placeWidget call in resize handler (uses null now).

  3. extension/compose-widget.js: Restored proper viewport-relative placeWidget.
     - Removed debug bottom-left forced positioning and red border.
     - placeWidget now uses viewport-relative coordinates: topPx from editorRect.top,
       rightPx from window.innerWidth - editorRect.right. Neighbor case also viewport-relative.
     - CSS .oiq-w position:fixed (kept from debug commit, correct fix for Mailtrack clipping).
     - widget still appended to document.body (kept from debug commit, correct fix).

verification: awaiting human confirmation
files_changed: [extension/content.js, extension/email-detector.js, extension/compose-widget.js]
