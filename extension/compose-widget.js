// compose-widget.js — Compose panel UI widget
// Classic script (no ES module imports). Exposes window.ReachWidget namespace.
// Loaded before content.js per manifest order; window.ReachLogger is available.

window.ReachWidget = (function () {
  const log = window.ReachLogger('compose-widget');

  // Module-local reference to shared state (set by init)
  let _state = null;

  // ─── Rendering helpers ───────────────────────────────────────────────────────

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
    } catch (e) { log.debug('_cpRelativeDate parse error:', e?.message); return ''; }
  }

  // ─── Widget styles ───────────────────────────────────────────────────────────

  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected || document.getElementById('oiq-w-style')) return;
    stylesInjected = true;
    // Load brand fonts into the host document (font faces are not shadow-scoped)
    if (!document.getElementById('reach-widget-fonts')) {
      const fontLink = document.createElement('link');
      fontLink.id = 'reach-widget-fonts';
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@700&family=Plus+Jakarta+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap';
      document.head.appendChild(fontLink);
    }
    const s = document.createElement('style');
    s.id = 'oiq-w-style';
    s.textContent = `
      .oiq-w {
        position: fixed !important;
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
      .oiq-w.oiq-tracking-on {
        opacity: 1 !important;
      }
      .oiq-w img.oiq-icon {
        width: 26px !important;
        height: 26px !important;
        display: block !important;
        object-fit: cover !important;
      }
    `;
    document.head.appendChild(s);
  }

  const ICON_IMG = `<img class="oiq-icon" src="${chrome.runtime.getURL('Reach.png')}" alt="Reach" />`;

  // ─── Widget DOM helpers ──────────────────────────────────────────────────────

  // Returns the nearest compose dialog or document — used for form-field lookups.
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

  // Detect if a neighboring extension widget occupies the default top-right position.
  function detectNeighborRect(editorEl, widgetEl) {
    const editorRect = editorEl.getBoundingClientRect();
    const HALF = 14;
    const probeX = editorRect.right - 4 - HALF;

    widgetEl.style.visibility = 'hidden';

    let neighborRect = null;
    const probeYs = [
      editorRect.top + 8,
      editorRect.top + 14,
      editorRect.top + 4,
    ];

    for (const testY of probeYs) {
      const el = document.elementFromPoint(probeX, testY);
      if (!el || el === document.body || editorEl.contains(el) || el.contains(editorEl)) continue;
      if (el.classList.contains('oiq-w')) continue; // skip other Reach widgets
      neighborRect = el.getBoundingClientRect();
      break;
    }

    widgetEl.style.visibility = '';
    return neighborRect;
  }

  // Widget is position:fixed, so all coordinates are viewport-relative.
  // container param is kept for API compatibility with email-detector.js resize handler.
  function placeWidget(editorEl, _container, w) {
    const HORIZONTAL_NUDGE_PX = 1;
    const VERTICAL_GAP_PX = 8;
    const editorRect = editorEl.getBoundingClientRect();
    const neighborRect = detectNeighborRect(editorEl, w);
    let topPx, rightPx;
    if (neighborRect) {
      topPx   = neighborRect.bottom + VERTICAL_GAP_PX;
      rightPx = window.innerWidth - neighborRect.right - HORIZONTAL_NUDGE_PX;
    } else {
      topPx   = editorRect.top - 6;
      rightPx = window.innerWidth - editorRect.right + 4;
    }
    w.style.bottom = '';
    w.style.left   = '';
    w.style.top    = topPx + 'px';
    w.style.right  = rightPx + 'px';
    w.style.border = '';
  }

  // Clears per-editor state from all shared WeakMaps — delegates to content.js via state
  function clearEditorState(el) {
    _state.editorWidgets.delete(el);
    _state.editorManualModes.delete(el);
    _state.editorAutoScores.delete(el);
    _state.editorScoreSeq.delete(el);
    _state.liveEditors.delete(el);
  }

  // Widget is always appended to document.body and uses position:fixed so that it renders
  // on top of any extension (e.g. Mailtrack) that wraps the compose dialog with
  // overflow:hidden or otherwise acts as a clipping containing block.
  function getOrCreateWidget(editorEl) {
    // Guard: _state is null if ReachWidget.init() hasn't run yet (can happen if
    // ReachDetector.init() calls scanForEditors synchronously before ReachWidget.init()).
    if (!_state) {
      return null;
    }
    if (_state.editorWidgets.has(editorEl)) return _state.editorWidgets.get(editorEl);
    injectStyles();

    const w = document.createElement('div');
    w.className = 'oiq-w';
    w.innerHTML = ICON_IMG;
    w.addEventListener('click', () => {
      _state.lastActiveEditor = editorEl;
      openComposePanel(editorEl);
    });
    document.body.appendChild(w);
    _state.editorWidgets.set(editorEl, w);
    _state.liveEditors.add(editorEl);

    placeWidget(editorEl, null, w);

    // Re-probe at 300ms — other extensions may inject widgets a few ms after ours.
    setTimeout(() => {
      if (document.body.contains(w) && document.body.contains(editorEl)) {
        placeWidget(editorEl, null, w);
      }
    }, 300);

    return w;
  }

  function updateWidget(editorEl) {
    // Guard: if _state not set yet, bail silently (init order issue).
    if (!_state) {
      return;
    }
    if (!document.body.contains(editorEl)) {
      if (_state.editorWidgets.has(editorEl)) {
        _state.editorWidgets.get(editorEl).remove();
        clearEditorState(editorEl);
      }
      // If the active editor was removed, promote the next live editor (UI-SYNC-01)
      if (_state.lastActiveEditor === editorEl) {
        _state.lastActiveEditor = null;
        for (const e of _state.liveEditors) {
          if (document.body.contains(e)) {
            _state.lastActiveEditor = e;
            break;
          }
        }
        if (_state.lastActiveEditor) updateWidget(_state.lastActiveEditor);
      }
      return;
    }

    const w = getOrCreateWidget(editorEl);
    const manualMode = _state.editorManualModes.get(editorEl) || 'force_track';

    if (manualMode === 'force_track') {
      w.classList.add('oiq-tracking-on');
      w.title = 'Reach: tracking ON';
    } else {
      w.classList.remove('oiq-tracking-on');
      w.title = 'Reach: tracking OFF';
    }

    // Show widget ONLY on the most-recently-focused editor (UI-SYNC-01)
    const isActive = (_state.lastActiveEditor === editorEl);
    w.style.display = isActive ? '' : 'none';
  }

  // ─── Compose panel styles ────────────────────────────────────────────────────

  const PANEL_STYLES = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :host {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-size: 13px;
      color: #1c1917;
    }
    .panel {
      width: 320px;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.14);
      animation: cp-slide-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
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
      background: #f6f5f1;
      border-bottom: 1px solid #e6e3db;
    }
    .header img { width: 18px; height: 18px; border-radius: 4px; flex-shrink: 0; }
    .header-text { display: flex; align-items: baseline; gap: 6px; flex: 1; }
    .header h1 { font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700; color: #1c1917; letter-spacing: -0.02em; }
    .tier-badge {
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: #78716c;
      border: 1px solid #e6e3db; border-radius: 4px; padding: 1px 5px;
    }
    .gear-btn {
      background: none; border: none; cursor: pointer; color: #78716c;
      display: flex; align-items: center; justify-content: center;
      padding: 3px; border-radius: 4px;
      transition: color 120ms ease, background 120ms ease; flex-shrink: 0;
    }
    .gear-btn:hover { color: #1c1917; background: #ede9e3; }
    .close-btn {
      background: none; border: none; cursor: pointer; color: #78716c;
      display: flex; align-items: center; justify-content: center;
      padding: 3px; border-radius: 4px;
      transition: color 120ms ease, background 120ms ease; flex-shrink: 0;
    }
    .close-btn:hover { color: #1c1917; background: #ede9e3; }
    .tabs {
      display: flex;
      border-bottom: 1px solid #e6e3db;
      background: #f6f5f1;
    }
    .tab {
      flex: 1; padding: 8px 4px; background: none;
      border: none; border-bottom: 2px solid transparent;
      cursor: pointer; font-size: 11px; font-weight: 600; color: #78716c;
      letter-spacing: 0.01em; transition: color 120ms ease, border-color 120ms ease;
      text-align: center; font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    }
    .tab:hover { color: #1c1917; }
    .tab.active { color: #b85212; border-bottom-color: #b85212; }
    .tab-panel { display: none; padding: 14px; }
    .tab-panel.active { display: block; }
    .stats {
      display: flex; margin-bottom: 14px;
      border: 1px solid #e6e3db; border-radius: 10px; overflow: hidden;
    }
    .stat { flex: 1; text-align: center; padding: 12px 8px; }
    .stat + .stat { border-left: 1px solid #e6e3db; }
    .stat-value {
      font-family: 'IBM Plex Mono', ui-monospace, monospace;
      font-size: 22px; font-weight: 500; color: #b85212;
      line-height: 1; letter-spacing: -0.02em;
    }
    .stat-label {
      font-size: 9px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: #78716c; margin-top: 4px;
    }
    .field-row {
      display: flex; align-items: center;
      justify-content: space-between; margin-bottom: 12px;
    }
    .field-label {
      font-size: 11px; font-weight: 600; color: #44403c;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    select, input, textarea {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-size: 12px; color: #1c1917;
      border: 1px solid #e6e3db; border-radius: 6px;
      padding: 5px 8px; background: #fff; outline: none;
      transition: border-color 120ms ease;
    }
    select:focus, input:focus, textarea:focus {
      border-color: #b85212;
      box-shadow: 0 0 0 2px rgba(184,82,18,0.12);
    }
    .track-toggle {
      display: flex; border: 1px solid #e6e3db; border-radius: 8px; overflow: hidden;
    }
    .tt-btn {
      flex: 1; border: none; border-right: 1px solid #e6e3db; background: none;
      padding: 5px 10px; font-size: 11px; font-weight: 600; color: #78716c;
      cursor: pointer; transition: background 120ms ease, color 120ms ease;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    }
    .tt-btn:last-child { border-right: none; }
    .tt-btn.active-on  { background: #b85212; color: #fff; }
    .tt-btn.active-off { background: #78716c; color: #fff; }
    .section-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: #78716c; margin-bottom: 8px;
    }
    .recent-list { margin-bottom: 14px; max-height: 102px; overflow-y: auto; }
    .recent-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 0; border-bottom: 1px solid #e6e3db; gap: 8px;
    }
    .recent-row:last-child { border-bottom: none; }
    .recent-company {
      font-size: 12px; font-weight: 500; color: #1c1917;
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
    .status-interviewing{ background: #fefce8; color: #ca8a04; }
    .status-offer       { background: #ecfdf5; color: #10b981; }
    .status-ghosted     { background: #fef2f2; color: #ef4444; }
    .recent-date { font-size: 10px; color: #78716c; flex-shrink: 0; }
    .open-btn, .action-btn {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      width: 100%; background: #b85212; color: #ffffff; border: none;
      border-radius: 8px; padding: 9px 14px;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-size: 12px; font-weight: 600; cursor: pointer;
      letter-spacing: -0.01em; transition: background 150ms ease;
    }
    .open-btn:hover, .action-btn:hover { background: #9a4310; }
    .action-btn:disabled { background: #d4a07a; cursor: not-allowed; }
    .action-btn.secondary {
      background: #f6f5f1; color: #44403c; border: 1px solid #e6e3db;
    }
    .action-btn.secondary:hover { background: #ede9e3; }
    .form-group { margin-bottom: 10px; }
    .form-group label {
      display: block; font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.06em;
      color: #78716c; margin-bottom: 4px;
    }
    .form-group input { width: 100%; }
    .results-list { margin-top: 12px; }
    .result-row {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 0; border-bottom: 1px solid #e6e3db;
    }
    .result-row:last-child { border-bottom: none; }
    .result-email {
      flex: 1; font-size: 12px; color: #1c1917;
      font-family: 'IBM Plex Mono', ui-monospace, monospace;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .result-score { font-size: 10px; color: #78716c; flex-shrink: 0; }
    .copy-btn {
      background: #f6f5f1; border: none; border-radius: 4px;
      padding: 3px 7px; cursor: pointer; font-size: 10px;
      font-weight: 600; color: #44403c; flex-shrink: 0;
      transition: background 120ms ease;
    }
    .copy-btn:hover { background: #ede9e3; }
    .copy-btn.copied { background: #dcfce7; color: #16a34a; }
    .status-msg {
      font-size: 11px; color: #78716c; text-align: center;
      padding: 8px 0; font-style: italic;
    }
    .draft-textarea {
      width: 100%; height: 130px; resize: vertical;
      font-size: 12px; line-height: 1.5; padding: 8px;
      border-radius: 6px; margin-top: 10px;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #1c1917;
    }
    .btn-row { display: flex; gap: 8px; margin-top: 8px; }
    .btn-row .action-btn { flex: 1; }
    .autofill-note { font-size: 10px; color: #78716c; margin-top: 4px; font-style: italic; }
    .result-status { font-size:9px; font-weight:700; padding:2px 5px; border-radius:10px;
      flex-shrink:0; text-transform:uppercase; letter-spacing:0.04em; }
    .result-status.verified    { background:#dcfce7; color:#16a34a; }
    .result-status.unconfirmed { background:#fefce8; color:#ca8a04; }
    .result-status.unreachable { background:#f6f5f1; color:#78716c; }
    .result-source { font-size:9px; color:#78716c; flex-shrink:0; font-style:italic; }

  /* ── Search box ─────────────────────────────── */
  .cp-search-box {
    position: relative;
    display: flex;
    align-items: center;
    border: 1.5px solid #e6e3db;
    border-radius: 8px;
    background: #fff;
    margin-bottom: 10px;
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }
  .cp-search-box:focus-within {
    border-color: #b85212;
    box-shadow: 0 0 0 2px rgba(184,82,18,0.12);
  }
  .cp-search-favicon {
    width: 18px; height: 18px; flex-shrink: 0;
    margin-left: 8px; border-radius: 3px; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; color: #fff; background: transparent;
  }
  .cp-search-favicon img { width: 18px; height: 18px; display: block; object-fit: contain; }
  .cp-search-input {
    flex: 1; min-width: 0;
    border: none !important; box-shadow: none !important;
    border-radius: 0 !important; background: transparent !important;
    padding: 6px 4px 6px 6px; font-size: 12px; color: #1c1917; outline: none;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  }
  .cp-search-input:focus { border: none !important; box-shadow: none !important; }
  .cp-search-clear {
    flex-shrink: 0; background: none; border: none; cursor: pointer;
    color: #78716c; font-size: 16px; line-height: 1; padding: 0 8px;
    transition: color 120ms ease; align-self: stretch;
    display: flex; align-items: center;
  }
  .cp-search-clear:hover { color: #1c1917; }

  /* ── Domain dropdown ────────────────────────── */
  .cp-domain-dropdown {
    position: absolute;
    top: calc(100% + 4px); left: -1.5px; right: -1.5px;
    background: #fff; border: 1.5px solid #e6e3db; border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    z-index: 10; overflow: hidden; max-height: 220px; overflow-y: auto;
  }
  .cp-domain-row {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 10px; cursor: pointer;
    border-bottom: 1px solid #e6e3db; transition: background 100ms ease;
  }
  .cp-domain-row:last-child { border-bottom: none; }
  .cp-domain-row:hover { background: #fdf3ec; }
  .cp-domain-favicon {
    width: 18px; height: 18px; flex-shrink: 0; border-radius: 3px; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 700; color: #fff; background: transparent;
  }
  .cp-domain-favicon img { width: 18px; height: 18px; display: block; object-fit: contain; }
  .cp-domain-name {
    flex: 1; font-size: 12px; font-weight: 500; color: #1c1917;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
  }
  .cp-domain-tld { font-size: 11px; color: #78716c; font-family: 'IBM Plex Mono', ui-monospace, monospace; flex-shrink: 0; }
  .cp-domain-mx {
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
    color: #16a34a; background: #f0fdf4; border-radius: 4px; padding: 1px 5px; flex-shrink: 0;
  }
  .cp-dropdown-status {
    font-size: 11px; color: #78716c; text-align: center; padding: 10px 0; font-style: italic;
  }
  `;

  // ─── Panel HTML ──────────────────────────────────────────────────────────────

  function getPanelHTML(iconUrl) {
    return `
      <div class="panel">
        <div class="header">
          <img src="${iconUrl}" alt="Reach" />
          <div class="header-text">
            <h1>Reach</h1>
            <span class="tier-badge" id="cp-tier">Free</span>
          </div>
          <button class="gear-btn" id="cp-gear-btn" title="Dashboard">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
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
              <button class="tt-btn" data-mode="force_track">On</button>
              <button class="tt-btn" data-mode="force_skip">Off</button>
            </div>
          </div>
          <div class="section-title">Recent</div>
          <div class="recent-list" id="cp-recent"><div class="status-msg">Loading\u2026</div></div>
          <button class="open-btn" id="cp-open-dash">Open Dashboard \u2192</button>
        </div>

        <!-- Find Contacts -->
        <div class="tab-panel" id="cp-panel-find">
          <div class="cp-search-box" id="cp-search-box">
            <div class="cp-search-favicon" id="cp-search-favicon"></div>
            <input
              type="text"
              class="cp-search-input"
              id="cp-company"
              placeholder="Enter a domain or company name\u2026"
              autocomplete="off"
              spellcheck="false"
            />
            <button class="cp-search-clear" id="cp-search-clear" aria-label="Clear" style="display:none">&times;</button>
            <div class="cp-domain-dropdown" id="cp-domain-dropdown" style="display:none"></div>
          </div>
          <div class="form-group">
            <label>First Name</label>
            <input type="text" id="cp-first-name" placeholder="Optional" />
          </div>
          <div class="form-group">
            <label>Last Name</label>
            <input type="text" id="cp-last-name" placeholder="Optional" />
          </div>
          <div id="cp-find-warning" style="font-size:11px;color:#dc2626;margin-bottom:6px;display:none"></div>
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
              <input type="text" id="cp-draft-notes" placeholder="Any extra context\u2026" />
            </div>
            <p class="autofill-note" id="cp-autofill-note"></p>
            <button class="action-btn" id="cp-generate-btn">Generate Draft \u2728</button>
            <textarea class="draft-textarea" id="cp-draft-output" placeholder="Generated draft will appear here\u2026"></textarea>
            <div class="btn-row">
              <button class="action-btn secondary" id="cp-copy-draft">Copy</button>
              <button class="action-btn" id="cp-insert-draft">Insert \u2193</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ─── Tab setup ───────────────────────────────────────────────────────────────

  // Sets up the Overview tab: stats, recent list, tracking toggle, dashboard button.
  // Returns loadOverviewData so buildComposePanel can call it on tab switch.
  function setupOverviewTab(shadow, ctx, updateTrackToggle) {
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

    // Tracking toggle
    shadow.querySelectorAll('.tt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        // Always resolve the most-recent live editor — ctx.currentEditorEl may be stale
        // if the compose window was closed/reopened without the panel being toggled.
        const liveEditor =
          (ctx.currentEditorEl && document.body.contains(ctx.currentEditorEl))
            ? ctx.currentEditorEl
            : (_state.lastActiveEditor && document.body.contains(_state.lastActiveEditor)
                ? _state.lastActiveEditor
                : null);
        if (liveEditor) {
          ctx.currentEditorEl = liveEditor; // keep ctx fresh
          _state.editorManualModes.set(liveEditor, mode);
          updateWidget(liveEditor);
        }
        updateTrackToggle(mode);
        _state.savedTrackingDefault = mode;
        try { chrome.storage.local.set({ trackingDefault: mode }); } catch (e) { log.error('Failed to persist trackingDefault:', e); }
      });
    });

    // Dashboard + gear buttons — fetched once at panel creation time.
    chrome.runtime.sendMessage({ type: 'GET_RUNTIME_CONFIG' }, (res) => {
      const dashUrl = res?.config?.dashboardUrl ?? 'http://localhost:5173';
      shadow.getElementById('cp-open-dash').addEventListener('click', () => window.open(dashUrl, '_blank'));
      shadow.getElementById('cp-gear-btn').addEventListener('click', () => window.open(dashUrl, '_blank'));
    });

    return loadOverviewData;
  }

  // Sets up the Find Contacts tab: search bar, domain dropdown, email finder.
  function setupFindTab(shadow) {
    var CP_AVATAR_COLORS = ['#6366f1','#8b5cf6','#14b8a6','#f59e0b','#f43f5e','#0ea5e9'];
    function _cpAvatarColor(s) {
      var h = s.split('').reduce(function(a, c) { return a * 31 + c.charCodeAt(0); }, 0);
      return CP_AVATAR_COLORS[Math.abs(h) % CP_AVATAR_COLORS.length];
    }
    function _cpTitleCase(str) {
      return str.replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    }

    // State
    var _cpSelectedDomain = null;
    var _cpDebounceTimer  = null;
    var _cpLastQuery      = '';

    // Refs
    var searchInput   = shadow.getElementById('cp-company');
    var searchFavicon = shadow.getElementById('cp-search-favicon');
    var clearBtn      = shadow.getElementById('cp-search-clear');
    var dropdown      = shadow.getElementById('cp-domain-dropdown');

    // Show placeholder icon by default
    var _cpPlaceholderImg = document.createElement('img');
    _cpPlaceholderImg.src = chrome.runtime.getURL('Placeholder.png');
    searchFavicon.appendChild(_cpPlaceholderImg);

    // Set favicon img in a slot element; fallback to colored initial on error
    function _cpSetFavicon(el, domain, label) {
      var img = document.createElement('img');
      img.src = 'https://www.google.com/s2/favicons?domain=' + domain + '&sz=64';
      img.onerror = function() {
        el.innerHTML = '';
        el.style.background = _cpAvatarColor(label || domain);
        el.textContent = (label || domain).charAt(0).toUpperCase();
      };
      img.onload = function() {
        el.innerHTML = '';
        el.style.background = 'transparent';
        el.appendChild(img);
      };
    }

    function _cpHideDropdown() {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
    }

    function _cpShowDropdown(domains, query) {
      if (!domains || !domains.length) { _cpHideDropdown(); return; }
      dropdown.innerHTML = '';
      domains.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'cp-domain-row';

        var favEl = document.createElement('div');
        favEl.className = 'cp-domain-favicon';
        _cpSetFavicon(favEl, item.domain, query);
        row.appendChild(favEl);

        var nameEl = document.createElement('span');
        nameEl.className = 'cp-domain-name';
        nameEl.textContent = _cpTitleCase(item.domain.replace(/\.[^.]+$/, ''));
        row.appendChild(nameEl);

        var tldEl = document.createElement('span');
        tldEl.className = 'cp-domain-tld';
        tldEl.textContent = item.domain;
        row.appendChild(tldEl);

        if (item.hasMX) {
          var mxEl = document.createElement('span');
          mxEl.className = 'cp-domain-mx';
          mxEl.textContent = 'MX';
          row.appendChild(mxEl);
        }

        row.addEventListener('click', function() { _cpSelectDomain(item.domain, query); });
        dropdown.appendChild(row);
      });
      dropdown.style.display = 'block';
    }

    function _cpSelectDomain(domain, company) {
      _cpSelectedDomain = domain;
      searchInput.value = domain;
      clearBtn.style.display = '';
      _cpHideDropdown();
      _cpSetFavicon(searchFavicon, domain, company);
    }

    function _cpResetSelection() {
      _cpSelectedDomain = null;
      searchFavicon.innerHTML = '';
      searchFavicon.style.background = 'transparent';
      searchFavicon.appendChild(_cpPlaceholderImg);
    }

    function _cpTriggerSuggest(query) {
      _cpLastQuery = query;
      clearTimeout(_cpDebounceTimer);
      if (query.length < 2) { _cpHideDropdown(); return; }
      dropdown.innerHTML = '<div class="cp-dropdown-status">Searching\u2026</div>';
      dropdown.style.display = 'block';
      _cpDebounceTimer = setTimeout(function() {
        chrome.runtime.sendMessage({ type: 'SUGGEST_DOMAINS', company: query }, function(res) {
          if (query !== _cpLastQuery) return; // stale
          if (chrome.runtime.lastError || !res || !res.ok) { _cpHideDropdown(); return; }
          _cpShowDropdown(res.domains, query);
        });
      }, 350);
    }

    searchInput.addEventListener('input', function() {
      var val = this.value.trim();
      clearBtn.style.display = val ? '' : 'none';
      _cpResetSelection();
      _cpTriggerSuggest(val);
    });

    clearBtn.addEventListener('click', function() {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      _cpResetSelection();
      _cpHideDropdown();
      searchInput.focus();
    });

    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') _cpHideDropdown();
    });

    // Dismiss dropdown on click outside (within shadow DOM)
    shadow.addEventListener('click', function(e) {
      var box = shadow.getElementById('cp-search-box');
      if (box && !box.contains(e.target)) _cpHideDropdown();
    }, true);

    // Find Emails button
    shadow.getElementById('cp-find-btn').addEventListener('click', function() {
      var company   = searchInput.value.trim();
      var firstName = shadow.getElementById('cp-first-name').value.trim();
      var lastName  = shadow.getElementById('cp-last-name').value.trim();
      var resultsEl = shadow.getElementById('cp-results');
      var warningEl = shadow.getElementById('cp-find-warning');
      var findBtn   = shadow.getElementById('cp-find-btn');

      _cpHideDropdown();
      warningEl.style.display = 'none';
      warningEl.textContent   = '';

      if (!company) {
        resultsEl.innerHTML = '<div class="status-msg">Enter a company name or domain first.</div>';
        return;
      }
      var hasFirst = firstName.length > 0;
      var hasLast  = lastName.length > 0;
      if (hasFirst !== hasLast) {
        warningEl.textContent   = 'Please enter both first and last name, or leave both empty.';
        warningEl.style.display = 'block';
        return;
      }

      resultsEl.innerHTML = '<div class="status-msg">Searching\u2026</div>';
      findBtn.disabled    = true;
      findBtn.textContent = 'Searching\u2026';

      var msg = { type: 'FIND_CONTACT', company: company, firstName: firstName, lastName: lastName };
      if (_cpSelectedDomain) msg.domain = _cpSelectedDomain;

      chrome.runtime.sendMessage(msg, function(res) {
        findBtn.disabled    = false;
        findBtn.textContent = 'Find Emails';
        if (chrome.runtime.lastError) {
          resultsEl.innerHTML = '<div class="status-msg">Error \u2014 check extension console.</div>';
          return;
        }
        if (res && res.ok && res.results && res.results.length) {
          resultsEl.innerHTML = res.results.map(function(r, i) {
            var sc = r.status ? r.status.toLowerCase() : 'unconfirmed';
            var sl = r.source ? r.source.replace('gemini-', '').replace('-', ' ') : '';
            return '<div class="result-row" data-idx="' + i + '">'
              + '<span class="result-email">'  + _cpEscapeHtml(r.email)  + '</span>'
              + '<span class="result-status ' + sc + '">' + _cpEscapeHtml(r.status) + '</span>'
              + '<span class="result-score">'  + r.confidence + '%</span>'
              + '<span class="result-source">' + _cpEscapeHtml(sl) + '</span>'
              + '<button class="copy-btn" data-email="' + _cpEscapeHtml(r.email) + '">Copy</button>'
              + '</div>';
          }).join('');
        } else if (!res || !res.ok) {
          var msgs = {
            no_domain:     'Could not resolve a domain for this company.',
            no_mx:         'No mail server found for this domain.',
            no_candidates: 'No public emails found for this company.',
            all_invalid:   'Unable to find email for this person/company.',
          };
          resultsEl.innerHTML = '<div class="status-msg">'
            + _cpEscapeHtml(msgs[res && res.reason] || 'Unable to find email.') + '</div>';
        } else {
          resultsEl.innerHTML = '<div class="status-msg">No results found.</div>';
        }
        resultsEl.querySelectorAll('.copy-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            navigator.clipboard.writeText(btn.dataset.email).then(function() {
              btn.textContent = 'Copied!'; btn.classList.add('copied');
              setTimeout(function() { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
            }).catch(function() {
              btn.textContent = 'Failed';
              setTimeout(function() { btn.textContent = 'Copy'; }, 1500);
            });
          });
        });
      });
    });
  }

  // Sets up the Draft AI tab: type/company/contact/notes form, generate, copy, insert.
  // Returns prefillDraftTab so buildComposePanel can call it when the tab is activated.
  function setupDraftTab(shadow, ctx) {
    function prefillDraftTab() {
      shadow.getElementById('cp-draft-empty').style.display = ctx.currentEditorEl ? 'none' : '';
      shadow.getElementById('cp-draft-form').style.display  = ctx.currentEditorEl ? '' : 'none';
      if (!ctx.currentEditorEl) return;

      const container = getComposeContainer(ctx.currentEditorEl);
      const subjectEl =
        container.querySelector('input[name="subjectbox"]') ||
        document.querySelector('input[name="subjectbox"]');
      const subject    = (subjectEl?.value || '').trim();
      const toEls      = Array.from(container.querySelectorAll('[email]'));
      const firstEmail = toEls[0]?.getAttribute('email') || '';
      const domain     = firstEmail.split('@')[1] || '';
      const rawName    = (toEls[0]?.textContent || '').trim().split(' ')[0];
      const contactName = rawName && rawName !== firstEmail ? rawName : '';
      const domainParts = domain.split('.');
      const domainRoot  = domainParts.length >= 2 ? domainParts[domainParts.length - 2] : domainParts[0];
      const company    = domainRoot
        ? domainRoot.charAt(0).toUpperCase() + domainRoot.slice(1)
        : '';

      if (company)     shadow.getElementById('cp-draft-company').value = company;
      if (contactName) shadow.getElementById('cp-draft-contact').value = contactName;

      const note = shadow.getElementById('cp-autofill-note');
      note.textContent = subject || firstEmail
        ? `Auto-filled from compose${subject ? ': "' + subject.slice(0, 40) + (subject.length > 40 ? '\u2026' : '') + '"' : ''}`
        : '';
    }

    // Generate button
    shadow.getElementById('cp-generate-btn').addEventListener('click', () => {
      const draftType   = shadow.getElementById('cp-draft-type').value;
      const company     = shadow.getElementById('cp-draft-company').value.trim();
      const contactName = shadow.getElementById('cp-draft-contact').value.trim();
      const notes       = shadow.getElementById('cp-draft-notes').value.trim();
      const genBtn      = shadow.getElementById('cp-generate-btn');

      let subject = '', bodySnippet = '';
      if (ctx.currentEditorEl) {
        const container = getComposeContainer(ctx.currentEditorEl);
        const subjectEl =
          container.querySelector('input[name="subjectbox"]') ||
          document.querySelector('input[name="subjectbox"]');
        subject     = (subjectEl?.value || '').trim();
        bodySnippet = (ctx.currentEditorEl.innerText || '').trim().slice(0, 300);
      }

      genBtn.disabled = true;
      genBtn.textContent = 'Generating\u2026';

      chrome.runtime.sendMessage(
        { type: 'DRAFT_EMAIL', draftType, company, contactName, subject, bodySnippet, notes },
        (res) => {
          genBtn.disabled = false;
          genBtn.textContent = 'Generate Draft \u2728';
          const textarea = shadow.getElementById('cp-draft-output');
          if (chrome.runtime.lastError || !res?.ok) {
            textarea.value = res?.error || 'Error \u2014 check that the Reach server is running.';
            return;
          }
          textarea.value = res.text;
        }
      );
    });

    // Copy button
    shadow.getElementById('cp-copy-draft').addEventListener('click', () => {
      const text = shadow.getElementById('cp-draft-output').value;
      if (!text) return;
      const btn = shadow.getElementById('cp-copy-draft');
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      });
    });

    // Insert into compose button
    shadow.getElementById('cp-insert-draft').addEventListener('click', () => {
      const text = shadow.getElementById('cp-draft-output').value;
      if (!text || !ctx.currentEditorEl) return;
      ctx.currentEditorEl.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      ctx.currentEditorEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });

    return prefillDraftTab;
  }

  // ─── Build compose panel ─────────────────────────────────────────────────────

  function buildComposePanel() {
    const ICON_URL = chrome.runtime.getURL('Reach.png');
    const host = document.createElement('div');
    host.id = 'reach-compose-panel-host';
    host.style.display = 'none';
    const shadow = host.attachShadow({ mode: 'closed' });

    // Gmail intercepts keydown/keyup/keypress — block propagation so shadow inputs work.
    ['keydown', 'keyup', 'keypress'].forEach(type =>
      host.addEventListener(type, e => e.stopPropagation(), true)
    );

    shadow.innerHTML = `<style>${PANEL_STYLES}</style>${getPanelHTML(ICON_URL)}`;

    // Shared mutable context — all tab setup functions read/write ctx.currentEditorEl.
    const ctx = { currentEditorEl: null };

    // Shared toggle updater used by Overview tab setup and setEditor/syncTrackMode.
    const trackBtns = shadow.querySelectorAll('.tt-btn');
    function updateTrackToggle(mode) {
      trackBtns.forEach(b => b.classList.remove('active-on', 'active-off'));
      const classMap = { force_track: 'active-on', force_skip: 'active-off' };
      const btn = shadow.querySelector(`.tt-btn[data-mode="${mode}"]`);
      if (btn && classMap[mode]) btn.classList.add(classMap[mode]);
    }

    // Wire up tabs.
    const tabs         = shadow.querySelectorAll('.tab');
    const panels       = shadow.querySelectorAll('.tab-panel');
    const loadOverviewData = setupOverviewTab(shadow, ctx, updateTrackToggle);
    const prefillDraftTab  = setupDraftTab(shadow, ctx);
    setupFindTab(shadow);

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        shadow.getElementById(`cp-panel-${tab.dataset.tab}`).classList.add('active');
        if (tab.dataset.tab === 'overview') loadOverviewData();
        if (tab.dataset.tab === 'draft')    prefillDraftTab();
      });
    });

    // Close button
    shadow.querySelector('.close-btn').addEventListener('click', () => {
      host.style.display = 'none';
    });

    // Update ctx + UI when the panel is opened for a (possibly different) editor.
    function setEditor(editorEl) {
      ctx.currentEditorEl = editorEl;
      const mode = editorEl
        ? (_state.editorManualModes.get(editorEl) || _state.savedTrackingDefault || 'force_track')
        : (_state.savedTrackingDefault || 'force_track');
      updateTrackToggle(mode);
      shadow.getElementById('cp-draft-empty').style.display = editorEl ? 'none' : '';
      shadow.getElementById('cp-draft-form').style.display  = editorEl ? '' : 'none';
      loadOverviewData();
      if (shadow.querySelector('.tab[data-tab="draft"]').classList.contains('active')) {
        prefillDraftTab();
      }
    }

    // Sync toggle — also refreshes ctx to the most recent live editor.
    function syncTrackMode() {
      const liveEditor = (_state.lastActiveEditor && document.body.contains(_state.lastActiveEditor))
        ? _state.lastActiveEditor
        : ctx.currentEditorEl;
      if (liveEditor) ctx.currentEditorEl = liveEditor;
      const mode = (ctx.currentEditorEl && _state.editorManualModes.get(ctx.currentEditorEl))
        || _state.savedTrackingDefault
        || 'force_track';
      updateTrackToggle(mode);
    }

    loadOverviewData();
    return { host, setEditor, syncTrackMode, loadOverviewData };
  }

  // ─── Panel state + open ──────────────────────────────────────────────────────

  let _composePanelHost           = null;
  let _composePanelSetEditor      = null;
  let _composePanelSyncTrackMode  = null;
  let _composePanelCurrentEditor  = null;
  let _composePanelLoadOverview   = null;

  function openComposePanel(editorEl) {
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

  function syncTrackMode() {
    _composePanelSyncTrackMode?.();
  }

  // Refresh the Overview tab data — called by content.js when background signals
  // that a scan completed. Only refreshes if the panel is currently visible so
  // we don't make unnecessary network requests.
  function refreshOverview() {
    if (_composePanelHost && _composePanelHost.style.display !== 'none') {
      _composePanelLoadOverview?.();
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  function init(state) {
    _state = state;
    injectStyles();
    log.debug('ReachWidget initialized.');
  }

  // attach: called externally, mirrors getOrCreateWidget
  function attach(editorEl) {
    getOrCreateWidget(editorEl);
  }

  return {
    init,
    attach,
    update: updateWidget,
    openComposePanel,
    syncTrackMode,
    refreshOverview,
    clearEditorState,
    getComposeContainer,
    getComposeMetadata,
    placeWidget,
  };
})();
