const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';
const SECRET = import.meta.env.VITE_REACH_SECRET;

async function apiFetch(url, options = {}) {
  if (!SECRET) throw new Error('VITE_REACH_SECRET not configured — set it in web/.env');
  const headers = {
    'Content-Type': 'application/json',
    'x-reach-secret': SECRET,
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${options.method ?? 'GET'} ${url} failed (${res.status}): ${body || res.statusText}`);
  }
  return res;
}

export const fetchOutreach = () =>
  apiFetch(`${BASE}/outreach`).then(r => r.json());

export const patchOutreach = (threadId, patch) =>
  apiFetch(`${BASE}/outreach/${threadId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }).then(r => r.json());

export const deleteOutreach = (threadId) =>
  apiFetch(`${BASE}/outreach/${threadId}`, { method: 'DELETE' });

export const fetchBestTime = () =>
  apiFetch(`${BASE}/insights/best-time`).then(r => r.json());

export const fetchInsights = ({ from, to } = {}) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return apiFetch(`${BASE}/insights${qs ? `?${qs}` : ''}`).then(r => r.json());
};
