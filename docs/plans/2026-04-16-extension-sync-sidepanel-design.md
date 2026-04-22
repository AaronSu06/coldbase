# Extension: Auth Sync + Side Panel Fix Design

**Date:** 2026-04-16

## Problem

Two bugs in the Chrome extension, both rooted in `manifest.json`:

1. **Auth not syncing** — Logging in/out on the web dashboard doesn't update the extension's stored JWT. The extension either still shows the panel when logged out, or stays locked when logged in.

2. **Side panel only opens on Gmail tabs** — Clicking the extension icon on any non-Gmail page silently fails. This is a recurring issue that gets "fixed" and then breaks again.

## Root Causes

### Auth Sync

`dashboard-sync.js` already exists and does the right thing: it reads `localStorage` on page load, listens for `COLDBASE_LOGIN`/`COLDBASE_LOGOUT` postMessages from the web app, and forwards them to the background service worker via `chrome.runtime.sendMessage`. The background handler (background.js:249–258) stores/clears the JWT in `chrome.storage.local`.

The script is just never injected — it's missing from `manifest.json`'s `content_scripts`. The dashboard URLs (`http://localhost:5173` and `https://coldbase.vercel.app`) are also missing from `host_permissions`, which Chrome requires before injecting content scripts.

### Side Panel

`background.js:80–99` handles icon clicks by sending `OPEN_PANEL` to the active tab. If no content script is running (i.e. not a Gmail tab), it falls back to `chrome.scripting.executeScript` to inject the scripts first. Chrome blocks this injection because the tab URL doesn't match `host_permissions`. The `"activeTab"` permission is missing — this is what allows script injection into whichever tab the user just clicked on, regardless of URL.

The recurring nature: `"activeTab"` is easy to omit since it's not obviously required by reading the code. It gets dropped in cleanups or merges, breaks silently, and has to be rediscovered.

## Solution

All changes are in `extension/manifest.json`.

### 1. Register `dashboard-sync.js` as a content script

```json
{
  "matches": [
    "http://localhost:5173/*",
    "https://coldbase.vercel.app/*"
  ],
  "js": ["dashboard-sync.js"],
  "run_at": "document_idle"
}
```

When a real domain is acquired, add it to `matches` and `host_permissions`.

### 2. Add dashboard URLs to `host_permissions`

```
"http://localhost:5173/*"
"https://coldbase.vercel.app/*"
```

### 3. Add `"activeTab"` to `permissions`

```json
"permissions": ["identity", "storage", "alarms", "scripting", "activeTab"]
```

`"activeTab"` grants temporary, one-time access to the tab the user just clicked on. No install-time permission warning. Enables `scripting.executeScript` to inject the panel on any non-restricted tab.

## Files Changed

- `extension/manifest.json` — only file modified

## Verification

1. Load the unpacked extension in Chrome (`chrome://extensions` → Load unpacked)
2. **Auth sync test:**
   - Open `http://localhost:5173` (or `https://coldbase.vercel.app`)
   - Log in → open Gmail → click extension icon → panel should open (not show auth gate)
   - Log out on dashboard → switch back to Gmail panel → should show auth gate / locked state
3. **Side panel test:**
   - Navigate to any non-Gmail page (e.g. `https://github.com`)
   - Click extension icon → panel should open
   - Navigate to Gmail → click icon → panel should still open
