const { createHash } = require('node:crypto');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { sql, eq, and, or, isNull, lt } = require('drizzle-orm');
const { attachDatabasePool } = require('@vercel/functions');
const { deliveries } = require('../db/schema.cjs');
let db;

function database() {
  if (!db) {
    const pool = new Pool({ connectionString: process.env.DELIVERY_DATABASE_URL,
      max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000,
      statement_timeout: 5000 });
    pool.on('error', () => console.error('delivery_database_connection_failed'));
    attachDatabasePool(pool);
    db = drizzle(pool);
  }
  return db;
}

async function deliverEmail(sessionId, makePayload) {
  const orderKey = createHash('sha256').update(sessionId).digest('hex');
  const d = database();
  // Unique checkout key covers both completed and async-payment events.
  // Persist the exact request before sending, so retries cannot change its contents.
  const existing = await d.select().from(deliveries).where(eq(deliveries.orderKey, orderKey));
  if (!existing.length) {
    await d.insert(deliveries).values({ orderKey, payload: await makePayload() }).onConflictDoNothing();
  }
  const [record] = await d.select().from(deliveries).where(eq(deliveries.orderKey, orderKey));
  if (record.status === 'sent') return;
  // Resend retains idempotency keys for 24 hours. An unresolved older attempt
  // needs provider-log review, never a blind resend that could duplicate an email.
  const expired = await d.update(deliveries).set({ status: 'needs_review' }).where(and(
    eq(deliveries.orderKey, orderKey), eq(deliveries.status, 'pending'),
    lt(deliveries.firstAttemptAt, sql`now() - interval '23 hours'`),
  )).returning();
  if (expired.length || record.status === 'needs_review') throw new Error('Delivery needs review');
  const [claim] = await d.update(deliveries).set({
    leaseUntil: sql`now() + interval '90 seconds'`,
    firstAttemptAt: sql`coalesce(${deliveries.firstAttemptAt}, now())`,
    attempts: sql`${deliveries.attempts} + 1`,
  }).where(and(eq(deliveries.orderKey, orderKey), eq(deliveries.status, 'pending'),
    or(isNull(deliveries.leaseUntil), lt(deliveries.leaseUntil, sql`now()`)),
  )).returning();
  if (!claim) throw new Error('Delivery already processing');
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json', 'Idempotency-Key': `pause90-pdf/${orderKey}` },
      body: JSON.stringify(claim.payload),
    });
    const result = await response.json();
    if (!response.ok || typeof result.id !== 'string') throw new Error('Email provider rejected delivery');
    await d.update(deliveries).set({ status: 'sent', providerId: result.id,
      sentAt: sql`now()`, leaseUntil: null, payload: null,
    }).where(eq(deliveries.orderKey, orderKey));
  } catch {
    await d.update(deliveries).set({ leaseUntil: null }).where(and(
      eq(deliveries.orderKey, orderKey), eq(deliveries.status, 'pending'),
    ));
    throw new Error('Email delivery incomplete');
  }
}
module.exports = { deliverEmail };
