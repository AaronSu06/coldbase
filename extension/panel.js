// panel.js — injected into any tab on extension icon click

(function () {
  if (window.__reachPanelInjected) {
    window.__reachPanelToggle?.();
    return;
  }
  window.__reachPanelInjected = true;

  const DEFAULT_CONFIG = {
    serverApiBase: 'http://localhost:3001/api',
    dashboardUrl: 'http://localhost:5173',
  };
  let runtimeConfig = { ...DEFAULT_CONFIG };
  let host = null;
  let sentEl = null;
  let repliedEl = null;
  let rateEl = null;

  function getRuntimeConfig() {
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

  async function loadStats() {
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

  function buildPanel() {
    host = document.createElement('div');
    host.id = 'reach-panel-host';

    const shadow = host.attachShadow({ mode: 'closed' });

    // Load brand fonts into the host document (font faces are not shadow-scoped)
    if (!document.getElementById('reach-panel-fonts')) {
      const fontLink = document.createElement('link');
      fontLink.id = 'reach-panel-fonts';
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@700&family=Plus+Jakarta+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap';
      document.head.appendChild(fontLink);
    }

    const style = document.createElement('style');
    style.textContent = `
      :host, * { box-sizing: border-box; margin: 0; padding: 0; }

      .panel {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        width: 300px;
        background: #ffffff;
        border-radius: 16px;
        box-shadow:
          0 8px 32px rgba(0, 0, 0, 0.14),
          0 2px 8px rgba(0, 0, 0, 0.08),
          0 0 0 1px rgba(0, 0, 0, 0.04);
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        font-size: 13px;
        color: #1c1917;
        overflow: hidden;
        animation: reach-slide-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes reach-slide-in {
        from { opacity: 0; transform: translateY(-10px) scale(0.95); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      .header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 16px;
        background: #f6f5f1;
        border-bottom: 1px solid #e6e3db;
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
        font-family: 'Syne', sans-serif;
        font-size: 15px;
        font-weight: 700;
        color: #1c1917;
        letter-spacing: -0.02em;
      }
      .header .subtitle {
        font-size: 11px;
        color: #78716c;
        font-weight: 400;
      }
      .close-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: #78716c;
        font-size: 18px;
        line-height: 1;
        padding: 2px 4px;
        border-radius: 4px;
        transition: color 120ms ease, background 120ms ease;
      }
      .close-btn:hover {
        color: #1c1917;
        background: #ede9e3;
      }

      .stats {
        display: flex;
        padding: 20px 16px;
        border-bottom: 1px solid #e6e3db;
      }
      .stat {
        flex: 1;
        text-align: center;
      }
      .stat + .stat {
        border-left: 1px solid #e6e3db;
      }
      .stat-value {
        font-family: 'IBM Plex Mono', ui-monospace, monospace;
        font-size: 28px;
        font-weight: 500;
        color: #b85212;
        line-height: 1;
        letter-spacing: -0.02em;
      }
      .stat-label {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #78716c;
        margin-top: 6px;
      }

      .footer {
        padding: 14px 16px;
      }
      .open-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        background: #b85212;
        color: #ffffff;
        border: none;
        border-radius: 8px;
        padding: 10px 14px;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        letter-spacing: -0.01em;
        transition: background 150ms ease;
      }
      .open-btn:hover { background: #9a4310; }
      .open-btn svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }
    `;

    const ICON_URL = chrome.runtime.getURL('Reach.png');

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

    shadow.querySelector('.close-btn').addEventListener('click', hidePanel);
    shadow.querySelector('.open-btn').addEventListener('click', () => {
      window.open(runtimeConfig.dashboardUrl, '_blank');
    });

    document.documentElement.appendChild(host);
  }

  function hidePanel() {
    if (host) host.style.display = 'none';
  }

  function showPanel() {
    if (!host) buildPanel();
    host.style.display = '';
    getRuntimeConfig().then(loadStats);
  }

  function toggle() {
    if (!host || host.style.display === 'none') {
      showPanel();
    } else {
      hidePanel();
    }
  }

  window.__reachPanelToggle = toggle;

  // Show immediately on first injection
  showPanel();
})();
