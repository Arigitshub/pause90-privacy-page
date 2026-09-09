# Automatic PDF email delivery

Status: implementation prepared; not deployed or enabled. The existing live download route is independent of email delivery.

## Behavior

`POST /api/stripe-webhook` verifies Stripe's signature against untouched request bytes, retrieves the current Checkout Session and charge, and applies the same exact-product, price, currency, paid, refund and dispute checks as the download route. Only `checkout.session.completed` and `checkout.session.async_payment_succeeded` are handled. Other orders are ignored.

The recipient is the paid session's `customer_details.email`. Each email contains only the purchased PDF and a support reply address. The buyer is not added to a marketing list.

The database has one row per SHA-256 checkout ID. The exact email request is stored before its first attempt; atomic leases prevent concurrent sends. Resend receives a stable idempotency key. Once Resend accepts the email, the payload containing the address and attachment is cleared, and the provider ID and sent timestamp remain. Acceptance is not proof of inbox delivery.

Unresolved attempts older than 23 hours become `needs_review`, because Resend retains idempotency keys for 24 hours. Inspect the provider's logs before resetting or retrying those records. A failed webhook returns HTTP 503 so Stripe can retry and surface failures in its dashboard. There is no separate scheduled recovery worker in this change.

## Activation steps still required

1. Sign into the existing Resend account and confirm a verified sender domain. Create a domain-restricted, sending-only key for this delivery service and put it in Vercel as sensitive `RESEND_API_KEY`. Set `DELIVERY_FROM` to the verified sender. Do not use a public mailbox domain as an unverified sender.
2. Apply the generated Drizzle migration first on an isolated branch of the existing Pause90 database, review its schema change, then apply it to the selected production branch. Use `DELIVERY_DATABASE_URL_UNPOOLED` locally for migration; never deploy the administrator credential. Provision a dedicated database role limited to SELECT/INSERT/UPDATE on `pause90_pdf_deliveries`, and store its pooled URL as sensitive `DELIVERY_DATABASE_URL` in Vercel.
3. Register a live Stripe webhook at the deployed `/api/stripe-webhook` URL for only the two event types above. Store its signing secret as sensitive `STRIPE_WEBHOOK_SECRET`. The existing restricted Stripe read key remains sufficient for payment retrieval.
4. Deploy with the private PDFs included in the function bundle, then enable `EMAIL_DELIVERY_ENABLED=true` only when all configuration and the table exist. Keep the manual email fallback promise until this is operational.
5. Review real delivery outcomes in Stripe and Resend. No checkout purchase or payment simulation has been run, at the owner's request. The email handler has not yet been validated against a live event.

## Validation completed

- JavaScript syntax checks and module imports pass.
- Static storefront build passes and retains its explicit public-file allowlist.
- Drizzle generated an additive migration for one new table; no database schema has been changed.
- Production dependency audit reports zero vulnerabilities. Drizzle Kit's development dependencies currently report four moderate advisories; these are not application runtime dependencies.

## References

- [Stripe webhook signature verification and retries](https://docs.stripe.com/webhooks)
- [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend idempotency retention](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Neon with Drizzle](https://neon.com/docs/guides/drizzle)
