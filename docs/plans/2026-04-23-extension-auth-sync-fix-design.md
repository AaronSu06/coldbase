# Extension Auth Sync + Login Page Fix — Design

**Date:** 2026-04-23  
**Context:** Chrome Web Store rejected submission with "Inaccurate Description – Non functional" citing that "on completing login, widget seems not able to sync the authentication on the widget and unable to track emails." Two root-cause bugs found.

---

## Root Causes

### Bug 1 — Async token write not awaited (critical)

**File:** `extension/background.js` lines 249-252

```js
if (msg.type === 'SYNC_COLDBASE_TOKEN' && msg.token) {
  setColdbaseToken(msg.token);  // async — NOT awaited
  return;                       // channel closes before storage write resolves
}
```

`setColdbaseToken` wraps `chrome.storage.local.set()`, which is a Promise. In MV3, the background service worker can be terminated at any point. By not awaiting the Promise and not returning `true` to keep the message channel open, Chrome may kill the service worker before the write completes — meaning `coldbase_jwt` is never actually persisted. 

Result: `chrome.storage.onChanged` never fires in the Gmail tab → the compose auth gate's `onStorageChanged` listener never triggers → the panel never auto-unlocks after login.

### Bug 2 — Login route shows disabled Google button

**Files:** `web/src/main.jsx`, `web/src/components/LoginPage.jsx`, `web/src/components/AuthPage.jsx`

The extension auth gate's "Sign in" button opens `https://coldbase.live/auth`. The current route for `/auth` is `<Navigate to="/auth/login">` → `LoginPage.jsx`. That page has a **disabled, non-functional** Google OAuth button (marked "UI only — wire when provider is added" in source).

Meanwhile, `AuthPage.jsx` is a complete combined sign-in/sign-up page with a **fully wired** Google OAuth button (`window.location.href = .../api/auth/google`). It is imported nowhere and mapped to no route — dead code.

Result: Users who try Google OAuth are stuck on a non-interactive button. Users who log in via email/password may still fail to sync (Bug 1).

---

## Solution

**Two targeted changes — no refactoring, no new abstractions.**

### Fix 1: Await the storage write in background.js

```js
// Before
if (msg.type === 'SYNC_COLDBASE_TOKEN' && msg.token) {
  setColdbaseToken(msg.token);
  return;
}

// After
if (msg.type === 'SYNC_COLDBASE_TOKEN' && msg.token) {
  setColdbaseToken(msg.token).then(() => sendResponse({ ok: true }));
  return true;
}
```

Returning `true` keeps the message channel open while the async write completes. The `.then()` ensures `chrome.storage.local.set` resolves before we respond — and keeps the service worker alive for the duration of the write.

### Fix 2: Route /auth to AuthPage

In `main.jsx`:
- Import `AuthPage`
- Change the `/auth` route from `<Navigate to="/auth/login">` → `<AuthPage />`
- Keep `/auth/login` and `/auth/register` unchanged (backward compat)

The extension already opens `/auth` from the auth gate, so no extension changes needed. `AuthPage` shows both sign-in/sign-up tabs and a working Google OAuth button.

---

## Files to Change

| File | Change |
|------|--------|
| `extension/background.js` | Fix SYNC_COLDBASE_TOKEN handler (lines 249-252) |
| `web/src/main.jsx` | Import AuthPage, route `/auth` → `<AuthPage />` |

---

## Verification

1. Load extension unpacked in Chrome Dev
2. Open Gmail → open compose window → auth gate appears
3. Click "Sign in" → `/auth` page opens (should show AuthPage with Google button active)
4. Log in via Google OAuth → complete OAuth flow → redirected to dashboard
5. Switch back to Gmail tab → auth gate should auto-dismiss, compose panel opens
6. Log in via email/password → same auto-dismiss behavior
7. Send a test email → confirm tracking pixel is injected and outreach record appears on dashboard
8. Check `chrome.storage.local` in DevTools → confirm `coldbase_jwt` is present after login
