# Email Digest System — Design

**Date:** 2026-04-26  
**Status:** Approved

---

## Overview

Add a scheduled email digest to Coldbase. Users opt in to weekly or monthly summaries of their outreach stats. Emails are sent via Resend. The cron job runs daily on the existing Railway Express server.

---

## Layer 1: Database & Settings API

### Schema Changes (`server/prisma/schema.prisma`)

- Rename existing `emailDigest` values: `'daily'` → `'weekly'`, `'never'` → `'none'`; add `'monthly'`
- Add `digestSendDay Int?` — computed once when user enables digests, null when disabled

### Migration (`server/prisma/migrations/`)

Two-step migration:
1. SQL to rewrite existing `emailDigest` values in place
2. Add `digestSendDay` column

### Settings Route (`server/routes/settings.js`)

- Update `VALID_DIGESTS` to `new Set(['weekly', 'monthly', 'none'])`
- On `PATCH /settings`: when `emailDigest` changes to `'weekly'` or `'monthly'`, compute and persist `digestSendDay`:
  - Weekly: `userId % 7` → 0–6 (day of week)
  - Monthly: `(userId % 28) + 1` → 1–28 (day of month)
- When `emailDigest` changes to `'none'`: set `digestSendDay = null`

### Settings UI (`web/src/components/SettingsPage.jsx`)

Swap toggle options from `daily | weekly | never` → `weekly | monthly | none`.

---

## Layer 2: Cron Job

### New File: `server/cron/digestCron.js`

- Scheduled daily at 9:00 AM UTC using `node-cron` (`'0 9 * * *'`)
- Determines `currentDayOfWeek` (0–6) and `currentDayOfMonth` (1–31, capped at 28)
- Queries users:
  ```sql
  WHERE (emailDigest = 'weekly' AND digestSendDay = currentDayOfWeek)
     OR (emailDigest = 'monthly' AND digestSendDay = currentDayOfMonth)
  ```
- For each matched user, fetches stats via Prisma aggregate queries:
  - `totalContacts` — COUNT outreach where `archived = false`
  - `followUpsDue` — COUNT where `nextActionDate <= today` AND `archived = false`
  - `emailsSent` — COUNT where `sentDate IS NOT NULL` AND `archived = false`
  - `sendRate` — `emailsSent / totalContacts`
  - `replyRate` — `COUNT(repliedAt IS NOT NULL) / emailsSent` (omitted if 0 sent)
- Calls Resend to send one email per user

### Startup Wiring

Import and invoke the cron job in `server/index.js` (on server boot).

### New Packages

```
node-cron   — daily scheduler
resend      — transactional email API
```

---

## Layer 3: Email Template

### New File: `server/emails/digestTemplate.js`

Exports `buildDigestEmail({ email, frequency, stats, dashboardUrl })`.

Returns an HTML string with inline CSS (email-safe):
- Header: "Your Coldbase Weekly/Monthly Digest"
- Stat cards: Follow-ups due · Total contacts · Emails sent · Send rate · Reply rate
- Reply rate card is hidden when `emailsSent === 0`
- CTA button linking to `dashboardUrl`
- Plain-text version passed to Resend as `text` field

### Resend Call

```js
resend.emails.send({
  from: 'digest@<verified-coldbase-domain>',
  to: user.email,
  subject: `Your Coldbase ${capitalize(user.emailDigest)} Digest`,
  html: buildDigestEmail({ ... }),
  text: buildDigestEmailText({ ... }),
})
```

---

## Constraints

- Resend free tier: 100 emails/day — modulo bucketing keeps daily volume well under this
- No queue state: the cron query is fully stateless
- `digestSendDay` is set once and never recomputed (even if user toggles off and back on)

---

## Out of Scope

- Email open/click tracking
- Custom send day preferences
- Digest preview in UI
- Unsubscribe flow (handled by settings toggle)

---

## Verification

1. Set a test user's `emailDigest = 'weekly'` and `digestSendDay = currentDayOfWeek`
2. Manually invoke the cron handler function
3. Confirm Resend API receives the call (check Resend dashboard or use test API key)
4. Confirm email renders correctly with real stat values
5. Toggle digest off in settings — confirm `digestSendDay` clears to null
6. Toggle back on — confirm `digestSendDay` is recomputed correctly
