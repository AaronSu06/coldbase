import { isColdOutreach, countKeywordMatches, extractCompanyFromEmail, extractCompanyFromText, fetchClearbitCompany, extractFirstName, isGenericDomain } from './classifier.js';

const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me';
const RUNTIME_CONFIG = {
  serverApiBase: 'http://localhost:3001/api',
  dashboardUrl: 'http://localhost:5173',
};
const SERVER = RUNTIME_CONFIG.serverApiBase;

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(token);
    });
  });
}

// ─── Gmail API helpers ────────────────────────────────────────────────────────

async function apiFetch(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status === 401) {
    await new Promise(r => chrome.identity.removeCachedAuthToken({ token }, r));
    throw new Error('TOKEN_EXPIRED');
  }
  if (!res.ok) {
    throw new Error(`Gmail API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

async function getFullMessage(token, messageId) {
  return apiFetch(`${GMAIL_API}/messages/${messageId}?format=full`, token);
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

function extractHeader(message, name) {
  const headers = message.payload?.headers || [];
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeBase64Url(data) {
  if (!data) return '';
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
  } catch {
    return '';
  }
}

function findPart(parts, mimeType) {
  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data) return part;
    if (part.parts) {
      const found = findPart(part.parts, mimeType);
      if (found) return found;
    }
  }
  return null;
}

function extractBody(message) {
  const allParts = message.payload?.parts || [];

  const textPart = findPart(allParts, 'text/plain');
  if (textPart) return decodeBase64Url(textPart.body.data);

  if (message.payload?.body?.data) return decodeBase64Url(message.payload.body.data);

  const htmlPart = findPart(allParts, 'text/html');
  if (htmlPart) return decodeBase64Url(htmlPart.body.data).replace(/<[^>]+>/g, ' ');

  return message.snippet || '';
}

function extractEmailAddress(header) {
  const match = header.match(/<([^>]+)>/);
  return match ? match[1] : header.trim();
}

function shortFrom(header) {
  if (!header) return 'Unknown';
  const withoutEmail = header.replace(/<[^>]+>/g, '').replace(/"/g, '').trim();
  return withoutEmail || extractEmailAddress(header) || 'Unknown';
}

function stripQuotedText(text) {
  // Remove "On [date] ... wrote: ..." — the standard Gmail/email reply quote header
  return text.replace(/\s+On\s+.+wrote:.*/s, '').trim();
}

function normalizeForMatch(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[-_]/g, '')
    .replace(/[^a-z0-9\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildConversationPreview(thread) {
  const messages = thread?.messages || [];
  if (messages.length === 0) return '';

  return messages
    .slice(-4)
    .map(msg => {
      const from = shortFrom(extractHeader(msg, 'From'));
      // SENT label = sent by the authenticated user; anything else = inbound
      const direction = (msg.labelIds || []).includes('SENT') ? '[OUT]' : '[IN]';
      const raw = (msg.snippet || extractBody(msg) || '').replace(/\s+/g, ' ').trim();
      const text = stripQuotedText(raw).slice(0, 300);
      return text ? `${direction} ${from}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

// ─── Track the single latest sent email ───────────────────────────────────────

let scanInProgress = false;

async function trackLatestSent(interactive = false, pendingScan = null) {
  if (scanInProgress) {
    console.log('[Reach] Scan already in progress — skipping duplicate trigger.');
    return;
  }
  scanInProgress = true;
  try {
    await _trackLatestSent(interactive, pendingScan);
  } finally {
    scanInProgress = false;
  }
}

async function _trackLatestSent(interactive = false, pendingScan = null) {
  console.log('[Reach] trackLatestSent() called — acquiring auth token...');

  let token;
  try {
    token = await getAuthToken(interactive);
    console.log('[Reach] Auth token acquired.');
  } catch (e) {
    console.error('[Reach] ❌ Could not acquire auth token:', e.message);
    return;
  }

  let messageList;
  try {
    const data = await apiFetch(
      `${GMAIL_API}/messages?labelIds=SENT&maxResults=1`,
      token
    );
    messageList = data.messages || [];
    console.log(`[Reach] Fetched sent message list — ${messageList.length} message(s).`);
  } catch (e) {
    if (e.message === 'TOKEN_EXPIRED') {
      console.warn('[Reach] Token expired — re-authing...');
      try {
        token = await getAuthToken(true);
        const data = await apiFetch(
          `${GMAIL_API}/messages?labelIds=SENT&maxResults=1`,
          token
        );
        messageList = data.messages || [];
      } catch (retryErr) {
        console.error('[Reach] ❌ Re-auth failed:', retryErr.message);
        return;
      }
    } else {
      console.error('[Reach] ❌ Failed to fetch sent messages:', e.message);
      return;
    }
  }

  if (!messageList.length) {
    console.warn('[Reach] No sent messages found.');
    return;
  }

  const msgId = messageList[0].id;
  console.log(`[Reach] Fetching full message id=${msgId}...`);

  let fullMsg;
  try {
    fullMsg = await getFullMessage(token, msgId);
  } catch (e) {
    if (e.message === 'TOKEN_EXPIRED') {
      try {
        token = await getAuthToken(true);
        fullMsg = await getFullMessage(token, msgId);
      } catch (retryErr) {
        console.error('[Reach] ❌ Could not fetch full message after re-auth:', retryErr.message);
        return;
      }
    } else {
      console.error('[Reach] ❌ Could not fetch full message:', e.message);
      return;
    }
  }

  const subject = extractHeader(fullMsg, 'Subject');
  const toHeader = extractHeader(fullMsg, 'To');
  const contactEmail = extractEmailAddress(toHeader);
  const body = extractBody(fullMsg);

  console.log(`[Reach] Message parsed — subject: "${subject}" | to: "${toHeader}"`);
  console.log(`[Reach] Body excerpt: "${body.slice(0, 200).replace(/\n/g, ' ')}"`);

  const normalizedSubject = normalizeForMatch(subject).slice(0, 120);
  const normalizedRecipients = normalizeForMatch(toHeader).slice(0, 180);
  let manualOverride = null;
  if (pendingScan?.overrideMode) {
    const subjectHint = normalizeForMatch(pendingScan.subjectHint).slice(0, 120);
    const recipientsHint = normalizeForMatch(pendingScan.recipientsHint).slice(0, 180);
    const subjectMatches = !subjectHint || normalizedSubject.includes(subjectHint);
    const recipientsMatch = !recipientsHint || normalizedRecipients.includes(recipientsHint);
    if (subjectMatches && recipientsMatch) {
      manualOverride = pendingScan.overrideMode;
    } else {
      console.log('[Reach] Manual override ignored (message hints did not match latest sent email).');
    }
  }

  console.log('[Reach] Running classification (keyword classifier)...');
  let isColdEmail = isColdOutreach(subject + ' ' + body);

  if (manualOverride === 'force_track') {
    isColdEmail = true;
  } else if (manualOverride === 'force_skip') {
    isColdEmail = false;
  }

  console.log(`[Reach] Classification → keyword=${isColdEmail} | override=${manualOverride ?? 'none'} | final=${isColdEmail}`);

  if (!isColdEmail) {
    console.log('[Reach] ⏭ Not classified as cold outreach — skipping.');
    console.log('[Reach] Tip: if this was a cold email, check that your email contains job-related keywords.');
    return;
  }

  const domain = contactEmail.split('@')[1] || '';
  const company =
    extractCompanyFromText(subject, body)
    || (!isGenericDomain(contactEmail) ? await fetchClearbitCompany(domain) : null)
    || (!isGenericDomain(contactEmail) ? extractCompanyFromEmail(contactEmail) : null)
    || 'Unknown';
  const contactName = extractFirstName(toHeader);
  const dateHeader = extractHeader(fullMsg, 'Date');
  const sentDate = dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString();

  const record = {
    threadId: fullMsg.threadId,
    gmailUrl: `https://mail.google.com/mail/u/0/#sent/${fullMsg.threadId}`,
    company,
    contactName,
    contactEmail,
    domain,
    subject,
    sentDate,
    status: 'Sent',
    snippet: fullMsg.snippet || '',
    messageCount: 1,
    hasReply: false,
    latestActivity: sentDate
  };

  console.log(`[Reach] POSTing record — company="${company}" threadId="${fullMsg.threadId}"`);

  try {
    const res = await fetch(`${SERVER}/outreach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });

    if (res.status === 409) {
      console.log('[Reach] ℹ️ threadId already tracked (409) — no-op.');
    } else if (!res.ok) {
      const body = await res.text();
      console.error(`[Reach] ❌ Server error on POST: ${res.status} — ${body}`);
    } else {
      const saved = await res.json();
      console.log(`[Reach] ✅ Tracked! id=${saved.id} company="${company}" subject="${subject}"`);
    }
  } catch (e) {
    console.error('[Reach] ❌ Could not reach server (is it running on :3001?):', e.message);
  }
}

// ─── Check threads for replies ─────────────────────────────────────────────────

async function checkReplies(token) {
  let records;
  try {
    const res = await fetch(`${SERVER}/outreach`);
    records = await res.json();
    console.log(`[Reach] Reply check: ${records.length} tracked record(s).`);
  } catch (e) {
    console.error('[Reach] ❌ Could not fetch records for reply check:', e.message);
    return;
  }

  for (const record of records) {
    if (!record.threadId) continue;
    try {
      const thread = await apiFetch(
        `${GMAIL_API}/threads/${record.threadId}?format=full`,
        token
      );
      const msgCount = thread.messages?.length || 1;
      // Also re-build snippet if messageCount > 1 but snippet was never updated to
      // conversation-preview format (no '\n\n' separator between messages).
      const snippetIsStale = msgCount > 1 && (
        !record.snippet?.includes('\n\n') ||
        / On .+ wrote:/.test(record.snippet) ||
        !(record.snippet?.includes('[OUT]') || record.snippet?.includes('[IN]'))
      );
      console.log(`[Reach] Thread ${record.threadId}: msgCount=${msgCount} dbCount=${record.messageCount} snippetIsStale=${snippetIsStale}`);
      if (msgCount > (record.messageCount || 1) || snippetIsStale) {
        const latestMsg = thread.messages[thread.messages.length - 1];
        const dateHeader = latestMsg?.payload?.headers?.find(h => h.name === 'Date');
        const repliedAt = dateHeader
          ? new Date(dateHeader.value).toISOString()
          : new Date().toISOString();
        const latestIsFromMe = (latestMsg?.labelIds || []).includes('SENT');
        const conversationPreview = buildConversationPreview(thread);
        console.log(`[Reach] Conversation preview (${thread.messages?.length} msgs): ${JSON.stringify(conversationPreview?.slice(0, 120))}`);
        const patch = {
          messageCount: msgCount,
          latestActivity: repliedAt,
          snippet: conversationPreview || record.snippet
        };

        // Only treat inbound messages as "replies". Self-sent bumps should
        // update thread metrics but must not auto-move status to Replied.
        if (!latestIsFromMe) {
          patch.hasReply = true;
          patch.repliedAt = repliedAt;
          if (record.status === 'Sent') patch.status = 'Replied';
        }

        await fetch(`${SERVER}/outreach/${record.threadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch)
        });

        if (latestIsFromMe) {
          console.log(`[Reach] ↺ Self-sent follow-up detected for ${record.threadId} — kept current status.`);
        } else if (record.status === 'Sent') {
          console.log(`[Reach] ✅ Inbound reply detected for ${record.threadId} — marked Replied.`);
        } else {
          console.log(`[Reach] ✅ Inbound reply detected for ${record.threadId} — preserved status ${record.status}.`);
        }
      }
    } catch {
      // Non-fatal — skip this record
    }
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Primary scan trigger from content.js.
// Uses storage instead of sendMessage to avoid the MV3 ES module race condition:
// when sendMessage cold-starts a terminated SW, the onMessage listener may not
// yet be registered (imports not complete). chrome.storage.onChanged does not
// have this problem — Chrome fully initializes the SW before dispatching it.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'outreachiq_pending_scan' in changes) {
    const pendingScan = changes.outreachiq_pending_scan?.newValue;
    if (!pendingScan) return; // delete event fired by remove() below — ignore
    chrome.storage.local.remove('outreachiq_pending_scan');
    console.log('[Reach] Storage trigger received — running trackLatestSent.');
    trackLatestSent(false, pendingScan);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Reach] Extension installed.');
  chrome.alarms.create('outreachiq-reply-check', { periodInMinutes: 30 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'outreachiq-reply-check') {
    console.log('[Reach] Alarm fired — checking for replies.');
    let token;
    try {
      token = await getAuthToken(false);
    } catch (e) {
      console.error('[Reach] ❌ Auth failed for reply check:', e.message);
      return;
    }
    await checkReplies(token);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['panel.js'],
    });
  } catch {
    // Restricted page (chrome://, new tab, etc.) — nothing to do
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_RUNTIME_CONFIG') {
    sendResponse({ ok: true, config: RUNTIME_CONFIG });
    return;
  }

  if (message.type === 'GET_STATS') {
    fetch(`${RUNTIME_CONFIG.serverApiBase}/outreach`)
      .then(r => r.json())
      .then(records => {
        const sent = records.length;
        const replied = records.filter(r =>
          r.status === 'Replied' || r.status === 'Interviewing' || r.status === 'Offer'
        ).length;
        const rate = sent > 0 ? Math.round((replied / sent) * 100) + '%' : '—';
        sendResponse({ ok: true, sent, replied, rate });
      })
      .catch(() => sendResponse({ ok: false }));
    return true; // keep message channel open for async response
  }

  if (message.type === 'KEYWORD_SCORE') {
    sendResponse({ ok: true, score: countKeywordMatches(message.text || '') });
    return;
  }

  if (message.type === 'RESCAN') {
    console.log('[Reach] RESCAN message received from content script.');
    trackLatestSent(message.interactive ?? false)
      .then(() => sendResponse({ ok: true }))
      .catch(e => {
        console.error('[Reach] ❌ trackLatestSent threw:', e.message);
        sendResponse({ ok: false, error: e.message });
      });
    return true;
  }

  if (message.type === 'RECHECK_REPLIES') {
    console.log('[Reach] RECHECK_REPLIES received — running reply check now.');
    getAuthToken(false)
      .then(token => checkReplies(token))
      .then(() => sendResponse({ ok: true }))
      .catch(e => {
        console.error('[Reach] ❌ RECHECK_REPLIES failed:', e.message);
        sendResponse({ ok: false, error: e.message });
      });
    return true;
  }

});
