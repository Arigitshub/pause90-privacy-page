const Stripe = require('stripe');
const { timingSafeEqual, createHash } = require('node:crypto');
const { offers, entitledFile } = require('../lib/entitlement.cjs');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const secret = process.env.GMAIL_DELIVERY_TOKEN;
  if (process.env.GMAIL_DELIVERY_ENABLED !== 'true' || !secret || secret.length < 40)
    return res.status(503).send('Gmail delivery not configured');
  const supplied = req.headers.authorization;
  const digest = value => createHash('sha256').update(value).digest();
  if (typeof supplied !== 'string' || !timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`)))
    return res.status(401).send('Unauthorized');
  const link = req.query?.payment_link;
  const after = req.query?.starting_after;
  if (!Object.hasOwn(offers, link) || (after !== undefined &&
      (typeof after !== 'string' || !/^cs_live_[A-Za-z0-9]+$/.test(after))))
    return res.status(400).send('Invalid offer or cursor');
  const key = process.env.STRIPE_RESTRICTED_KEY;
  if (process.env.DELIVERY_MODE !== 'live' || !key?.startsWith('rk_live_'))
    return res.status(503).send('Payment verification unavailable');
  try {
    const stripe = new Stripe(key, { maxNetworkRetries: 1, timeout: 10000 });
    const page = await stripe.checkout.sessions.list({ payment_link: link,
      status: 'complete', limit: 30,
      created: { gte: Math.floor(Date.parse('2026-09-09T00:00:00-04:00') / 1000) },
      ...(after ? { starting_after: after } : {}),
      expand: ['data.payment_intent.latest_charge'],
    });
    const orders = page.data.flatMap(session => {
      const filename = entitledFile(session, true);
      if (!filename) return [];
      return [{ id: session.id, email: session.customer_details?.email || null, filename }];
    });
    return res.status(200).json({ orders,
      next: page.has_more ? page.data.at(-1).id : null });
  } catch {
    return res.status(503).send('Orders temporarily unavailable');
  }
};
