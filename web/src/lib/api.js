// web/src/lib/api.js
import { TOKEN_KEY } from '../hooks/useAuth.js';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  if (!token) {
    window.location.href = '/login';
    throw new Error('Not authenticated — redirecting to login');
  }
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/login';
    throw new Error('Session expired — redirecting to login');
  }
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

export async function authSignup(email, password) {
  const res = await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Signup failed');
  return data;
}

export const fetchProfile = () =>
  apiFetch(`${BASE}/auth/me`).then(r => r.json());

export async function uploadResume(file) {
  const token = getToken();
  if (!token) { window.location.href = '/login'; throw new Error('Not authenticated'); }
  const form = new FormData();
  form.append('resume', file);
  const res = await fetch(`${BASE}/profile/resume`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (res.status === 401) { localStorage.removeItem(TOKEN_KEY); window.location.href = '/login'; throw new Error('Session expired'); }
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`Upload failed (${res.status}): ${b || res.statusText}`); }
  return res.json();
}

export async function deleteResume() {
  return apiFetch(`${BASE}/profile/resume`, { method: 'DELETE' }).then(r => r.json());
}

export async function authLogin(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Login failed');
  return data;
}
