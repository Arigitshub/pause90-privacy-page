// Worker-only reconciler. Lists ONLY fully verified purchases; has no public access.
const Stripe = require('stripe');
const { timingSafeEqual, createHash } = require('node:crypto');
const { entitledFile } = require('../lib/entitlement.cjs');
const { deliveryConfig } = require('../lib/delivery-config.cjs');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') return res.status(405).end();
  const secret = process.env.GMAIL_DELIVERY_TOKEN;
  if (process.env.GMAIL_DELIVERY_ENABLED !== 'true' || !secret || secret.length < 40)
    return res.status(503).end();
  const supplied = req.headers.authorization;
  const digest = value => createHash('sha256').update(value).digest();
  if (typeof supplied !== 'string' || !timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`)))
    return res.status(401).end();
  const config = deliveryConfig();
  if (!config) return res.status(503).end();
  const { live, key, catalog, sessionPattern } = config;
  const link = req.query?.payment_link;
  const after = req.query?.starting_after;
  if (!Object.hasOwn(catalog, link) || (after !== undefined &&
      (typeof after !== 'string' || !sessionPattern.test(after))))
    return res.status(400).end();
  try {
    const stripe = new Stripe(key, { maxNetworkRetries: 1, timeout: 10000 });
    const page = await stripe.checkout.sessions.list({ payment_link: link,
      status: 'complete', limit: 30,
      created: { gte: Math.floor(Date.parse('2026-09-09T00:00:00-04:00') / 1000) },
      ...(after ? { starting_after: after } : {}),
      expand: ['data.payment_intent.latest_charge'],
    });
    const orders = [];
    for (const session of page.data) {
      // Avoid extra Stripe calls for sessions with no chance of entitlement.
      if (session.payment_status !== 'paid') continue;
      const offer = catalog[link];
      let items = null;
      if (offer.price) {
        const found = await stripe.checkout.sessions.listLineItems(session.id, {limit:5});
        items = found.has_more ? null : found.data;
      }
      const filename = entitledFile(session, live, catalog, items);
      if (filename) orders.push({id:session.id,email:session.customer_details?.email || null,filename});
    }
    return res.status(200).json({ orders,
      next: page.has_more ? page.data.at(-1).id : null });
  } catch { return res.status(503).end(); }
};
