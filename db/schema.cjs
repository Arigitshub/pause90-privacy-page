const { pgTable, text, jsonb, timestamp, integer } = require('drizzle-orm/pg-core');

const deliveries = pgTable('pause90_pdf_deliveries', {
  orderKey: text('order_key').primaryKey(),
  payload: jsonb('payload'),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  firstAttemptAt: timestamp('first_attempt_at', { withTimezone: true }),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
  providerId: text('provider_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});
module.exports = { deliveries };
