// extension/reach-auth.js
// Manages the Reach JWT in browser.storage.local.
// Token is synced from the web dashboard via content script.

const STORAGE_KEY = 'reach_jwt';

export async function getReachToken() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

export async function setReachToken(token) {
  await chrome.storage.local.set({ [STORAGE_KEY]: token });
}

export async function clearReachToken() {
  await chrome.storage.local.remove(STORAGE_KEY);
}
