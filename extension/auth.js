// extension/auth.js
// OAuth token management — wraps chrome.identity.getAuthToken with structured logging.

import { logger } from './logger.js';

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
