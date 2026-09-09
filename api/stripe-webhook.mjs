import Stripe from 'stripe';
import entitlement from '../lib/entitlement.cjs';
import email from '../lib/email-payload.cjs';
import delivery from '../lib/email-delivery.cjs';

const reply = (status, text) => new Response(text, { status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const types = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

export async function POST(request) {
  const live = process.env.DELIVERY_MODE === 'live';
  const key = process.env.STRIPE_RESTRICTED_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!['test', 'live'].includes(process.env.DELIVERY_MODE) ||
      !key?.startsWith(live ? 'rk_live_' : 'rk_test_') || !secret?.startsWith('whsec_'))
    return reply(503, 'Webhook not configured');
  const signature = request.headers.get('stripe-signature');
  if (!signature) return reply(400, 'Missing signature');
  const stripe = new Stripe(key, { maxNetworkRetries: 1, timeout: 10000 });
  let event;
  try {
    // Use the untouched request bytes, not re-serialized JSON.
    const reader = request.body?.getReader();
    if (!reader) return reply(400, 'Missing body');
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024 * 1024) { await reader.cancel(); return reply(413, 'Payload too large'); }
      chunks.push(Buffer.from(value));
    }
    event = stripe.webhooks.constructEvent(Buffer.concat(chunks), signature, secret);
  } catch { return reply(400, 'Invalid signature'); }
  if (event.livemode !== live || !types.has(event.type)) return reply(200, 'Ignored');
  const id = event.data?.object?.id;
  if (typeof id !== 'string' || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(id))
    return reply(400, 'Invalid checkout');
  try {
    const session = await stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent.latest_charge'] });
    const catalog = live ? entitlement.offers : {
      ...(process.env.TEST_TINY_WIN_PAYMENT_LINK ? { [process.env.TEST_TINY_WIN_PAYMENT_LINK]: { amount: 300, file: 'one-tiny-win.pdf' } } : {}),
      ...(process.env.TEST_KIT_PAYMENT_LINK ? { [process.env.TEST_KIT_PAYMENT_LINK]: { amount: 900, file: 'pocket-reset-kit.pdf' } } : {}),
    };
    const filename = entitlement.entitledFile(session, live, catalog);
    if (!filename) return reply(200, 'No eligible paid order');
    if (process.env.EMAIL_DELIVERY_ENABLED !== 'true' || !process.env.DELIVERY_DATABASE_URL ||
        !process.env.RESEND_API_KEY || !process.env.DELIVERY_FROM)
      return reply(503, 'Email delivery not configured');
    await delivery.deliverEmail(id, () => email.emailPayload(session, filename, process.env.DELIVERY_FROM));
    return reply(200, 'Email accepted');
  } catch {
    // Stripe retries failed deliveries. Never expose/log raw events, credentials,
    // customer addresses, checkout download tokens, or provider response bodies.
    console.error('pause90_email_delivery_incomplete');
    return reply(503, 'Delivery incomplete; retry');
  }
}
