const { createHmac, timingSafeEqual } = require('node:crypto');
const DEFAULT_TTL_SECONDS = 15 * 60;
const MAX_TTL_SECONDS = 72 * 60 * 60;
const SESSION_PATTERN = /^cs_live_[A-Za-z0-9]+$/;
const FILENAMES = new Set(['solo-income-planner.pdf', 'client-ready-kickoff-kit.zip']);

function signGrant(sessionId, filename, secret, nowSeconds = Math.floor(Date.now() / 1000), ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (typeof secret !== 'string' || secret.length < 40) throw new Error('Download signing secret unavailable');
  if (!SESSION_PATTERN.test(sessionId) || !FILENAMES.has(filename)) throw new Error('Invalid entitlement');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_TTL_SECONDS) throw new Error('Invalid TTL');
  const payload = Buffer.from(JSON.stringify({ v: 1, sid: sessionId, file: filename, exp: nowSeconds + ttlSeconds })).toString('base64url');
  const mac = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}
function verifyGrant(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof secret !== 'string' || secret.length < 40 || typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[\w-]+$/.test(parts[0]) || !/^[\w-]+$/.test(parts[1])) return null;
  const correctMac = createHmac('sha256', secret).update(parts[0]).digest();
  const suppliedMac = Buffer.from(parts[1], 'base64url');
  if (suppliedMac.length !== correctMac.length || !timingSafeEqual(suppliedMac, correctMac)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (data.v !== 1 || !SESSION_PATTERN.test(data.sid) || !FILENAMES.has(data.file) ||
        !Number.isInteger(data.exp) || data.exp <= nowSeconds || data.exp > nowSeconds + MAX_TTL_SECONDS) return null;
    return { sessionId: data.sid, filename: data.file, expiresAt: data.exp };
  } catch { return null; }
}
module.exports = { signGrant, verifyGrant, DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS };
