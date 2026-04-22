# Stripe Plan Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Make the user's plan (free/pro) update immediately after Stripe payment, and keep the webhook lifecycle handlers complete for renewal, failure, and cancellation.

**Architecture:** Two changes — server webhook gets two fixes (add `plan: 'pro'` on renewal, add `invoice.payment_failed` handler), web settings page polls `/api/settings` after redirect until plan reflects 'pro'. Extension already re-fetches on every panel open, no change needed.

**Tech Stack:** Express, Stripe Node SDK, Prisma, React

---

### Task 1: Fix `customer.subscription.updated` webhook handler

**Files:**
- Modify: `server/routes/billing.js:141-151`

The current handler updates `subscriptionStatus` and `subscriptionCurrentPeriodEnd` but never touches `plan`. If a renewal happens after any drift, plan stays wrong. Fix by asserting `plan: 'pro'` whenever the subscription is active.

**Step 1: Update the handler**

In `server/routes/billing.js`, replace the `customer.subscription.updated` case:

```javascript
case 'customer.subscription.updated': {
  const subscription = event.data.object;
  const isCanceling = subscription.cancel_at_period_end;
  const updateData = {
    subscriptionStatus: isCanceling ? 'canceling' : subscription.status,
    subscriptionCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
  };
  // Re-assert pro on active renewals so plan never drifts
  if (subscription.status === 'active') {
    updateData.plan = 'pro';
  }
  await prisma.user.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: updateData,
  });
  break;
}
```

**Step 2: Verify manually**

```bash
stripe trigger customer.subscription.updated
```

Check the server logs — should see no errors. Check DB: `plan` should be 'pro' for the test user.

**Step 3: Commit**

```bash
git add server/routes/billing.js
git commit -m "fix: re-assert plan:pro on subscription.updated to handle renewal drift"
```

---

### Task 2: Add `invoice.payment_failed` webhook handler

**Files:**
- Modify: `server/routes/billing.js:165-169` (add before the `default` case)

When Stripe fails to charge the renewal, set `subscriptionStatus: 'past_due'` so the UI can warn the user. Stripe retries automatically; if all retries fail, `subscription.deleted` fires and the existing handler downgrades to free.

**Step 1: Add the handler**

In the `switch (event.type)` block, add before `default`:

```javascript
case 'invoice.payment_failed': {
  const invoice = event.data.object;
  if (invoice.subscription) {
    await prisma.user.updateMany({
      where: { stripeSubscriptionId: invoice.subscription },
      data: { subscriptionStatus: 'past_due' },
    });
  }
  break;
}
```

**Step 2: Verify manually**

```bash
stripe trigger invoice.payment_failed
```

Check server logs for no errors. Check DB: `subscriptionStatus` should be 'past_due'.

**Step 3: Commit**

```bash
git add server/routes/billing.js
git commit -m "feat: handle invoice.payment_failed webhook — set subscriptionStatus past_due"
```

---

### Task 3: Poll for plan update after Stripe redirect (web settings page)

**Files:**
- Modify: `web/src/components/SettingsPage.jsx` — the `useEffect` that checks `params.get('stripe') === 'success'` (around line 342)

Currently the code shows a success banner but never re-fetches settings, so plan stays "Free" until hard refresh. Add a polling loop that calls `fetchSettings()` up to 8 times (1.5s apart) until `plan === 'pro'`, then updates state. If all retries are exhausted, show a fallback prompt to refresh.

**Step 1: Add a `pollForProPlan` helper inside the component**

Find the `useEffect` that reads `params.get('stripe')` (around line 322). Just above it, add this helper:

```javascript
async function pollForProPlan(fetchSettingsFn, setters, maxAttempts = 8, intervalMs = 1500) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const data = await fetchSettingsFn();
      if (data?.plan === 'pro') {
        setters.setPlan(data.plan);
        setters.setSubscriptionStatus(data.subscriptionStatus ?? null);
        setters.setSubscriptionCurrentPeriodEnd(
          data.subscriptionCurrentPeriodEnd ? new Date(data.subscriptionCurrentPeriodEnd) : null
        );
        return true;
      }
    } catch (_) {
      // network hiccup — keep retrying
    }
  }
  return false; // timed out
}
```

**Step 2: Update the `?stripe=success` handler in the useEffect**

Replace:
```javascript
if (params.get('stripe') === 'success') {
  setStripeSuccess(true);
  const url = new URL(window.location.href);
  url.searchParams.delete('stripe');
  window.history.replaceState({}, '', url.toString());
}
```

With:
```javascript
if (params.get('stripe') === 'success') {
  setStripeSuccess(true);
  const url = new URL(window.location.href);
  url.searchParams.delete('stripe');
  window.history.replaceState({}, '', url.toString());

  pollForProPlan(fetchSettings, { setPlan, setSubscriptionStatus, setSubscriptionCurrentPeriodEnd })
    .then(upgraded => {
      if (!upgraded) {
        // Webhook took too long — nudge user to refresh
        console.warn('[Coldbase] Plan not yet updated after payment — webhook may be delayed');
      }
    });
}
```

**Step 3: Check what `fetchSettings` returns**

`GET /api/settings` returns `{ plan, subscriptionStatus, subscriptionCurrentPeriodEnd, emailDigest, resumeName }`. The state setters `setPlan`, `setSubscriptionStatus`, `setSubscriptionCurrentPeriodEnd` already exist in the component. Confirm their names match before saving.

**Step 4: Test manually**

1. Run `stripe listen --forward-to localhost:3001/api/billing/webhook`
2. Run server locally, run web locally
3. Complete a test payment using card `4242 4242 4242 4242`
4. After Stripe redirects to `/settings?stripe=success`, watch the plan badge — it should flip from "Free" to "Pro" within ~3 seconds without any refresh

**Step 5: Commit**

```bash
git add web/src/components/SettingsPage.jsx
git commit -m "fix: poll for pro plan upgrade after Stripe redirect instead of showing stale Free badge"
```

---

## Subscription Lifecycle Reference

| Event | Handler | DB Result |
|---|---|---|
| User pays | `checkout.session.completed` | plan: pro, status: active |
| Subscription renews | `customer.subscription.updated` | plan: pro, new periodEnd |
| User cancels | `DELETE /billing/subscription` | status: canceling, plan stays pro |
| Period expires | `customer.subscription.deleted` | plan: free |
| Payment fails | `invoice.payment_failed` | status: past_due |
| All retries fail | `customer.subscription.deleted` | plan: free |
| User resubscribes | `checkout.session.completed` | plan: pro, status: active |
