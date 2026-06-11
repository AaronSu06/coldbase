// extension/auth.js
// OAuth token management — wraps chrome.identity.getAuthToken with structured logging.

import { logger } from './logger-esm.js';

const log = logger('auth');

/**
 * Acquire a Google OAuth token via chrome.identity.
 * @param {boolean} interactive - Whether to show the sign-in prompt if no token is cached.
 * @returns {Promise<string>} The OAuth token.
 * @throws {Error} On auth failure — logged then rethrown (EXT-04 escalation policy).
 */
export function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        const err = new Error(chrome.runtime.lastError.message);
        log.error('getAuthToken failed:', err.message);
        return reject(err);
      }
      resolve(token);
    });
  });
}

// In-memory cache: email → Chrome account id. Cleared when the service worker terminates.
const _accountIdCache = new Map();

function _getTokenForAccount(accountInfo, interactive = false) {
  return new Promise((resolve, reject) => {
    const opts = accountInfo ? { account: accountInfo, interactive } : { interactive };
    chrome.identity.getAuthToken(opts, (token) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(token);
    });
  });
}

async function _fetchTokenEmail(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.email || '').toLowerCase() || null;
}

/**
 * Acquire a Gmail OAuth token for a specific email address.
 * Iterates all Google accounts Chrome knows about to find the matching one,
 * so it works even when the Chrome profile's primary account differs from
 * the account the user wants to track (e.g. personal Chrome + coldbaseapp Gmail).
 *
 * Falls back to the default Chrome account with a warning if no match is found.
 */
export async function getAuthTokenForEmail(targetEmail, interactive = false) {
  if (!targetEmail) return getAuthToken(interactive);

  const target = targetEmail.toLowerCase();

  // Fast path: already resolved this email to a Chrome account id this session.
  if (_accountIdCache.has(target)) {
    try {
      return await _getTokenForAccount({ id: _accountIdCache.get(target) }, interactive);
    } catch {
      _accountIdCache.delete(target); // stale entry — fall through to re-resolve
    }
  }

  // chrome.identity.getAccounts is dev-channel only — on stable Chrome (every real
  // user) it's undefined. Without it we can't enumerate accounts, so fall back to the
  // standard default-account token path. The caller's account-match guard then verifies
  // the resulting token actually belongs to targetEmail.
  if (typeof chrome.identity.getAccounts !== 'function') {
    log.warn('getAuthTokenForEmail: chrome.identity.getAccounts unavailable (stable Chrome) — using default account.');
    return getAuthToken(interactive);
  }

  // Iterate all accounts Chrome knows about and match by email.
  const accounts = await new Promise((resolve) => {
    chrome.identity.getAccounts((accts) => resolve(accts || []));
  });

  for (const account of accounts) {
    let token;
    try { token = await _getTokenForAccount(account, false); } catch { continue; }

    let email;
    try { email = await _fetchTokenEmail(token); } catch { continue; }

    if (email === target) {
      _accountIdCache.set(target, account.id);
      log.info(`getAuthTokenForEmail: matched ${target} to account ${account.id}.`);
      return token;
    }
  }

  // No matching account — fall back to default and let the caller's guard decide.
  log.warn(`getAuthTokenForEmail: no Chrome account found for ${target} — falling back to default.`);
  return getAuthToken(interactive);
}
