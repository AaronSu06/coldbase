# Session Handoff — RBAC + Extension Auth Sync

**Date:** 2026-03-22
**Branch:** `emdash/user-roles-1g3`
**Worktree:** `/Users/aaron/Documents/GitHub/worktrees/user-roles-1g3`

---

## What was done this session

Implemented role-based access controls across server, web app, and extension.

### Feature matrix

| Feature | Free | Pro | Admin |
|---------|------|-----|-------|
| Email finding (Hunter) | 10/month | 100/month | unlimited |
| AI Draft (extension → `/api/draft-email`) | ❌ 403 | ✅ | ✅ |
| Personalized Feedback (web → `/api/feedback`) | ❌ 403 | ✅ | ✅ |
| All other features | ✅ | ✅ | ✅ |

### Files changed

| File | What changed |
|------|-------------|
| `server/routes/auth.js` | `/auth/me` now returns `isAdmin` |
| `server/middleware/requireAdmin.js` | NEW — middleware for admin-only routes |
| `server/middleware/checkQuota.js` | limits updated (free: 10, pro: 100), admin bypass added |
| `server/routes/email.js` | `/draft-email` allows admin; new `/feedback` endpoint |
| `server/app.js` | `expensiveRateLimit` applied to `/api/feedback` |
| `server/scripts/create-admin.js` | also seeds free test user (`user1@gmail.com` / `user123`) |
| `web/src/hooks/useUser.js` | NEW — `UserProvider` + `useUser()` context hook |
| `web/src/lib/api.js` | `generateFeedback()` added |
| `web/src/App.jsx` | wrapped with `UserProvider` |
| `web/src/components/Sidebar.jsx` | feedback gated by plan; calls `/api/feedback` instead of client-side Gemini |
| `extension/background.js` | `GET_USER_PROFILE` now returns `isAdmin` |
| `extension/compose-widget.js` | `_isAdmin` flag added; Draft AI gate bypassed for admin; tier badge shows "Admin" |

### Status

Code is complete but **not yet verified or merged**. Next session should:
1. Run `node server/scripts/create-admin.js` to seed test accounts
2. Test free user, pro user, and admin scenarios (see plan file for checklist)
3. Fix extension auth sync (see below)
4. Push branch and create PR

---

## Next task: Extension auth sync

### Problem

The extension stays logged in even after the user logs out of the web app.

**Root cause:** `extension/dashboard-sync.js` is an IIFE that runs once on dashboard page load. It reads `reach_token` from localStorage and sends `SYNC_REACH_TOKEN` to the background — but it never watches for the token being removed (logout).

```js
// Current dashboard-sync.js — only syncs on load, no logout handling
(function syncReachToken() {
  const token = localStorage.getItem('reach_token');
  if (token) {
    chrome.runtime.sendMessage({ type: 'SYNC_REACH_TOKEN', token });
  }
})();
```

The extension token lives in `chrome.storage.local` under `reach_jwt` (see `extension/reach-auth.js`). `clearReachToken()` already exists but is never called on web logout.

### Fix needed

**`extension/dashboard-sync.js`** — add a `storage` event listener alongside the existing IIFE:

```js
// After the existing IIFE, add:
window.addEventListener('storage', (e) => {
  if (e.key !== 'reach_token') return;
  if (e.newValue) {
    // Token was set (login on another tab)
    chrome.runtime.sendMessage({ type: 'SYNC_REACH_TOKEN', token: e.newValue });
  } else {
    // Token was removed (logout)
    chrome.runtime.sendMessage({ type: 'CLEAR_REACH_TOKEN' });
  }
});
```

**`extension/background.js`** — handle the new `CLEAR_REACH_TOKEN` message:

```js
if (message.type === 'CLEAR_REACH_TOKEN') {
  clearReachToken().then(() => sendResponse({ ok: true }));
  return true;
}
```

**`extension/reach-auth.js`** — `clearReachToken()` already exists, no change needed.

### Scope note

This also means the extension is effectively tied to having an active web account — which is the desired UX. Logging out of the web app should immediately invalidate the extension session.

---

## Test accounts (after running seed script)

| Account | Email | Password | Role |
|---------|-------|----------|------|
| Admin | set in `.env` as `ADMIN_EMAIL` | `ADMIN_PASSWORD` | admin + pro |
| Free user | `user1@gmail.com` | `user123` | free |
