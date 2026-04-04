# Email Tracking Fix Design

**Date:** 2026-04-01  
**Status:** Approved

## Context

After a "best practices" refactor that added JWT authentication to all `/api/*` server routes and restructured the extension auth layer, two features regressed:

1. **Reply tracking** — the extension's `checkReplies()` silently fails because it can't authenticate to the server (JWT not in storage), and expired Gmail OAuth tokens cause thread fetches to be skipped without retry.
2. **"Open in Gmail"** — stored `gmailUrl` values are `https://mail.google.com/mail/u/0/#sent` (no thread ID) from before commit `da23ca6`. The Sidebar prioritizes this stored value over a correctly-constructed `#all/${threadId}` URL.

Email open tracking is **out of scope** — it requires a deployed server for tracking pixels to be reachable, and has not been tested in a deployed context.

## Root Causes

### Reply Tracking

- `checkReplies()` in `extension/reply-checker.js` calls `fetchOutreach()` → `serverFetch('/outreach')`, which requires a Coldbase JWT attached from `chrome.storage.local`.
- The JWT is synced by `dashboard-sync.js` only when the user visits the web dashboard or logs in. If the JWT is missing, `fetchOutreach()` returns 401, `records` is `undefined`, and the for-loop throws silently.
- Inside `checkReplies()`, Gmail thread fetches use `apiFetch()` directly — not `apiFetchRetry()`. If the Gmail OAuth token is expired, each thread fetch throws `TOKEN_EXPIRED` and is silently skipped.

### "Open in Gmail"

- Records created before `da23ca6` (today's fix) have `gmailUrl = 'https://mail.google.com/mail/u/0/#sent'` — no thread ID.
- Records created via the `trackFromPendingScan` fallback (when Gmail OAuth is unavailable) still set `gmailUrl: 'https://mail.google.com/mail/u/0/#sent'`.
- `web/src/components/Sidebar.jsx` evaluates: `record.gmailThreadUrl || record.gmailUrl || #all/${threadId}` — the broken stored URL is truthy, so the correct fallback never fires.

## Design

### Fix 1: `checkReplies` — graceful 401 handling

**File:** `extension/reply-checker.js`

Replace the `fetchOutreach()` block to explicitly check `res.ok` before calling `.json()`. On non-ok status, log a descriptive error (including status code and a hint to open the dashboard if it's 401) and return early.

```js
const res = await fetchOutreach();
if (!res.ok) {
  const status = res.status;
  if (status === 401) {
    log.warn('Reply check aborted: JWT missing or invalid. Open the web dashboard to sync your session.');
  } else {
    log.error(`Reply check aborted: fetchOutreach returned ${status}`);
  }
  return;
}
records = (await res.json()).data;
```

### Fix 2: `checkReplies` — use `apiFetchRetry` for thread fetches

**File:** `extension/reply-checker.js`

Replace `apiFetch(...)` with `apiFetchRetry(..., token, getAuthToken)` in the thread-fetch loop so expired OAuth tokens auto-refresh instead of silently skipping threads.

Import `apiFetchRetry` and `getAuthToken` at the top (already imported via `auth.js` and `api-client.js`).

### Fix 3: JWT startup check in background service worker

**File:** `extension/background.js`

Add `chrome.runtime.onStartup` listener (alongside the existing `onInstalled`) that reads `getColdbaseToken()` and logs a console warning if it's null:

```js
async function checkJwtPresent() {
  const token = await getColdbaseToken();
  if (!token) {
    log.warn('No Coldbase JWT found in storage. Open the web dashboard at http://localhost:5173 to sync your session.');
  }
}
chrome.runtime.onInstalled.addListener(() => {
  checkJwtPresent();
  chrome.alarms.create('coldbase-reply-check', { periodInMinutes: 30 });
});
chrome.runtime.onStartup.addListener(checkJwtPresent);
```

### Fix 4: `trackFromPendingScan` — stop storing broken URL

**File:** `extension/reply-checker.js`

Change `gmailUrl: 'https://mail.google.com/mail/u/0/#sent'` → `gmailUrl: null`.  
Synthetic `reach_` threadIds cannot deep-link to a specific Gmail thread. Storing null lets the Sidebar's fallback logic handle it correctly.

### Fix 5: Sidebar URL priority logic

**File:** `web/src/components/Sidebar.jsx`

Replace the current URL derivation (lines ~364–367) with logic that prefers constructing from a real threadId over using the stored (potentially broken) `gmailUrl`:

```js
const gmailUrl =
  (record?.threadId && !record.threadId.startsWith('reach_'))
    ? `https://mail.google.com/mail/u/0/#all/${record.threadId}`
    : (record?.gmailThreadUrl || record?.gmailUrl || '');
```

This means: if the threadId is a real Gmail ID, always construct the URL fresh. Only fall back to stored values for synthetic IDs or when there's no threadId at all.

### Fix 6: Server migration endpoint for existing bad URLs

**File:** `server/routes/outreach.js`

Add `POST /api/outreach/backfill-gmail-urls` (authenticated). Updates all records belonging to the authenticated user where `gmailUrl` matches the old broken patterns (`#sent`, `#inbox` without thread ID, etc.) and `threadId` is a real Gmail ID (not `reach_`-prefixed):

```js
router.post('/backfill-gmail-urls', async (req, res, next) => {
  const { userId } = req.user;
  try {
    const records = await prisma.outreach.findMany({
      where: {
        userId,
        threadId: { not: { startsWith: 'reach_' } },
        OR: [
          { gmailUrl: { contains: '#sent' } },
          { gmailUrl: { contains: '#inbox' } },
          { gmailUrl: null },
        ],
      },
      select: { id: true, threadId: true },
    });
    let updated = 0;
    for (const r of records) {
      await prisma.outreach.update({
        where: { id: r.id },
        data: { gmailUrl: `https://mail.google.com/mail/u/0/#all/${r.threadId}` },
      });
      updated++;
    }
    res.json({ updated });
  } catch (e) {
    next(e);
  }
});
```

Trigger this once from the web dashboard (e.g., on first load after login, or via a "Fix Gmail links" button in Settings).

## Files Changed

| File | Change |
|------|--------|
| `extension/reply-checker.js` | Fix 1 (401 handling), Fix 2 (apiFetchRetry), Fix 4 (null gmailUrl) |
| `extension/background.js` | Fix 3 (JWT startup check + onStartup listener) |
| `web/src/components/Sidebar.jsx` | Fix 5 (URL priority logic) |
| `server/routes/outreach.js` | Fix 6 (backfill endpoint) |

## Verification

### Reply tracking
1. Open extension DevTools (Extensions → Coldbase background page)
2. Visit `localhost:5173` while logged in → confirm "JWT synced" message or absence of JWT warning
3. Click Refresh in the dashboard → triggers `RECHECK_REPLIES`
4. Confirm logs show: "Reply check: N tracked record(s)" and thread fetches succeed
5. Reply from test account, click Refresh → card moves to "Replied"

### Gmail URL
1. Click "Open in Gmail" on an existing card → confirm it navigates to the specific thread (not just Gmail inbox)
2. Call `POST /api/outreach/backfill-gmail-urls` via dashboard or curl → returns `{ updated: N }`
3. Check a previously-broken card → "Open in Gmail" now opens the correct thread
4. Send a new test email via the extension → confirm the fallback path stores `gmailUrl: null`, not `#sent`
