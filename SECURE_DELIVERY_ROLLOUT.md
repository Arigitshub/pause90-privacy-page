# Paid downloads: secure-delivery rollout (draft, not activated)

**Scope:** Two new products added to the *existing* Pause90 Vercel delivery code. This change contains no paid assets, credentials, public URL removal, or live Payment Link mutation. **Do not merge until Vercel is inspected and preflight checks pass.** Previous $3/$9 products and their fulfillment must remain functional.

## Confirmed identifiers (read back from live Stripe, Oct 11 2026)

| Product | Link | Stripe Payment Link ID | Price ID | Product ID | Expected bytes / SHA-256 |
|---|---|---|---|---|---|
| Client-Ready: The Freelancer Project Kickoff Kit — $12 | https://buy.stripe.com/aFadR93KAh296W05OqdAk08 | `plink_1UPUhuFUkdXDZAscmOmda3aw` | `price_1UPUhuFUkdXDZAscQGurjoEa` | `prod_VQLOboh1xHZ5ji` | `122303` / `ea4666ab15a7f7413d465fa4cb8725d6774358679c1c3be3118d4d81a4aff7b6` |
| The Solo Income Planner — $9 | https://buy.stripe.com/dRmfZh0yobHPgwA4KmdAk09 | `plink_1UPUi3FUkdXDZAsc6WpS7cnF` | `price_1UPUi3FUkdXDZAscePDC1gnN` | `prod_VQLOhNHTVd6EPa` | `25148` / `51049e292f1ffd75900ec102b71571478ecc231e0c8c90c1711c1dcbcdba4258` |

## Design

1. Existing checkout remains Stripe-hosted; no new product, Price or Payment Link is created.
2. `GET /api/download?session_id=...` re-reads Stripe Checkout Session and latest charge. New offers additionally require an exact Payment Link, Price ID, Product ID, quantity 1, currency USD, full amount, complete + paid, not refunded/disputed, live mode.
3. Server returns a 303 to `/api/redeem?token=...` with an HMAC-SHA256 15-minute bearer token bound to the session and purchased product. `GET /api/redeem` rechecks Stripe authorization and streams only the matching server-only PDF or ZIP. No path is user-selected.
4. Authenticated `POST /api/email-link` rechecks the purchase, reads the receipt email from Stripe, and issues a **72-hour** recovery grant. The email worker sends the link only to the verified email, not to a supplied arbitrary recipient.
5. `POST /api/stripe-webhook` verifies the raw-body `Stripe-Signature`; it relays a short-lived HMAC-authenticated event to the existing Apps Script under `GMAIL_WEB_APP_URL`. Apps Script stores a durable queue entry under a lock, uses hashed session keys for send idempotence and five-minute polling for fallback reconciliation; before sending it checks the live order through `/api/email-link`. This design deliberately fails closed if the email receiver is unavailable, so Stripe retries.
6. `scripts/build.cjs` keeps public static content allowlisted and fails if any paid private product bytes are missing or modified. No paid file is committed to this public Git repository.

## Existing hosting prerequisite — BLOCKING

We could not access the Vercel project in this session. First inspect `pause90-pdf-delivery.vercel.app`: confirm account/project owner, source repo and production branch, deploy mechanism, current secrets **names only**, functions, logs, and actual deployment private assets. The current repository's build requires two older private PDFs, while this proposed build additionally requires both new assets. An automatic Git-only build without untracked assets will fail by design. Do **not** merge a PR until the assets' private deployment channel works without adding a paid service.

The original new files are privately available on Google Drive but the currently deployed Vercel server has no confirmed permission to read those Drive files. Use Vercel's existing private deployment asset approach **if it is working**. Otherwise, assess a private object store or an authenticated Drive integration for zero additional spend; don't improvise public URLs.

## Needed environment variables (names only)

- Existing: `DELIVERY_MODE=live`, `STRIPE_RESTRICTED_KEY=rk_live_...` with Checkout Session + charge + line-item read access; `GMAIL_DELIVERY_ENABLED`, `GMAIL_DELIVERY_TOKEN` (40+ random characters)
- New: `DELIVERY_LINK_SECRET` (40+ secret random characters), `STRIPE_WEBHOOK_SECRET` from the *new scoped endpoint*, `GMAIL_WEB_APP_URL` from your already-owned Apps Script Web App, optionally `DELIVERY_PUBLIC_ORIGIN=https://pause90-pdf-delivery.vercel.app`.
- Google Apps Script project Script Properties must contain the *same* `GMAIL_DELIVERY_TOKEN`. Never copy actual secrets into GitHub, prompts, logs, response HTML or public settings.

Do not add the new live webhook endpoint to Stripe until Vercel and Apps Script are fully configured; otherwise Stripe will retry webhooks indefinitely. New endpoint subscribes only to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Existing Stripe webhook endpoints must not be altered.

## Safe activation gates

- [ ] Connect/inspect existing Vercel project and confirm $0 incremental billing/usage.
- [ ] Private files are deployed server-side only, correct SHA-256, absent from public static tree, and available to `/api/redeem` (including .zip).
- [ ] Existing $3/$9 Pause90 products still download after a matching paid order.
- [ ] Verify negative cases for both new products: no session, unguessable/invalid session, unpaid, wrong link, wrong Price/Product/amount, test/live mismatch, wrong file, tampered token, expired token, refunded, disputed.
- [ ] Verify signed `Stripe-Signature` against original raw bytes. Unsigned/fake webhook rejected; valid webhook persisted once by Apps Script; repeat delivery does not resend email.
- [ ] Confirm Apps Script authorized Gmail sender, private token, installable trigger, failed/uncertain email review policy, recovery and quotas. The worker has not been activated by this PR.
- [ ] Two *sandbox* purchase/fulfillment end-to-end tests, one per product; confirm valid receipt emails and downloaded PDF/ZIP byte-for-byte. **Do not use real paid transactions to test.**
- [ ] Update the **same** two live Stripe Payment Links in-place, read back `after_completion.redirect.url = https://pause90-pdf-delivery.vercel.app/api/download?session_id={CHECKOUT_SESSION_ID}`. Verify unchanged `buy.stripe.com` URLs and $12/$9 prices.
- [ ] Only after those gates: remove precisely `thenewmindai/solo-income-planner.pdf` and `thenewmindai/client-ready-kickoff-kit.zip` from **public main**, verify old GitHub Pages URLs return 404/410 under cache-busting GET and HEAD and verify new private route works.
- [ ] Coordinate historical Git exposure: deletions from current branch **do not** purge previous blobs/commits, caches, clones or forks. Force-push history rewrites are not part of this draft; they can break open PRs and may not eliminate external copies. Prefer revised never-public products if genuinely exclusive bytes are required.
- [ ] Only then mark both checkout paths launch-ready. Keep first orders under error / mail deliverability / refund watch.

## Failure/rollback boundaries

Until redirect cutover: current two Stripe Payment Links remain at public URLs. No customer delivery should be disrupted by an unmerged PR. After redirect cutover, rollback by restoring original links *only as an emergency last resort* because that restores free download access; preferably fix forward or temporarily disable both links while preserving customers' support contact and providing manual fulfillment.

Security limits: a paid buyer can always save and share a digital file; signed URLs are bearer tokens and can be forwarded within validity. A Checkout Session ID is also a bearer capability; avoid leaking it in analytics or logs. Never claim current files can be made secret retrospectively after a public release.
