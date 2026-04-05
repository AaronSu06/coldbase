// extension/coldbase-auth.js
// Manages the Coldbase JWT in browser.storage.local.
// Token is synced from the web dashboard via content script.

const STORAGE_KEY = 'coldbase_jwt';

export async function getColdbaseToken() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

export async function setColdbaseToken(token) {
  await chrome.storage.local.set({ [STORAGE_KEY]: token });
}

export async function clearColdbaseToken() {
  await chrome.storage.local.remove(STORAGE_KEY);
}

/**
 * Decode the Reach account email from the stored Coldbase JWT.
 * Returns the lowercase email string, or null if no token / malformed.
 */
export async function getColdbaseEmail() {
  const token = await getColdbaseToken();
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    // base64url → base64 → JSON
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const { email } = JSON.parse(json);
    return typeof email === 'string' ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}
