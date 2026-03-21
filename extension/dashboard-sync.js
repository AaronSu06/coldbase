// extension/dashboard-sync.js
// Content script: runs on the dashboard URL.
// Reads the Reach JWT from localStorage and sends it to the background service worker.
(function syncReachToken() {
  const token = localStorage.getItem('reach_token');
  if (token) {
    chrome.runtime.sendMessage({ type: 'SYNC_REACH_TOKEN', token });
  }
})();
