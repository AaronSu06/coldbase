// tracking.js — Tracking pixel injection + send toast
// Classic script (no ES module imports). Exposes window.ReachTracking namespace.
// Loaded before content.js per manifest order; window.ReachLogger is available.

window.ReachTracking = (function () {
  const log = window.ReachLogger('tracking');

  // Module-local reference to shared state (set by init)
  let _state = null;

  // Toast deduplication
  let toastFired = false;
  let toastCooldown = null;

  // ─── Tracking ID + pixel ─────────────────────────────────────────────────────

  function generateTrackingId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  function injectTrackingPixel(editorEl, trackingId) {
    const img = document.createElement('img');
    img.src = 'http://localhost:3001/track/' + trackingId + '.gif';
    img.width = 1; img.height = 1;
    img.style.cssText = 'display:block;width:1px;height:1px;opacity:0;position:absolute;pointer-events:none;';
    img.alt = '';
    editorEl.appendChild(img);
  }

  // ─── Watch send button ───────────────────────────────────────────────────────

  function watchSendButton(editorEl) {
    const container = editorEl.closest('form') || editorEl.closest('[role="dialog"]') || document.body;
    container.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-tooltip*="Send"], [aria-label*="Send"]');
      if (!btn) return;
      if (editorEl.dataset.reachTracking) return;
      const manualMode = _state.editorManualModes.get(editorEl) || 'auto';
      if (manualMode === 'force_skip') return;
      const trackingId = generateTrackingId();
      editorEl.dataset.reachTracking = trackingId;
      injectTrackingPixel(editorEl, trackingId);
      _state.pendingTrackingId = trackingId;
    }, true);
  }

  // ─── Reload banner ───────────────────────────────────────────────────────────

  function showReloadBanner() {
    if (document.getElementById('reach-reload-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'reach-reload-banner';
    Object.assign(banner.style, {
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
      gap: '12px',
      maxWidth: '360px',
    });
    banner.innerHTML = `
      <span style="font-size:18px">&#x26A0;&#xFE0F;</span>
      <span><strong>Reach</strong>: extension was reloaded \u2014 this email was <em>not</em> tracked.<br>
      Reload Gmail to restore tracking.</span>
      <button id="reach-reload-btn" style="
        flex-shrink:0; background:#6366f1; color:#fff; border:none;
        border-radius:6px; padding:6px 12px; font-size:12px; font-weight:600;
        cursor:pointer; white-space:nowrap;">
        Reload now
      </button>
    `;
    document.body.appendChild(banner);
    document.getElementById('reach-reload-btn').addEventListener('click', () => location.reload());
    setTimeout(() => banner.remove(), 30_000);
  }

  // ─── Send toast handler ──────────────────────────────────────────────────────

  function fireSendToast() {
    if (toastFired) return;
    toastFired = true;
    clearTimeout(toastCooldown);
    toastCooldown = setTimeout(() => { toastFired = false; }, 10_000);

    log.info('"Message sent" detected \u2014 triggering scan in 3s.');
    setTimeout(() => {
      if (!chrome.runtime?.id) {
        log.warn('Extension context invalidated \u2014 cannot trigger scan.');
        showReloadBanner();
        return;
      }

      let pendingScanPayload = {
        ts: Date.now(),
        overrideMode: null,
        subjectHint: '',
        recipientsHint: '',
        trackingId: _state.pendingTrackingId,
      };

      if (_state.lastActiveEditor && document.body.contains(_state.lastActiveEditor)) {
        const manualMode = _state.editorManualModes.get(_state.lastActiveEditor) || 'auto';
        const meta = window.ReachWidget.getComposeMetadata(_state.lastActiveEditor);
        pendingScanPayload = {
          ts: Date.now(),
          overrideMode: manualMode === 'auto' ? null : manualMode,
          subjectHint: window.ReachDetector.normalizeHint(meta.subject).slice(0, 120),
          recipientsHint: window.ReachDetector.normalizeHint(meta.recipients).slice(0, 180),
          trackingId: _state.pendingTrackingId,
        };
        _state.editorManualModes.set(_state.lastActiveEditor, 'auto');
        window.ReachWidget.update(_state.lastActiveEditor, _state.editorAutoScores.get(_state.lastActiveEditor) || 0);
      }
      _state.pendingTrackingId = null;

      chrome.storage.local.set({ outreachiq_pending_scan: pendingScanPayload }, () => {
        if (chrome.runtime.lastError) {
          log.warn('Storage trigger failed:', chrome.runtime.lastError.message);
        } else {
          log.info('Storage trigger written \u2014 background will pick it up.');
        }
      });
    }, 3000);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  function init(state) {
    _state = state;
    log.debug('ReachTracking initialized.');
  }

  return {
    init,
    watchSendButton,
    fireSendToast,
    generateTrackingId,
    injectTrackingPixel,
    showReloadBanner,
  };
})();
