# Sidebar Edit Mode Design

**Date:** 2026-03-26
**Scope:** `web/src/components/Sidebar.jsx`

## Problem

The sidebar currently uses a per-field inline edit pattern (`editingField` state) where clicking
any field individually activates it as an input. There's no clear signal to the user that fields
are editable, and the sentDate is editable when it shouldn't be.

## Solution

Replace per-field edit state with a global edit mode toggle controlled by a pencil icon in the
sidebar header.

## Design

### State changes

- Remove `editingField` state and all per-field click handlers that set it
- Add `isEditMode` boolean state (default `false`)
- `isEditMode` resets to `false` when the sidebar opens a new record
- `editValues` stays as-is (tracks live input values for company, contactName, contactEmail, subject)

### Header pencil icon

- Import `Pencil` from `lucide-react` in `Sidebar.jsx`
- Add pencil button to the header action row (alongside heart, archive, trash, close)
- When `isEditMode` is true: button shows accent color + light accent background
- When `isEditMode` is false: button shows muted color
- Clicking toggles `isEditMode`

### Field rendering

**Edit mode OFF (default):**
- company, contactName, contactEmail, subject render as plain `<p>` / `<span>` text
- No `cursor-text`, no hover underline, no `onClick` handler
- sentDate always renders as plain text (no edit interaction, ever)

**Edit mode ON:**
- All four fields (company, contactName, contactEmail, subject) render as `<input>` simultaneously
- No click required to activate individual fields
- Inputs get a visible border (`border border-chrome-rim rounded px-1`) to signal editability
- Blur-to-save via existing `handleFieldBlur` per field — no change to save logic

### Non-editable fields

- sentDate: remove `editingField === 'sentDate'` branch entirely; always render `formatShortDate(record.sentDate)` as plain text
- All other sidebar content (notes, status stepper, conversation, tips, next action date) is unchanged

## Files changed

- `web/src/components/Sidebar.jsx` — only file modified

## Out of scope

- No changes to OutreachCard, KanbanBoard, or App
- No new save/cancel buttons
- No changes to the notes textarea or next action date picker
