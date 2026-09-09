const Stripe = require('stripe');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { entitledFile, offers } = require('../lib/entitlement.cjs');

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
    return res.status(503).send('Downloads are not configured yet. Contact arimail@duck.com for your PDF.');
  const catalog = live ? offers : {
    ...(process.env.TEST_TINY_WIN_PAYMENT_LINK ? { [process.env.TEST_TINY_WIN_PAYMENT_LINK]: { amount: 300, file: 'one-tiny-win.pdf' } } : {}),
    ...(process.env.TEST_KIT_PAYMENT_LINK ? { [process.env.TEST_KIT_PAYMENT_LINK]: { amount: 900, file: 'pocket-reset-kit.pdf' } } : {}),
  };
  try {
    const stripe = new Stripe(key, { maxNetworkRetries: 1, timeout: 10000 });
    const session = await stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent.latest_charge'] });
    const filename = entitledFile(session, live, catalog);
    if (!filename) return res.status(403).send('A completed, paid purchase for this PDF could not be confirmed. If payment is processing, try again shortly.');
    // Exact approved files are deployment-only assets, never committed to the public repository.
    const bytes = await readFile(path.join(process.cwd(), 'private-products', filename));
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid product asset');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Pause90-${filename}"`);
    return res.status(200).send(bytes);
  } catch {
    // Do not log session IDs, customer email, keys or provider error payloads.
    return res.status(503).send('Your download is temporarily unavailable. Try again or contact arimail@duck.com.');
  }
};
