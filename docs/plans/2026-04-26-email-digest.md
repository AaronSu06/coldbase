# Email Digest Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Add a scheduled weekly/monthly email digest that sends each opted-in user a summary of their outreach stats via Resend.

**Architecture:** A `node-cron` job runs daily on the Railway Express server, queries users whose `digestSendDay` matches today, fetches their stats via Prisma aggregate queries, and sends a plain-HTML email through the Resend API. The digest frequency preference is already stored on the `User` model; this plan migrates its values and adds the `digestSendDay` column.

**Tech Stack:** node-cron, resend, Prisma (Postgres), Express (ESM), plain HTML email template

---

## Task 1: Install packages

**Files:**
- Modify: `server/package.json` (via npm install)

**Step 1: Install node-cron and resend**

```bash
cd server && npm install node-cron resend
```

Expected: both packages appear in `server/package.json` dependencies.

**Step 2: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "chore: install node-cron and resend for email digest"
```

---

## Task 2: DB migration — migrate emailDigest values and add digestSendDay

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260426000000_add_digest_send_day/migration.sql`

**Step 1: Add digestSendDay to schema**

In `server/prisma/schema.prisma`, add this line to the `User` model after the `emailDigest` line:

```prisma
  digestSendDay        Int?
```

Result — the `User` model block around those lines becomes:
```prisma
  emailDigest          String          @default("none")
  digestSendDay        Int?
```

Also update the default for `emailDigest` from `"weekly"` to `"none"` since `'weekly'` is no longer a safe default without a `digestSendDay`.

**Step 2: Create the migration SQL file**

Create directory `server/prisma/migrations/20260426000000_add_digest_send_day/` and write `migration.sql`:

```sql
-- Migrate existing emailDigest values to new scheme
UPDATE "User" SET "emailDigest" = 'weekly' WHERE "emailDigest" = 'daily';
UPDATE "User" SET "emailDigest" = 'none'   WHERE "emailDigest" = 'never';

-- Add digestSendDay column
ALTER TABLE "User" ADD COLUMN "digestSendDay" INTEGER;

-- Backfill digestSendDay for any existing weekly/monthly users
-- (userId % 7 for weekly, (userId % 28) + 1 for monthly)
UPDATE "User" SET "digestSendDay" = "id" % 7           WHERE "emailDigest" = 'weekly';
UPDATE "User" SET "digestSendDay" = ("id" % 28) + 1    WHERE "emailDigest" = 'monthly';

-- Update default for new rows
ALTER TABLE "User" ALTER COLUMN "emailDigest" SET DEFAULT 'none';
```

**Step 3: Apply the migration**

```bash
cd server && npx prisma migrate dev --name add_digest_send_day
```

If the migration file already exists it will be applied as-is. Verify with:

```bash
cd server && npx prisma studio
```

Check the `User` table has the new `digestSendDay` column and existing rows have been updated.

**Step 4: Regenerate the Prisma client**

```bash
cd server && npx prisma generate
```

**Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add digestSendDay column, migrate emailDigest values to weekly/monthly/none"
```

---

## Task 3: Update settings route — valid digests + digestSendDay logic

**Files:**
- Modify: `server/routes/settings.js`

**Step 1: Update VALID_DIGESTS and the PATCH handler**

Replace the file content with:

```js
// server/routes/settings.js
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

const VALID_DIGESTS = new Set(['weekly', 'monthly', 'none']);

// ─── GET /settings ─────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        emailDigest: true,
        resumeName: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'Not Found', message: 'User not found', statusCode: 404 });
    res.json(user);
  } catch (e) {
    next(e);
  }
});

// ─── PATCH /settings ───────────────────────────────────────────────────────────

router.patch('/', async (req, res, next) => {
  const { emailDigest } = req.body;
  if (emailDigest !== undefined && !VALID_DIGESTS.has(emailDigest)) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'emailDigest must be weekly, monthly, or none',
      statusCode: 400,
    });
  }
  try {
    const data = {};
    if (emailDigest !== undefined) {
      data.emailDigest = emailDigest;
      if (emailDigest === 'weekly') {
        data.digestSendDay = req.user.userId % 7;
      } else if (emailDigest === 'monthly') {
        data.digestSendDay = (req.user.userId % 28) + 1;
      } else {
        data.digestSendDay = null;
      }
    }
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data,
      select: {
        emailDigest: true,
        resumeName: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
      },
    });
    res.json(user);
  } catch (e) {
    next(e);
  }
});

export default router;
```

**Step 2: Commit**

```bash
git add server/routes/settings.js
git commit -m "feat: update settings route for weekly/monthly/none digests with digestSendDay computation"
```

---

## Task 4: Create email template

**Files:**
- Create: `server/emails/digestTemplate.js`

**Step 1: Write the template function**

```js
// server/emails/digestTemplate.js

/**
 * @param {object} opts
 * @param {string} opts.frequency  - 'weekly' | 'monthly'
 * @param {object} opts.stats
 * @param {number} opts.stats.totalContacts
 * @param {number} opts.stats.followUpsDue
 * @param {number} opts.stats.emailsSent
 * @param {number} opts.stats.sendRate    - 0–1
 * @param {number|null} opts.stats.replyRate  - 0–1, or null if no emails sent
 * @param {string} opts.dashboardUrl
 * @returns {string} HTML string
 */
export function buildDigestEmail({ frequency, stats, dashboardUrl }) {
  const label = frequency === 'monthly' ? 'Monthly' : 'Weekly';
  const pct = (rate) => rate != null ? `${Math.round(rate * 100)}%` : '—';

  const statCards = [
    { label: 'Follow-ups due', value: stats.followUpsDue },
    { label: 'Total contacts', value: stats.totalContacts },
    { label: 'Emails sent',    value: stats.emailsSent },
    { label: 'Send rate',      value: pct(stats.sendRate) },
    ...(stats.replyRate != null
      ? [{ label: 'Reply rate', value: pct(stats.replyRate) }]
      : []),
  ];

  const cardHtml = statCards.map(({ label, value }) => `
    <td style="padding:0 8px 0 0;vertical-align:top;">
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;min-width:100px;">
        <div style="font-size:22px;font-weight:700;color:#111827;line-height:1;">${value}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">${label}</div>
      </div>
    </td>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your Coldbase ${label} Digest</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:28px 32px;">
              <div style="font-size:20px;font-weight:700;color:#ffffff;">Coldbase</div>
              <div style="font-size:13px;color:#9ca3af;margin-top:4px;">Your ${label} Digest</div>
            </td>
          </tr>

          <!-- Stats -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 20px;font-size:15px;color:#374151;">
                Here's your outreach summary:
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>${cardHtml}</tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 36px;">
              <a href="${dashboardUrl}"
                 style="display:inline-block;background:#f97316;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">
                Open Coldbase →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #f3f4f6;padding:20px 32px;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                You're receiving this because you enabled ${label.toLowerCase()} digests in your Coldbase settings.
                To unsubscribe, update your notification preferences in settings.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Plain-text fallback for email clients that don't render HTML.
 */
export function buildDigestEmailText({ frequency, stats, dashboardUrl }) {
  const label = frequency === 'monthly' ? 'Monthly' : 'Weekly';
  const pct = (rate) => rate != null ? `${Math.round(rate * 100)}%` : 'N/A';
  return [
    `Your Coldbase ${label} Digest`,
    '',
    `Follow-ups due:  ${stats.followUpsDue}`,
    `Total contacts:  ${stats.totalContacts}`,
    `Emails sent:     ${stats.emailsSent}`,
    `Send rate:       ${pct(stats.sendRate)}`,
    ...(stats.replyRate != null ? [`Reply rate:      ${pct(stats.replyRate)}`] : []),
    '',
    `Open Coldbase: ${dashboardUrl}`,
    '',
    `To unsubscribe, update your notification preferences in settings.`,
  ].join('\n');
}
```

**Step 2: Commit**

```bash
git add server/emails/digestTemplate.js
git commit -m "feat: add plain-HTML digest email template"
```

---

## Task 5: Create the cron job

**Files:**
- Create: `server/cron/digestCron.js`

**Step 1: Write the cron job**

Requires env vars: `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`, `DASHBOARD_URL`.

```js
// server/cron/digestCron.js
import cron from 'node-cron';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma.js';
import { buildDigestEmail, buildDigestEmailText } from '../emails/digestTemplate.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.DIGEST_FROM_EMAIL;   // e.g. digest@coldbase.io
const DASHBOARD_URL = process.env.DASHBOARD_URL;    // e.g. https://app.coldbase.io

async function getUserStats(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalContacts, followUpsDue, emailsSent, repliedCount] = await Promise.all([
    prisma.outreach.count({
      where: { userId, archived: false },
    }),
    prisma.outreach.count({
      where: { userId, archived: false, nextActionDate: { lte: today } },
    }),
    prisma.outreach.count({
      where: { userId, archived: false, sentDate: { not: null } },
    }),
    prisma.outreach.count({
      where: { userId, archived: false, repliedAt: { not: null } },
    }),
  ]);

  return {
    totalContacts,
    followUpsDue,
    emailsSent,
    sendRate: totalContacts > 0 ? emailsSent / totalContacts : 0,
    replyRate: emailsSent > 0 ? repliedCount / emailsSent : null,
  };
}

async function sendDigests() {
  const now = new Date();
  const currentDayOfWeek = now.getDay();          // 0–6
  const currentDayOfMonth = now.getDate();         // 1–31 (only 1–28 ever assigned)

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { emailDigest: 'weekly',  digestSendDay: currentDayOfWeek },
        { emailDigest: 'monthly', digestSendDay: currentDayOfMonth },
      ],
    },
    select: { id: true, email: true, emailDigest: true },
  });

  console.log(`[digest] Running for ${users.length} user(s) on day ${currentDayOfWeek}/${currentDayOfMonth}`);

  for (const user of users) {
    try {
      const stats = await getUserStats(user.id);
      const html = buildDigestEmail({ frequency: user.emailDigest, stats, dashboardUrl: DASHBOARD_URL });
      const text = buildDigestEmailText({ frequency: user.emailDigest, stats, dashboardUrl: DASHBOARD_URL });
      const label = user.emailDigest === 'monthly' ? 'Monthly' : 'Weekly';

      await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject: `Your Coldbase ${label} Digest`,
        html,
        text,
      });

      console.log(`[digest] Sent to ${user.email}`);
    } catch (err) {
      console.error(`[digest] Failed for ${user.email}:`, err.message);
    }
  }
}

export function startDigestCron() {
  // Run daily at 9:00 AM UTC
  cron.schedule('0 9 * * *', sendDigests, { timezone: 'UTC' });
  console.log('[digest] Cron scheduled: daily at 09:00 UTC');
}

// Export for manual testing
export { sendDigests };
```

**Step 2: Commit**

```bash
git add server/cron/digestCron.js
git commit -m "feat: add daily digest cron job with Resend integration"
```

---

## Task 6: Wire cron into server startup

**Files:**
- Modify: `server/index.js`

**Step 1: Import and start the cron after app boots**

The current `index.js` dynamically imports `app.js` after migrations. Add the cron start after `app.listen`. Replace the bottom of the file:

```js
import './instrument.js';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  execSync('npx prisma migrate deploy', {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env },
  });
} catch (err) {
  console.error(`DB migration failed: ${err.message}. Check DATABASE_URL and retry.`);
  process.exit(1);
}

const { default: app } = await import('./app.js');
const { startDigestCron } = await import('./cron/digestCron.js');

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[Coldbase server] Listening on http://localhost:${PORT}`);
  startDigestCron();
});
```

**Step 2: Commit**

```bash
git add server/index.js
git commit -m "feat: start digest cron job on server boot"
```

---

## Task 7: Update settings UI

**Files:**
- Modify: `web/src/components/SettingsPage.jsx`

**Step 1: Find the radiogroup in the Notifications section (around line 661)**

The current options array is:
```jsx
{['Daily', 'Weekly', 'Never'].map((opt, i) => (
```

Replace it with:
```jsx
{['Weekly', 'Monthly', 'None'].map((opt, i) => (
```

The values sent to `handleDigestChange` are `opt.toLowerCase()`, which becomes `'weekly'`, `'monthly'`, `'none'` — matching the new VALID_DIGESTS set exactly.

**Step 2: Commit**

```bash
git add web/src/components/SettingsPage.jsx
git commit -m "feat: update digest toggle to weekly/monthly/none"
```

---

## Task 8: Add env vars (Railway + local)

**Files:**
- Modify: `server/.env` (local dev)
- Railway dashboard: add env vars for production

**Step 1: Add to local `.env`**

```
RESEND_API_KEY=re_...         # from Resend dashboard
DIGEST_FROM_EMAIL=digest@coldbase.io   # your verified domain
DASHBOARD_URL=https://app.coldbase.io  # or localhost:5173 for local testing
```

**Step 2: Add the same three vars to Railway**

In the Railway project dashboard → Variables, add `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`, and `DASHBOARD_URL`.

**Step 3: Commit only the `.env.example` update (never commit `.env`)**

If a `.env.example` file exists, add:
```
RESEND_API_KEY=
DIGEST_FROM_EMAIL=
DASHBOARD_URL=
```

---

## Verification

**Manual smoke test (without waiting for cron schedule):**

1. Start server locally: `cd server && npm run dev`
2. Set a test user's `emailDigest = 'weekly'` and `digestSendDay = <today's day-of-week>` directly in the DB via Prisma Studio (`npx prisma studio`)
3. In a scratch file or REPL, import and call `sendDigests()` directly:
   ```bash
   node --env-file=.env -e "
     import('./cron/digestCron.js').then(({ sendDigests }) => sendDigests())
   "
   ```
4. Check Resend dashboard → sent emails — confirm the email was received
5. Verify the email renders correctly with real stat values

**Settings toggle test:**

1. In the running web app, open Settings → Notifications
2. Toggle from current value to Weekly — verify server PATCH sets `digestSendDay = userId % 7`
3. Toggle to Monthly — verify `digestSendDay = (userId % 28) + 1`
4. Toggle to None — verify `digestSendDay = null`
5. Check via Prisma Studio to confirm DB values

**API validation test:**

```bash
curl -X PATCH http://localhost:3001/api/settings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"emailDigest":"daily"}'
# Expected: 400 Validation Error
```
