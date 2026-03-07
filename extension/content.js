// content.js — Reach Gmail compose detector
// Runs as a classic script (no ES module imports allowed in content scripts).
if (window.__reachLoaded) { throw new Error('[Reach] Already loaded — skipping re-injection.'); }
window.__reachLoaded = true;
console.log('[Reach] Content script loaded.');

// Compose-window widgets only attach on known email client domains.
const isEmailClient = new Set([
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'outlook.office365.com',
]).has(location.hostname);

// ─── Keyword score bridge (delegates to classifier.js in background) ─────────

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

// ─── Widget UI ─────────────────────────────────────────────────────────────────

const editorWidgets = new WeakMap();
const editorManualModes = new WeakMap(); // auto | force_track | force_skip
const editorAutoScores = new WeakMap();  // heuristic score for auto mode

let savedTrackingDefault = 'auto';
try {
  chrome.storage.local.get('trackingDefault', (r) => {
    if (r.trackingDefault) {
      savedTrackingDefault = r.trackingDefault;
      // Apply to any editors already open when the script loaded
      for (const el of liveEditors) {
        if ((editorManualModes.get(el) || 'auto') === 'auto') {
          editorManualModes.set(el, savedTrackingDefault);
          updateWidget(el, editorAutoScores.get(el) || 0);
        }
      }
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !('trackingDefault' in changes)) return;
    savedTrackingDefault = changes.trackingDefault.newValue || 'auto';
    // Repaint the toggle in any already-open panel (if no per-compose override)
    if (_composePanelHost?.style.display !== 'none') {
      _composePanelSyncTrackMode?.();
    }
  });
} catch (_) {}
const editorScoreSeq = new WeakMap();
const liveEditors = new Set();       // parallel to editorWidgets for resize iteration
let lastActiveEditor = null;
let stylesInjected = false;

function injectStyles() {
  if (stylesInjected || document.getElementById('oiq-w-style')) return;
  stylesInjected = true;
  const s = document.createElement('style');
  s.id = 'oiq-w-style';
  s.textContent = `
    .oiq-w {
      position: absolute !important;
      width: 24px !important;
      height: 24px !important;
      border-radius: 6px !important;
      overflow: hidden !important;
      z-index: 999 !important;
      opacity: 1 !important;
      pointer-events: auto !important;
      cursor: pointer !important;
      box-shadow: 0 1px 5px rgba(0,0,0,0.22) !important;
      transition: box-shadow 0.25s ease !important;
    }
    .oiq-w.oiq-partial {
      animation: oiq-ring 2.5s ease-in-out infinite !important;
    }
    .oiq-w.oiq-manual-track {
      outline: 2px solid #86efac !important;
      outline-offset: 1px !important;
    }
    .oiq-w.oiq-manual-skip {
      outline: 2px solid #fca5a5 !important;
      outline-offset: 1px !important;
    }
    .oiq-w img.oiq-icon {
      width: 26px !important;
      height: 26px !important;
      display: block !important;
      object-fit: cover !important;
    }
    @keyframes oiq-ring {
      0%, 100% { box-shadow: 0 1px 5px rgba(0,0,0,0.22); }
      50%       { box-shadow: 0 0 0 3px rgba(29,78,216,0.35), 0 1px 5px rgba(0,0,0,0.22); }
    }
  `;
  document.head.appendChild(s);
}

const ICON_IMG = `<img class="oiq-icon" src="${chrome.runtime.getURL('Reach.png')}" alt="Reach" />`;

function getComposeContainer(editorEl) {
  return (
    editorEl.closest('[role="dialog"]') ||
    editorEl.closest('.nH.if') ||
    editorEl.closest('form') ||
    document
  );
}

function getComposeMetadata(editorEl) {
  const container = getComposeContainer(editorEl);
  const subjectEl =
    container.querySelector('input[name="subjectbox"]') ||
    document.querySelector('input[name="subjectbox"]');
  const recipients = Array.from(container.querySelectorAll('[email]'))
    .map((el) => el.getAttribute('email'))
    .filter(Boolean)
    .sort()
    .join(',');
  return {
    subject: (subjectEl?.value || '').trim(),
    recipients
  };
}

function cycleManualMode(current) {
  if (current === 'auto') return 'force_track';
  if (current === 'force_track') return 'force_skip';
  return 'auto';
}

// Detect if a neighboring extension widget occupies the default top-right position.
// Returns the neighbor rect in viewport coords, or null if no neighbor.
function detectNeighborRect(editorEl, widgetEl) {
  const editorRect = editorEl.getBoundingClientRect();
  const HALF = 14;
  const probeX = editorRect.right - 4 - HALF;

  widgetEl.style.visibility = 'hidden';

  let neighborRect = null;
  const probeYs = [
    editorRect.top + 8,   // new default center
    editorRect.top + 14,  // slightly lower
    editorRect.top + 4,   // slightly higher
  ];

  for (const testY of probeYs) {
    const el = document.elementFromPoint(probeX, testY);
    if (!el || el === document.body || editorEl.contains(el) || el.contains(editorEl)) continue;
    neighborRect = el.getBoundingClientRect();
    break;
  }

  widgetEl.style.visibility = '';
  return neighborRect;
}

function placeWidget(editorEl, container, w) {
  const HORIZONTAL_NUDGE_PX = 1;
  const VERTICAL_GAP_PX = 8;
  const editorRect = editorEl.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const neighborRect = detectNeighborRect(editorEl, w);
  const topPx = neighborRect
    ? neighborRect.bottom - containerRect.top + VERTICAL_GAP_PX
    : editorRect.top - containerRect.top - 6;
  const rightPx = neighborRect
    ? Math.max(0, containerRect.right - neighborRect.right - HORIZONTAL_NUDGE_PX)
    : (containerRect.right - editorRect.right + 4);
  w.style.top   = topPx + 'px';
  w.style.right = rightPx + 'px';
}

function getOrCreateWidget(editorEl) {
  if (editorWidgets.has(editorEl)) return editorWidgets.get(editorEl);
  injectStyles();

  const container =
    editorEl.closest('[role="dialog"]') ||
    editorEl.closest('.nH') ||
    document.body;

  if (window.getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  const w = document.createElement('div');
  w.className = 'oiq-w';
  w.innerHTML = ICON_IMG;
  w.addEventListener('click', () => {
    lastActiveEditor = editorEl;
    openComposePanel(editorEl);
  });
  container.appendChild(w);   // inject INTO dialog, not document.body
  editorWidgets.set(editorEl, w);
  liveEditors.add(editorEl);

  placeWidget(editorEl, container, w);

  // Other extensions may inject their widgets a few ms after ours.
  // Re-probe at 300ms so neighbor is loaded — neighborTopY gives reliable vertical alignment.
  setTimeout(() => {
    if (document.body.contains(w) && document.body.contains(editorEl)) {
      placeWidget(editorEl, container, w);
    }
  }, 300);

  return w;
}

function updateWidget(editorEl, matchCount) {
  if (!document.body.contains(editorEl)) {
    if (editorWidgets.has(editorEl)) {
      editorWidgets.get(editorEl).remove();
      editorWidgets.delete(editorEl);
      editorManualModes.delete(editorEl);
      editorAutoScores.delete(editorEl);
      editorScoreSeq.delete(editorEl);
      liveEditors.delete(editorEl);
    }
    return;
  }

  editorAutoScores.set(editorEl, matchCount);
  const w = getOrCreateWidget(editorEl);
  const manualMode = editorManualModes.get(editorEl) || 'auto';

  w.classList.remove('oiq-partial', 'oiq-tracking', 'oiq-manual-track', 'oiq-manual-skip');
  if (manualMode === 'force_track') {
    w.classList.add('oiq-manual-track');
    w.title = 'Reach: manual tracking ON (click to set OFF)';
    return;
  }
  if (manualMode === 'force_skip') {
    w.classList.add('oiq-manual-skip');
    w.title = 'Reach: manual tracking OFF (click for AUTO)';
    return;
  }

  w.title = 'Reach: auto mode (click to force ON)';
  if (matchCount >= 2) w.classList.add('oiq-tracking');
  else if (matchCount === 1) w.classList.add('oiq-partial');
}

// ─── Compose window detection ─────────────────────────────────────────────────

const observedEditors = new WeakSet();

function attachToEditor(el) {
  if (observedEditors.has(el)) {
    // If the widget was removed (dialog closed + recreated), re-attach
    const existing = editorWidgets.get(el);
    if (existing && document.body.contains(existing)) return;
    observedEditors.delete(el);
    editorWidgets.delete(el);
    editorManualModes.delete(el);
    editorAutoScores.delete(el);
    editorScoreSeq.delete(el);
    liveEditors.delete(el);
  }
  observedEditors.add(el);
  console.log('[Reach] Attached to compose editor.');

  // Show the icon immediately when the compose window opens
  editorManualModes.set(el, savedTrackingDefault);
  editorAutoScores.set(el, 0);
  updateWidget(el, 0);

  el.addEventListener('focus', () => {
    lastActiveEditor = el;
  });

  el.addEventListener('input', () => {
    lastActiveEditor = el;
    // Try to find the subject field in the nearest compose container first,
    // then fall back to any visible subject box in the document.
    const container = getComposeContainer(el);

    const subjectEl =
      container.querySelector('input[name="subjectbox"]') ||
      document.querySelector('input[name="subjectbox"]');

    const subject = subjectEl ? subjectEl.value : '';
    const body = el.innerText || el.textContent || '';
    const combined = subject + ' ' + body;

    const seq = (editorScoreSeq.get(el) || 0) + 1;
    editorScoreSeq.set(el, seq);
    requestKeywordScore(combined).then((score) => {
      if (editorScoreSeq.get(el) !== seq) return;
      if (!document.body.contains(el)) return;
      updateWidget(el, score);
    });
  });
}

// Scan the current DOM for any open compose editors
function scanForEditors() {
  // Gmail compose body element selector — covers new compose + inline reply
  const candidates = document.querySelectorAll(
    'div[contenteditable="true"].Am,' +          // classic compose body
    '[role="dialog"] div[contenteditable="true"],' + // compose in modal
    'div[contenteditable="true"][aria-multiline="true"]' // reply inline
  );
  candidates.forEach(attachToEditor);
}

// ─── "Message sent" toast detector ───────────────────────────────────────────

let toastFired = false;
let toastCooldown = null;

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
    <span style="font-size:18px">⚠️</span>
    <span><strong>Reach</strong>: extension was reloaded — this email was <em>not</em> tracked.<br>
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
  // Auto-dismiss after 30s
  setTimeout(() => banner.remove(), 30_000);
}

function fireSendToast() {
  // Debounce: one scan per 10s to avoid duplicate triggers
  if (toastFired) return;
  toastFired = true;
  clearTimeout(toastCooldown);
  toastCooldown = setTimeout(() => { toastFired = false; }, 10_000);

  console.log('[Reach] "Message sent" detected — triggering scan in 3s.');
  setTimeout(() => {
    if (!chrome.runtime?.id) {
      console.warn('[Reach] Extension context invalidated — cannot trigger scan.');
      showReloadBanner();
      return;
    }
    // Use chrome.storage.local.set instead of sendMessage.
    // Reason: MV3 service workers use "type": "module" — when Chrome terminates
    // the SW and sendMessage wakes it back up, the ES module import chain may not
    // complete before the onMessage event fires, silently dropping the message.
    // chrome.storage.onChanged does NOT have this race condition: Chrome waits
    // for the SW to fully initialize before dispatching the storage event.
    let pendingScanPayload = { ts: Date.now(), overrideMode: null, subjectHint: '', recipientsHint: '' };
    if (lastActiveEditor && document.body.contains(lastActiveEditor)) {
      const manualMode = editorManualModes.get(lastActiveEditor) || 'auto';
      const meta = getComposeMetadata(lastActiveEditor);
      pendingScanPayload = {
        ts: Date.now(),
        overrideMode: manualMode === 'auto' ? null : manualMode,
        subjectHint: normalizeHint(meta.subject).slice(0, 120),
        recipientsHint: normalizeHint(meta.recipients).slice(0, 180)
      };
      // Reset per-message override after send so the next compose starts in auto.
      editorManualModes.set(lastActiveEditor, 'auto');
      updateWidget(lastActiveEditor, editorAutoScores.get(lastActiveEditor) || 0);
    }

    chrome.storage.local.set({ outreachiq_pending_scan: pendingScanPayload }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[Reach] Storage trigger failed:', chrome.runtime.lastError.message);
      } else {
        console.log('[Reach] Storage trigger written — background will pick it up.');
      }
    });
  }, 3000);
}

function checkForSendToast(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.dataset.reachSeen) return;
  const text = node.textContent || '';
  if (text.includes('Message sent')) {
    node.dataset.reachSeen = '1';
    fireSendToast();
  }
}

// Also scan the full notification area on any mutation — catches text inserted
// into a pre-existing container (Gmail sometimes adds an empty toast then fills it).
// We mark processed elements with data-reach-seen so the same toast node can
// never re-trigger after the 10s debounce resets.
function scanForSendToast() {
  const candidates = document.querySelectorAll(
    '[aria-live], [role="status"], [role="alert"], .bAq, .vh'
  );
  for (const el of candidates) {
    if (el.dataset.reachSeen) continue;
    if (el.textContent?.includes('Message sent')) {
      el.dataset.reachSeen = '1';
      fireSendToast();
      return;
    }
  }
}

// Watch the DOM for compose windows being added dynamically.
// Also watches attribute mutations so that saved drafts that Gmail shows by
// toggling visibility/display/aria-hidden on pre-existing DOM nodes are caught.
const domObserver = new MutationObserver((mutations) => {
  let shouldScanEditors = false;
  let shouldScanToast = false;

  for (const mutation of mutations) {
    // characterData: text node changed — check parent element
    if (mutation.type === 'characterData') {
      const text = mutation.target.textContent || '';
      if (text.includes('Message sent')) {
        fireSendToast();
      }
      continue;
    }

    if (mutation.type === 'attributes') {
      // Gmail shows saved-draft compose windows by mutating style/class/aria-hidden
      // on an already-existing container. Trigger a scan whenever a compose-like
      // ancestor becomes visible so the icon attaches immediately.
      const el = mutation.target;
      if (el.querySelector?.('div[contenteditable="true"]')) {
        shouldScanEditors = true;
      }
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
  if (shouldScanEditors && isEmailClient) scanForEditors();
});

domObserver.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['style', 'class', 'aria-hidden', 'hidden'],
});

// Periodic fallback: catches any compose windows Gmail reveals through mechanisms
// the MutationObserver misses (e.g. CSS transitions, shadow DOM changes).
// attachToEditor is idempotent so repeated calls on attached editors are no-ops.
if (isEmailClient) setInterval(scanForEditors, 1500);

// Recompute position when the window is resized
window.addEventListener('resize', () => {
  for (const editorEl of liveEditors) {
    if (!document.body.contains(editorEl)) continue;
    const w = editorWidgets.get(editorEl);
    if (!w) continue;
    const container =
      editorEl.closest('[role="dialog"]') ||
      editorEl.closest('.nH') ||
      document.body;
    placeWidget(editorEl, container, w);
  }
});

// In case a compose window is already open when the script loads
if (isEmailClient) scanForEditors();

// Proactively warn if the extension context becomes invalidated while Gmail is
// open (e.g. extension reloaded/updated). Checks every 5s after a 10s grace
// period so it doesn't false-fire during initial script setup.
setTimeout(() => {
  setInterval(() => {
    if (!chrome.runtime?.id) showReloadBanner();
  }, 5000);
}, 10_000);

// ─── Compose Panel (3-tab hub) ────────────────────────────────────────────────

let _composePanelHost = null;
let _composePanelSetEditor = null;
let _composePanelSyncTrackMode = null;
let _composePanelCurrentEditor = null;

function openComposePanel(editorEl) {
  if (!_composePanelHost) {
    const panel = buildComposePanel();
    _composePanelHost = panel.host;
    _composePanelSetEditor = panel.setEditor;
    _composePanelSyncTrackMode = panel.syncTrackMode;
    document.documentElement.appendChild(_composePanelHost);
  }

  const alreadyVisible = _composePanelHost.style.display !== 'none';
  const sameEditor = _composePanelCurrentEditor === editorEl;

  if (alreadyVisible && sameEditor) {
    _composePanelHost.style.display = 'none';
    return;
  }

  _composePanelCurrentEditor = editorEl;
  _composePanelSetEditor(editorEl);
  _composePanelHost.style.display = '';
}

function _cpEscapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _cpRelativeDate(isoString) {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const d = Math.floor(diffMs / 86400000);
    if (d === 0) return 'today';
    if (d === 1) return '1d ago';
    if (d < 7) return `${d}d ago`;
    const w = Math.floor(d / 7);
    if (w === 1) return '1w ago';
    if (w < 5) return `${w}w ago`;
    return `${Math.floor(d / 30)}mo ago`;
  } catch { return ''; }
}

function buildComposePanel() {
  const ICON_URL = chrome.runtime.getURL('Reach.png');
  const host = document.createElement('div');
  host.id = 'reach-compose-panel-host';
  host.style.display = 'none'; // openComposePanel shows it; keeps alreadyVisible logic correct
  const shadow = host.attachShadow({ mode: 'closed' });

  // Gmail intercepts keydown/keyup/keypress at the document level.
  // Block propagation in capture phase so Shadow DOM inputs work.
  ['keydown', 'keyup', 'keypress'].forEach(type =>
    host.addEventListener(type, e => e.stopPropagation(), true)
  );

  let currentEditorEl = null;

  shadow.innerHTML = `
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      :host {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        color: #0a0a0a;
      }
      .panel {
        width: 320px;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.14);
        overflow: hidden;
        animation: cp-slide-in 200ms cubic-bezier(0.34, 1.4, 0.64, 1);
      }
      @keyframes cp-slide-in {
        from { opacity: 0; transform: translateY(-8px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 14px;
        background: #f9fafb;
        border-bottom: 1px solid #e5e7eb;
      }
      .header img { width: 18px; height: 18px; border-radius: 4px; flex-shrink: 0; }
      .header-text { display: flex; align-items: baseline; gap: 6px; flex: 1; }
      .header h1 { font-size: 14px; font-weight: 700; color: #0a0a0a; letter-spacing: -0.02em; }
      .tier-badge {
        font-size: 9px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.08em; color: #9ca3af;
        border: 1px solid #e5e7eb; border-radius: 4px; padding: 1px 5px;
      }
      .gear-btn {
        background: none; border: none; cursor: pointer; color: #9ca3af;
        font-size: 15px; line-height: 1; padding: 2px 4px; border-radius: 4px;
        transition: color 120ms ease; flex-shrink: 0;
      }
      .gear-btn:hover { color: #374151; background: #f3f4f6; }
      .close-btn {
        background: none; border: none; cursor: pointer; color: #9ca3af;
        font-size: 18px; line-height: 1; padding: 2px 4px; border-radius: 4px;
        transition: color 120ms ease, background 120ms ease; flex-shrink: 0;
      }
      .close-btn:hover { color: #374151; background: #f3f4f6; }
      .tabs {
        display: flex;
        border-bottom: 1px solid #e5e7eb;
        background: #f9fafb;
      }
      .tab {
        flex: 1; padding: 8px 4px; background: none;
        border: none; border-bottom: 2px solid transparent;
        cursor: pointer; font-size: 11px; font-weight: 600; color: #6b7280;
        letter-spacing: 0.01em; transition: color 120ms ease, border-color 120ms ease;
        text-align: center;
      }
      .tab:hover { color: #374151; }
      .tab.active { color: #4f46e5; border-bottom-color: #4f46e5; }
      .tab-panel { display: none; padding: 14px; }
      .tab-panel.active { display: block; }

      /* Overview */
      .stats {
        display: flex; margin-bottom: 14px;
        border: 1px solid #f3f4f6; border-radius: 10px; overflow: hidden;
      }
      .stat { flex: 1; text-align: center; padding: 12px 8px; }
      .stat + .stat { border-left: 1px solid #f3f4f6; }
      .stat-value {
        font-family: ui-monospace, 'Cascadia Code', monospace;
        font-size: 22px; font-weight: 600; color: #4f46e5;
        line-height: 1; letter-spacing: -0.02em;
      }
      .stat-label {
        font-size: 9px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.08em; color: #9ca3af; margin-top: 4px;
      }
      .field-row {
        display: flex; align-items: center;
        justify-content: space-between; margin-bottom: 12px;
      }
      .field-label {
        font-size: 11px; font-weight: 600; color: #374151;
        text-transform: uppercase; letter-spacing: 0.06em;
      }
      select, input, textarea {
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 12px; color: #0a0a0a;
        border: 1px solid #e5e7eb; border-radius: 6px;
        padding: 5px 8px; background: #fff; outline: none;
        transition: border-color 120ms ease;
      }
      select:focus, input:focus, textarea:focus {
        border-color: #6366f1;
        box-shadow: 0 0 0 2px rgba(99,102,241,0.12);
      }
      .track-toggle {
        display: flex; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;
      }
      .tt-btn {
        flex: 1; border: none; border-right: 1px solid #e5e7eb; background: none;
        padding: 5px 10px; font-size: 11px; font-weight: 600; color: #6b7280;
        cursor: pointer; transition: background 120ms ease, color 120ms ease;
      }
      .tt-btn:last-child { border-right: none; }
      .tt-btn.active-auto   { background: #4f46e5; color: #fff; }
      .tt-btn.active-on     { background: #16a34a; color: #fff; }
      .tt-btn.active-off    { background: #dc2626; color: #fff; }
      .section-title {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 8px;
      }
      .recent-list { margin-bottom: 14px; }
      .recent-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 6px 0; border-bottom: 1px solid #f3f4f6; gap: 8px;
      }
      .recent-row:last-child { border-bottom: none; }
      .recent-company {
        font-size: 12px; font-weight: 500; color: #111827;
        flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .status-badge {
        font-size: 10px; font-weight: 600; padding: 2px 6px;
        border-radius: 20px; flex-shrink: 0;
        text-transform: uppercase; letter-spacing: 0.04em;
      }
      .status-sent { background: #eff6ff; color: #3b82f6; }
      .status-replied, .status-interviewing { background: #f0fdf4; color: #16a34a; }
      .status-offer { background: #fefce8; color: #ca8a04; }
      .status-ghosted { background: #fef2f2; color: #dc2626; }
      .recent-date { font-size: 10px; color: #9ca3af; flex-shrink: 0; }
      .open-btn, .action-btn {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        width: 100%; background: #4f46e5; color: #ffffff; border: none;
        border-radius: 8px; padding: 9px 14px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 12px; font-weight: 600; cursor: pointer;
        letter-spacing: -0.01em; transition: background 150ms ease;
      }
      .open-btn:hover, .action-btn:hover { background: #4338ca; }
      .action-btn:disabled { background: #a5b4fc; cursor: not-allowed; }
      .action-btn.secondary {
        background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;
      }
      .action-btn.secondary:hover { background: #e5e7eb; }

      /* Find Contacts */
      .form-group { margin-bottom: 10px; }
      .form-group label {
        display: block; font-size: 10px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.06em;
        color: #6b7280; margin-bottom: 4px;
      }
      .form-group input { width: 100%; }
      .results-list { margin-top: 12px; }
      .result-row {
        display: flex; align-items: center; gap: 8px;
        padding: 7px 0; border-bottom: 1px solid #f3f4f6;
      }
      .result-row:last-child { border-bottom: none; }
      .result-email {
        flex: 1; font-size: 12px; color: #111827;
        font-family: ui-monospace, monospace;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .result-score { font-size: 10px; color: #9ca3af; flex-shrink: 0; }
      .copy-btn {
        background: #f3f4f6; border: none; border-radius: 4px;
        padding: 3px 7px; cursor: pointer; font-size: 10px;
        font-weight: 600; color: #374151; flex-shrink: 0;
        transition: background 120ms ease;
      }
      .copy-btn:hover { background: #e5e7eb; }
      .copy-btn.copied { background: #dcfce7; color: #16a34a; }
      .status-msg {
        font-size: 11px; color: #6b7280; text-align: center;
        padding: 8px 0; font-style: italic;
      }

      /* Draft AI */
      .draft-textarea {
        width: 100%; height: 130px; resize: vertical;
        font-size: 12px; line-height: 1.5; padding: 8px;
        border-radius: 6px; margin-top: 10px;
        font-family: system-ui, -apple-system, sans-serif; color: #111827;
      }
      .btn-row { display: flex; gap: 8px; margin-top: 8px; }
      .btn-row .action-btn { flex: 1; }
      .autofill-note { font-size: 10px; color: #9ca3af; margin-top: 4px; font-style: italic; }
    </style>

    <div class="panel">
      <div class="header">
        <img src="${ICON_URL}" alt="Reach" />
        <div class="header-text">
          <h1>Reach</h1>
          <span class="tier-badge" id="cp-tier">Free</span>
        </div>
        <button class="gear-btn" id="cp-gear-btn" title="Dashboard">⚙</button>
        <button class="close-btn" aria-label="Close">&times;</button>
      </div>

      <div class="tabs">
        <button class="tab active" data-tab="overview">Overview</button>
        <button class="tab" data-tab="find">Find Contacts</button>
        <button class="tab" data-tab="draft">Draft AI</button>
      </div>

      <!-- Overview -->
      <div class="tab-panel active" id="cp-panel-overview">
        <div class="stats">
          <div class="stat">
            <div class="stat-value" id="cp-stat-sent">—</div>
            <div class="stat-label">Sent</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="cp-stat-replied">—</div>
            <div class="stat-label">Replied</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="cp-stat-rate">—</div>
            <div class="stat-label">Reply Rate</div>
          </div>
        </div>
        <div class="field-row" id="cp-tracking-row">
          <span class="field-label">Tracking</span>
          <div class="track-toggle" id="cp-track-toggle">
            <button class="tt-btn" data-mode="auto">Auto</button>
            <button class="tt-btn" data-mode="force_track">On</button>
            <button class="tt-btn" data-mode="force_skip">Off</button>
          </div>
        </div>
        <div class="section-title">Recent</div>
        <div class="recent-list" id="cp-recent"><div class="status-msg">Loading…</div></div>
        <button class="open-btn" id="cp-open-dash">Open Dashboard →</button>
      </div>

      <!-- Find Contacts -->
      <div class="tab-panel" id="cp-panel-find">
        <div class="form-group">
          <label>Domain</label>
          <input type="text" id="cp-domain" placeholder="stripe.com" />
        </div>
        <div class="form-group">
          <label>First Name</label>
          <input type="text" id="cp-first-name" placeholder="Aaron" />
        </div>
        <div class="form-group">
          <label>Last Name</label>
          <input type="text" id="cp-last-name" placeholder="Su" />
        </div>
        <button class="action-btn" id="cp-find-btn">Find Emails</button>
        <div class="results-list" id="cp-results"></div>
      </div>

      <!-- Draft AI -->
      <div class="tab-panel" id="cp-panel-draft">
        <div id="cp-draft-empty" class="status-msg" style="padding:24px 0">
          Open a compose window to use Draft AI.
        </div>
        <div id="cp-draft-form" style="display:none">
        <div class="form-group">
          <label>Type</label>
          <select id="cp-draft-type" style="width:100%">
            <option value="cold">Cold Outreach</option>
            <option value="bump">Follow-up</option>
            <option value="reply">Reply</option>
          </select>
        </div>
        <div class="form-group">
          <label>Company</label>
          <input type="text" id="cp-draft-company" placeholder="e.g. Stripe" />
        </div>
        <div class="form-group">
          <label>Contact Name</label>
          <input type="text" id="cp-draft-contact" placeholder="e.g. Hiring Team" />
        </div>
        <div class="form-group">
          <label>Notes (optional)</label>
          <input type="text" id="cp-draft-notes" placeholder="Any extra context…" />
        </div>
        <p class="autofill-note" id="cp-autofill-note"></p>
        <button class="action-btn" id="cp-generate-btn">Generate Draft ✨</button>
        <textarea class="draft-textarea" id="cp-draft-output" placeholder="Generated draft will appear here…"></textarea>
        <div class="btn-row">
          <button class="action-btn secondary" id="cp-copy-draft">Copy</button>
          <button class="action-btn" id="cp-insert-draft">Insert ↓</button>
        </div>
        </div> <!-- #cp-draft-form -->
      </div>
    </div>
  `;

  // ── Close ──
  shadow.querySelector('.close-btn').addEventListener('click', () => {
    host.style.display = 'none';
  });

  // ── Tabs ──
  const tabs = shadow.querySelectorAll('.tab');
  const panels = shadow.querySelectorAll('.tab-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      shadow.getElementById(`cp-panel-${tab.dataset.tab}`).classList.add('active');
      if (tab.dataset.tab === 'overview') loadOverviewData();
      if (tab.dataset.tab === 'draft') prefillDraftTab();
    });
  });

  // ── Overview: stats + recent ──
  function loadOverviewData() {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, (res) => {
      if (chrome.runtime.lastError || !res?.ok) return;
      shadow.getElementById('cp-stat-sent').textContent = res.sent;
      shadow.getElementById('cp-stat-replied').textContent = res.replied;
      shadow.getElementById('cp-stat-rate').textContent = res.rate;
    });
    chrome.runtime.sendMessage({ type: 'GET_RECENT' }, (res) => {
      const el = shadow.getElementById('cp-recent');
      if (chrome.runtime.lastError || !res?.ok || !res.recent?.length) {
        el.innerHTML = '<div class="status-msg">No recent outreach yet.</div>';
        return;
      }
      el.innerHTML = res.recent.map(r => {
        const cls = 'status-' + (r.status || 'sent').toLowerCase().replace(/\s+/g, '');
        return `<div class="recent-row">
          <span class="recent-company">${_cpEscapeHtml(r.company || 'Unknown')}</span>
          <span class="status-badge ${cls}">${_cpEscapeHtml(r.status || 'Sent')}</span>
          <span class="recent-date">${_cpRelativeDate(r.sentDate)}</span>
        </div>`;
      }).join('');
    });
  }

  // ── Overview: tracking 3-pill toggle ──
  const trackBtns = shadow.querySelectorAll('.tt-btn');

  function updateTrackToggle(mode) {
    trackBtns.forEach(b => b.classList.remove('active-auto', 'active-on', 'active-off'));
    const classMap = { auto: 'active-auto', force_track: 'active-on', force_skip: 'active-off' };
    const btn = shadow.querySelector(`.tt-btn[data-mode="${mode}"]`);
    if (btn) btn.classList.add(classMap[mode]);
  }

  trackBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (currentEditorEl) {
        editorManualModes.set(currentEditorEl, mode);
        updateWidget(currentEditorEl, editorAutoScores.get(currentEditorEl) || 0);
      }
      updateTrackToggle(mode);
      savedTrackingDefault = mode;
      try { chrome.storage.local.set({ trackingDefault: mode }); } catch (_) {}
    });
  });

  // ── Overview: open dashboard + gear btn ──
  chrome.runtime.sendMessage({ type: 'GET_RUNTIME_CONFIG' }, (res) => {
    const dashUrl = res?.config?.dashboardUrl ?? 'http://localhost:5173';
    shadow.getElementById('cp-open-dash').addEventListener('click', () => {
      window.open(dashUrl, '_blank');
    });
    shadow.getElementById('cp-gear-btn').addEventListener('click', () => {
      window.open(dashUrl, '_blank');
    });
  });

  // ── Find Contacts ──
  shadow.getElementById('cp-find-btn').addEventListener('click', () => {
    const domain = shadow.getElementById('cp-domain').value.trim();
    const firstName = shadow.getElementById('cp-first-name').value.trim();
    const lastName = shadow.getElementById('cp-last-name').value.trim();
    const resultsEl = shadow.getElementById('cp-results');

    if (!domain) {
      resultsEl.innerHTML = '<div class="status-msg">Enter a domain first.</div>';
      return;
    }

    resultsEl.innerHTML = '<div class="status-msg">Searching…</div>';
    const findBtn = shadow.getElementById('cp-find-btn');
    findBtn.disabled = true;
    findBtn.textContent = 'Searching…';

    chrome.runtime.sendMessage({ type: 'FIND_CONTACT', domain, firstName, lastName }, (res) => {
      findBtn.disabled = false;
      findBtn.textContent = 'Find Emails';

      if (chrome.runtime.lastError) {
        resultsEl.innerHTML = '<div class="status-msg">Error — check extension console.</div>';
        return;
      }

      const emails = res?.ok ? (res.emails || []) : [];
      const fallback = !res?.ok ? (res?.fallback || []) : [];

      if (emails.length) {
        resultsEl.innerHTML = emails.map((e, i) => `
          <div class="result-row" data-idx="${i}">
            <span class="result-email">${_cpEscapeHtml(e.value)}</span>
            ${e.score ? `<span class="result-score">${e.score}%</span>` : ''}
            <button class="copy-btn" data-email="${_cpEscapeHtml(e.value)}">Copy</button>
          </div>`).join('');
      } else if (fallback.length) {
        resultsEl.innerHTML =
          '<div class="status-msg" style="text-align:left;margin-bottom:8px;font-style:normal">No API key — common formats:</div>' +
          fallback.map((e, i) => `
            <div class="result-row" data-idx="${i}">
              <span class="result-email">${_cpEscapeHtml(e)}</span>
              <button class="copy-btn" data-email="${_cpEscapeHtml(e)}">Copy</button>
            </div>`).join('');
      } else {
        resultsEl.innerHTML = '<div class="status-msg">No results found.</div>';
      }

      resultsEl.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.email).then(() => {
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
          }).catch(() => {
            btn.textContent = 'Failed';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
          });
        });
      });
    });
  });

  // ── Draft AI: pre-fill from compose ──
  function prefillDraftTab() {
    shadow.getElementById('cp-draft-empty').style.display = currentEditorEl ? 'none' : '';
    shadow.getElementById('cp-draft-form').style.display = currentEditorEl ? '' : 'none';
    if (!currentEditorEl) return;
    const container =
      currentEditorEl.closest('[role="dialog"]') ||
      currentEditorEl.closest('.nH.if') ||
      currentEditorEl.closest('form') ||
      document;
    const subjectEl =
      container.querySelector('input[name="subjectbox"]') ||
      document.querySelector('input[name="subjectbox"]');
    const subject = (subjectEl?.value || '').trim();
    const toEls = Array.from(container.querySelectorAll('[email]'));
    const firstEmail = toEls[0]?.getAttribute('email') || '';
    const domain = firstEmail.split('@')[1] || '';
    const rawName = (toEls[0]?.textContent || '').trim().split(' ')[0];
    const contactName = rawName && rawName !== firstEmail ? rawName : '';
    const company = domain
      ? domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1)
      : '';

    if (company) shadow.getElementById('cp-draft-company').value = company;
    if (contactName) shadow.getElementById('cp-draft-contact').value = contactName;

    const note = shadow.getElementById('cp-autofill-note');
    note.textContent = subject || firstEmail
      ? `Auto-filled from compose${subject ? ': "' + subject.slice(0, 40) + (subject.length > 40 ? '…' : '') + '"' : ''}`
      : '';
  }

  // ── Draft AI: generate ──
  shadow.getElementById('cp-generate-btn').addEventListener('click', () => {
    const draftType = shadow.getElementById('cp-draft-type').value;
    const company = shadow.getElementById('cp-draft-company').value.trim();
    const contactName = shadow.getElementById('cp-draft-contact').value.trim();
    const notes = shadow.getElementById('cp-draft-notes').value.trim();

    let subject = '', bodySnippet = '';
    if (currentEditorEl) {
      const container =
        currentEditorEl.closest('[role="dialog"]') ||
        currentEditorEl.closest('.nH.if') ||
        currentEditorEl.closest('form') ||
        document;
      const subjectEl =
        container.querySelector('input[name="subjectbox"]') ||
        document.querySelector('input[name="subjectbox"]');
      subject = (subjectEl?.value || '').trim();
      bodySnippet = (currentEditorEl.innerText || '').trim().slice(0, 300);
    }

    const genBtn = shadow.getElementById('cp-generate-btn');
    genBtn.disabled = true;
    genBtn.textContent = 'Generating…';

    chrome.runtime.sendMessage(
      { type: 'DRAFT_EMAIL', draftType, company, contactName, subject, bodySnippet, notes },
      (res) => {
        genBtn.disabled = false;
        genBtn.textContent = 'Generate Draft ✨';
        const textarea = shadow.getElementById('cp-draft-output');
        if (chrome.runtime.lastError || !res?.ok) {
          textarea.value = res?.error || 'Error — check your Gemini API key in the Reach popup.';
          return;
        }
        textarea.value = res.text;
      }
    );
  });

  // ── Draft AI: copy ──
  shadow.getElementById('cp-copy-draft').addEventListener('click', () => {
    const text = shadow.getElementById('cp-draft-output').value;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const btn = shadow.getElementById('cp-copy-draft');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
  });

  // ── Draft AI: insert into compose ──
  shadow.getElementById('cp-insert-draft').addEventListener('click', () => {
    const text = shadow.getElementById('cp-draft-output').value;
    if (!text || !currentEditorEl) return;
    currentEditorEl.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    currentEditorEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });

  // ── setEditor: update context when panel is (re-)opened for a compose ──
  function setEditor(editorEl) {
    currentEditorEl = editorEl;
    updateTrackToggle(editorEl ? (editorManualModes.get(editorEl) || savedTrackingDefault) : savedTrackingDefault);
    shadow.getElementById('cp-draft-empty').style.display = editorEl ? 'none' : '';
    shadow.getElementById('cp-draft-form').style.display = editorEl ? '' : 'none';
    loadOverviewData();
    // Re-fill Draft AI tab if it's already active
    if (shadow.querySelector('.tab[data-tab="draft"]').classList.contains('active')) {
      prefillDraftTab();
    }
  }

  function syncTrackMode() {
    const mode = (currentEditorEl && editorManualModes.get(currentEditorEl)) || savedTrackingDefault;
    updateTrackToggle(mode);
  }

  return { host, setEditor, syncTrackMode };
}

// ── Toolbar icon → open panel (shares same context as widget) ──────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'OPEN_PANEL') openComposePanel(lastActiveEditor);
});
