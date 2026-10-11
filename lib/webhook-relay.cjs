// Authenticated relay from Stripe-verified Vercel event to Apps Script queue.
const { createHmac, timingSafeEqual } = require('node:crypto');
const MAX_SKEW_SECONDS = 300;
const sidPattern = /^cs_live_[A-Za-z0-9]+$/;
const evtPattern = /^evt_[A-Za-z0-9]+$/;
function signEnvelope(sessionId, eventId, secret, ts = Math.floor(Date.now()/1000)) {
  if (typeof secret !== 'string' || secret.length < 40 || !sidPattern.test(sessionId) || !evtPattern.test(eventId))
    throw new Error('Invalid webhook relay input');
  const message = `p90-webhook-v1:${ts}:${sessionId}:${eventId}`;
  return {ts, session_id:sessionId, event_id:eventId,
    sig:createHmac('sha256',secret).update(message).digest('hex')};
}
function verifyEnvelope(data, secret, now=Math.floor(Date.now()/1000)) {
  if (typeof secret !== 'string' || secret.length < 40 ||
      !Number.isSafeInteger(data?.ts) || Math.abs(now-data.ts)>MAX_SKEW_SECONDS ||
      typeof data?.session_id !== 'string' || !sidPattern.test(data.session_id) ||
      typeof data?.event_id !== 'string' || !evtPattern.test(data.event_id) ||
      typeof data?.sig !== 'string' || !/^[a-f0-9]{64}$/.test(data.sig)) return false;
  const good = signEnvelope(data.session_id,data.event_id,secret,data.ts);
  return timingSafeEqual(Buffer.from(good.sig,'hex'),Buffer.from(data.sig,'hex'));
}
module.exports={signEnvelope,verifyEnvelope};
