const BASE = 'http://localhost:3001/api';

export const fetchOutreach = () => fetch(`${BASE}/outreach`).then(r => r.json());

export const patchOutreach = (threadId, patch) =>
  fetch(`${BASE}/outreach/${threadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`PATCH /outreach/${threadId} failed (${res.status}): ${body || res.statusText}`);
    }
    return res.json();
  });

export const deleteOutreach = (threadId) =>
  fetch(`${BASE}/outreach/${threadId}`, { method: 'DELETE' });

export const fetchBestTime = () => fetch(`${BASE}/insights/best-time`).then(r => r.json());
