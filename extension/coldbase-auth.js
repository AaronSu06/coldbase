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
