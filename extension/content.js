// content.js — Reach Gmail compose orchestrator
// Runs as a classic script (no ES module imports allowed in content scripts).
// Owns shared state; delegates detection, widget, and tracking to module namespaces.
//
// Re-injection: after an extension reload Chrome re-injects all content scripts into
// open tabs.  Each module IIFE re-executes and resets its _state = null.  We always
// proceed to init() so modules are restored.  Module init() calls are idempotent
// (intervals are cleared before re-creating, observer is disconnected then re-observed).
if (window.__reachLoaded) {
  // Allow re-initialisation — modules were reset by their IIFEs re-running.
  window.__reachLoaded = false;
}
window.__reachLoaded = true;

const log = window.ReachLogger('content');
log.info('Content script loaded.');

// Compose-window widgets only attach on known email client domains.
const isEmailClient = new Set([
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'outlook.office365.com',
]).has(location.hostname);

// ─── Shared state ──────────────────────────────────────────────────────────────

const editorWidgets      = new WeakMap();
const editorManualModes  = new WeakMap(); // auto | force_track | force_skip
const editorAutoScores   = new WeakMap();
const editorScoreSeq     = new WeakMap();
const observedEditors    = new WeakSet();
const liveEditors        = new Set();

let lastActiveEditor    = null;
let savedTrackingDefault = 'auto';
let pendingTrackingId   = null;

// State object passed to each module init so they can read/write shared state
// without owning it. Getter/setter ensures modules always see the current value
// of the primitive lastActiveEditor, savedTrackingDefault, pendingTrackingId.
const state = {
  editorWidgets,
  editorManualModes,
  editorAutoScores,
  editorScoreSeq,
  observedEditors,
  liveEditors,
  get lastActiveEditor()     { return lastActiveEditor; },
  set lastActiveEditor(v)    { lastActiveEditor = v; },
  get savedTrackingDefault() { return savedTrackingDefault; },
  set savedTrackingDefault(v){ savedTrackingDefault = v; },
  get pendingTrackingId()    { return pendingTrackingId; },
  set pendingTrackingId(v)   { pendingTrackingId = v; },
};

// ─── Centralised cleanup ───────────────────────────────────────────────────────

// Called whenever an editor is detached from the DOM or re-attached from scratch.
function clearEditorMaps(el) {
  editorWidgets.delete(el);
  editorManualModes.delete(el);
  editorAutoScores.delete(el);
  editorScoreSeq.delete(el);
  liveEditors.delete(el);
}

// ─── Storage listeners ─────────────────────────────────────────────────────────
// Deferred to ensure all module-level state is fully declared before listeners fire.

function initStorageListeners() {
  try {
    chrome.storage.local.get('trackingDefault', (r) => {
      if (r.trackingDefault) {
        savedTrackingDefault = r.trackingDefault;
        for (const el of liveEditors) {
          if ((editorManualModes.get(el) || 'auto') === 'auto') {
            editorManualModes.set(el, savedTrackingDefault);
            window.ReachWidget.update(el);
          }
        }
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !('trackingDefault' in changes)) return;
      savedTrackingDefault = changes.trackingDefault.newValue || 'auto';
      window.ReachWidget.syncTrackMode();
    });
  } catch (_) {}
}

// ─── Boot sequence ─────────────────────────────────────────────────────────────

console.log('[REACH-DIAG] content.js boot: ReachDetector=', typeof ReachDetector, 'ReachWidget=', typeof ReachWidget, 'ReachTracking=', typeof ReachTracking);
try {
  ReachDetector.init(state);
  console.log('[REACH-DIAG] content.js: ReachDetector.init() returned OK');
} catch (e) {
  console.error('[REACH-DIAG] content.js: ReachDetector.init() THREW:', e);
}
try {
  ReachWidget.init(state);
  console.log('[REACH-DIAG] content.js: ReachWidget.init() returned OK');
} catch (e) {
  console.error('[REACH-DIAG] content.js: ReachWidget.init() THREW:', e);
}
try {
  ReachTracking.init(state);
  console.log('[REACH-DIAG] content.js: ReachTracking.init() returned OK');
} catch (e) {
  console.error('[REACH-DIAG] content.js: ReachTracking.init() THREW:', e);
}
initStorageListeners();

// ─── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'OPEN_PANEL') return;
  const editor = lastActiveEditor && document.body.contains(lastActiveEditor)
    ? lastActiveEditor
    : null;
  window.ReachWidget.openComposePanel(editor);
});
