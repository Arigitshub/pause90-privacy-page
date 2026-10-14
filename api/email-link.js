// Private delivery-worker endpoint: issues a purchase-verified 72-hour recovery link.
// Requires server-only GMAIL_DELIVERY_TOKEN. Never expose this endpoint to customers.
const Stripe = require('stripe');
const { createHash, timingSafeEqual } = require('node:crypto');
const { entitledFile } = require('../lib/entitlement.cjs');
const { deliveryConfig } = require('../lib/delivery-config.cjs');
const { signGrant, MAX_TTL_SECONDS } = require('../lib/download-grants.cjs');

const isAuthorized = (supplied, secret) => {
  if (typeof supplied !== 'string' || typeof secret !== 'string' || secret.length < 40) return false;
  const digest = v => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`));
};

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'POST') return res.status(405).end();
  if (!isAuthorized(req.headers.authorization, process.env.GMAIL_DELIVERY_TOKEN))
    return res.status(401).end();
  const config = deliveryConfig();
  if (process.env.GMAIL_DELIVERY_ENABLED !== 'true' || !config) return res.status(503).end();
  const { live, key, catalog, sessionPattern } = config;
  const id = req.body?.session_id;
  if (typeof id !== 'string' || !sessionPattern.test(id)) return res.status(400).end();
  try {
    const stripe = new Stripe(key, {maxNetworkRetries:1, timeout:10000});
    const session = await stripe.checkout.sessions.retrieve(id, {expand:['payment_intent.latest_charge']});
    const offer = catalog[session.payment_link];
    if (!offer?.price) return res.status(403).end(); // Old offers continue attachment fulfillment.
    const page = await stripe.checkout.sessions.listLineItems(id, {limit:5});
    const filename = entitledFile(session, live, catalog, page.has_more ? null : page.data);
    if (!filename) return res.status(403).end();
    const email = session.customer_details?.email || session.customer_email;
    if (typeof email !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
      return res.status(422).end();
    const token = signGrant(id, filename, process.env.DELIVERY_LINK_SECRET,
      Math.floor(Date.now()/1000), MAX_TTL_SECONDS);
    const origin = (process.env.DELIVERY_PUBLIC_ORIGIN || (live ? 'https://pause90-pdf-delivery.vercel.app' : '')).replace(/\/$/, '');
    if (!live && origin === 'https://pause90-pdf-delivery.vercel.app') throw new Error('Sandbox origin required');
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(origin)) throw new Error('Invalid delivery origin');
    return res.status(200).json({id, email, filename, url:`${origin}/api/redeem?token=${encodeURIComponent(token)}`,
      expires_after_seconds:MAX_TTL_SECONDS});
  } catch {
    return res.status(503).end(); // Never echo token, email or provider details.
  }
};
