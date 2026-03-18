// email-detector.js — Send detection and DOM observation
// Classic script (no ES module imports). Exposes window.ReachDetector namespace.
// Loaded before content.js per manifest order; window.ReachLogger is available.

window.ReachDetector = (function () {
  const log = window.ReachLogger('email-detector');

  // Module-local reference to shared state (set by init)
  let _state = null;

  // ─── Utilities ──────────────────────────────────────────────────────────────

  function normalizeHint(text) {
    return (text || '').toLowerCase().replace(/[-_]/g, '').replace(/[^a-z0-9\s]/g, ' ');
  }

  // ─── Editor attachment ───────────────────────────────────────────────────────

  function attachToEditor(el, state) {
    if (state.observedEditors.has(el)) {
      // Widget was removed (dialog closed + recreated) — re-attach cleanly.
      const existing = state.editorWidgets.get(el);
      if (existing && document.body.contains(existing)) return;
      state.observedEditors.delete(el);
      window.ReachWidget.clearEditorState(el);
    }
    state.observedEditors.add(el);
    log.info('Attached to compose editor.');

    // Set lastActiveEditor BEFORE calling update() so widget visibility sees it (UI-SYNC-01)
    state.lastActiveEditor = el;
    state.editorManualModes.set(el, state.savedTrackingDefault || 'force_track');
    // updateWidget is in ReachWidget — it's a callback path so ReachWidget is loaded by now
    window.ReachWidget.update(el);
    window.ReachWidget.syncTrackMode(); // sync panel if already open (UI-SYNC-02)
    window.ReachTracking.watchSendButton(el);

    el.addEventListener('focus', () => {
      state.lastActiveEditor = el;
      window.ReachWidget.syncTrackMode();
    });

    el.addEventListener('input', () => {
      state.lastActiveEditor = el;
    });
  }

  // ─── Scan for editors ────────────────────────────────────────────────────────

  function scanForEditors(state) {
    const candidates = document.querySelectorAll(
      'div[contenteditable="true"].Am,' +
      '[role="dialog"] div[contenteditable="true"],' +
      'div[contenteditable="true"][aria-multiline="true"]'
    );
    candidates.forEach((el) => attachToEditor(el, state));
  }

  // ─── Send toast detection ────────────────────────────────────────────────────

  function checkForSendToast(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.dataset.reachSeen) return;
    const text = node.textContent || '';
    if (text.includes('Message sent')) {
      node.dataset.reachSeen = '1';
      window.ReachTracking.fireSendToast();
    }
  }

  function scanForSendToast() {
    const candidates = document.querySelectorAll(
      '[aria-live], [role="status"], [role="alert"], .bAq, .vh'
    );
    for (const el of candidates) {
      if (el.dataset.reachSeen) continue;
      if (el.textContent?.includes('Message sent')) {
        el.dataset.reachSeen = '1';
        window.ReachTracking.fireSendToast();
        return;
      }
    }
  }

  // ─── DOM observer + periodic scan + resize ───────────────────────────────────

  let _isEmailClient = false;
  let _scanInterval = null;
  let _healthInterval = null;

  const domObserver = new MutationObserver((mutations) => {
    let shouldScanEditors = false;
    let shouldScanToast = false;

    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const text = mutation.target.textContent || '';
        if (text.includes('Message sent')) window.ReachTracking.fireSendToast();
        continue;
      }

      if (mutation.type === 'attributes') {
        const el = mutation.target;
        if (el.querySelector?.('div[contenteditable="true"]')) shouldScanEditors = true;
        continue;
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        checkForSendToast(node);
        if (
          node.matches('div[contenteditable="true"]') ||
          node.querySelector?.('div[contenteditable="true"]')
        ) {
          shouldScanEditors = true;
        }
      }
      shouldScanToast = true;
    }

    if (shouldScanToast) scanForSendToast();
    if (shouldScanEditors && _isEmailClient) scanForEditors(_state);
  });

  // ─── Public API ──────────────────────────────────────────────────────────────

  function init(state) {
    _state = state;
    _isEmailClient = new Set([
      'mail.google.com',
      'outlook.live.com',
      'outlook.office.com',
      'outlook.office365.com',
    ]).has(location.hostname);

    // Idempotent: disconnect and re-observe so re-injection after extension reload
    // does not leave a stale observer referencing old _state.
    domObserver.disconnect();
    domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'aria-hidden', 'hidden'],
    });

    // Clear previous intervals before creating new ones (idempotent on re-init).
    if (_scanInterval) { clearInterval(_scanInterval); _scanInterval = null; }
    if (_healthInterval) { clearInterval(_healthInterval); _healthInterval = null; }

    if (_isEmailClient) _scanInterval = setInterval(() => scanForEditors(state), 1500);

    window.addEventListener('resize', () => {
      for (const editorEl of state.liveEditors) {
        if (!document.body.contains(editorEl)) continue;
        const w = state.editorWidgets.get(editorEl);
        if (!w) continue;
        window.ReachWidget.placeWidget(editorEl, null, w);
      }
    });

    if (_isEmailClient) {
      scanForEditors(state);
    }

    // Extension context health check
    setTimeout(() => {
      _healthInterval = setInterval(() => {
        if (!chrome.runtime?.id) window.ReachTracking.showReloadBanner();
      }, 5000);
    }, 10_000);

    log.debug('ReachDetector initialized.');
  }

  return { init, scanForEditors, normalizeHint };
})();
