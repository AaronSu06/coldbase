// content.js — Coldbase Gmail compose orchestrator
// Runs as a classic script (no ES module imports allowed in content scripts).
// Owns shared state; delegates detection, widget, and tracking to module namespaces.
//
// Re-injection: after an extension reload Chrome re-injects all content scripts into
// open tabs.  Each module IIFE re-executes and resets its _state = null.  We always
// proceed to init() so modules are restored.  Module init() calls are idempotent
// (intervals are cleared before re-creating, observer is disconnected then re-observed).
(function () {
  // Allow re-initialisation on every injection — module IIFEs have already reset _state.
  window.__reachLoaded = true;

  const log = window.ColdbaseLogger('content');
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
  let savedTrackingDefault = 'force_track';
  let pendingTrackingId   = null;
  let pendingEmailMeta    = null; // { subject, recipients, body } captured at send-click

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
    get pendingEmailMeta()     { return pendingEmailMeta; },
    set pendingEmailMeta(v)    { pendingEmailMeta = v; },
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
            editorManualModes.set(el, savedTrackingDefault);
            window.ColdbaseWidget.update(el);
          }
        }
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if ('trackingDefault' in changes) {
          savedTrackingDefault = changes.trackingDefault.newValue || 'force_track';
          window.ColdbaseWidget.syncTrackMode();
        }
        // Background notifies us when a scan completes — refresh the panel overview
        // so newly tracked emails appear without requiring manual interaction.
        if ('coldbase_scan_complete' in changes && changes.coldbase_scan_complete.newValue) {
          window.ColdbaseWidget.refreshOverview();
        }
      });
    } catch (e) { log.error('initStorageListeners failed:', e); }
  }

  // ─── Boot sequence ─────────────────────────────────────────────────────────────

  try { window.ColdbaseDetector.init(state); } catch (e) { log.error('ColdbaseDetector.init() threw:', e); }
  try { window.ColdbaseWidget.init(state);   } catch (e) { log.error('ColdbaseWidget.init() threw:', e); }
  try { window.ColdbaseTracking.init(state); } catch (e) { log.error('ColdbaseTracking.init() threw:', e); }
  initStorageListeners();

  // ─── Message listener ──────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'OPEN_PANEL') return;
    const editor = (lastActiveEditor && document.body.contains(lastActiveEditor))
      ? lastActiveEditor
      : [...liveEditors].find(el => document.body.contains(el)) || null;
    window.ColdbaseWidget.openComposePanel(editor);
  });
})();
