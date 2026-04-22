# Stripe Subscriptions Design

**Date:** 2026-04-15
**Status:** Approved

## Summary

Implement monthly and annual Stripe subscription billing with in-app cancellation. Most of the infrastructure already exists; this design fills the remaining gaps.

## What Already Exists

- `server/routes/billing.js` — checkout session, portal session, webhook handler
- `web/src/components/ProModal.jsx` — monthly/annual plan picker UI
- `web/src/lib/api.js` — `createCheckoutSession`, `createPortalSession`
- `web/src/components/SettingsPage.jsx` — Pro/Free plan UI, manage subscription button
- DB fields: `plan`, `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`

## What's Being Added

### 1. Database

Add to `User` model in `schema.prisma`:

```prisma
subscriptionCurrentPeriodEnd  DateTime?
```

Set on `checkout.session.completed` and `customer.subscription.updated`. Cleared on `customer.subscription.deleted`.

### 2. Backend

**New endpoint: `DELETE /api/billing/subscription`**
- Protected by `requireAuth`
- Calls Stripe `subscriptions.update({ cancel_at_period_end: true })`
- Returns `{ subscriptionCurrentPeriodEnd }` so the frontend can update state

**Webhook updates:**
- `checkout.session.completed` — retrieve subscription from Stripe to get `current_period_end`, store in DB
- `customer.subscription.updated` — update `subscriptionStatus` + `subscriptionCurrentPeriodEnd`
- `customer.subscription.deleted` — set `plan = 'free'`, clear `stripeSubscriptionId` + `subscriptionCurrentPeriodEnd`

**Settings route:**
`GET /settings` adds `subscriptionStatus` and `subscriptionCurrentPeriodEnd` to its Prisma select.

### 3. Frontend

**`api.js`** — add `cancelSubscription()` calling `DELETE /api/billing/subscription`.

**`SettingsPage.jsx` — `PlanSection` two states when Pro:**

1. **Active** — shows Pro badge, "Manage subscription" link, and a text-style "Cancel plan" button. Clicking "Cancel plan" reveals an inline confirmation row showing the period end date with "Confirm cancel" and "Keep plan" buttons.

2. **Canceling** — when `subscriptionCurrentPeriodEnd` is set after cancellation. Shows "Your plan ends on [date]" message and a "Resubscribe" button that opens the ProModal.

**`SettingsPage.jsx`** loads `subscriptionStatus` and `subscriptionCurrentPeriodEnd` from `fetchSettings()`.

## Environment Variables

All go in `server/.env`:

| Variable | Where to find it |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key |
| `STRIPE_MONTHLY_PRICE_ID` | Stripe Dashboard → Products → your monthly price → Price ID (starts with `price_`) |
| `STRIPE_ANNUAL_PRICE_ID` | Stripe Dashboard → Products → your annual price → Price ID |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → signing secret (starts with `whsec_`) |
| `CLIENT_URL` | Your production frontend URL (e.g. `https://app.coldbase.co`) |

For local dev, use the Stripe CLI to forward webhooks: `stripe listen --forward-to localhost:3001/api/billing/webhook` — the CLI prints a local `whsec_` secret to use.

## Cancellation Flow

1. User clicks "Cancel plan" in Settings → inline confirmation appears showing end date
2. User confirms → `DELETE /api/billing/subscription` → Stripe sets `cancel_at_period_end: true`
3. UI flips to "Canceling" state — user retains Pro access until period end
4. At period end, Stripe fires `customer.subscription.deleted` → webhook sets `plan = 'free'` → user is on Free
