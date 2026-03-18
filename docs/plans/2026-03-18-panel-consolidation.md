# Panel Consolidation & Widget Positioning Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the duplicate sidebar panel (`sidebar.js`) by routing all icon clicks through the single compose panel (`compose-widget.js`), and fix the widget positioning bug where new compose widgets stick to the position of the old one.

**Architecture:** `openComposePanel(null)` in `compose-widget.js` already handles the no-editor state gracefully (Draft AI shows disabled, tracking toggle uses `savedTrackingDefault`, Overview loads stats). `background.js` just needs to always send `OPEN_PANEL` instead of branching on `isGmail`. `sidebar.js` is then dead code and is deleted. The widget positioning bug is in `detectNeighborRect` — it must skip other Reach widgets (`.oiq-w` elements) when probing for neighbors.

**Tech Stack:** Vanilla JS content scripts (no bundler, no framework). Chrome Extension Manifest V3.

---

### Task 1: Fix widget positioning — skip own widgets in neighbor probe

The `detectNeighborRect` function in `compose-widget.js` uses `document.elementFromPoint()` to find a neighbor element near the editor's top-right corner. When multiple compose windows are open at similar screen positions, the probe finds the first compose's widget (`.oiq-w`) and positions the new widget relative to it instead of the new editor.

**Files:**
- Modify: `extension/compose-widget.js` (function `detectNeighborRect`, ~line 98–121)

**Step 1: Locate the probe loop**

The loop in `detectNeighborRect`:
```js
for (const testY of probeYs) {
  const el = document.elementFromPoint(probeX, testY);
  if (!el || el === document.body || editorEl.contains(el) || el.contains(editorEl)) continue;
  neighborRect = el.getBoundingClientRect();
  break;
}
```

**Step 2: Add the Reach widget skip condition**

Add one guard after the existing guards:
```js
for (const testY of probeYs) {
  const el = document.elementFromPoint(probeX, testY);
  if (!el || el === document.body || editorEl.contains(el) || el.contains(editorEl)) continue;
  if (el.classList.contains('oiq-w')) continue; // skip other Reach widgets
  neighborRect = el.getBoundingClientRect();
  break;
}
```

**Step 3: Manual verification**

Load unpacked extension → open two Gmail compose windows → click in the second one to focus it → confirm the widget appears at the second compose window's position, not the first.

**Step 4: Commit**
```bash
git add extension/compose-widget.js
git commit -m "fix(widget): skip own widgets in neighbor probe to fix multi-compose positioning"
```

---

### Task 2: Update background.js to always send OPEN_PANEL

**Files:**
- Modify: `extension/background.js` (~line 67–88)

**Current code:**
```js
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  const isGmail = tab.url && tab.url.startsWith('https://mail.google.com/');
  const msgType = isGmail ? 'OPEN_PANEL' : 'TOGGLE_SIDEBAR';
  chrome.tabs.sendMessage(tab.id, { type: msgType }, () => {
    ...
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        files: ['logger.js', 'email-detector.js', 'compose-widget.js', 'tracking.js', 'content.js', 'sidebar.js'],
      },
      () => {
        if (chrome.runtime.lastError) return;
        chrome.tabs.sendMessage(tab.id, { type: msgType }, () => {
          void chrome.runtime.lastError;
        });
      }
    );
  });
});
```

**Step 1: Remove isGmail branching, remove sidebar.js from injection list**

Replace the entire `onClicked` listener with:
```js
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' }, () => {
    const err = chrome.runtime.lastError;
    // "Could not establish connection" = no content script yet — inject and retry
    if (!err?.message?.includes('Could not establish connection')) return;
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        files: ['logger.js', 'email-detector.js', 'compose-widget.js', 'tracking.js', 'content.js'],
      },
      () => {
        if (chrome.runtime.lastError) return; // restricted page (chrome://, etc.)
        chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' }, () => {
          void chrome.runtime.lastError;
        });
      }
    );
  });
});
```

Note: `sidebar.js` removed from the injection list. `TOGGLE_SIDEBAR` replaced with `OPEN_PANEL` throughout.

**Step 2: Manual verification**

Reload extension → click icon on a non-Gmail tab → confirm the 3-tab Reach panel appears (same panel as Gmail). Click again → panel closes. Verify tracking toggle still persists across tabs via storage.

**Step 3: Commit**
```bash
git add extension/background.js
git commit -m "feat(background): always send OPEN_PANEL, remove TOGGLE_SIDEBAR and sidebar.js injection"
```

---

### Task 3: Remove sidebar.js from manifest content_scripts

**Files:**
- Modify: `extension/manifest.json`

**Step 1: Remove the sidebar.js entry**

In the `content_scripts` array, find the Gmail match entry:
```json
{
  "matches": ["https://mail.google.com/*"],
  "js": [
    "logger.js",
    "email-detector.js",
    "compose-widget.js",
    "tracking.js",
    "content.js",
    "sidebar.js"
  ],
  ...
}
```

Remove `"sidebar.js"` from the `js` array:
```json
{
  "matches": ["https://mail.google.com/*"],
  "js": [
    "logger.js",
    "email-detector.js",
    "compose-widget.js",
    "tracking.js",
    "content.js"
  ],
  ...
}
```

**Step 2: Commit**
```bash
git add extension/manifest.json
git commit -m "chore(manifest): remove sidebar.js from Gmail content scripts"
```

---

### Task 4: Delete sidebar.js

**Files:**
- Delete: `extension/sidebar.js`

**Step 1: Delete the file**
```bash
git rm extension/sidebar.js
```

**Step 2: Final end-to-end verification**

- Gmail tab: click icon → compose panel opens with all 3 tabs, Draft AI enabled when compose is open, disabled otherwise
- Non-Gmail tab: click icon → same compose panel opens, Draft AI permanently disabled ("Open a compose window to use this feature.")
- Non-Gmail tracking toggle: toggle Off → open Gmail compose → confirm tracking toggle reflects Off state
- Multi-compose widget positioning: open 2+ compose windows → confirm each widget sits at its own compose, not the first one's

**Step 3: Commit**
```bash
git add -A
git commit -m "chore: delete sidebar.js — compose-widget.js panel is now the single implementation"
```
