// sidebar.js — injected into Gmail pages as a classic content script (no imports)

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
    :host, * { box-sizing: border-box; margin: 0; padding: 0; }

    .panel {
      position: fixed;
      right: 0;
      top: 72px;
      z-index: 2147483647;
      width: 300px;
      background: #ffffff;
      border-radius: 12px 0 0 12px;
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.13);
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
      padding: 14px 16px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }
    .header img {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .header-text {
      display: flex;
      align-items: baseline;
      gap: 6px;
      flex: 1;
    }
    .header h1 {
      font-size: 15px;
      font-weight: 700;
      color: #0a0a0a;
      letter-spacing: -0.02em;
    }
    .header .subtitle {
      font-size: 11px;
      color: #9ca3af;
      font-weight: 400;
    }
    .close-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: #9ca3af;
      font-size: 18px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 4px;
      transition: color 120ms ease, background 120ms ease;
    }
    .close-btn:hover {
      color: #374151;
      background: #f3f4f6;
    }

    /* ── Stats ──────────────────────────────── */
    .stats {
      display: flex;
      padding: 20px 16px;
      gap: 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .stat {
      flex: 1;
      text-align: center;
    }
    .stat + .stat {
      border-left: 1px solid #f3f4f6;
    }
    .stat-value {
      font-family: ui-monospace, 'Cascadia Code', monospace;
      font-size: 28px;
      font-weight: 600;
      color: #4f46e5;
      line-height: 1;
      letter-spacing: -0.02em;
    }
    .stat-label {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #9ca3af;
      margin-top: 6px;
    }

    /* ── Footer ─────────────────────────────── */
    .footer {
      padding: 14px 16px;
    }
    .open-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      background: #4f46e5;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 10px 14px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: -0.01em;
      transition: background 150ms ease;
    }
    .open-btn:hover { background: #4338ca; }
    .open-btn svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
  `;

  const panel = document.createElement('div');
  panel.className = 'panel';

  panel.innerHTML = `
    <div class="header">
      <img src="${ICON_URL}" alt="Reach" />
      <div class="header-text">
        <h1>Reach</h1>
        <span class="subtitle">outreach tracker</span>
      </div>
      <button class="close-btn" aria-label="Close">&times;</button>
    </div>
    <div class="stats">
      <div class="stat">
        <div class="stat-value" id="stat-sent">—</div>
        <div class="stat-label">Sent</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="stat-replied">—</div>
        <div class="stat-label">Replied</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="stat-rate">—</div>
        <div class="stat-label">Reply Rate</div>
      </div>
    </div>
    <div class="footer">
      <button class="open-btn">
        Open Dashboard
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 8h10M9 4l4 4-4 4"/>
        </svg>
      </button>
    </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(panel);

  sentEl = shadow.getElementById('stat-sent');
  repliedEl = shadow.getElementById('stat-replied');
  rateEl = shadow.getElementById('stat-rate');

  shadow.querySelector('.close-btn').addEventListener('click', hideSidebar);
  shadow.querySelector('.open-btn').addEventListener('click', () => {
    window.open(runtimeConfig.dashboardUrl, '_blank');
  });

  document.documentElement.appendChild(host);
}

function hideSidebar() {
  if (host) host.style.display = 'none';
}

function showSidebar() {
  if (!host) buildSidebar();
  host.style.display = '';
  fetchRuntimeConfig().then(loadStats);
}

function loadStats() {
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      if (sentEl) sentEl.textContent = '—';
      if (repliedEl) repliedEl.textContent = '—';
      if (rateEl) rateEl.textContent = '—';
      return;
    }
    if (sentEl) sentEl.textContent = response.sent;
    if (repliedEl) repliedEl.textContent = response.replied;
    if (rateEl) rateEl.textContent = response.rate;
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'TOGGLE_SIDEBAR') return;

  if (!host || host.style.display === 'none') {
    showSidebar();
  } else {
    hideSidebar();
  }
});
