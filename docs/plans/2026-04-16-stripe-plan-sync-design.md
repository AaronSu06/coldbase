# Stripe Plan Sync Design

**Date:** 2026-04-16

## Problem

After a successful Stripe payment, the user's plan does not update in:
1. The web settings page — shows "Free" until hard refresh
2. The extension panel — shows "Free" until panel is closed and reopened

Additionally, the webhook `customer.subscription.updated` handler doesn't set `plan: 'pro'` on renewal, so if `plan` ever drifts it won't self-correct.

## Root Causes

1. **Web:** `SettingsPage.jsx` detects `?stripe=success` and shows a banner, but never re-fetches settings. Plan state is stale from initial mount.
2. **Webhook gap:** `customer.subscription.updated` updates `subscriptionStatus` and `subscriptionCurrentPeriodEnd` but not `plan`. Renewal doesn't re-assert pro access.
3. **No `invoice.payment_failed` handler:** No way to surface payment failure to users.

## What's Already Working

- `checkout.session.completed` → sets `plan: 'pro'`, all subscription fields ✓
- `customer.subscription.deleted` → sets `plan: 'free'`, clears fields ✓
- `DELETE /billing/subscription` → sets `cancel_at_period_end: true`, status: 'canceling' ✓
- Cancellation + expiry flow: canceling → period ends → subscription.deleted → plan: 'free' ✓
- DB schema: all needed fields exist (`plan`, `subscriptionStatus`, `subscriptionCurrentPeriodEnd`) ✓
- Extension: fetches fresh from `/auth/me` on every panel open ✓

## Solution

### 1. Webhook improvements (server/routes/billing.js)

**`customer.subscription.updated`** — add `plan: 'pro'` when `status === 'active'`:
```javascript
data: {
  plan: subscription.status === 'active' ? 'pro' : undefined,
  subscriptionStatus: subscription.cancel_at_period_end ? 'canceling' : subscription.status,
  subscriptionCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
}
```

**Add `invoice.payment_failed`** — sets `subscriptionStatus: 'past_due'` so UI can warn user. Stripe retries automatically; if all retries fail, `subscription.deleted` fires and downgrades to free.

### 2. Web settings re-fetch (web/src/components/SettingsPage.jsx)

When `?stripe=success` detected on mount, poll `fetchSettings()` up to 8 times (1.5s apart) until `plan === 'pro'`. On success, update `plan`, `subscriptionStatus`, `subscriptionCurrentPeriodEnd` in state. If max retries hit, show fallback "refresh the page" message.

### 3. Extension

No change. `GET_USER_PROFILE` hits `/auth/me` fresh on every panel open.

## Subscription Lifecycle

| Event | Handler | Result |
|---|---|---|
| User pays | `checkout.session.completed` | plan: 'pro', status: 'active' |
| Subscription renews | `customer.subscription.updated` | plan: 'pro', new periodEnd |
| User cancels | `DELETE /billing/subscription` | status: 'canceling', plan stays 'pro' |
| Period expires after cancel | `customer.subscription.deleted` | plan: 'free' |
| Payment fails | `invoice.payment_failed` | status: 'past_due' |
| All retries fail | `customer.subscription.deleted` | plan: 'free' |
| User resubscribes | `checkout.session.completed` | plan: 'pro', status: 'active' |

## Files Changed

- `server/routes/billing.js` — webhook handler improvements
- `web/src/components/SettingsPage.jsx` — poll on stripe=success

## Verification

1. Complete a test payment → settings page should update to Pro within ~3s without refresh
2. Cancel subscription → status shows "Canceling", plan stays Pro
3. Trigger `customer.subscription.deleted` via Stripe CLI → plan downgrades to Free
4. Trigger `invoice.payment_failed` via Stripe CLI → status shows past_due
5. Resubscribe → plan returns to Pro
