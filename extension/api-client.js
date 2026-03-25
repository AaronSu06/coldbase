// extension/api-client.js
// Gmail API transport helpers + server API call helpers.

import { logger } from './logger-esm.js';
import { SERVER_URL } from './config.js';
import { getColdbaseToken } from './coldbase-auth.js';

const log = logger('api-client');

const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me';

// ─── Gmail API helpers ────────────────────────────────────────────────────────

/**
 * Fetch a Gmail API URL with an OAuth bearer token.
 * Throws TOKEN_EXPIRED (with cached token removal) on 401.
 */
export async function apiFetch(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status === 401) {
    log.warn('Token expired — removing cached token.');
    await new Promise(r => chrome.identity.removeCachedAuthToken({ token }, r));
    throw new Error('TOKEN_EXPIRED');
  }
  if (!res.ok) {
    throw new Error(`Gmail API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch a full Gmail message by ID.
 */
export async function getFullMessage(token, messageId) {
  return apiFetch(`${GMAIL_API}/messages/${messageId}?format=full`, token);
}

/**
 * Retries an apiFetch call once after transparently re-acquiring a fresh token
 * if the first attempt returns TOKEN_EXPIRED (HTTP 401).
 * @param {string} url
 * @param {string} token - The current token (may be expired).
 * @param {Function} getAuthToken - Token refresh callback (avoids circular import).
 */
export async function apiFetchRetry(url, token, getAuthToken) {
  try {
    return await apiFetch(url, token);
  } catch (e) {
    if (e.message !== 'TOKEN_EXPIRED') throw e;
    log.warn('Token expired — re-authing...');
    const newToken = await getAuthToken(true);
    return await apiFetch(url, newToken);
  }
}

// ─── Server API helpers ───────────────────────────────────────────────────────

/**
 * Base fetch helper for the Coldbase server. Attaches the Authorization: Bearer
 * token (from chrome.storage.local) and prepends SERVER_URL to the path.
 * @param {string} path - Path relative to SERVER_URL (e.g. '/outreach').
 * @param {RequestInit} options - Standard fetch options.
 */
export async function serverFetch(path, options = {}) {
  const token = await getColdbaseToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  return fetch(`${SERVER_URL}${path}`, { ...options, headers });
}

/**
 * POST a new outreach record to /api/outreach.
 * @param {object} payload - The outreach record.
 */
export async function postOutreach(payload) {
  return serverFetch('/outreach', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * POST a tracking pixel association to /api/track.
 * @param {object} payload - { trackingId, threadId }
 */
export async function postTrackingPixel(payload) {
  return serverFetch('/track', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch outreach records from the server (used by reply checker + stats).
 * Returns the raw Response so callers can call .json() themselves.
 */
export async function fetchOutreach() {
  return serverFetch('/outreach');
}
