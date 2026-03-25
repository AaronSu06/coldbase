// relay.js — content script injected into localhost
// Bridges window.postMessage (from the web app) to chrome.runtime.sendMessage
// (which content scripts can call without knowing the extension ID).
const log = window.ColdbaseLogger('relay');

window.addEventListener('message', event => {
  if (event.source !== window) return;
  if (event.data?.source !== 'coldbase-webapp') return;
  const { type, requestId } = event.data;
  if (type !== 'RESCAN' && type !== 'RECHECK_REPLIES') return;

  if (!chrome.runtime?.id) {
    log.warn('extension context invalidated — cannot forward message.');
    window.postMessage({ source: 'coldbase-relay', requestId, ok: true }, '*');
    return;
  }

  chrome.runtime.sendMessage({ type }, response => {
    void chrome.runtime.lastError; // suppress unchecked-error console warning
    window.postMessage({ source: 'coldbase-relay', requestId, ok: response?.ok ?? true }, '*');
  });
});
