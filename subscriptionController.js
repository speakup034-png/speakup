const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const paymentService = require('../services/paymentService');

// GET /api/subscription
async function getSubscription(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT plan, status, start_date, renewal_date FROM subscriptions
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    res.json({ success: true, data: { isPremium: req.user.is_premium, subscription: rows[0] || null } });
  } catch (err) {
    next(err);
  }
}

// POST /api/subscription/create
// Only ever creates a *pending* checkout session with the payment provider.
// is_premium is flipped to true exclusively by the webhook handler below —
// never here, and never from anything the client sends.
async function createCheckout(req, res, next) {
  try {
    const { plan } = req.body; // 'monthly' | 'yearly'
    if (!['monthly', 'yearly'].includes(plan)) throw new ApiError(400, 'INVALID_PLAN', 'plan must be monthly or yearly');

    // TODO: call your real payment provider's checkout-session API here, e.g.:
    // const session = await razorpay.subscriptions.create({ plan_id: PLAN_IDS[plan], ... });
    const checkoutUrl = `https://payment-provider.example.com/checkout?plan=${plan}&user=${req.user.id}`;

    res.json({ success: true, data: { checkoutUrl } });
  } catch (err) {
    next(err);
  }
}

// POST /api/subscription/webhook
// The ONLY path allowed to activate premium. Verifies the provider's signature first.
async function handleWebhook(req, res, next) {
  try {
    const signature = req.headers['x-webhook-signature'];
    const valid = paymentService.verifyWebhookSignature(req.rawBody || '', signature);
    if (!valid) throw new ApiError(400, 'INVALID_SIGNATURE', 'Webhook signature verification failed');

    const { event, userId, provider, providerSubscriptionId, plan, renewalDate } = req.body;

    if (event === 'subscription.activated') {
      await paymentService.activateSubscription({ userId, provider, providerSubscriptionId, plan, renewalDate });
    } else if (event === 'subscription.cancelled' || event === 'subscription.expired') {
      await paymentService.deactivateSubscription(userId);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSubscription, createCheckout, handleWebhook };
