# Extension Auth Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Gate the extension's compose panel and popup behind a JWT auth check, showing a ghost-background sign-in card to unauthenticated users that auto-unlocks when they log in on the web dashboard.

**Architecture:** Both `panel.js` (popup) and `compose-widget.js` (compose panel) gain an async JWT check at their open entry-points. If no token is found in `chrome.storage.local`, a shadow-DOM auth gate is rendered instead of normal content. A `chrome.storage.onChanged` listener watches `reach_jwt`; when the token is written by `dashboard-sync.js` after login, the listener tears itself down and re-opens the normal panel — no server or background.js changes required.

**Tech Stack:** Vanilla JS, Chrome Extensions API (`chrome.storage.local`, `chrome.storage.onChanged`, `chrome.runtime.sendMessage`), Shadow DOM.

---

## Reference

- Design doc: `docs/plans/2026-03-21-extension-auth-gate-design.md`
- Token storage key: `reach_jwt` (set by `extension/reach-auth.js`, synced by `extension/dashboard-sync.js`)
- Dashboard URL: fetched at runtime via `GET_RUNTIME_CONFIG` message → `res.config.dashboardUrl`, fallback `'http://localhost:5173'`
- Both files are **classic scripts** (no ES module imports). All Chrome APIs are available as globals.

---

### Task 1: Auth gate in `panel.js`

**Files:**
- Modify: `extension/panel.js`

The popup's IIFE has these module-level vars: `host`, `sentEl`, `repliedEl`, `rateEl`, `runtimeConfig`.
`showPanel()` is the entry point called on every open. `buildPanel()` builds the shadow DOM.

**Step 1: Add auth gate CSS**

Inside `buildPanel()`, at the end of the `style.textContent = \`...\`` block (just before the closing backtick on the `style.textContent` assignment), add:

```css
      /* ── Auth gate ───────────────────────────────── */
      .auth-gate {
        position: relative;
        overflow: hidden;
      }
      .auth-ghost {
        filter: blur(5px);
        opacity: 0.12;
        pointer-events: none;
        user-select: none;
      }
      .auth-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px 20px;
        gap: 10px;
        background: rgba(255,255,255,0.6);
        backdrop-filter: blur(2px);
      }
      .auth-logo {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        margin-bottom: 4px;
      }
      .auth-heading {
        font-family: 'Syne', sans-serif;
        font-size: 15px;
        font-weight: 700;
        color: #1c1917;
        letter-spacing: -0.02em;
        text-align: center;
        margin: 0;
      }
      .auth-sub {
        font-size: 11px;
        color: #78716c;
        text-align: center;
        line-height: 1.5;
        margin: 0;
      }
      .auth-btn-row {
        display: flex;
        gap: 8px;
        margin-top: 6px;
        width: 100%;
      }
      .auth-btn-primary {
        flex: 1;
        background: #b85212;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 9px 14px;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 150ms ease;
      }
      .auth-btn-primary:hover { background: #9a4310; }
      .auth-btn-secondary {
        flex: 1;
        background: #f6f5f1;
        color: #44403c;
        border: 1px solid #e6e3db;
        border-radius: 8px;
        padding: 9px 14px;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 150ms ease;
      }
      .auth-btn-secondary:hover { background: #ede9e3; }
```

**Step 2: Add `buildAuthPanel()` function**

Add this function directly after the closing brace of `buildPanel()` (before `function hidePanel()`):

```js
  function buildAuthPanel() {
    host = document.createElement('div');
    host.id = 'reach-panel-host';

    const shadow = host.attachShadow({ mode: 'closed' });

    if (!document.getElementById('reach-panel-fonts')) {
      const fontLink = document.createElement('link');
      fontLink.id = 'reach-panel-fonts';
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@700&family=Plus+Jakarta+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap';
      document.head.appendChild(fontLink);
    }

    // Re-use the same <style> from buildPanel — clone it
    const style = document.createElement('style');
    style.textContent = PANEL_STYLE_TEXT; // see Step 3
    shadow.appendChild(style);

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
      <div class="auth-gate">
        <div class="auth-ghost">
          <div class="stats">
            <div class="stat">
              <div class="stat-value">—</div>
              <div class="stat-label">Sent</div>
            </div>
            <div class="stat">
              <div class="stat-value">—</div>
              <div class="stat-label">Replied</div>
            </div>
            <div class="stat">
              <div class="stat-value">—</div>
              <div class="stat-label">Reply Rate</div>
            </div>
          </div>
          <div class="footer">
            <div style="height:38px;background:#b85212;border-radius:8px;opacity:0.6;"></div>
          </div>
        </div>
        <div class="auth-overlay">
          <img src="${ICON_URL}" class="auth-logo" alt="Reach" />
          <p class="auth-heading">Sign in to unlock Reach</p>
          <p class="auth-sub">Track outreach, find contacts,<br>and draft emails.</p>
          <div class="auth-btn-row">
            <button class="auth-btn-primary" id="auth-login-btn">Log in</button>
            <button class="auth-btn-secondary" id="auth-signup-btn">Create account</button>
          </div>
        </div>
      </div>
    `;
    shadow.appendChild(panel);

    const dashUrl = runtimeConfig.dashboardUrl || 'http://localhost:5173';
    shadow.getElementById('auth-login-btn').addEventListener('click', () => {
      window.open(dashUrl + '/login', '_blank');
    });
    shadow.getElementById('auth-signup-btn').addEventListener('click', () => {
      window.open(dashUrl + '/signup', '_blank');
    });

    // Auto-unlock: when JWT is written to storage, rebuild as normal panel
    function onStorageChanged(changes, area) {
      if (area !== 'local' || !changes.reach_jwt?.newValue) return;
      chrome.storage.onChanged.removeListener(onStorageChanged);
      host.remove();
      host = null;
      showPanel();
    }
    chrome.storage.onChanged.addListener(onStorageChanged);

    shadow.querySelector('.close-btn').addEventListener('click', () => {
      chrome.storage.onChanged.removeListener(onStorageChanged);
      hidePanel();
    });

    document.documentElement.appendChild(host);
  }
```

**Step 3: Extract style text constant + rewrite `showPanel()`**

The problem is that `buildAuthPanel()` needs the same CSS as `buildPanel()`. The cleanest fix is to extract the style text into a module-level constant before both build functions use it.

At the top of `buildPanel()`, the style is created inline. Extract it: move the CSS text into a constant `const PANEL_STYLE_TEXT = \`...\`` defined **at IIFE scope** (just after `let rateEl = null;`), then in both `buildPanel()` and `buildAuthPanel()` set `style.textContent = PANEL_STYLE_TEXT`.

Then rewrite `showPanel()`:

```js
  async function showPanel() {
    if (!host) {
      await getRuntimeConfig();
      const result = await new Promise(resolve =>
        chrome.storage.local.get('reach_jwt', resolve)
      );
      if (!result.reach_jwt) {
        buildAuthPanel();
        host.style.display = '';
        return;
      }
      buildPanel();
    }
    host.style.display = '';
    getRuntimeConfig().then(loadStats);
  }
```

Note: `getRuntimeConfig()` is called first so `runtimeConfig.dashboardUrl` is populated before `buildAuthPanel()` uses it.

**Step 4: Verify manually**

1. Make sure no `reach_jwt` key is in extension storage (chrome://extensions → Service Worker → Console → `chrome.storage.local.remove('reach_jwt')`)
2. Click the extension icon — should show auth gate with ghost stats + "Sign in to unlock Reach"
3. "Log in" and "Create account" buttons should open `localhost:5173/login` and `localhost:5173/signup` respectively
4. Close button should hide the panel
5. Set the token manually in console: `chrome.storage.local.set({ reach_jwt: 'test' })` — panel should auto-rebuild with normal stats content

**Step 5: Commit**

```bash
git add extension/panel.js
git commit -m "feat(extension): auth gate in popup with storage-sync unlock"
```

---

### Task 2: Auth gate in `compose-widget.js`

**Files:**
- Modify: `extension/compose-widget.js`

Key facts:
- `PANEL_STYLES` is the large CSS template literal (lines ~240–512). Add auth gate classes at its end.
- `openComposePanel(editorEl)` is the entry point (line ~1100). Currently synchronous.
- Module-level vars for panel state start at line ~1094: `_composePanelHost`, etc.
- `dashUrl` is not a global here — fetch it via `GET_RUNTIME_CONFIG` the same way Overview tab does (line 692).

**Step 1: Add auth gate CSS to `PANEL_STYLES`**

At the end of the `PANEL_STYLES` template literal (just before the closing backtick), add:

```css
  /* ── Auth gate ───────────────────────────────── */
  .cp-auth-gate {
    position: relative;
    overflow: hidden;
  }
  .cp-auth-ghost {
    filter: blur(5px);
    opacity: 0.12;
    pointer-events: none;
    user-select: none;
    padding: 14px;
  }
  .cp-auth-ghost .stats {
    display: flex;
    border: 1px solid #e6e3db;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 14px;
  }
  .cp-auth-ghost .stat { flex: 1; text-align: center; padding: 12px 8px; }
  .cp-auth-ghost .stat + .stat { border-left: 1px solid #e6e3db; }
  .cp-auth-ghost .stat-value {
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-size: 22px; font-weight: 500; color: #b85212; line-height: 1;
  }
  .cp-auth-ghost .stat-label {
    font-size: 9px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.08em; color: #78716c; margin-top: 4px;
  }
  .cp-auth-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 20px;
    gap: 10px;
    background: rgba(255,255,255,0.6);
    backdrop-filter: blur(2px);
  }
  .cp-auth-logo {
    width: 28px; height: 28px; border-radius: 7px; margin-bottom: 2px;
  }
  .cp-auth-heading {
    font-family: 'Syne', sans-serif;
    font-size: 14px; font-weight: 700; color: #1c1917;
    letter-spacing: -0.02em; text-align: center; margin: 0;
  }
  .cp-auth-sub {
    font-size: 11px; color: #78716c; text-align: center;
    line-height: 1.5; margin: 0;
  }
  .cp-auth-btn-row {
    display: flex; gap: 8px; margin-top: 6px; width: 100%;
  }
  .cp-auth-btn-primary {
    flex: 1; background: #b85212; color: #fff; border: none;
    border-radius: 8px; padding: 8px 12px;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    font-size: 12px; font-weight: 600; cursor: pointer;
    transition: background 150ms ease;
  }
  .cp-auth-btn-primary:hover { background: #9a4310; }
  .cp-auth-btn-secondary {
    flex: 1; background: #f6f5f1; color: #44403c;
    border: 1px solid #e6e3db; border-radius: 8px; padding: 8px 12px;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    font-size: 12px; font-weight: 600; cursor: pointer;
    transition: background 150ms ease;
  }
  .cp-auth-btn-secondary:hover { background: #ede9e3; }
  .cp-tabs-locked .tab { opacity: 0.35; pointer-events: none; cursor: default; }
```

**Step 2: Add `_composeAuthGateHost` module-level variable**

Directly below the existing panel state vars (after `let _composePanelLoadOverview = null;`), add:

```js
  let _composeAuthGateHost = null;
```

**Step 3: Add `showComposeAuthGate(editorEl)` function**

Add this new function directly before `openComposePanel`:

```js
  function showComposeAuthGate(editorEl) {
    // If auth gate already open for same editor, toggle it off
    if (_composeAuthGateHost && _composeAuthGateHost.style.display !== 'none') {
      _composeAuthGateHost.style.display = 'none';
      return;
    }

    if (!_composeAuthGateHost) {
      const ICON_URL = chrome.runtime.getURL('Reach.png');
      const host = document.createElement('div');
      host.id = 'reach-compose-auth-gate-host';
      host.style.display = 'none';

      ['keydown', 'keyup', 'keypress'].forEach(type =>
        host.addEventListener(type, e => e.stopPropagation(), true)
      );

      const shadow = host.attachShadow({ mode: 'closed' });
      shadow.innerHTML = `
        <style>${PANEL_STYLES}</style>
        <div class="panel">
          <div class="header">
            <img src="${ICON_URL}" alt="Reach" />
            <div class="header-text">
              <h1>Reach</h1>
              <span class="tier-badge">Free</span>
            </div>
            <button class="close-btn" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <div class="tabs cp-tabs-locked">
            <button class="tab active">Overview</button>
            <button class="tab">Find Contacts</button>
            <button class="tab">Draft AI</button>
          </div>
          <div class="cp-auth-gate">
            <div class="cp-auth-ghost">
              <div class="stats">
                <div class="stat">
                  <div class="stat-value">—</div>
                  <div class="stat-label">Sent</div>
                </div>
                <div class="stat">
                  <div class="stat-value">—</div>
                  <div class="stat-label">Replied</div>
                </div>
              </div>
              <div style="height:32px;background:#e6e3db;border-radius:8px;margin-bottom:10px;"></div>
              <div style="height:32px;background:#e6e3db;border-radius:8px;opacity:0.5;"></div>
            </div>
            <div class="cp-auth-overlay">
              <img src="${ICON_URL}" class="cp-auth-logo" alt="Reach" />
              <p class="cp-auth-heading">Sign in to unlock Reach</p>
              <p class="cp-auth-sub">Track outreach, find contacts,<br>and draft emails.</p>
              <div class="cp-auth-btn-row">
                <button class="cp-auth-btn-primary" id="cp-auth-login">Log in</button>
                <button class="cp-auth-btn-secondary" id="cp-auth-signup">Create account</button>
              </div>
            </div>
          </div>
        </div>
      `;

      // Fetch dashUrl via existing GET_RUNTIME_CONFIG pattern
      chrome.runtime.sendMessage({ type: 'GET_RUNTIME_CONFIG' }, (res) => {
        const dashUrl = res?.config?.dashboardUrl ?? 'http://localhost:5173';
        shadow.getElementById('cp-auth-login').addEventListener('click', () => window.open(dashUrl + '/login', '_blank'));
        shadow.getElementById('cp-auth-signup').addEventListener('click', () => window.open(dashUrl + '/signup', '_blank'));
      });

      // Auto-unlock when JWT is set
      function onStorageChanged(changes, area) {
        if (area !== 'local' || !changes.reach_jwt?.newValue) return;
        chrome.storage.onChanged.removeListener(onStorageChanged);
        _composeAuthGateHost.style.display = 'none';
        openComposePanel(editorEl);
      }
      chrome.storage.onChanged.addListener(onStorageChanged);

      shadow.querySelector('.close-btn').addEventListener('click', () => {
        chrome.storage.onChanged.removeListener(onStorageChanged);
        host.style.display = 'none';
      });

      document.documentElement.appendChild(host);
      _composeAuthGateHost = host;
    }

    _composeAuthGateHost.style.display = '';
  }
```

**Step 4: Make `openComposePanel` async + add JWT check**

Replace the existing `openComposePanel` function:

```js
  async function openComposePanel(editorEl) {
    // Auth gate check
    const result = await new Promise(resolve =>
      chrome.storage.local.get('reach_jwt', resolve)
    );
    if (!result.reach_jwt) {
      showComposeAuthGate(editorEl);
      return;
    }

    // Hide auth gate if previously shown
    if (_composeAuthGateHost) {
      _composeAuthGateHost.style.display = 'none';
    }

    if (!_composePanelHost) {
      const panel = buildComposePanel();
      _composePanelHost          = panel.host;
      _composePanelSetEditor     = panel.setEditor;
      _composePanelSyncTrackMode = panel.syncTrackMode;
      _composePanelLoadOverview  = panel.loadOverviewData;
      document.documentElement.appendChild(_composePanelHost);
    }

    const alreadyVisible = _composePanelHost.style.display !== 'none';
    const sameEditor     = _composePanelCurrentEditor === editorEl;

    if (alreadyVisible && sameEditor) {
      _composePanelHost.style.display = 'none';
      return;
    }

    _composePanelCurrentEditor = editorEl;
    _composePanelSetEditor(editorEl);
    _composePanelHost.style.display = '';
  }
```

**Step 5: Verify manually**

1. Ensure no JWT in extension storage: DevTools console on the Gmail tab → `chrome.storage.local.remove('reach_jwt')`
2. Open a compose window in Gmail — click the Reach widget
3. Confirm: auth gate appears with ghost stats, dimmed locked tabs, sign-in card
4. "Log in" and "Create account" open the dashboard
5. Close button hides the panel
6. Simulate sync: in console → `chrome.storage.local.set({ reach_jwt: 'fake-jwt' })`
7. Confirm: panel switches automatically to normal compose panel (will fail to load data since JWT is fake, but the gate should go away)
8. Clear the token: `chrome.storage.local.remove('reach_jwt')` — reopen compose widget → auth gate shows again

**Step 6: Commit**

```bash
git add extension/compose-widget.js
git commit -m "feat(extension): auth gate in compose panel with storage-sync unlock"
```

---

### Task 3: End-to-end auth sync test

No code changes — this task validates the full happy path.

**Step 1: Clear all extension state**

In DevTools console (Gmail tab or background service worker):
```js
chrome.storage.local.clear();
```

**Step 2: Verify both panels show auth gate**

- Open Gmail compose → click Reach widget → should show auth gate
- Click extension icon → should show auth gate in popup

**Step 3: Log in on the web dashboard**

1. Open `localhost:5173` (or click "Log in" button from either gate)
2. Log in with a valid account
3. `dashboard-sync.js` fires and writes `reach_jwt` to extension storage

**Step 4: Confirm auto-unlock**

- Without reloading Gmail, open the Reach compose widget — should show the normal panel with real data
- Click the extension popup icon — should show normal stats panel

**Step 5: Commit a test note** (optional)

```bash
git commit --allow-empty -m "test: verified auth gate e2e — gates, syncs, and unlocks correctly"
```
