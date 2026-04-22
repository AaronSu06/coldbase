# Stripe Subscriptions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Complete the Stripe subscription billing system — monthly/annual checkout, in-app cancellation with period-end access retention, and accurate UI state.

**Architecture:** Most infrastructure is already in place. We're adding a `subscriptionCurrentPeriodEnd` DB field, wiring it through the webhook + settings API, adding a `DELETE /billing/subscription` endpoint, and updating the Settings UI to show canceling state and an inline cancel flow.

**Tech Stack:** Node.js/Express, Prisma/PostgreSQL, Stripe SDK, React (Vite)

---

### Task 1: Add `subscriptionCurrentPeriodEnd` to DB schema

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add the field**

In `server/prisma/schema.prisma`, add this line to the `User` model after `subscriptionStatus`:

```prisma
subscriptionCurrentPeriodEnd DateTime?
```

The User model's billing fields should now read:

```prisma
stripeCustomerId             String?
stripeSubscriptionId         String?
subscriptionStatus           String?
subscriptionCurrentPeriodEnd DateTime?
```

**Step 2: Run migration**

```bash
cd server && npx prisma migrate dev --name add-subscription-period-end
```

Expected: migration created and applied, Prisma client regenerated.

**Step 3: Verify Prisma client updated**

```bash
cd server && node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); console.log('subscriptionCurrentPeriodEnd' in p.user.fields || 'ok')"
```

Expected: no error (field exists on model).

**Step 4: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add subscriptionCurrentPeriodEnd to User schema"
```

---

### Task 2: Update webhook handler to track period end

**Files:**
- Modify: `server/routes/billing.js`

The webhook already handles `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`. We need to store/clear `subscriptionCurrentPeriodEnd` in each case.

**Step 1: Update `checkout.session.completed` handler**

Find the `checkout.session.completed` case (around line 116). After the `prisma.user.update` call, retrieve the subscription to get `current_period_end`. Replace the current block:

```js
case 'checkout.session.completed': {
  const session = event.data.object;
  const userId = session.metadata?.userId ? Number(session.metadata.userId) : null;
  if (!userId) break;

  // Retrieve subscription to get current_period_end
  let periodEnd = null;
  if (session.subscription) {
    const sub = await stripe.subscriptions.retrieve(session.subscription);
    periodEnd = new Date(sub.current_period_end * 1000);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: 'pro',
      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription,
      subscriptionStatus: 'active',
      subscriptionCurrentPeriodEnd: periodEnd,
    },
  });
  break;
}
```

**Step 2: Update `customer.subscription.updated` handler**

Find the `customer.subscription.updated` case (around line 133). Replace with:

```js
case 'customer.subscription.updated': {
  const subscription = event.data.object;
  await prisma.user.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      subscriptionStatus: subscription.status,
      subscriptionCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });
  break;
}
```

**Step 3: Update `customer.subscription.deleted` handler**

Find the `customer.subscription.deleted` case (around line 141). Replace with:

```js
case 'customer.subscription.deleted': {
  const subscription = event.data.object;
  await prisma.user.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      plan: 'free',
      subscriptionStatus: 'canceled',
      stripeSubscriptionId: null,
      subscriptionCurrentPeriodEnd: null,
    },
  });
  break;
}
```

**Step 4: Commit**

```bash
git add server/routes/billing.js
git commit -m "feat: store subscriptionCurrentPeriodEnd in webhook events"
```

---

### Task 3: Add `DELETE /api/billing/subscription` endpoint

**Files:**
- Modify: `server/routes/billing.js`

**Step 1: Add the endpoint**

Add this route before `export default router` at the bottom of `server/routes/billing.js`:

```js
// ─── DELETE /api/billing/subscription ─────────────────────────────────────────
// Cancels the subscription at period end (user retains Pro access until then).

router.delete('/subscription', requireAuth, async (req, res, next) => {
  try {
    const stripe = getStripe();

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { stripeSubscriptionId: true },
    });
    if (!user) return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    if (!user.stripeSubscriptionId) {
      return res.status(400).json({ error: 'Bad Request', message: 'No active subscription found.' });
    }

    const sub = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    res.json({
      subscriptionCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
    });
  } catch (e) {
    next(e);
  }
});
```

**Step 2: Manual smoke-test (optional, requires Stripe test keys)**

```bash
curl -X DELETE http://localhost:3001/api/billing/subscription \
  -H "Authorization: Bearer <test-jwt>"
```

Expected when no subscription: `400 { "error": "Bad Request", "message": "No active subscription found." }`

**Step 3: Commit**

```bash
git add server/routes/billing.js
git commit -m "feat: add DELETE /api/billing/subscription endpoint"
```

---

### Task 4: Update settings route to expose subscription fields

**Files:**
- Modify: `server/routes/settings.js`

**Step 1: Add fields to GET select**

In `server/routes/settings.js`, find the `prisma.user.findUnique` call in the GET handler. Change the `select` from:

```js
select: { emailDigest: true, resumeName: true, plan: true },
```

to:

```js
select: {
  emailDigest: true,
  resumeName: true,
  plan: true,
  subscriptionStatus: true,
  subscriptionCurrentPeriodEnd: true,
},
```

**Step 2: Add fields to PATCH select**

In the same file, find the `prisma.user.update` call in the PATCH handler. Change its `select` the same way:

```js
select: {
  emailDigest: true,
  resumeName: true,
  plan: true,
  subscriptionStatus: true,
  subscriptionCurrentPeriodEnd: true,
},
```

**Step 3: Commit**

```bash
git add server/routes/settings.js
git commit -m "feat: expose subscriptionStatus and subscriptionCurrentPeriodEnd in settings API"
```

---

### Task 5: Add `cancelSubscription` to API client

**Files:**
- Modify: `web/src/lib/api.js`

**Step 1: Add the function**

In `web/src/lib/api.js`, add after `createPortalSession`:

```js
export const cancelSubscription = () =>
  apiFetch(`${BASE}/billing/subscription`, { method: 'DELETE' }).then(r => r.json());
```

**Step 2: Commit**

```bash
git add web/src/lib/api.js
git commit -m "feat: add cancelSubscription API client function"
```

---

### Task 6: Update SettingsPage with cancellation state and inline cancel flow

**Files:**
- Modify: `web/src/components/SettingsPage.jsx`

This is the largest frontend change. Follow these steps carefully.

**Step 1: Update imports in SettingsPage**

Add `cancelSubscription` to the import from `../lib/api`:

```js
import { fetchSettings, patchSettings, uploadResume, deleteResume, patchEmail, patchPassword, deleteAccount, createPortalSession, cancelSubscription } from '../lib/api';
```

**Step 2: Add subscription state variables**

In the `SettingsPage` component body, after `const [stripeSuccess, setStripeSuccess] = useState(false);`, add:

```js
const [subscriptionStatus, setSubscriptionStatus] = useState(null);
const [subscriptionCurrentPeriodEnd, setSubscriptionCurrentPeriodEnd] = useState(null);
```

**Step 3: Load subscription fields from settings**

In the `fetchSettings()` `.then` block, add after `if (data.plan) setPlan(data.plan);`:

```js
if (data.subscriptionStatus) setSubscriptionStatus(data.subscriptionStatus);
if (data.subscriptionCurrentPeriodEnd) {
  setSubscriptionCurrentPeriodEnd(new Date(data.subscriptionCurrentPeriodEnd));
}
```

**Step 4: Pass new props to PlanSection**

Find the `<PlanSection` usage near the bottom of the JSX. Update it to pass the new props:

```jsx
<PlanSection
  plan={plan}
  subscriptionStatus={subscriptionStatus}
  subscriptionCurrentPeriodEnd={subscriptionCurrentPeriodEnd}
  onUpgrade={() => setShowProModal(true)}
  onManageSubscription={handleManageSubscription}
  onSubscriptionCanceled={(periodEnd) => {
    setSubscriptionCurrentPeriodEnd(periodEnd);
  }}
/>
```

**Step 5: Replace the `PlanSection` component**

Replace the entire `PlanSection` function with this implementation:

```jsx
function PlanSection({ plan = 'free', subscriptionStatus, subscriptionCurrentPeriodEnd, onUpgrade, onManageSubscription, onSubscriptionCanceled }) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Determine if subscription is in canceling state:
  // cancel_at_period_end = true means Stripe keeps status 'active' but will delete at period end
  const isCanceling = plan === 'pro' && subscriptionCurrentPeriodEnd && subscriptionStatus !== 'canceled';

  async function handleConfirmCancel() {
    setCancelLoading(true);
    try {
      const { subscriptionCurrentPeriodEnd: periodEnd } = await cancelSubscription();
      onSubscriptionCanceled(new Date(periodEnd));
      setShowCancelConfirm(false);
    } catch (e) {
      console.error('[Coldbase] Cancel subscription failed:', e.message);
    } finally {
      setCancelLoading(false);
    }
  }

  if (plan === 'pro') {
    // Canceling state — subscription will end at period end
    if (isCanceling && !showCancelConfirm) {
      const endDate = subscriptionCurrentPeriodEnd?.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });
      return (
        <section aria-label="Plan">
          <SectionTitle>Plan</SectionTitle>
          <div className="rounded-lg border border-chrome-rim bg-chrome-card overflow-hidden">
            <div className="px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Star size={13} className="text-accent fill-accent flex-shrink-0" aria-hidden="true" />
                    <span className="text-[14px] font-semibold text-chrome-text">Coldbase Pro</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-700">
                      Canceling
                    </span>
                  </div>
                  <p className="text-[13px] text-chrome-muted mt-1">
                    Your Pro access ends on <span className="font-semibold text-chrome-text">{endDate}</span>.
                  </p>
                </div>
              </div>
            </div>
            <div className="border-t border-chrome-border px-4 py-3 flex items-center justify-between">
              <span className="text-[12px] text-chrome-muted">You won't be charged after {endDate}</span>
              <button
                onClick={onUpgrade}
                className="text-[13px] font-medium text-accent hover:text-accent-hover transition-colors"
              >
                Resubscribe
              </button>
            </div>
          </div>
        </section>
      );
    }

    // Active Pro state
    const endDate = subscriptionCurrentPeriodEnd?.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });

    return (
      <section aria-label="Plan">
        <SectionTitle>Plan</SectionTitle>
        <div className="rounded-lg border border-chrome-rim bg-chrome-card overflow-hidden">
          <div className="px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <Star size={13} className="text-accent fill-accent flex-shrink-0" aria-hidden="true" />
                  <span className="text-[14px] font-semibold text-chrome-text">Coldbase Pro</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700">
                    <Check size={10} strokeWidth={2.5} aria-hidden="true" />
                    Active
                  </span>
                </div>
                <ul className="space-y-1 mt-2">
                  {PRO_FEATURES.map(f => (
                    <li key={f} className="flex items-center gap-2 text-[13px] text-chrome-muted">
                      <Check size={12} className="text-accent flex-shrink-0" strokeWidth={2.5} aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Cancel confirmation row */}
          {showCancelConfirm && endDate && (
            <div className="border-t border-chrome-border px-4 py-3 bg-chrome-deep">
              <p className="text-[13px] text-chrome-text mb-3">
                You'll keep Pro access until <span className="font-semibold">{endDate}</span>, then move to the free plan. No further charges.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmCancel}
                  disabled={cancelLoading}
                  className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {cancelLoading ? 'Canceling…' : 'Confirm cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-chrome-muted hover:text-chrome-text hover:bg-chrome-surface transition-colors"
                >
                  Keep plan
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-chrome-border px-4 py-3 flex items-center justify-between">
            <button
              onClick={onManageSubscription}
              className="text-[13px] font-medium text-accent hover:text-accent-hover transition-colors"
            >
              Manage subscription
            </button>
            {!showCancelConfirm && (
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                className="text-[13px] text-chrome-muted hover:text-chrome-text transition-colors"
              >
                Cancel plan
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Free plan state
  return (
    <section aria-label="Plan">
      <SectionTitle>Plan</SectionTitle>
      <div className="rounded-lg border border-chrome-rim bg-chrome-card overflow-hidden">
        <div className="px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-chrome-deep border border-chrome-border text-[11px] font-semibold text-chrome-muted uppercase tracking-wide">
                  Free
                </span>
                <span className="text-[13px] text-chrome-muted">Upgrade to unlock:</span>
              </div>
              <ul className="space-y-1 mt-2">
                {PRO_FEATURES.map(f => (
                  <li key={f} className="flex items-center gap-2 text-[13px] text-chrome-muted">
                    <Star size={11} className="text-accent/60 flex-shrink-0" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={onUpgrade}
              className="flex-shrink-0 mt-0.5 px-4 py-2 rounded-lg bg-accent text-white text-[13px] font-semibold hover:bg-accent-hover transition-colors whitespace-nowrap"
            >
              Upgrade
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
```

**Step 6: Commit**

```bash
git add web/src/components/SettingsPage.jsx
git commit -m "feat: add in-app subscription cancellation UI with period-end state"
```

---

### Task 7: Document Stripe env vars in `.env.example`

**Files:**
- Modify: `server/.env.example`

**Step 1: Add the Stripe section**

Append to `server/.env.example`:

```bash
# Stripe billing
# Secret key — Stripe Dashboard → Developers → API keys → Secret key
STRIPE_SECRET_KEY=

# Price IDs — Stripe Dashboard → Products → [product] → Prices → copy the price_... ID
STRIPE_MONTHLY_PRICE_ID=
STRIPE_ANNUAL_PRICE_ID=

# Webhook signing secret — Stripe Dashboard → Developers → Webhooks → signing secret (whsec_...)
# For local dev: run `stripe listen --forward-to localhost:3001/api/billing/webhook`
# and use the whsec_ secret it prints
STRIPE_WEBHOOK_SECRET=

# Frontend URL — used for Stripe redirect URLs after checkout/portal
CLIENT_URL=http://localhost:5173
```

**Step 2: Set real values in `server/.env`**

Set these in `server/.env` (not committed). Values to get:

| Variable | Where |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key (`sk_test_...` for test) |
| `STRIPE_MONTHLY_PRICE_ID` | Stripe Dashboard → Products → your $7/mo price → Price ID (`price_...`) |
| `STRIPE_ANNUAL_PRICE_ID` | Stripe Dashboard → Products → your $60/yr price → Price ID (`price_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret (`whsec_...`) |
| `CLIENT_URL` | `http://localhost:5173` for dev, production URL for prod |

**Step 3: Commit**

```bash
git add server/.env.example
git commit -m "docs: add Stripe env vars to .env.example"
```

---

## End-to-End Test Checklist

Once all tasks are complete and Stripe test keys are configured:

1. **Checkout flow** — open ProModal, select Monthly, click Get Started → Stripe test checkout → complete with test card `4242 4242 4242 4242` → redirected to `/settings?stripe=success` → green banner appears, plan shows "Pro · Active"
2. **Webhook received** — check server logs for `[Billing]` webhook events; check DB that `plan = 'pro'` and `subscriptionCurrentPeriodEnd` is set
3. **Cancel flow** — in Settings, click "Cancel plan" → confirm → plan shows "Canceling" badge + end date
4. **Portal** — click "Manage subscription" → Stripe portal opens with billing history
5. **Period end simulation** — in Stripe test dashboard, advance the subscription clock to period end → `customer.subscription.deleted` webhook fires → DB `plan = 'free'` → UI shows Free plan on next load

## Local Webhook Forwarding

Run in a separate terminal:

```bash
stripe listen --forward-to localhost:3001/api/billing/webhook
```

Copy the `whsec_...` secret it prints and set it as `STRIPE_WEBHOOK_SECRET` in `server/.env`.
