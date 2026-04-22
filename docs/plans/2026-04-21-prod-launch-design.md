# Production Launch Design

**Date:** 2026-04-21
**Status:** Approved

## Summary

Full production launch of Coldbase on `coldbase.live`. Extension is already published on the Chrome Web Store. All features exist for v1. This plan covers domain setup, URL migration, Stripe live mode, Google OAuth, Hunter.io, and extension re-publish.

## Domain Routing

- `coldbase.live` → Vercel (web dashboard)
- `api.coldbase.live` → Railway (server)

Add custom domains in Vercel and Railway project settings. Add DNS records (A/CNAME) at registrar.

## URL Updates

**Extension `manifest.json`:**
- Replace `https://coldbase.vercel.app/*` with `https://coldbase.live/*` in `host_permissions` and `content_scripts` matches

**Extension `config.js`:**
- `SERVER_URL` → `https://api.coldbase.live/api`
- `DASH_URL` → `https://coldbase.live`

**Railway env vars:**
- `ALLOWED_ORIGINS` → `chrome-extension://,https://coldbase.live`
- `CLIENT_URL` → `https://coldbase.live`
- `HUNTER_KEY` → Hunter.io API key

**Vercel env vars:**
- `VITE_API_URL` → `https://api.coldbase.live/api`

## Stripe (Live Mode)

Switch all Stripe env vars on Railway to live mode:
- `STRIPE_SECRET_KEY` → `sk_live_...`
- `STRIPE_MONTHLY_PRICE_ID` → live price ID
- `STRIPE_ANNUAL_PRICE_ID` → live price ID
- `STRIPE_WEBHOOK_SECRET` → `whsec_...` from new production webhook

Create production webhook in Stripe Dashboard:
- URL: `https://api.coldbase.live/api/billing/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

## Google OAuth

**Immediate:** Publish OAuth app in Google Cloud Console (OAuth consent screen → Publish App) to lift the 100-user testing cap.

**Implement "Continue with Google":**
- Add `https://coldbase.live/auth/google/callback` to authorized redirect URIs
- Add `coldbase.live` to authorized JavaScript origins
- Backend: `GET /api/auth/google` — redirect to Google consent screen
- Backend: `GET /api/auth/google/callback` — exchange code, find/create user, issue JWT
- Frontend: wire "Continue with Google" button to `/api/auth/google`

**Verification:** Submit for Google OAuth verification in parallel (privacy policy at `coldbase.live/legal/privacy`, homepage `coldbase.live`). Until approved, users see unverified warning but can proceed via "Advanced → Go to Coldbase".

## Hunter.io

Add `HUNTER_KEY` to Railway env vars. No code changes needed.

## Chrome Web Store Re-publish

After manifest + config.js URL changes:
1. Zip the `extension/` folder
2. Upload in Chrome Web Store Developer Dashboard
3. Submit for review (1-3 days)
4. Existing users auto-update on approval
