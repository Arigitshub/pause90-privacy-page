const Stripe = require('stripe');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { entitledFile } = require('../lib/entitlement.cjs');
const { deliveryConfig } = require('../lib/delivery-config.cjs');
const { verifyGrant } = require('../lib/download-grants.cjs');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const data = verifyGrant(req.query?.token, process.env.DELIVERY_LINK_SECRET);
  const config = deliveryConfig();
  if (!data || !config || !config.sessionPattern.test(data.sessionId))
    return res.status(403).send('Invalid or expired download link. Use your original purchase confirmation.');
  const { live, key, catalog } = config;
  try {
    const stripe = new Stripe(key, { maxNetworkRetries: 1, timeout: 10000 });
    const session = await stripe.checkout.sessions.retrieve(data.sessionId, { expand: ['payment_intent.latest_charge'] });
    const offer = catalog[session.payment_link];
    if (!offer?.price) return res.status(403).send('This download is not authorized.');
    const page = await stripe.checkout.sessions.listLineItems(data.sessionId, { limit: 5 });
    const allowed = entitledFile(session, live, catalog, page.has_more ? null : page.data);
    if (!allowed || allowed !== data.filename) return res.status(403).send('This download is not authorized.');
    const bytes = await readFile(path.join(process.cwd(), 'private-products', allowed));
    const isPdf = allowed.endsWith('.pdf');
    if (isPdf ? bytes.subarray(0, 5).toString() !== '%PDF-' : bytes.subarray(0, 4).toString('hex') !== '504b0304')
      throw new Error('Invalid product asset');
    res.setHeader('Content-Type', isPdf ? 'application/pdf' : 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${allowed}"`);
    return res.status(200).send(bytes);
  } catch {
    return res.status(503).send('Your download is temporarily unavailable. Contact ari532477@gmail.com.');
  }
};
