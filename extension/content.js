// content.js — Reach Gmail compose detector
// Runs as a classic script (no ES module imports allowed in content scripts).
console.log('[Reach] Content script loaded on Gmail.');

// ─── Keyword matching (mirrors classifier.js) ─────────────────────────────────

const AUTO_KEYWORD_GROUPS = [
  { key: 'intern', variants: ['intern', 'interns', 'interned', 'interning', 'internship', 'internships'] },
  { key: 'coop', variants: ['coop'] },
  { key: 'fulltime', variants: ['fulltime'] },
  { key: 'parttime', variants: ['parttime'] },
  { key: 'candidate', variants: ['candidate', 'candidates'] },
  { key: 'hiring', variants: ['hiring', 'hire', 'hired'] },
  { key: 'recruit', variants: ['recruit', 'recruiter', 'recruiting', 'recruitment'] },
  { key: 'apply', variants: ['apply', 'application', 'applications'] },
  { key: 'resume', variants: ['resume', 'resumes', 'cv'] },
];

function normalizeText(text) {
  return text.toLowerCase().replace(/[-_]/g, '').replace(/[^a-z0-9\s]/g, ' ');
}

function tokenize(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

function editDistanceWithinLimit(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return false;
  if (a === b) return true;
  if (limit === 0) return false;

  const cols = b.length + 1;
  let prev = Array.from({ length: cols }, (_, i) => i);
  let curr = new Array(cols);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }

    if (rowMin > limit) return false;
    [prev, curr] = [curr, prev];
  }

  return prev[b.length] <= limit;
}

function tokenMatchesVariant(token, variant) {
  if (token === variant) return true;
  const limit = variant.length >= 9 ? 2 : variant.length >= 5 ? 1 : 0;
  return editDistanceWithinLimit(token, variant, limit);
}

function hasGroupMatch(tokenSet, variants) {
  for (const token of tokenSet) {
    for (const variant of variants) {
      if (tokenMatchesVariant(token, variant)) return true;
    }
  }
  return false;
}

function countKeywordMatches(text) {
  const tokens = new Set(tokenize(text));
  let score = 0;
  for (const group of AUTO_KEYWORD_GROUPS) {
    if (hasGroupMatch(tokens, group.variants)) score++;
  }
  return score;
}

// ─── Widget UI ─────────────────────────────────────────────────────────────────

const editorWidgets = new WeakMap();
const editorManualModes = new WeakMap(); // auto | force_track | force_skip
const editorAutoScores = new WeakMap();  // heuristic score for auto mode
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
      opacity: 0.35 !important;
      pointer-events: auto !important;
      cursor: pointer !important;
      box-shadow: 0 1px 5px rgba(0,0,0,0.22) !important;
      transition: opacity 0.2s ease, box-shadow 0.25s ease !important;
    }
    .oiq-w.oiq-partial {
      opacity: 1 !important;
      animation: oiq-ring 2.5s ease-in-out infinite !important;
    }
    .oiq-w.oiq-tracking {
      opacity: 1 !important;
    }
    .oiq-w.oiq-manual-track {
      opacity: 1 !important;
      outline: 2px solid #86efac !important;
      outline-offset: 1px !important;
    }
    .oiq-w.oiq-manual-skip {
      opacity: 1 !important;
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
    const nextMode = cycleManualMode(editorManualModes.get(editorEl) || 'auto');
    editorManualModes.set(editorEl, nextMode);
    updateWidget(editorEl, editorAutoScores.get(editorEl) || 0);
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
    liveEditors.delete(el);
  }
  observedEditors.add(el);
  console.log('[Reach] Attached to compose editor.');

  // Show the icon immediately when the compose window opens
  editorManualModes.set(el, 'auto');
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

    updateWidget(el, countKeywordMatches(combined));
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
        subjectHint: normalizeText(meta.subject).slice(0, 120),
        recipientsHint: normalizeText(meta.recipients).slice(0, 180)
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
  if (shouldScanEditors) scanForEditors();
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
setInterval(scanForEditors, 1500);

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
scanForEditors();

// Proactively warn if the extension context becomes invalidated while Gmail is
// open (e.g. extension reloaded/updated). Checks every 5s after a 10s grace
// period so it doesn't false-fire during initial script setup.
setTimeout(() => {
  setInterval(() => {
    if (!chrome.runtime?.id) showReloadBanner();
  }, 5000);
}, 10_000);
