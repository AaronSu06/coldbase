// tracking.js — Tracking pixel injection + send toast
// Classic script (no ES module imports). Exposes window.ReachTracking namespace.
// Loaded before content.js per manifest order; window.ReachLogger is available.

window.ReachTracking = (function () {
  const log = window.ReachLogger('tracking');

  // Module-local reference to shared state (set by init)
  let _state = null;

  // Cached server base URL from config — pre-fetched in init()
  let _serverBase = 'http://localhost:3001';

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
    img.src = _serverBase + '/track/' + trackingId + '.gif';
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
      const manualMode = _state.editorManualModes.get(editorEl) || 'force_track';
      if (manualMode === 'force_skip') return;
      const trackingId = generateTrackingId();
      editorEl.dataset.reachTracking = trackingId;
      injectTrackingPixel(editorEl, trackingId);
      _state.pendingTrackingId = trackingId;

      // Capture email metadata now (compose window still open).
      // Stored on _state so fireSendToast can include it in the storage payload,
      // enabling the background to build a record without needing Gmail API auth.
      try {
        const meta = window.ReachWidget.getComposeMetadata(editorEl);
        const bodyText = (editorEl.innerText || editorEl.textContent || '').slice(0, 2000);
        _state.pendingEmailMeta = {
          subject: meta.subject || '',
          recipients: meta.recipients || '',
          body: bodyText,
        };
        log.debug('Captured email metadata at send click:', meta.subject, '|', meta.recipients);
      } catch (err) {
        log.debug('Could not capture email metadata at send click:', err?.message);
        _state.pendingEmailMeta = null;
      }
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

    log.info('"Message sent" detected \u2014 triggering scan in 5s.');
    setTimeout(() => {
      if (!chrome.runtime?.id) {
        log.warn('Extension context invalidated \u2014 cannot trigger scan.');
        showReloadBanner();
        return;
      }

      // emailMeta captured at send-click time (compose window was still open then).
      const capturedMeta = _state.pendingEmailMeta || null;
      _state.pendingEmailMeta = null;

      let pendingScanPayload = {
        ts: Date.now(),
        overrideMode: null,
        subjectHint: '',
        recipientsHint: '',
        trackingId: _state.pendingTrackingId,
        // Fallback data for servers that can POST without Gmail API auth:
        emailSubject: capturedMeta?.subject || '',
        emailRecipients: capturedMeta?.recipients || '',
        emailBody: capturedMeta?.body || '',
      };

      if (_state.lastActiveEditor && document.body.contains(_state.lastActiveEditor)) {
        const manualMode = _state.editorManualModes.get(_state.lastActiveEditor) || 'force_track';
        const meta = window.ReachWidget.getComposeMetadata(_state.lastActiveEditor);
        pendingScanPayload = {
          ts: Date.now(),
          overrideMode: manualMode,
          subjectHint: window.ReachDetector.normalizeHint(meta.subject).slice(0, 120),
          recipientsHint: window.ReachDetector.normalizeHint(meta.recipients).slice(0, 180),
          trackingId: _state.pendingTrackingId,
          // Prefer live metadata if compose is still open, else use captured snapshot.
          emailSubject: meta.subject || capturedMeta?.subject || '',
          emailRecipients: meta.recipients || capturedMeta?.recipients || '',
          emailBody: capturedMeta?.body || '',
        };
        _state.editorManualModes.set(_state.lastActiveEditor, _state.savedTrackingDefault || 'force_track');
        window.ReachWidget.update(_state.lastActiveEditor);
      }
      _state.pendingTrackingId = null;

      chrome.storage.local.set({ outreachiq_pending_scan: pendingScanPayload }, () => {
        if (chrome.runtime.lastError) {
          log.warn('Storage trigger failed:', chrome.runtime.lastError.message);
        } else {
          log.info('Storage trigger written \u2014 background will pick it up.');
        }
      });
    }, 5000);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  function init(state) {
    _state = state;
    log.debug('ReachTracking initialized.');
    chrome.runtime.sendMessage({ type: 'GET_RUNTIME_CONFIG' }, (resp) => {
      if (chrome.runtime.lastError) {
        log.warn('GET_RUNTIME_CONFIG failed — using fallback serverBase:', chrome.runtime.lastError.message);
        return;
      }
      if (resp?.ok && resp.config?.serverBase) {
        _serverBase = resp.config.serverBase;
        log.debug('serverBase loaded from config:', _serverBase);
      }
    });
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
