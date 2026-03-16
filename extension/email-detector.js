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

  function requestKeywordScore(text) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'KEYWORD_SCORE', text }, (response) => {
        if (chrome.runtime.lastError || !response?.ok || typeof response.score !== 'number') {
          resolve(0);
          return;
        }
        resolve(response.score);
      });
    });
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
    console.log('[REACH-DIAG] attachToEditor: about to call ReachWidget.update(el) — ReachWidget._state should be set by now if ReachWidget.init() ran first');
    log.info('Attached to compose editor.');

    state.editorManualModes.set(el, state.savedTrackingDefault);
    state.editorAutoScores.set(el, 0);
    // updateWidget is in ReachWidget — it's a callback path so ReachWidget is loaded by now
    window.ReachWidget.update(el);
    window.ReachTracking.watchSendButton(el);

    el.addEventListener('focus', () => {
      state.lastActiveEditor = el;
    });

    el.addEventListener('input', () => {
      state.lastActiveEditor = el;
      const container = window.ReachWidget.getComposeContainer(el);
      const subjectEl =
        container.querySelector('input[name="subjectbox"]') ||
        document.querySelector('input[name="subjectbox"]');
      const subject = subjectEl ? subjectEl.value : '';
      const body = el.innerText || el.textContent || '';
      const combined = subject + ' ' + body;

      const seq = (state.editorScoreSeq.get(el) || 0) + 1;
      state.editorScoreSeq.set(el, seq);
      requestKeywordScore(combined).then((score) => {
        if (state.editorScoreSeq.get(el) !== seq) return;
        if (!document.body.contains(el)) return;
        window.ReachWidget.update(el, score);
      });
    });
  }

  // ─── Scan for editors ────────────────────────────────────────────────────────

  function scanForEditors(state) {
    const candidates = document.querySelectorAll(
      'div[contenteditable="true"].Am,' +
      '[role="dialog"] div[contenteditable="true"],' +
      'div[contenteditable="true"][aria-multiline="true"]'
    );
    console.log('[REACH-DIAG] scanForEditors found', candidates.length, 'editor candidate(s)');
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
    console.log('[REACH-DIAG] ReachDetector.init() called');
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
      console.log('[REACH-DIAG] ReachDetector.init() — running initial synchronous scanForEditors');
      scanForEditors(state);
      console.log('[REACH-DIAG] ReachDetector.init() — initial scanForEditors complete (if you see this, no throw)');
    }

    // Extension context health check
    setTimeout(() => {
      _healthInterval = setInterval(() => {
        if (!chrome.runtime?.id) window.ReachTracking.showReloadBanner();
      }, 5000);
    }, 10_000);

    console.log('[REACH-DIAG] ReachDetector.init() complete');
    log.debug('ReachDetector initialized.');
  }

  return { init, scanForEditors, normalizeHint };
})();
