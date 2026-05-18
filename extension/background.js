import { countKeywordMatches } from './classifier.js';
import { SERVER_URL, DASH_URL } from './config.js';
import { serverFetch, fetchOutreach } from './api-client.js';
import { checkReplies, trackLatestSent, trackFromPendingScan } from './reply-checker.js';
import { getColdbaseToken, setColdbaseToken, clearColdbaseToken } from './coldbase-auth.js';
import { makeLogger } from './logger-esm.js';

const log = makeLogger('background');

// ─── Event listeners ──────────────────────────────────────────────────────────

// Primary scan trigger from content.js.
// Uses storage instead of sendMessage to avoid the MV3 ES module race condition:
// when sendMessage cold-starts a terminated SW, the onMessage listener may not
// yet be registered (imports not complete). chrome.storage.onChanged does not
// have this problem — Chrome fully initializes the SW before dispatching it.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'coldbase_pending_scan' in changes) {
    const pendingScan = changes.coldbase_pending_scan?.newValue;
    if (!pendingScan) return; // delete event fired by remove() below — ignore
    chrome.storage.local.remove('coldbase_pending_scan');
    log.info('Storage trigger received — running trackLatestSent.');
    trackLatestSent(false, pendingScan).then(async (tracked) => {
      // If Gmail API path failed (OAuth unavailable) AND the content script
      // provided email metadata, attempt the direct-POST fallback.
      if (!tracked && (pendingScan?.emailSubject || pendingScan?.emailRecipients)) {
        log.info('Gmail API path returned false — attempting content-script data fallback.');
        tracked = await trackFromPendingScan(pendingScan).catch((e) => {
          log.error('trackFromPendingScan threw:', e.message);
          return false;
        });
      }

      // Notify all content scripts that a scan completed so they can refresh
      // the panel UI. We use storage (not sendMessage) to avoid the MV3
      // service-worker cold-start race, and to reach all open Gmail tabs at once.
      chrome.storage.local.set({ coldbase_scan_complete: { ts: Date.now(), tracked: !!tracked } }, () => {
        void chrome.runtime.lastError; // suppress unchecked-error warning
        // Remove immediately after writing so onChanged fires on every send.
        chrome.storage.local.remove('coldbase_scan_complete', () => {
          void chrome.runtime.lastError;
        });
      });
    });
  }
});

async function checkJwtPresent() {
  const token = await getColdbaseToken();
  if (!token) {
    log.warn(`No Coldbase JWT in storage. Visit ${DASH_URL} and log in to sync your session.`);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  log.info('Extension installed.');
  checkJwtPresent();
  chrome.alarms.create('coldbase-reply-check', { periodInMinutes: 30 });
});

chrome.runtime.onStartup.addListener(() => {
  checkJwtPresent();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'coldbase-reply-check') {
    log.info('Alarm fired — checking for replies.');
    await checkReplies();
  }
});

const COMPOSE_SCRIPTS = ['logger.js', 'email-detector.js', 'compose-widget.js', 'tracking.js', 'content.js'];

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  // On dashboard pages only dashboard-sync.js runs — the OPEN_PANEL message is
  // delivered (no connection error) but silently ignored, so we must inject the
  // compose scripts first before sending OPEN_PANEL.
  const isDashboard = /coldbase\.live|localhost:5173/.test(tab.url || '');
  if (isDashboard) {
    const [check] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => typeof window.ColdbaseWidget !== 'undefined',
    }).catch(() => [{ result: false }]);
    if (!check?.result) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: COMPOSE_SCRIPTS })
        .catch(() => {});
    }
    chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' }, () => { void chrome.runtime.lastError; });
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' }, () => {
    const err = chrome.runtime.lastError;
    // "Could not establish connection" = no content script yet — inject and retry
    if (!err?.message?.includes('Could not establish connection')) return;
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, files: COMPOSE_SCRIPTS },
      () => {
        if (chrome.runtime.lastError) return; // restricted page (chrome://, etc.)
        chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' }, () => { void chrome.runtime.lastError; });
      }
    );
  });
});


chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_RUNTIME_CONFIG') {
    sendResponse({ ok: true, config: { serverApiBase: SERVER_URL, dashboardUrl: DASH_URL, serverBase: SERVER_URL.replace(/\/api$/, '') } });
    return;
  }

  if (message.type === 'GET_STATS') {
    fetchOutreach()
      .then(r => r.json())
      .then(({ data: records }) => {
        const sent = records.length;
        const replied = records.filter(r =>
          r.status === 'Replied' || r.status === 'Interviewing' || r.status === 'Offer'
        ).length;
        const rate = sent > 0 ? Math.round((replied / sent) * 100) + '%' : '—';
        sendResponse({ ok: true, sent, replied, rate });
      })
      .catch((e) => { log.error('GET_STATS failed:', e); sendResponse({ ok: false }); });
    return true; // keep message channel open for async response
  }

  if (message.type === 'KEYWORD_SCORE') {
    sendResponse({ ok: true, score: countKeywordMatches(message.text || '') });
    return;
  }

  if (message.type === 'RESCAN') {
    log.info('RESCAN message received from content script.');
    trackLatestSent(message.interactive ?? false)
      .then(() => sendResponse({ ok: true }))
      .catch(e => {
        log.error('trackLatestSent threw:', e.message);
        sendResponse({ ok: false, error: e.message });
      });
    return true;
  }

  if (message.type === 'RECHECK_REPLIES') {
    log.info('RECHECK_REPLIES received — running reply check now.');
    checkReplies()
      .then(() => sendResponse({ ok: true }))
      .catch(e => {
        log.error('RECHECK_REPLIES failed:', e.message);
        sendResponse({ ok: false, error: e.message });
      });
    return true;
  }

  if (message.type === 'GET_RECENT') {
    fetchOutreach()
      .then(r => r.json())
      .then(({ data: records }) => {
        const recent = records.slice(0, 3).map(r => ({
          company: r.company,
          status: r.status,
          sentDate: r.sentDate,
        }));
        sendResponse({ ok: true, recent });
      })
      .catch((e) => { log.error('GET_RECENT failed:', e); sendResponse({ ok: false }); });
    return true;
  }

  if (message.type === 'SUGGEST_DOMAINS') {
    (async () => {
      try {
        const res = await serverFetch('/suggest-domains', {
          method: 'POST',
          body: JSON.stringify({ company: message.company }),
        });
        sendResponse(await res.json());
      } catch (e) {
        log.error('SUGGEST_DOMAINS fetch failed:', e.message);
        sendResponse({ ok: false, domains: [] });
      }
    })();
    return true;
  }

  if (message.type === 'FIND_CONTACT') {
    (async () => {
      try {
        const payload = {
          company:   message.company,
          firstName: message.firstName || undefined,
          lastName:  message.lastName  || undefined,
          domain:    message.domain    || undefined,
        };
        console.log('[coldbase] FIND_CONTACT payload:', JSON.stringify(payload));
        const res  = await serverFetch('/find-email', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const body = await res.json();
        console.log('[coldbase] FIND_CONTACT response status:', res.status, 'body:', JSON.stringify(body));
        if (res.status === 429) {
          sendResponse({ ok: false, error: 'quota_exceeded', used: body.used, limit: body.limit });
        } else {
          sendResponse(body);
        }
      } catch (e) {
        log.error('/api/find-email fetch failed:', e.message);
        sendResponse({ ok: false, reason: 'all_invalid' });
      }
    })();
    return true;
  }

  if (message.type === 'GET_USER_PROFILE') {
    (async () => {
      try {
        const res = await serverFetch('/auth/me');
        if (!res.ok) { sendResponse({ ok: false }); return; }
        const data = await res.json();
        sendResponse({ ok: true, plan: data.plan, isAdmin: data.isAdmin ?? false, resumeName: data.resumeName ?? null, lookupsUsed: data.lookupsUsed ?? 0, lookupsLimit: data.lookupsLimit ?? 3 });
      } catch (e) {
        log.error('GET_USER_PROFILE failed:', e.message);
        sendResponse({ ok: false });
      }
    })();
    return true;
  }

  if (message.type === 'DRAFT_EMAIL') {
    (async () => {
      try {
        const res = await serverFetch('/draft-email', {
          method: 'POST',
          body: JSON.stringify({
            draftType:   message.draftType,
            company:     message.company,
            contactName: message.contactName,
            notes:       message.notes,
            subject:     message.subject,
            bodySnippet: message.bodySnippet,
          }),
        });
        sendResponse(await res.json());
      } catch (e) {
        log.error('DRAFT_EMAIL fetch failed:', e.message);
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

});

// ─── Dashboard token sync ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SYNC_COLDBASE_TOKEN' && msg.token) {
    setColdbaseToken(msg.token).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'CLEAR_COLDBASE_TOKEN') {
    (async () => {
      await clearColdbaseToken();
      const tabs = await chrome.tabs.query({
        url: ['*://coldbase.live/*', 'http://localhost:5173/*'],
      });
      for (const tab of tabs) {
        if (tab.id === _sender.tab?.id) continue; // don't echo back to the originating tab
        chrome.tabs.sendMessage(tab.id, { type: 'WEBAPP_LOGOUT' }).catch(() => {});
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
});
