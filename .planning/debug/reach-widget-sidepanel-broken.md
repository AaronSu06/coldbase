---
status: investigating
trigger: "reach-widget-sidepanel-broken: After Phase 4 refactor, compose widget and side panel silently broken"
created: 2026-03-16T00:00:00Z
updated: 2026-03-16T00:10:00Z
---

## Current Focus

hypothesis: ReachDetector.init() calls scanForEditors() SYNCHRONOUSLY at the end of init() (email-detector.js line 186), which calls attachToEditor() → window.ReachWidget.update() → updateWidget() → getOrCreateWidget() → _state.editorWidgets — but _state in compose-widget.js is still null because ReachWidget.init() has NOT yet been called (content.js calls ReachDetector.init() first on line 94, THEN ReachWidget.init() on line 95). This causes a TypeError: Cannot read properties of null (reading 'editorWidgets'). The exception propagates out of ReachDetector.init(), so content.js NEVER reaches ReachWidget.init() or ReachTracking.init(). The scan interval was registered before the throw (line 175 runs before 186), but every interval tick also crashes on _state null — so widget is never created.
test: Diagnostic commit with [REACH-DIAG] console.logs + null guard in getOrCreateWidget/updateWidget applied. On reload, console should show: ReachWidget.init() THROWS or updateWidget bails with null _state message.
expecting: After null guards: ReachDetector.init() no longer throws, content.js reaches ReachWidget.init(), _state gets set, interval scan creates widget within 1500ms.
next_action: User loads extension with diagnostic build, opens Gmail, opens DevTools console, opens Compose, reports [REACH-DIAG] output.

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

- timestamp: 2026-03-16T00:10:00Z
  checked: exact init call order in content.js vs synchronous scanForEditors at end of ReachDetector.init()
  found: content.js calls ReachDetector.init(state) on line 94 FIRST. email-detector.js init() at line 175 registers the 1500ms interval, then at line 186 calls scanForEditors(state) synchronously. scanForEditors → attachToEditor → window.ReachWidget.update(el) → updateWidget() → line 197: _state.editorWidgets.has(editorEl) — but _state in compose-widget.js is null (ReachWidget.init() has not run yet). TypeError thrown. Exception propagates up through scanForEditors → init() → back to content.js line 94. content.js NEVER reaches line 95 (ReachWidget.init) or line 96 (ReachTracking.init). ReachWidget._state stays null. Every interval tick (1500ms) calls the same path and crashes on null _state. Widget never created.
  implication: This is the true root cause. The __reachLoaded fix from prior session was necessary but not sufficient. The synchronous initial scan in ReachDetector.init() must not crash even when ReachWidget._state is null. Fix: add null guard at top of updateWidget() and getOrCreateWidget() in compose-widget.js. Also wrap each init() call in content.js with try/catch so one module crashing does not prevent the others from initialising.

## Resolution

root_cause: |
  Bug #2 (sidebar, FIXED): background.js chrome.action.onClicked sent { type: 'OPEN_PANEL' }
  but sidebar.js only listens for { type: 'TOGGLE_SIDEBAR' }. Fixed in prior session.

  Bug #1 (compose widget, ROOT CAUSE REVISED): email-detector.js init() calls
  scanForEditors() SYNCHRONOUSLY before returning (line 186). This runs INSIDE
  ReachDetector.init() which is called FIRST in content.js (line 94), BEFORE
  ReachWidget.init() (line 95). When a compose editor is already in the DOM
  (or during any subsequent interval tick where scanForEditors finds an editor),
  the call chain scanForEditors → attachToEditor → window.ReachWidget.update() →
  updateWidget() dereferences _state.editorWidgets where _state is null in compose-widget.js.
  TypeError is thrown, propagates up through scanForEditors → ReachDetector.init() →
  back to content.js line 94. content.js never reaches line 95 (ReachWidget.init) or
  line 96. ReachWidget._state stays null. Every 1500ms interval tick crashes the same way.
  Widget is never created.

  The prior __reachLoaded fix was necessary (correct) but this underlying crash was the
  remaining blocker.

fix: |
  1. extension/compose-widget.js: Added null guards.
     - updateWidget(): return early if _state is null.
     - getOrCreateWidget(): return null if _state is null.
     These prevent TypeError when ReachDetector's synchronous initial scan fires
     before ReachWidget.init() has set _state.

  2. extension/content.js: Wrapped each init() call in try/catch.
     If one module init throws, the others still run. This is defensive and ensures
     ReachWidget.init() and ReachTracking.init() always execute even if ReachDetector.init()
     throws for any reason.

  3. Diagnostic console.log calls added (prefixed [REACH-DIAG]) across all four files
     (logger.js, email-detector.js, compose-widget.js, content.js) for verification.

verification: awaiting human diagnostic run
files_changed: [extension/content.js, extension/email-detector.js, extension/compose-widget.js, extension/logger.js]
