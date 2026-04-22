# Production Launch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Launch Coldbase on `coldbase.live` with live Stripe billing, Google OAuth ("Continue with Google"), Hunter.io, and the updated Chrome extension.

**Architecture:** Domain routing splits traffic between Vercel (web, `coldbase.live`) and Railway (API, `api.coldbase.live`). Google OAuth uses a standard redirect-based authorization code flow — browser follows redirects through Google and back, server issues a JWT at the end. No new auth library abstraction needed; same JWT pattern as email/password.

**Tech Stack:** Express, Prisma (PostgreSQL/Neon), React + Vite, `google-auth-library` (new), Railway, Vercel, Chrome Web Store.

---

### Task 1: Domain Routing — Vercel

**Files:** None (manual steps only)

**Step 1: Add custom domain in Vercel**

In the Vercel dashboard:
- Open the `reach` project → Settings → Domains
- Add `coldbase.live`
- Vercel will show you DNS records to add (usually an A record pointing to Vercel's IP, or a CNAME)

**Step 2: Add DNS records at your registrar**

At your domain registrar (where you bought `coldbase.live`):
- Add the A record or CNAME Vercel provided
- DNS propagation takes 5–30 minutes

**Step 3: Verify**

Once DNS propagates, `https://coldbase.live` should load the Vercel dashboard. Check the Vercel dashboard — it shows a green checkmark when the domain is active.

---

### Task 2: Domain Routing — Railway

**Files:** None (manual steps only)

**Step 1: Add custom domain in Railway**

In the Railway dashboard:
- Open your server service → Settings → Networking → Custom Domain
- Add `api.coldbase.live`
- Railway will show you a CNAME record to add

**Step 2: Add DNS records at your registrar**

At your registrar, add the CNAME record Railway provided pointing `api.coldbase.live` to Railway's target.

**Step 3: Verify**

`https://api.coldbase.live/health` (or any route) should respond. Railway shows a green checkmark in the dashboard.

---

### Task 3: Update Extension URLs

**Files:**
- Modify: `extension/manifest.json`
- Modify: `extension/config.js`

**Step 1: Update manifest.json**

Replace all `coldbase.vercel.app` references with `coldbase.live`:

In `host_permissions`, change:
```json
"https://coldbase.vercel.app/*"
```
to:
```json
"https://coldbase.live/*"
```

In `content_scripts[1].matches`, change:
```json
"https://coldbase.vercel.app/*"
```
to:
```json
"https://coldbase.live/*"
```

**Step 2: Update config.js**

```js
export const SERVER_URL = 'https://api.coldbase.live/api';
export const DASH_URL = 'https://coldbase.live';
export const REACH_SECRET = 'f824a42ea02d149b28f96141068bc71538e3321f18b2c4cc';
export const DEBUG = false;
```

**Step 3: Verify locally**

Load the unpacked extension in Chrome (`chrome://extensions` → Load unpacked). Open Gmail — the panel should still appear. Open `coldbase.live` — login/logout should sync to the extension.

---

### Task 4: Update Railway Env Vars

**Files:** None (Railway dashboard)

**Step 1: Open Railway service → Variables**

Update or add these variables:

| Variable | Value |
|---|---|
| `ALLOWED_ORIGINS` | `chrome-extension://,https://coldbase.live` |
| `CLIENT_URL` | `https://coldbase.live` |
| `HUNTER_KEY` | Your key from hunter.io/api-keys |
| `STRIPE_SECRET_KEY` | `sk_live_...` from Stripe Dashboard → API keys |
| `STRIPE_MONTHLY_PRICE_ID` | Live-mode price ID from Stripe Dashboard → Products |
| `STRIPE_ANNUAL_PRICE_ID` | Live-mode price ID from Stripe Dashboard → Products |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from new production webhook (see Task 5) |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console → Credentials (see Task 6) |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console → Credentials (see Task 6) |

Railway auto-redeploys after saving variables.

---

### Task 5: Create Stripe Production Webhook

**Files:** None (Stripe Dashboard)

**Step 1: Create webhook endpoint**

In Stripe Dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://api.coldbase.live/api/billing/webhook`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

**Step 2: Copy signing secret**

After creating the endpoint, click into it and copy the `whsec_...` signing secret. Add it to Railway as `STRIPE_WEBHOOK_SECRET` (from Task 4).

**Step 3: Verify**

Use the Stripe dashboard "Send test webhook" to fire a `checkout.session.completed` event. Check Railway logs to confirm your server received and processed it.

---

### Task 6: Google Cloud Console — OAuth Setup

**Files:** None (Google Cloud Console)

**Step 1: Create/update OAuth 2.0 Web Client credentials**

In Google Cloud Console → APIs & Services → Credentials:
- If you have an existing Web client OAuth credential, open it
- If not, click Create Credentials → OAuth client ID → Web application

Add to **Authorized redirect URIs**:
```
https://coldbase.live/auth/google/callback
http://localhost:5173/auth/google/callback
```

Add to **Authorized JavaScript origins**:
```
https://coldbase.live
http://localhost:5173
```

Copy the **Client ID** and **Client Secret** — add to Railway as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (Task 4). Also add to `server/.env` for local dev.

**Step 2: Publish the OAuth app**

In Google Cloud Console → APIs & Services → OAuth consent screen:
- Click **Publish App** → Confirm

This removes the 100-user testing cap immediately. Users will see an "unverified" warning until verification completes — they can click "Advanced → Go to Coldbase (unsafe)" to proceed.

**Step 3: Submit for verification (parallel, non-blocking)**

Still on the OAuth consent screen, fill in:
- App homepage: `https://coldbase.live`
- Privacy policy: `https://coldbase.live/legal/privacy`
- Terms of service: `https://coldbase.live/legal/terms`

Submit for verification. This is a background process (1–4 weeks) — the app works for all users in the meantime.

---

### Task 7: Google OAuth — Schema Migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: migration via `prisma migrate dev`

**Step 1: Update schema**

In `schema.prisma`, update the `User` model:

Change `passwordHash String` to:
```prisma
passwordHash   String?
```

Add after `passwordHash`:
```prisma
googleId       String?         @unique
```

**Step 2: Run migration**

```bash
cd server
npx prisma migrate dev --name add_google_oauth
```

Expected: migration file created, applied to dev DB.

**Step 3: Verify**

```bash
npx prisma studio
```

Open the `User` table — confirm `googleId` column exists and `passwordHash` is nullable.

---

### Task 8: Install google-auth-library

**Files:**
- Modify: `server/package.json` (via npm install)

**Step 1: Install**

```bash
cd server
npm install google-auth-library
```

**Step 2: Verify**

```bash
node -e "import('google-auth-library').then(m => console.log('ok', Object.keys(m)))"
```

Expected: prints `ok` with exported names including `OAuth2Client`.

---

### Task 9: Google OAuth — Backend Routes

**Files:**
- Modify: `server/routes/auth.js`

**Step 1: Add OAuth2 client setup and routes**

At the top of `server/routes/auth.js`, after the existing imports, add:

```js
import { OAuth2Client } from 'google-auth-library';

const oauthClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.CLIENT_URL}/auth/google/callback`
);
```

**Step 2: Add GET /google route**

Add before `export default router`:

```js
// ─── GET /google ───────────────────────────────────────────────────────────────

router.get('/google', (req, res) => {
  const url = oauthClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });
  res.redirect(url);
});
```

**Step 3: Add GET /google/callback route**

```js
// ─── GET /google/callback ──────────────────────────────────────────────────────

router.get('/google/callback', async (req, res, next) => {
  const { code } = req.query;
  if (!code) return res.redirect(`${process.env.CLIENT_URL}/auth?error=no_code`);

  try {
    const { tokens } = await oauthClient.getToken(code);
    oauthClient.setCredentials(tokens);

    const ticket = await oauthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email } = payload;

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (user) {
      if (!user.googleId) {
        user = await prisma.user.update({ where: { id: user.id }, data: { googleId } });
      }
    } else {
      user = await prisma.user.create({ data: { email, googleId } });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.redirect(`${process.env.CLIENT_URL}/auth/google/callback?token=${token}`);
  } catch (e) {
    next(e);
  }
});
```

**Step 4: Test locally**

Start the server (`cd server && npm run dev`). Visit `http://localhost:3001/api/auth/google` in your browser — it should redirect to Google's consent screen. After signing in with your Google account, you should land on `http://localhost:5173/auth/google/callback?token=...`.

---

### Task 10: Google OAuth — Frontend Callback Route

**Files:**
- Modify: `web/src/main.jsx` (or wherever routes are defined)
- Create: `web/src/components/GoogleAuthCallback.jsx`

**Step 1: Find the router**

Check `web/src/main.jsx` or `web/src/App.jsx` to see how React Router routes are defined.

**Step 2: Create GoogleAuthCallback.jsx**

```jsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function GoogleAuthCallback() {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');
    if (token) {
      login(token);
      navigate('/', { replace: true });
    } else {
      navigate(`/auth?error=${error ?? 'google_failed'}`, { replace: true });
    }
  }, []);

  return null;
}
```

**Step 3: Register the route**

In your router config, add:
```jsx
<Route path="/auth/google/callback" element={<GoogleAuthCallback />} />
```

**Step 4: Wire up the button in AuthPage.jsx**

Replace the disabled Google button (lines 86–94 in `AuthPage.jsx`):

```jsx
<button
  type="button"
  onClick={() => window.location.href = `${import.meta.env.VITE_API_URL}/auth/google`}
  className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-chrome-surface border border-chrome-border rounded-xl text-[14px] font-medium text-chrome-text transition-colors hover:bg-chrome-hover"
>
  <GoogleIcon />
  Continue with Google
</button>
```

**Step 5: Test locally**

Start both dev servers. On the login page, click "Continue with Google". Complete Google sign-in. You should land on the dashboard as a logged-in user. Check Neon — a new `User` row should exist with a `googleId` and no `passwordHash`.

**Step 6: Commit**

```bash
git add server/routes/auth.js server/prisma/schema.prisma web/src/components/GoogleAuthCallback.jsx web/src/main.jsx web/src/components/AuthPage.jsx
git commit -m "feat: add Google OAuth sign-in"
```

---

### Task 11: Update Vercel Env Vars

**Files:** None (Vercel dashboard)

**Step 1: Open Vercel project → Settings → Environment Variables**

Add or update:

| Variable | Value | Environment |
|---|---|---|
| `VITE_API_URL` | `https://api.coldbase.live/api` | Production |

Keep `VITE_API_URL=http://localhost:3001/api` for Preview/Development environments if it exists.

**Step 2: Redeploy**

Trigger a redeploy in Vercel (or push a commit) so the new env var takes effect.

**Step 3: Verify**

Visit `https://coldbase.live` — the app should load and API calls should hit `api.coldbase.live`.

---

### Task 12: Package and Re-submit Extension

**Files:** None (manual steps)

**Step 1: Package the extension**

```bash
cd /path/to/reach
zip -r extension.zip extension/ --exclude "extension/config.example.js" --exclude "extension/*.test.js" --exclude "extension/docs/*"
```

**Step 2: Upload to Chrome Web Store**

In the Chrome Web Store Developer Dashboard:
- Open your extension
- Click **Package** → Upload new package
- Upload `extension.zip`
- Update the store listing if needed (screenshots, description)
- Click **Submit for review**

**Step 3: Monitor**

Review takes 1–3 business days. Existing users auto-update when approved. You'll get an email notification.

---

## Execution Order

Tasks 1–6 are manual setup steps (no code). Complete them first, gathering credentials as you go.

Tasks 7–10 are code changes (schema + backend + frontend). These can be done locally while DNS propagates.

Tasks 11–12 are final deployment steps after code is merged and env vars are confirmed.

```
1 (Vercel domain) → 2 (Railway domain) → 3 (extension URLs) →
4 (Railway env vars) → 5 (Stripe webhook) → 6 (Google Cloud) →
7 (schema) → 8 (install pkg) → 9 (backend routes) → 10 (frontend) →
11 (Vercel env vars) → 12 (extension resubmit)
```
