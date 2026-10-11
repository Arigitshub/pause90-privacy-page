const Stripe = require('stripe');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { entitledFile, offers } = require('../lib/entitlement.cjs');
const { signGrant } = require('../lib/download-grants.cjs');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const id = req.query?.session_id;
  if (typeof id !== 'string' || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(id))
    return res.status(400).send('Open the download link from your completed checkout.');
  const live = process.env.DELIVERY_MODE === 'live';
  const key = process.env.STRIPE_RESTRICTED_KEY;
  if (!['test', 'live'].includes(process.env.DELIVERY_MODE) || !key ||
      !key.startsWith(live ? 'rk_live_' : 'rk_test_'))
    return res.status(503).send('Downloads are not configured yet. Contact ari532477@gmail.com for your PDF.');
  const catalog = live ? offers : {
    ...(process.env.TEST_TINY_WIN_PAYMENT_LINK ? { [process.env.TEST_TINY_WIN_PAYMENT_LINK]: { amount: 300, file: 'one-tiny-win.pdf' } } : {}),
    ...(process.env.TEST_KIT_PAYMENT_LINK ? { [process.env.TEST_KIT_PAYMENT_LINK]: { amount: 900, file: 'pocket-reset-kit.pdf' } } : {}),
  };
  try {
    const stripe = new Stripe(key, { maxNetworkRetries: 1, timeout: 10000 });
    const session = await stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent.latest_charge'] });
    const offer = catalog[session.payment_link];
    let items = null;
    if (offer?.price) {
      const page = await stripe.checkout.sessions.listLineItems(id, { limit: 5 });
      items = page.has_more ? null : page.data;
    }
    const filename = entitledFile(session, live, catalog, items);
    if (!filename) return res.status(403).send('A completed paid purchase for this product could not be confirmed.');
    if (offer?.price) {
      // New offers use an expiring signed grant, redeemed only after a fresh Stripe check.
      const grant = signGrant(id, filename, process.env.DELIVERY_LINK_SECRET);
      res.setHeader('Location', `/api/redeem?token=${encodeURIComponent(grant)}`);
      return res.status(303).end();
    }
    // Legacy paid products retain their current, uninterrupted fulfillment behavior.
    const bytes = await readFile(path.join(process.cwd(), 'private-products', filename));
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid product asset');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Pause90-${filename}"`);
    return res.status(200).send(bytes);
  } catch {
    // Do not log session IDs, customer email, secret values or provider error payloads.
    return res.status(503).send('Your download is temporarily unavailable. Contact ari532477@gmail.com.');
  }
};
