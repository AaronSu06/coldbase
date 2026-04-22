# Extension Auth Sync + Side Panel Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Fix two bugs in `extension/manifest.json` — auth JWT never syncing from the dashboard to the extension, and the side panel silently failing to open on non-Gmail tabs.

**Architecture:** Both bugs are manifest-only fixes. No logic changes needed. `dashboard-sync.js` already exists and works; it just needs to be registered. `"activeTab"` is the standard Chrome permission for click-triggered script injection on arbitrary tabs.

**Tech Stack:** Chrome Extension Manifest V3, `chrome.scripting`, `chrome.storage.local`

**Design doc:** `docs/plans/2026-04-16-extension-sync-sidepanel-design.md`

---

### Task 1: Add `"activeTab"` permission and dashboard `host_permissions`

**Files:**
- Modify: `extension/manifest.json`

**Step 1: Add `"activeTab"` to the permissions array**

In `manifest.json`, change:
```json
"permissions": [
  "identity",
  "storage",
  "alarms",
  "scripting"
],
```
to:
```json
"permissions": [
  "identity",
  "storage",
  "alarms",
  "scripting",
  "activeTab"
],
```

**Step 2: Add dashboard URLs to `host_permissions`**

Change:
```json
"host_permissions": [
  "https://mail.google.com/*",
  "https://www.googleapis.com/*",
  "https://generativelanguage.googleapis.com/*"
],
```
to:
```json
"host_permissions": [
  "https://mail.google.com/*",
  "https://www.googleapis.com/*",
  "https://generativelanguage.googleapis.com/*",
  "http://localhost:5173/*",
  "https://coldbase.vercel.app/*"
],
```

**Step 3: Add the `dashboard-sync.js` content script entry**

In `content_scripts`, add a second entry after the existing Gmail one:
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

**Step 4: Commit**

```bash
git add extension/manifest.json
git commit -m "fix: add activeTab permission and register dashboard-sync.js content script"
```

---

### Task 2: Verify fixes manually

**Step 1: Reload the extension**

Go to `chrome://extensions` → find Coldbase → click the reload (↺) button.

**Step 2: Test auth sync**

1. Open `http://localhost:5173` (or `https://coldbase.vercel.app`)
2. Log in → open a Gmail tab → click the extension icon → panel should open (no auth gate)
3. Log out on the dashboard → switch back to Gmail → click icon → should show auth gate / locked

**Step 3: Test side panel on non-Gmail tab**

1. Navigate to any regular page (e.g. `https://github.com`)
2. Click the extension icon → panel should open
3. Verify it still works on Gmail tabs too

---

## Future: custom domain

When a real domain is acquired, add it to both `host_permissions` and the `dashboard-sync.js` content script `matches` array. That's the only change needed.
