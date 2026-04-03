# Draft AI Autofill Fix Design

**Date:** 2026-04-02
**File:** `extension/compose-widget.js`

## Problem

The Draft AI tab autofills the Company and Contact Name fields with names from a completely different email. This happens in both compose and reply windows.

**Root cause:** `getComposeContainer()` falls back to `document` when none of its Gmail DOM selectors match the current editor element (most commonly in inline reply windows). The subsequent `querySelectorAll('[email]')` then sweeps the entire Gmail page, grabbing recipient chips from whatever thread Gmail has rendered in the background.

## Design

Three targeted changes to `compose-widget.js`:

### 1. Fix `getComposeContainer` (line 80–87)

Add two additional Gmail inline-reply container selectors (`.M9`, `.AD`) and replace the `document` fallback with `null`:

```js
function getComposeContainer(editorEl) {
  return (
    editorEl.closest('[role="dialog"]') ||
    editorEl.closest('.nH.if') ||
    editorEl.closest('.M9') ||
    editorEl.closest('.AD') ||
    editorEl.closest('form') ||
    null
  );
}
```

### 2. Guard `getComposeMetadata` (line 89–97)

Return empty defaults when container is `null` instead of falling back to `document.querySelector`:

```js
function getComposeMetadata(editorEl) {
  const container = getComposeContainer(editorEl);
  if (!container) return { subject: '', recipients: '' };
  const subjectEl = container.querySelector('input[name="subjectbox"]');
  const recipients = Array.from(container.querySelectorAll('[email]'))
    .map(el => el.getAttribute('email'))
    .filter(Boolean)
    .join(',');
  return { subject: (subjectEl?.value || '').trim(), recipients };
}
```

### 3. Guard `prefillDraftTab` and generate handler (lines 1124, 1159)

Early-return when container is `null` — fields stay blank rather than being poisoned:

```js
const container = getComposeContainer(ctx.currentEditorEl);
if (!container) return;
```

## Outcome

- Names and company from unrelated emails can no longer leak into the Draft AI form
- If Gmail changes its DOM and none of the selectors match, fields stay blank — user can type manually
- No behavior change for correctly-scoped compose/reply windows

## Verification

1. Open Gmail, load a thread with multiple participants
2. Open an inline reply and open the Draft AI tab — verify Contact Name and Company match the actual recipient
3. Open a modal compose window and verify same
4. Check that the generate button still works after the null guard is added
