# Email Tracking Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Fix two regressions introduced by the best-practices JWT-auth refactor: reply tracking silently failing and "Open in Gmail" opening inbox instead of the specific thread.

**Architecture:** Six targeted code edits across four files. No schema changes needed. Extension fixes restore correct auth error handling. Server adds one new authenticated endpoint. Web Sidebar gets smarter URL logic.

**Tech Stack:** Chrome Extension MV3 (ES modules), Express.js + Prisma, React

---

### Task 1: Fix `checkReplies` — handle non-ok `fetchOutreach` response

**Files:**
- Modify: `extension/reply-checker.js:317-326`

The current code calls `(await res.json()).data` without checking `res.ok`. If the server returns 401 (JWT missing), `records` is `undefined` and the for-loop throws silently. This fix makes the failure visible.

**Step 1: Open the file and locate the target block**

Open `extension/reply-checker.js`. Find the `checkReplies` function starting at line 317. The block to replace is:

```js
export async function checkReplies(token) {
  let records;
  try {
    const res = await fetchOutreach();
    records = (await res.json()).data;
    log.info(`Reply check: ${records.length} tracked record(s).`);
  } catch (e) {
    log.error('Could not fetch records for reply check:', e.message);
    return;
  }
```

**Step 2: Replace with explicit status check**

```js
export async function checkReplies(token) {
  let records;
  try {
    const res = await fetchOutreach();
    if (!res.ok) {
      if (res.status === 401) {
        log.warn('Reply check aborted: JWT missing or invalid. Open the web dashboard to sync your session.');
      } else {
        log.error(`Reply check aborted: fetchOutreach returned ${res.status}`);
      }
      return;
    }
    records = (await res.json()).data;
    log.info(`Reply check: ${records.length} tracked record(s).`);
  } catch (e) {
    log.error('Could not fetch records for reply check:', e.message);
    return;
  }
```

**Step 3: Manually verify**

In the extension DevTools console (background page), trigger `RECHECK_REPLIES` without a JWT. Confirm you now see the warning `"Reply check aborted: JWT missing or invalid"` instead of a TypeError crash.

**Step 4: Commit**

```bash
git add extension/reply-checker.js
git commit -m "fix(extension): abort reply check with clear error when JWT is missing"
```

---

### Task 2: Fix `checkReplies` — use `apiFetchRetry` for Gmail thread fetches

**Files:**
- Modify: `extension/reply-checker.js:330-334`

`apiFetch` throws `TOKEN_EXPIRED` on a 401 from Gmail. The caller catches it and skips the thread silently. `apiFetchRetry` auto-refreshes the token and retries once. Both `apiFetchRetry` and `getAuthToken` are already imported at the top of the file.

**Step 1: Locate the target line**

In `extension/reply-checker.js`, inside the `for (const record of records)` loop (around line 330):

```js
const thread = await apiFetch(
  `${GMAIL_API}/threads/${record.threadId}?format=full`,
  token
);
```

**Step 2: Replace with `apiFetchRetry`**

```js
const thread = await apiFetchRetry(
  `${GMAIL_API}/threads/${record.threadId}?format=full`,
  token,
  getAuthToken
);
```

No import changes needed — both are already imported (`apiFetchRetry` from `./api-client.js`, `getAuthToken` from `./auth.js`).

**Step 3: Commit**

```bash
git add extension/reply-checker.js
git commit -m "fix(extension): use apiFetchRetry in checkReplies so expired tokens auto-refresh"
```

---

### Task 3: Fix `trackFromPendingScan` — stop storing broken `gmailUrl`

**Files:**
- Modify: `extension/reply-checker.js:271`

The fallback path creates a synthetic `reach_` threadId. Storing `#sent` (no thread ID) as `gmailUrl` means every "Open in Gmail" click on a fallback record opens the Sent label. Storing `null` lets the Sidebar handle it gracefully.

**Step 1: Locate the target line**

In `extension/reply-checker.js`, inside `trackFromPendingScan`, find the record object (around line 269):

```js
  const record = {
    threadId:      syntheticThreadId,
    gmailUrl:      'https://mail.google.com/mail/u/0/#sent',
```

**Step 2: Change to null**

```js
  const record = {
    threadId:      syntheticThreadId,
    gmailUrl:      null,
```

**Step 3: Commit**

```bash
git add extension/reply-checker.js
git commit -m "fix(extension): store null gmailUrl for fallback records instead of broken #sent URL"
```

---

### Task 4: Add JWT presence check on extension startup

**Files:**
- Modify: `extension/background.js:49-52`

Adds a `chrome.runtime.onStartup` listener and runs the same check inside `onInstalled`. Makes the "JWT not synced" state immediately visible in the extension console on every browser start.

**Step 1: Add `getColdbaseToken` to the existing import**

At the top of `extension/background.js`, line 6:

```js
import { setColdbaseToken, clearColdbaseToken } from './coldbase-auth.js';
```

Change to:

```js
import { getColdbaseToken, setColdbaseToken, clearColdbaseToken } from './coldbase-auth.js';
```

**Step 2: Add the check function and startup listener**

Find the `chrome.runtime.onInstalled` listener (line 49):

```js
chrome.runtime.onInstalled.addListener(() => {
  log.info('Extension installed.');
  chrome.alarms.create('coldbase-reply-check', { periodInMinutes: 30 });
});
```

Replace with:

```js
async function checkJwtPresent() {
  const token = await getColdbaseToken();
  if (!token) {
    log.warn('No Coldbase JWT in storage. Visit http://localhost:5173 and log in to sync your session.');
  }
}

chrome.runtime.onInstalled.addListener(() => {
  log.info('Extension installed.');
  checkJwtPresent();
  chrome.alarms.create('coldbase-reply-check', { periodInMinutes: 30 });
});

chrome.runtime.onStartup.addListener(() => {
  checkJwtPresent();
});
```

**Step 3: Commit**

```bash
git add extension/background.js
git commit -m "fix(extension): warn on startup when Coldbase JWT is missing from storage"
```

---

### Task 5: Fix Sidebar `gmailUrl` priority logic

**Files:**
- Modify: `web/src/components/Sidebar.jsx:364-367`

Currently: `record.gmailUrl || fallback`. Problem: `gmailUrl` stored as `'#sent'` (truthy) wins over the correct `#all/${threadId}` fallback.

Fix: For records with a real Gmail threadId (not `reach_`-prefixed), always construct the URL fresh. Only use stored values as last resort.

**Step 1: Locate the target block**

In `web/src/components/Sidebar.jsx`, lines 364–367:

```js
  const gmailUrl =
    record?.gmailThreadUrl ||
    record?.gmailUrl ||
    (record?.threadId ? `https://mail.google.com/mail/u/0/#all/${record.threadId}` : '');
```

**Step 2: Replace with smarter priority**

```js
  const gmailUrl =
    (record?.threadId && !record.threadId.startsWith('reach_'))
      ? `https://mail.google.com/mail/u/0/#all/${record.threadId}`
      : (record?.gmailThreadUrl || record?.gmailUrl || '');
```

Logic: if threadId looks like a real Gmail ID, always build `#all/${threadId}`. Only fall back to stored values for synthetic or missing IDs.

**Step 3: Test manually**

Start the web dev server (`npm run dev` in `web/`). Open a record in the Sidebar. Click "Open in Gmail" — confirm it opens the specific thread, not Gmail home or Sent.

**Step 4: Commit**

```bash
git add web/src/components/Sidebar.jsx
git commit -m "fix(web): prefer constructed #all/threadId URL over stale stored gmailUrl in Sidebar"
```

---

### Task 6: Add `POST /api/outreach/backfill-gmail-urls` server endpoint

**Files:**
- Modify: `server/routes/outreach.js:121-136` (add before `export default router`)

One-time migration endpoint. Updates all records for the authenticated user where `gmailUrl` contains the old broken pattern and `threadId` is a real Gmail ID.

**Step 1: Locate the insertion point**

In `server/routes/outreach.js`, find the DELETE route (line 122) and then `export default router` (line 137). Insert the new route between the DELETE handler and the export.

**Step 2: Add the endpoint**

```js
// ─── POST /backfill-gmail-urls — one-time migration ─────────────────────────

router.post('/backfill-gmail-urls', async (req, res, next) => {
  const { userId } = req.user;
  try {
    const records = await prisma.outreach.findMany({
      where: {
        userId,
        NOT: { threadId: { startsWith: 'reach_' } },
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

**Note on Prisma syntax:** `NOT: { threadId: { startsWith: 'reach_' } }` requires Prisma 4.3+. If it causes a type error, use the `where` filter:
```js
where: {
  userId,
  OR: [
    { gmailUrl: { contains: '#sent' } },
    { gmailUrl: { contains: '#inbox' } },
    { gmailUrl: null },
  ],
},
```
...then filter in JS: `records.filter(r => !r.threadId.startsWith('reach_'))`.

**Step 3: Test the endpoint**

With the server running:

```bash
# Get a valid JWT from the web app (check localStorage in browser DevTools)
curl -X POST http://localhost:3001/api/outreach/backfill-gmail-urls \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json"
# Expected: { "updated": N }
```

**Step 4: Commit**

```bash
git add server/routes/outreach.js
git commit -m "feat(server): add backfill-gmail-urls endpoint to fix legacy #sent gmailUrl records"
```

---

### Task 7: End-to-end verification

No code changes. Confirm all fixes work together.

**Reply tracking check:**
1. Reload the Chrome extension (Extensions page → Reload)
2. Open the extension background DevTools console
3. Confirm on startup: no "JWT missing" warning if you're logged into the dashboard, or the warning appears if you're not
4. Open `http://localhost:5173` and log in
5. Click the Refresh button in the dashboard (triggers `RECHECK_REPLIES`)
6. In extension console: confirm "Reply check: N tracked record(s)" and no 401 errors
7. Reply to a tracked email from the other account, wait, click Refresh again → card moves to "Replied"

**Gmail URL check:**
1. Call the backfill endpoint (curl command from Task 6, Step 3)
2. Open the web dashboard, click any card → Sidebar opens → click "Open in Gmail"
3. Confirm Gmail opens the specific thread, not inbox or Sent label
4. Send a new test email through the extension → check the DB or network tab that `gmailUrl` is `null` for fallback records

**Confirm no regressions:**
- Status updates (dragging cards) still work
- Archive/delete still work
- Extension compose widget still appears on Gmail
