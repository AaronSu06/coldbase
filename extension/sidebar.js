// sidebar.js — injected into non-Gmail pages as a classic content script (no imports)

const ICON_URL = chrome.runtime.getURL('Reach.png');
const DEFAULT_CONFIG = {
  serverApiBase: 'http://localhost:3001/api',
  dashboardUrl: 'http://localhost:5173',
};
let runtimeConfig = { ...DEFAULT_CONFIG };

let host = null;
let sentEl = null;
let repliedEl = null;
let rateEl = null;
let trackToggleBtns = [];
let recentListEl = null;
let resultsEl = null;
let _updateTrackToggle = null; // set inside buildSidebar, called from onChanged

function fetchRuntimeConfig() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_RUNTIME_CONFIG' }, (response) => {
      if (chrome.runtime.lastError || !response?.ok || !response.config) {
        resolve();
        return;
      }
      runtimeConfig = { ...runtimeConfig, ...response.config };
      resolve();
    });
  });
}

function buildSidebar() {
  host = document.createElement('div');
  host.id = 'reach-sidebar-host';

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .panel {
      position: fixed;
      right: 16px;
      top: 16px;
      z-index: 2147483647;
      width: 320px;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 8px 32px rgba(0, 0, 0, 0.14);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      color: #0a0a0a;
      overflow: hidden;
    }

    /* ── Header ─────────────────────────────── */
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
    .close-btn {
      background: none; border: none; cursor: pointer; color: #9ca3af;
      display: flex; align-items: center; justify-content: center;
      padding: 3px; border-radius: 4px;
      transition: color 120ms ease, background 120ms ease; flex-shrink: 0;
    }
    .close-btn:hover { color: #374151; background: #f3f4f6; }

    /* ── Tabs ────────────────────────────────── */
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

    /* ── Stats ──────────────────────────────── */
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

    /* ── Field row / tracking ────────────────── */
    .field-row {
      display: flex; align-items: center;
      justify-content: space-between; margin-bottom: 12px;
    }
    .field-label {
      font-size: 11px; font-weight: 600; color: #374151;
      text-transform: uppercase; letter-spacing: 0.06em;
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
    .tt-btn.active-on  { background: #4f46e5; color: #fff; }
    .tt-btn.active-off { background: #6b7280; color: #fff; }

    /* ── Recent list ─────────────────────────── */
    .section-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 8px;
    }
    .recent-list { margin-bottom: 14px; max-height: 102px; overflow-y: auto; }
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
      border-radius: 6px; flex-shrink: 0;
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .status-sent        { background: #eff6ff; color: #3b82f6; }
    .status-replied,
    .status-applied     { background: #f5f3ff; color: #8b5cf6; }
    .status-interviewing{ background: #fffbeb; color: #f59e0b; }
    .status-offer       { background: #ecfdf5; color: #10b981; }
    .status-ghosted     { background: #fef2f2; color: #ef4444; }
    .recent-date { font-size: 10px; color: #9ca3af; flex-shrink: 0; }

    /* ── Buttons ─────────────────────────────── */
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

    /* ── Find Contacts form ───────────────────── */
    .form-group { margin-bottom: 10px; }
    .form-group label {
      display: block; font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.06em;
      color: #6b7280; margin-bottom: 4px;
    }
    .form-group input {
      width: 100%;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px; color: #0a0a0a;
      border: 1px solid #e5e7eb; border-radius: 6px;
      padding: 5px 8px; background: #fff; outline: none;
      transition: border-color 120ms ease;
    }
    .form-group input:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 2px rgba(99,102,241,0.12);
    }

    /* ── Results list ────────────────────────── */
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
    .copy-btn {
      background: #f3f4f6; border: none; border-radius: 4px;
      padding: 3px 7px; cursor: pointer; font-size: 10px;
      font-weight: 600; color: #374151; flex-shrink: 0;
      transition: background 120ms ease;
    }
    .copy-btn:hover { background: #e5e7eb; }
    .copy-btn.copied { background: #dcfce7; color: #16a34a; }

    /* ── Status / empty messages ─────────────── */
    .status-msg {
      font-size: 11px; color: #6b7280; text-align: center;
      padding: 8px 0; font-style: italic;
    }
  `;

  const panel = document.createElement('div');
  panel.className = 'panel';

  panel.innerHTML = `
    <div class="header">
      <img src="${ICON_URL}" alt="Reach" />
      <div class="header-text">
        <h1>Reach</h1>
      </div>
      <button class="close-btn" aria-label="Close">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
        </svg>
      </button>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="find">Find Contacts</button>
      <button class="tab" data-tab="draft">Draft AI</button>
    </div>

    <!-- Overview -->
    <div class="tab-panel active" id="sb-panel-overview">
      <div class="stats">
        <div class="stat">
          <div class="stat-value" id="sb-stat-sent">—</div>
          <div class="stat-label">Sent</div>
        </div>
        <div class="stat">
          <div class="stat-value" id="sb-stat-replied">—</div>
          <div class="stat-label">Replied</div>
        </div>
        <div class="stat">
          <div class="stat-value" id="sb-stat-rate">—</div>
          <div class="stat-label">Reply Rate</div>
        </div>
      </div>
      <div class="field-row">
        <span class="field-label">Tracking</span>
        <div class="track-toggle" id="sb-track-toggle">
          <button class="tt-btn" data-mode="force_track">On</button>
          <button class="tt-btn" data-mode="force_skip">Off</button>
        </div>
      </div>
      <div class="section-title">Recent</div>
      <div class="recent-list" id="sb-recent"><div class="status-msg">Loading\u2026</div></div>
      <button class="open-btn" id="sb-open-dash">Open Dashboard \u2192</button>
    </div>

    <!-- Find Contacts -->
    <div class="tab-panel" id="sb-panel-find">
      <div class="form-group">
        <label>Domain or Company</label>
        <input type="text" id="sb-domain" placeholder="e.g. stripe.com" autocomplete="off" spellcheck="false" />
      </div>
      <div class="form-group">
        <label>First Name</label>
        <input type="text" id="sb-first-name" placeholder="Optional" />
      </div>
      <div class="form-group">
        <label>Last Name</label>
        <input type="text" id="sb-last-name" placeholder="Optional" />
      </div>
      <div id="sb-find-warning" style="font-size:11px;color:#dc2626;margin-bottom:6px;display:none"></div>
      <button class="action-btn" id="sb-find-btn">Find Emails</button>
      <div class="results-list" id="sb-results"></div>
    </div>

    <!-- Draft AI (permanently disabled on non-Gmail pages) -->
    <div class="tab-panel" id="sb-panel-draft">
      <div class="status-msg" style="padding:24px 16px;text-align:center;color:#6b7280">
        Open a compose window to use this feature.
      </div>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(panel);

  // Store shadow-internal element references at build time
  sentEl    = shadow.getElementById('sb-stat-sent');
  repliedEl = shadow.getElementById('sb-stat-replied');
  rateEl    = shadow.getElementById('sb-stat-rate');
  recentListEl = shadow.getElementById('sb-recent');
  resultsEl    = shadow.getElementById('sb-results');
  trackToggleBtns = Array.from(shadow.querySelectorAll('#sb-track-toggle .tt-btn'));

  // ── Close button ──────────────────────────────────────────────────────────
  shadow.querySelector('.close-btn').addEventListener('click', hideSidebar);

  // ── Tab switching ─────────────────────────────────────────────────────────
  const tabs   = Array.from(shadow.querySelectorAll('.tab'));
  const panels = Array.from(shadow.querySelectorAll('.tab-panel'));
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((t)   => t.classList.toggle('active', t.dataset.tab === target));
      panels.forEach((p) => {
        const matches = p.id === `sb-panel-${target}`;
        p.classList.toggle('active', matches);
        // Load recent list on overview tab switch
        if (matches && target === 'overview') {
          loadRecent();
        }
      });
    });
  });

  // ── Tracking toggle ───────────────────────────────────────────────────────
  _updateTrackToggle = function (mode) {
    if (!trackToggleBtns.length) return;
    trackToggleBtns.forEach((btn) => {
      const isOn  = btn.dataset.mode === 'force_track';
      const isOff = btn.dataset.mode === 'force_skip';
      btn.classList.remove('active-on', 'active-off');
      if (mode === 'force_track' && isOn)  btn.classList.add('active-on');
      if (mode === 'force_skip'  && isOff) btn.classList.add('active-off');
      if (mode === 'auto') {
        // 'auto' — highlight On as the default
        if (isOn) btn.classList.add('active-on');
      }
    });
  };

  // Load initial tracking state from storage
  chrome.storage.local.get(['trackingDefault'], (data) => {
    _updateTrackToggle(data.trackingDefault || 'force_track');
  });

  trackToggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      _updateTrackToggle(mode);
      try { chrome.storage.local.set({ trackingDefault: mode }); } catch (e) {}
    });
  });

  // ── Dashboard button ──────────────────────────────────────────────────────
  shadow.getElementById('sb-open-dash').addEventListener('click', () => {
    window.open(runtimeConfig.dashboardUrl, '_blank');
  });

  // ── Find Contacts ─────────────────────────────────────────────────────────
  const findBtn     = shadow.getElementById('sb-find-btn');
  const warningEl   = shadow.getElementById('sb-find-warning');
  const domainInput = shadow.getElementById('sb-domain');
  const firstInput  = shadow.getElementById('sb-first-name');
  const lastInput   = shadow.getElementById('sb-last-name');

  findBtn.addEventListener('click', () => {
    const domain = (domainInput.value || '').trim();
    if (!domain) {
      warningEl.textContent = 'Please enter a domain or company name.';
      warningEl.style.display = '';
      return;
    }
    warningEl.style.display = 'none';
    resultsEl.innerHTML = '<div class="status-msg">Searching\u2026</div>';
    findBtn.disabled = true;

    chrome.runtime.sendMessage(
      {
        type: 'FIND_CONTACT',
        domain: domain,
        firstName: (firstInput.value || '').trim(),
        lastName:  (lastInput.value  || '').trim(),
      },
      (response) => {
        findBtn.disabled = false;
        if (chrome.runtime.lastError || !response?.ok) {
          resultsEl.innerHTML = '<div class="status-msg">Could not reach server. Is it running?</div>';
          return;
        }
        const emails = response.emails || [];
        if (!emails.length) {
          resultsEl.innerHTML = '<div class="status-msg">No emails found.</div>';
          return;
        }
        resultsEl.innerHTML = emails.map((e) => {
          const addr = typeof e === 'string' ? e : (e.email || e.address || String(e));
          return `
            <div class="result-row">
              <span class="result-email" title="${_sbEscapeHtml(addr)}">${_sbEscapeHtml(addr)}</span>
              <button class="copy-btn" data-email="${_sbEscapeHtml(addr)}">Copy</button>
            </div>
          `;
        }).join('');

        // Wire copy buttons
        resultsEl.querySelectorAll('.copy-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            navigator.clipboard.writeText(btn.dataset.email).then(() => {
              btn.textContent = 'Copied!';
              btn.classList.add('copied');
              setTimeout(() => {
                btn.textContent = 'Copy';
                btn.classList.remove('copied');
              }, 1500);
            }).catch(() => {});
          });
        });
      }
    );
  });

  document.documentElement.appendChild(host);
}

// ── HTML escape helper ─────────────────────────────────────────────────────
function _sbEscapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hideSidebar() {
  if (host) host.style.display = 'none';
}

function showSidebar() {
  if (!host) buildSidebar();
  host.style.display = '';
  fetchRuntimeConfig().then(() => {
    loadStats();
    loadRecent();
  });
}

function loadStats() {
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      if (sentEl)    sentEl.textContent    = '—';
      if (repliedEl) repliedEl.textContent = '—';
      if (rateEl)    rateEl.textContent    = '—';
      return;
    }
    if (sentEl)    sentEl.textContent    = response.sent;
    if (repliedEl) repliedEl.textContent = response.replied;
    if (rateEl)    rateEl.textContent    = response.rate;
  });
}

function loadRecent() {
  if (!recentListEl) return;
  recentListEl.innerHTML = '<div class="status-msg">Loading\u2026</div>';
  chrome.runtime.sendMessage({ type: 'GET_RECENT' }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      recentListEl.innerHTML = '<div class="status-msg">Could not load recent activity.</div>';
      return;
    }
    const recent = response.recent || [];
    if (!recent.length) {
      recentListEl.innerHTML = '<div class="status-msg">No recent emails yet.</div>';
      return;
    }
    recentListEl.innerHTML = recent.map((row) => {
      const company = _sbEscapeHtml(row.company || '—');
      const status  = _sbEscapeHtml(row.status  || 'sent');
      const date    = _sbEscapeHtml(row.sentDate ? _sbRelativeDate(row.sentDate) : '');
      return `
        <div class="recent-row">
          <span class="recent-company" title="${company}">${company}</span>
          <span class="status-badge status-${status.toLowerCase()}">${status}</span>
          ${date ? `<span class="recent-date">${date}</span>` : ''}
        </div>
      `;
    }).join('');
  });
}

function _sbRelativeDate(isoString) {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const d = Math.floor(diffMs / 86400000);
    if (d === 0) return 'today';
    if (d === 1) return '1d ago';
    if (d < 7)  return `${d}d ago`;
    const w = Math.floor(d / 7);
    if (w === 1) return '1w ago';
    if (w < 5)  return `${w}w ago`;
    return `${Math.floor(d / 30)}mo ago`;
  } catch (e) { return ''; }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'TOGGLE_SIDEBAR') return;

  if (!host || host.style.display === 'none') {
    showSidebar();
  } else {
    hideSidebar();
  }
});

// Refresh stats when background signals a scan completed — but only if the
// sidebar is currently visible so we avoid unnecessary API calls.
// Also keep the tracking toggle in sync with changes made on Gmail tabs.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if ('outreachiq_scan_complete' in changes && changes.outreachiq_scan_complete.newValue) {
    if (host && host.style.display !== 'none') {
      loadStats();
    }
  }
  // Keep tracking toggle in sync with changes made on Gmail tabs
  if ('trackingDefault' in changes) {
    if (_updateTrackToggle) {
      _updateTrackToggle(changes.trackingDefault.newValue || 'force_track');
    }
  }
});
