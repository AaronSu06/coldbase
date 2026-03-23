// extension/dashboard-sync.js
// Content script: runs on the dashboard URL.
// Reads the Reach JWT from localStorage and sends it to the background service worker.
(function syncReachToken() {
  const token = localStorage.getItem('reach_token');
  if (token) {
    chrome.runtime.sendMessage({ type: 'SYNC_REACH_TOKEN', token });
  }
})();

// Listen for login/logout messages from the web app.
// window.postMessage crosses the MAIN→ISOLATED world boundary reliably.
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== 'reach-webapp') return;

  if (event.data.type === 'REACH_LOGIN' && event.data.token) {
    chrome.runtime.sendMessage({ type: 'SYNC_REACH_TOKEN', token: event.data.token });
  } else if (event.data.type === 'REACH_LOGOUT') {
    chrome.runtime.sendMessage({ type: 'CLEAR_REACH_TOKEN' });
  }
});

// Cross-tab fallback: token set or removed in another tab.
window.addEventListener('storage', (e) => {
  if (e.key !== 'reach_token') return;
  if (e.newValue) {
    chrome.runtime.sendMessage({ type: 'SYNC_REACH_TOKEN', token: e.newValue });
  } else {
    chrome.runtime.sendMessage({ type: 'CLEAR_REACH_TOKEN' });
  }
});
