// server/routes/billing.js
import { Router } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import requireAuth from '../middleware/requireAuth.js';

const router = Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
}

// ─── POST /api/billing/checkout ────────────────────────────────────────────────
// Creates a Stripe Hosted Checkout session for monthly or annual subscription.

router.post('/checkout', requireAuth, async (req, res, next) => {
  try {
    const stripe = getStripe();
    const { plan } = req.body;

    if (plan !== 'monthly' && plan !== 'annual') {
      return res.status(400).json({ error: 'Validation Error', message: 'plan must be monthly or annual' });
    }

    const priceId = plan === 'monthly'
      ? process.env.STRIPE_MONTHLY_PRICE_ID
      : process.env.STRIPE_ANNUAL_PRICE_ID;

    if (!priceId) {
      return res.status(500).json({ error: 'Configuration Error', message: `STRIPE_${plan.toUpperCase()}_PRICE_ID is not configured` });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { email: true, stripeCustomerId: true },
    });
    if (!user) return res.status(404).json({ error: 'Not Found', message: 'User not found' });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${clientUrl}/settings?stripe=success`,
      cancel_url: `${clientUrl}/settings`,
      metadata: { userId: String(req.user.userId) },
    };

    if (user.stripeCustomerId) {
      sessionParams.customer = user.stripeCustomerId;
    } else {
      sessionParams.customer_email = user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (e) {
    next(e);
  }
});

// ─── POST /api/billing/portal ──────────────────────────────────────────────────
// Creates a Stripe Customer Portal session so the user can manage their subscription.

router.post('/portal', requireAuth, async (req, res, next) => {
  try {
    const stripe = getStripe();

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { stripeCustomerId: true },
    });
    if (!user) return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: 'Bad Request', message: 'No billing account found. Please subscribe first.' });
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${clientUrl}/settings`,
    });

    res.json({ url: session.url });
  } catch (e) {
    next(e);
  }
});

// ─── POST /api/billing/webhook ─────────────────────────────────────────────────
// Stripe webhook — must receive raw body (mounted before express.json()).

router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Billing] STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Billing] Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('[Billing] checkout.session.completed:', {
          sessionId: session.id,
          metadataUserId: session.metadata?.userId,
          customer: session.customer,
          subscription: session.subscription,
        });

        const userId = session.metadata?.userId ? Number(session.metadata.userId) : null;

        // Helper to retrieve period end safely
        const getPeriodEnd = async (subscriptionId) => {
          if (!subscriptionId) return null;
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          return sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
        };

        const upgradeData = {
          plan: 'pro',
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          subscriptionStatus: 'active',
          subscriptionCurrentPeriodEnd: await getPeriodEnd(session.subscription),
        };

        if (userId) {
          await prisma.user.update({ where: { id: userId }, data: upgradeData });
          console.log('[Billing] checkout.session.completed: updated user', userId, '→ pro');
        } else if (session.customer) {
          // Fallback: metadata.userId missing — look up by Stripe customer ID
          console.error('[Billing] checkout.session.completed: missing userId in metadata, falling back to customer lookup', session.metadata);
          const userByCustomer = await prisma.user.findFirst({ where: { stripeCustomerId: session.customer } });
          if (userByCustomer) {
            await prisma.user.update({ where: { id: userByCustomer.id }, data: upgradeData });
            console.log('[Billing] checkout.session.completed: updated user via customer fallback', userByCustomer.id, '→ pro');
          } else {
            console.error('[Billing] checkout.session.completed: no user found for customer', session.customer);
          }
        } else {
          console.error('[Billing] checkout.session.completed: no userId in metadata and no customer ID — cannot update user', session.metadata);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const isCanceling = subscription.cancel_at_period_end;
        const updateData = {
          subscriptionStatus: isCanceling ? 'canceling' : subscription.status,
        };
        if (subscription.current_period_end) {
          updateData.subscriptionCurrentPeriodEnd = new Date(subscription.current_period_end * 1000);
        }
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

      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Billing] Webhook handler error:', err.message);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

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

    await prisma.user.update({
      where: { id: req.user.userId },
      data: { subscriptionStatus: 'canceling' },
    });

    res.json({
      subscriptionCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
