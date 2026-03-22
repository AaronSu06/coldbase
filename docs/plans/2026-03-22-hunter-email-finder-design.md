# Hunter Email Finder — Design

**Date:** 2026-03-22
**Branch:** emdash/extension-52q
**Status:** Approved, ready for implementation planning

---

## Problem

The current email finder uses Gemini to infer email patterns + raw SMTP probing to verify them. SMTP probing is blocked by Google Workspace and Office 365 (the majority of modern companies), so results stay UNCONFIRMED at 30% confidence and are often wrong. Gemini is also used for domain resolution and known-email discovery — roles it doesn't perform reliably.

## Decision

Replace the entire `emailFinder.js` with a direct Hunter.io API call. Keep Gemini only for AI drafting. Add per-user monthly lookup quotas to protect against credit burn. Add session-state persistence for Find Contacts and Draft AI panels.

---

## Architecture

### Deleted
- `server/emailFinder.js` — all Gemini + SMTP logic removed

### Modified
- `server/routes/email.js` — `/find-email` handler replaced with Hunter API call; `/draft-email` handler unchanged (Gemini stays here)
- `server/app.js` — `checkQuota` middleware added to the `/find-email` mount point
- `server/prisma/schema.prisma` — two fields added to `User`
- `extension/compose-widget.js` — result rendering simplified; session state save/restore added
- `extension/panel.js` — same session state changes as compose-widget

### Added
- `server/middleware/checkQuota.js` — quota read, check, and increment logic

### Unchanged
- `/suggest-domains` — DNS-based, no quota, no change
- `/draft-email` — Gemini, no change to logic
- All auth, outreach, tracking, analytics routes

---

## Section 1: Hunter API Integration

### Email finder (name provided — Mode B)
```
GET https://api.hunter.io/v2/email-finder
  ?domain=stripe.com
  &first_name=Adyan
  &last_name=Tanver
  &api_key=HUNTER_KEY
```

### Domain search (no name — Mode A)
```
GET https://api.hunter.io/v2/domain-search
  ?domain=stripe.com
  &limit=5
  &api_key=HUNTER_KEY
```
Returns up to 5 publicly known emails for the domain (press contacts, leadership, etc.).

### Response mapping

| Hunter field | Extension field | Notes |
|---|---|---|
| `data.email` | `email` | direct |
| `data.score` | `confidence` | Hunter 0–100 |
| — | `status` | **removed** |
| — | `source` | **removed** |
| — | `domain` | **removed** |

If Hunter returns `{ data: null }` → `{ ok: false, reason: 'no_candidates' }`.

### Environment
- `HUNTER_KEY` added to `.env` and `.env.example`
- If missing, `/find-email` returns `500` with a clear message (same pattern as `GEMINI_KEY` in `/draft-email`)

---

## Section 2: Quota Enforcement

### DB schema — `User` model additions
```prisma
lookupsUsedThisMonth Int      @default(0)
lookupsResetAt       DateTime?
```

### Plan limits
| Plan | Limit |
|------|-------|
| `free` | 5 lookups/month |
| `basic` | 50 lookups/month |
| `pro` | 200 lookups/month |

### `server/middleware/checkQuota.js` — flow
1. Read `user.lookupsResetAt` — if null or in the past, reset `lookupsUsedThisMonth = 0`, set `lookupsResetAt = first day of next month`
2. Check `lookupsUsedThisMonth >= limit[user.plan]` → return `429 { error: 'quota_exceeded', used: N, limit: N }`
3. Pass through to route handler
4. On successful Hunter response, increment `lookupsUsedThisMonth += 1`

### Route mount order
```
requireAuth → checkQuota → expensiveRateLimit → /find-email handler
```

### Extension error handling
On `quota_exceeded`, results area shows:
> *"Monthly lookup limit reached (50/50). Upgrade to find more contacts."*

---

## Section 3: Session State Persistence

Uses `chrome.storage.session` — persists across popup open/close, clears when browser closes, never synced across tabs.

### Keys
| Key | Contents |
|---|---|
| `reach_find_state` | `{ domain, firstName, lastName }` |
| `reach_find_results` | `{ results: [...], domain }` |
| `reach_draft_state` | `{ text }` |

### Behaviour
- **On open** — restore inputs and results from session storage immediately, no re-fetch
- **On Find Emails click** — save inputs before request, save results after response
- **On draft generated** — save draft text
- **On clear (×)** — clear `reach_find_state` and `reach_find_results` from session storage

### Scope
Both `compose-widget.js` and `panel.js` — same keys, same logic.

Not persisted: dropdown suggestions, loading/spinner state.

---

## Section 4: Result Display

### Before
```
adyan.tanv…   [UNCONFIRMED]   30%   pattern   [Copy]
```

### After
```
adyan.tanver@cove.dev          65%   [Copy]
```

- Full email, not truncated
- Confidence percentage only — no status badge, no source label
- `status`, `source`, `domain` fields removed from server JSON response

---

## Implementation Task Reference

| # | Task |
|---|---|
| T1 | Add `lookupsUsedThisMonth` + `lookupsResetAt` to User schema and run migration |
| T2 | Write `server/middleware/checkQuota.js` |
| T3 | Replace `/find-email` route handler with Hunter API call (Mode A + B) |
| T4 | Delete `server/emailFinder.js` |
| T5 | Wire `checkQuota` into `server/app.js` |
| T6 | Add session state save/restore to `extension/compose-widget.js` |
| T7 | Add session state save/restore to `extension/panel.js` |
| T8 | Update result rendering in both extension files (remove badges/labels, show full email) |
| T9 | Add `HUNTER_KEY` to `.env.example`, update server startup check |
