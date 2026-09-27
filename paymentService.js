// Payment/subscription verification stub.
// Real rule from the spec: NEVER trust subscription status sent by the client —
// only a verified webhook (or a signed server-to-server status check) may set is_premium.
const crypto = require('crypto');
const db = require('../config/db');

function verifyWebhookSignature(rawBody, signatureHeader) {
  // Example HMAC verification pattern (Razorpay/Stripe-style). Replace with your
  // provider's actual verification method — this is structure, not a working secret.
  const expected = crypto
    .createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET || '')
    .update(rawBody)
    .digest('hex');
  return expected === signatureHeader;
}

async function activateSubscription({ userId, provider, providerSubscriptionId, plan, renewalDate }) {
  await db.query(
    `INSERT INTO subscriptions (user_id, provider, provider_subscription_id, plan, status, renewal_date)
     VALUES ($1, $2, $3, $4, 'active', $5)`,
    [userId, provider, providerSubscriptionId, plan, renewalDate]
  );
  await db.query(`UPDATE users SET is_premium = true WHERE id = $1`, [userId]);
}

async function deactivateSubscription(userId) {
  await db.query(
    `UPDATE subscriptions SET status = 'cancelled' WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
  await db.query(`UPDATE users SET is_premium = false WHERE id = $1`, [userId]);
}

module.exports = { verifyWebhookSignature, activateSubscription, deactivateSubscription };
