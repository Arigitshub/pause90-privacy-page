// Stripe webhook -> authenticated Apps Script durable queue.
// Only a correctly signed Stripe event is eligible for relay; worker rechecks payment.
const Stripe = require('stripe');
const {signEnvelope} = require('../lib/webhook-relay.cjs');
const { deliveryConfig } = require('../lib/delivery-config.cjs');

module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(req.method !== 'POST') return res.status(405).end();
  const config = deliveryConfig();
  if (!config) return res.status(503).end();
  const { live, key, catalog, sessionPattern } = config;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (typeof webhookSecret !== 'string' || !webhookSecret.startsWith('whsec_'))
    return res.status(503).end();
  const sig=req.headers['stripe-signature'];
  if(typeof sig !== 'string') return res.status(400).end();
  let raw;
  try {
    // Vercel Node incoming request: read the raw stream, NEVER stringify parsed JSON.
    if(Buffer.isBuffer(req.rawBody)) raw=req.rawBody;
    else { // Do NOT access req.body: Vercel's body getter may parse/consume the stream.
      const chunks=[];let len=0;
      for await(const chunk of req) {
        const buf=Buffer.from(chunk);len+=buf.length;
        if(len>65536) return res.status(413).end();
        chunks.push(buf);
      }
      raw=Buffer.concat(chunks);
    }
    if(!raw?.length || raw.length>65536) return res.status(400).end();
    // constructEvent relies solely on raw body and the endpoint-specific signing secret.
    const stripe = new Stripe(key);
    let event;
    try { event = stripe.webhooks.constructEvent(raw,sig,webhookSecret); }
    catch { return res.status(400).end(); }
    if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))
      return res.status(200).json({received:true});
    const session=event.data?.object;
    if(!session || session.object!=='checkout.session' || event.livemode!==live || session.livemode!==live ||
       !sessionPattern.test(session.id || '') ||
       session.payment_status!=='paid') return res.status(200).json({received:true});
    const link=session.payment_link;
    if(!catalog[link]?.price)
      return res.status(200).json({received:true});
    const url=process.env.GMAIL_WEB_APP_URL;
    const token=process.env.GMAIL_DELIVERY_TOKEN;
    if(!url || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url) ||
       typeof token!=='string' || token.length<40 || process.env.GMAIL_DELIVERY_ENABLED!=='true')
      return res.status(503).end(); // Stripe retries; don't acknowledge unqueued paid orders.
    const signed=signEnvelope(session.id,event.id,token);
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(signed),redirect:'follow',signal:AbortSignal.timeout(8000)});
    if(!response.ok) return res.status(503).end();
    const message=await response.json();
    if(message?.ok!==true) return res.status(503).end();
    return res.status(200).json({received:true});
  }catch{return res.status(503).end();} // Stripe retries transient relay failures.
};

// Required in Next-style adapters; raw Stripe payload must not be JSON reserialized.
module.exports.config = {api:{bodyParser:false}};
