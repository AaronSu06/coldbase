const DEFAULT_DASHBOARD_URL = 'https://coldbase.vercel.app';

function loadStats() {
  const sentEl = document.getElementById('stat-sent');
  const repliedEl = document.getElementById('stat-replied');
  const rateEl = document.getElementById('stat-rate');

  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      sentEl.textContent = '—';
      repliedEl.textContent = '—';
      rateEl.textContent = '—';
      return;
    }
    sentEl.textContent = response.sent;
    repliedEl.textContent = response.replied;
    rateEl.textContent = response.rate;
  });
}

chrome.runtime.sendMessage({ type: 'GET_RUNTIME_CONFIG' }, (response) => {
  const dashboardUrl = response?.config?.dashboardUrl ?? DEFAULT_DASHBOARD_URL;
  document.getElementById('open-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: dashboardUrl });
  });
});

loadStats();
