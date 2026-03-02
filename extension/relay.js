// relay.js — content script injected into localhost
// Bridges window.postMessage (from the web app) to chrome.runtime.sendMessage
// (which content scripts can call without knowing the extension ID).
window.addEventListener('message', event => {
  if (event.source !== window) return;
  if (event.data?.source !== 'outreachiq-webapp') return;
  const { type, requestId } = event.data;
  if (type !== 'RESCAN' && type !== 'RECHECK_REPLIES') return;

  if (!chrome.runtime?.id) {
    console.warn('[Reach] relay.js: extension context invalidated — cannot forward message.');
    window.postMessage({ source: 'outreachiq-relay', requestId, ok: true }, '*');
    return;
  }

  chrome.runtime.sendMessage({ type }, response => {
    void chrome.runtime.lastError; // suppress unchecked-error console warning
    window.postMessage({ source: 'outreachiq-relay', requestId, ok: response?.ok ?? true }, '*');
  });
});
