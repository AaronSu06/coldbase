// extension/reply-checker.js
// Reply detection logic, parsing helpers, and outreach tracking.

import { logger } from './logger-esm.js';
import { getAuthToken } from './auth.js';
import { extractEmailAddress, normalizeForMatch } from './text-utils.js';
import { apiFetch, apiFetchRetry, serverFetch, postOutreach, postTrackingPixel, fetchOutreach } from './api-client.js';
import { isColdOutreach, extractCompanyFromEmail, extractCompanyFromText, fetchClearbitCompany, extractFirstName, isGenericDomain } from './classifier.js';

const log = logger('reply-checker');

const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me';

let scanInProgress = false;

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
  } catch (e) {
    log.debug('decodeBase64Url: malformed input', e?.message);
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

function shortFrom(header) {
  if (!header) return 'Unknown';
  const withoutEmail = header.replace(/<[^>]+>/g, '').replace(/"/g, '').trim();
  return withoutEmail || extractEmailAddress(header) || 'Unknown';
}

function stripQuotedText(text) {
  // Remove "On [date] ... wrote: ..." — the standard Gmail/email reply quote header
  return text.replace(/\s+On\s+.+wrote:.*/s, '').trim();
}

export function buildConversationPreview(thread) {
  const messages = thread?.messages || [];
  if (messages.length === 0) return '';

  return messages
    .slice(-4)
    .map(msg => {
      const from = shortFrom(extractHeader(msg, 'From'));
      // SENT label = sent by the authenticated user; anything else = inbound
      const direction = (msg.labelIds || []).includes('SENT') ? '[OUT]' : '[IN]';
      const raw = (extractBody(msg) || msg.snippet || '').replace(/\s+/g, ' ').trim();
      const text = stripQuotedText(raw).slice(0, 300);
      return text ? `${direction} ${from}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

// ─── Track the single latest sent email ───────────────────────────────────────

export async function trackLatestSent(interactive = false, pendingScan = null) {
  if (scanInProgress) {
    log.info('Scan already in progress — skipping duplicate trigger.');
    return false;
  }
  scanInProgress = true;
  try {
    return await _trackLatestSent(interactive, pendingScan);
  } finally {
    scanInProgress = false;
  }
}

async function _trackLatestSent(interactive = false, pendingScan = null) {
  log.info('trackLatestSent() called — acquiring auth token...');

  let token;
  try {
    token = await getAuthToken(interactive);
    log.info('Auth token acquired.');
  } catch (e) {
    log.error('Could not acquire auth token:', e.message);
    return false;
  }

  let messageList;
  try {
    const data = await apiFetchRetry(
      `${GMAIL_API}/messages?labelIds=SENT&maxResults=1`,
      token,
      getAuthToken
    );
    messageList = data.messages || [];
    log.info(`Fetched sent message list — ${messageList.length} message(s).`);
  } catch (e) {
    log.error('Failed to fetch sent messages:', e.message);
    return false;
  }

  if (!messageList.length) {
    log.warn('No sent messages found.');
    return false;
  }

  const msgId = messageList[0].id;
  log.info(`Fetching full message id=${msgId}...`);

  let fullMsg;
  try {
    fullMsg = await apiFetchRetry(
      `${GMAIL_API}/messages/${msgId}?format=full`,
      token,
      getAuthToken
    );
  } catch (e) {
    log.error('Could not fetch full message:', e.message);
    return false;
  }

  const subject = extractHeader(fullMsg, 'Subject');
  const toHeader = extractHeader(fullMsg, 'To');
  const contactEmail = extractEmailAddress(toHeader);
  const body = extractBody(fullMsg);

  log.info(`Message parsed — subject: "${subject}" | to: "${toHeader}"`);
  log.debug(`Body excerpt: "${body.slice(0, 200).replace(/\n/g, ' ')}"`);

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
      log.info('Manual override ignored (message hints did not match latest sent email).');
    }
  }

  log.info('Running classification (keyword classifier)...');
  let isColdEmail = isColdOutreach(subject + ' ' + body);

  if (manualOverride === 'force_track') {
    isColdEmail = true;
  } else if (manualOverride === 'force_skip') {
    isColdEmail = false;
  }

  log.info(`Classification → keyword=${isColdEmail} | override=${manualOverride ?? 'none'} | final=${isColdEmail}`);

  if (!isColdEmail) {
    log.info('Not classified as cold outreach — skipping.');
    log.info('Tip: if this was a cold email, check that your email contains job-related keywords.');
    return false;
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

  log.info(`POSTing record — company="${company}" threadId="${fullMsg.threadId}"`);

  try {
    const res = await postOutreach(record);

    if (res.status === 409) {
      log.info('threadId already tracked (409) — no-op.');
      return false;
    } else if (!res.ok) {
      const errBody = await res.text();
      log.error(`Server error on POST: ${res.status} — ${errBody}`);
      return false;
    } else {
      const saved = await res.json();
      log.info(`Tracked! id=${saved.id} company="${company}" subject="${subject}"`);
      if (pendingScan?.trackingId) {
        try {
          await postTrackingPixel({ trackingId: pendingScan.trackingId, threadId: fullMsg.threadId });
        } catch (e) {
          log.warn('Could not register tracking pixel:', e.message);
        }
      }
      return true;
    }
  } catch (e) {
    log.error('Could not reach server (is it running on :3001?):', e.message);
    return false;
  }
}

// ─── Fallback: track from content-script-provided data (no OAuth needed) ─────

/**
 * Build and POST an outreach record entirely from data captured by the content
 * script at send time. Used when chrome.identity.getAuthToken is unavailable
 * (e.g. unpacked dev extension with misconfigured OAuth client ID).
 *
 * Limitations vs. full Gmail API path:
 * - threadId is a synthetic UUID (no Gmail thread link, reply detection won't work)
 * - gmailUrl points to the SENT label view rather than the specific thread
 * - Duplicate detection per-send is UUID-based (no 409 on re-scan of same thread)
 *
 * @param {object} pendingScan — payload from coldbase_pending_scan storage key
 * @returns {Promise<boolean>} true if a new record was saved, false otherwise
 */
export async function trackFromPendingScan(pendingScan) {
  const subject    = pendingScan?.emailSubject    || '';
  const recipients = pendingScan?.emailRecipients || '';
  const body       = pendingScan?.emailBody       || '';

  if (!subject && !recipients) {
    log.warn('trackFromPendingScan: no email data in pendingScan — cannot build record.');
    return false;
  }

  log.info('trackFromPendingScan() — building record from content-script data (OAuth unavailable).');
  log.info(`Subject: "${subject}" | Recipients: "${recipients}"`);

  // Classification: same rules as the Gmail API path
  let isColdEmail = isColdOutreach(subject + ' ' + body);
  if (pendingScan?.overrideMode === 'force_track') isColdEmail = true;
  if (pendingScan?.overrideMode === 'force_skip')  isColdEmail = false;

  log.info(`Classification → isCold=${isColdEmail} | override=${pendingScan?.overrideMode ?? 'none'}`);

  if (!isColdEmail) {
    log.info('trackFromPendingScan: not classified as cold outreach — skipping.');
    return false;
  }

  // Parse first recipient as the contact
  const firstRecipient = recipients.split(',')[0].trim();
  const contactEmail   = extractEmailAddress(firstRecipient) || firstRecipient;
  const domain         = contactEmail.split('@')[1] || '';

  if (!contactEmail || !domain) {
    log.warn('trackFromPendingScan: could not parse a valid recipient email — skipping.');
    return false;
  }

  const company =
    extractCompanyFromText(subject, body)
    || (!isGenericDomain(contactEmail) ? await fetchClearbitCompany(domain).catch(() => null) : null)
    || (!isGenericDomain(contactEmail) ? extractCompanyFromEmail(contactEmail) : null)
    || 'Unknown';

  const contactName = extractFirstName(firstRecipient);
  const sentDate    = new Date().toISOString();

  // Synthetic threadId: unique per send so it never collides with a real Gmail threadId.
  // Format: reach_ prefix makes it identifiable as synthetic; UUID ensures uniqueness.
  const syntheticThreadId = 'reach_' + (pendingScan?.trackingId || crypto.randomUUID());

  const record = {
    threadId:      syntheticThreadId,
    gmailUrl:      'https://mail.google.com/mail/u/0/#sent',
    company,
    contactName,
    contactEmail,
    domain,
    subject,
    sentDate,
    status:        'Sent',
    snippet:       body.slice(0, 500),
    messageCount:  1,
    hasReply:      false,
    latestActivity: sentDate,
  };

  log.info(`POSTing record (fallback) — company="${company}" threadId="${syntheticThreadId}"`);

  try {
    const res = await postOutreach(record);

    if (res.status === 409) {
      log.info('threadId already tracked (409) — no-op.');
      return false;
    } else if (!res.ok) {
      const errBody = await res.text();
      log.error(`Server error on POST: ${res.status} — ${errBody}`);
      return false;
    } else {
      const saved = await res.json();
      log.info(`Tracked via fallback! id=${saved.id} company="${company}" subject="${subject}"`);
      if (pendingScan?.trackingId) {
        try {
          await postTrackingPixel({ trackingId: pendingScan.trackingId, threadId: syntheticThreadId });
        } catch (e) {
          log.warn('Could not register tracking pixel:', e.message);
        }
      }
      return true;
    }
  } catch (e) {
    log.error('trackFromPendingScan: could not reach server:', e.message);
    return false;
  }
}

// ─── Check threads for replies ─────────────────────────────────────────────────

export async function checkReplies(token) {
  let records;
  try {
    const res = await fetchOutreach();
    records = (await res.json()).data;
    log.info(`Reply check: ${records.length} tracked record(s).`);
  } catch (e) {
    log.error('Could not fetch records for reply check:', e.message);
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
      log.debug(`Thread ${record.threadId}: msgCount=${msgCount} dbCount=${record.messageCount} snippetIsStale=${snippetIsStale}`);
      if (msgCount > (record.messageCount || 1) || snippetIsStale) {
        const latestMsg = thread.messages[thread.messages.length - 1];
        const dateHeader = latestMsg?.payload?.headers?.find(h => h.name === 'Date');
        const repliedAt = dateHeader
          ? new Date(dateHeader.value).toISOString()
          : new Date().toISOString();
        const latestIsFromMe = (latestMsg?.labelIds || []).includes('SENT');
        const conversationPreview = buildConversationPreview(thread);
        log.debug(`Conversation preview (${thread.messages?.length} msgs): ${JSON.stringify(conversationPreview?.slice(0, 300))}`);
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

        await serverFetch(`/outreach/${record.threadId}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });

        if (latestIsFromMe) {
          log.info(`Self-sent follow-up detected for ${record.threadId} — kept current status.`);
        } else if (record.status === 'Sent') {
          log.info(`Inbound reply detected for ${record.threadId} — marked Replied.`);
        } else {
          log.info(`Inbound reply detected for ${record.threadId} — preserved status ${record.status}.`);
        }
      }
    } catch (e) {
      log.error('Reply check failed for thread', record.threadId, e);
    }
  }
}
