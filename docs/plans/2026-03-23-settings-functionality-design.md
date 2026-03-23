# Settings Page Functionality Design

**Date:** 2026-03-23
**Status:** Approved

## Problem

The Settings page UI is fully laid out but mostly non-functional:

- Resume upload and email digest work visually but have no error feedback; silent failures leave users confused
- Change email, change password, and delete account forms have no submit handlers — clicking Save does nothing
- No backend routes exist for email/password changes or account deletion
- "Email digest" label is unclear

## Approach

Option A — minimal wiring. Add the missing backend routes, wire up the existing UI forms, add inline feedback. No architectural changes.

## Backend Routes

All three routes added to `server/routes/auth.js`, protected by `requireAuth`.

### `PATCH /auth/email`
- Body: `{ newEmail, password }`
- Verifies current password with bcrypt
- Checks new email not already taken (409 if conflict)
- Updates `user.email` in DB
- Returns `{ email }`

### `PATCH /auth/password`
- Body: `{ currentPassword, newPassword }`
- Verifies current password with bcrypt
- Hashes new password, updates DB
- Returns `{ success: true }`

### `DELETE /auth/account`
- Body: `{ confirm: "DELETE" }` (server-side safety check)
- Hard deletes user row (cascades to Outreach, TrackingPixel)
- Returns `{ success: true }`
- Frontend clears token and redirects to `/login`

All errors use existing shape: `{ error, message, statusCode }`.

## Frontend Form Wiring

Each accordion section becomes a `<form onSubmit={handler}>`.

**Shared pattern per form:**
1. `preventDefault`
2. Set `saving` state → disables Save button, shows "Saving…"
3. Call API
4. Success: show inline "Saved ✓" for 2s, close accordion, reset form
5. Error: show inline red error message below fields (persists until user edits)

**Change email** — calls `patchEmail(newEmail, password)`. New `api.js` export.

**Change password** — calls `patchPassword(currentPassword, newPassword)`. Client-side validates `newPassword === confirmPassword` before hitting server.

**Delete account** — `onClick` calls `deleteAccount()`, then clears auth token and redirects to `/login`. New `api.js` exports for both.

**Email digest** — already calls `patchSettings` on change. Add subtle "Saved ✓" confirmation after API resolves.

**Resume** — already wired. Add visible error message if upload fails.

## UX Copy & Feedback

- "Email digest" → **"Email me updates"**
- Shared `FormStatus` component: green "Saved ✓" (auto-fades after 2s) or red error (persists)
- Error messages:
  - Wrong password → "Incorrect password"
  - Email already taken → "That email is already in use"
  - Passwords don't match (client) → "Passwords don't match"
  - Generic → "Something went wrong, please try again"

## Task IDs

- #7 — Backend: add PATCH /auth/email, PATCH /auth/password, DELETE /auth/account
- #8 — Frontend: wire change email form
- #9 — Frontend: wire change password form
- #10 — Frontend: wire delete account button
- #11 — Frontend: add inline feedback to email digest and resume
- #12 — UX: rename label + add FormStatus component
