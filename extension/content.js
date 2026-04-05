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
  window.__coldbaseLoaded = true;

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

  function showAccountMismatchToast(reachEmail) {
    const TOAST_ID = 'coldbase-account-mismatch-toast';
    if (document.getElementById(TOAST_ID)) return;

    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: '2147483647',
      background: '#1e1e2e',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      lineHeight: '1.4',
      padding: '12px 16px',
      borderRadius: '10px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      maxWidth: '380px',
    });
    const icon = document.createElement('span');
    icon.style.fontSize = '18px';
    icon.textContent = '⚠️';

    const text = document.createElement('span');
    text.innerHTML = '<strong>Reach</strong>: email not tracked \u2014 sign into Gmail as ';
    const emailStrong = document.createElement('strong');
    emailStrong.textContent = reachEmail;
    text.appendChild(emailStrong);
    text.appendChild(document.createTextNode(' to enable tracking.'));

    toast.appendChild(icon);
    toast.appendChild(text);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'OPEN_PANEL') {
      const editor = (lastActiveEditor && document.body.contains(lastActiveEditor))
        ? lastActiveEditor
        : [...liveEditors].find(el => document.body.contains(el)) || null;
      window.ColdbaseWidget.openComposePanel(editor);
      return;
    }

    if (msg.type === 'ACCOUNT_MISMATCH') {
      showAccountMismatchToast(msg.reachEmail);
      return;
    }
  });
})();
