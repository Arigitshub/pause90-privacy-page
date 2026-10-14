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


## October 14 verification and smallest corrections (not activated)

Source reviewed: PR #22 head `4fa6c9150a7782a8e53aec1d475e5f501386268d`; main `9d13fa6e7bcef7d60bc427840c8622903ab364a6`.

### Independently observed

- Connected Stripe exposes only Pause90 **live** account `acct_1NzqGyFUkdXDZAsc`; no sandbox account is accessible. Read-only live checks only; no payment, email, webhook registration or Payment Link mutation.
- Both new live Payment Links remain active and redirect to the original public GitHub Pages binaries. Old $3/$9 links still redirect to the existing Vercel download route. The live webhook inventory contains no endpoint for `pause90-pdf-delivery.vercel.app`.
- Public Vercel GET observations: `/api/download` without a session returns **400**; `/api/gmail-orders` without authorization returns **401**; `/api/redeem` and `/api/stripe-webhook` return **404**. These observations do not prove successful paid fulfillment, private deployment integrity or worker activation.
- Vercel plugin discovery reports **not installed** (previously suggested October 11). Dashboard access lands on sign-in; authenticated project settings, plan, usage, source, environment names, function bundles and logs remain inaccessible. No authentication or deployment changes were made.
- Both repository product sizes and SHA-256 match the table above. ZIP CRC check passes; entries are US Letter PDF, A4 PDF, email templates TXT and START_HERE TXT. These are **source** integrity results, not deployed-private-asset verification.
- A clean checkout's `npm run build` safely fails on missing `private-products/one-tiny-win.pdf`. Older private PDFs and the deployment asset channel must be preserved, not replaced with placeholders.
- Current Work automation lookup did not find a named paid-fulfillment task. This does not establish the state of the documented Windows/local Codex fallback or Apps Script trigger; inspect those before any live worker handover. Historical send state must be imported and concurrent senders avoided.

### Corrections on the existing draft branch

The original draft could not perform the required new-product sandbox tests: new offers were missing from its test catalog; grants, redemption, recovery, reconciliation, relay and Script session checks were live-only. A shared fail-closed delivery configuration now supports explicitly configured sandbox Link/Price/Product IDs, rejecting live IDs and wrong key/session modes. Live identifiers and legacy direct-PDF behavior remain unchanged.

Apps Script supports a **separate sandbox project**, explicit preview origin and sandbox links. Sandbox mail is constrained to the approved owner; live recipient behavior and historical `order_` state keys are preserved. A preview cannot default to the production recovery origin. Separate signing/relay tokens and webhook secrets are mandatory between environments.

The public output directory is rebuilt from scratch **after** asset validation, removing stale unallowlisted files before a successful build. `vercel.json` explicitly disables public deployment source/log access. No public binaries were removed or added.

`npm test`: **27/27 local tests pass**, including both sandbox product route chains, exact authorization failures, refund/dispute rejection, wrong-file/tampered/expired grants, buyer-email binding, legacy direct downloads, real Stripe SDK raw-body signatures, streamed webhook bodies, unavailable relay retry behavior, Script replay deduplication, owner-only sandbox mail, uncertain-send review and stale-public-file exclusion. Stripe sessions, file reads, Google services and email sending are mocked. **No real sandbox purchase, Vercel runtime test or inbox delivery has been performed.**

### Zero-additional-cost deployment assessment

The existing `includeFiles` + server-only `private-products/` approach is a candidate requiring **no new storage subscription**: upload approved untracked files with the existing project's private CLI deployment flow, bundle them only into authorized functions, publish only the allowlisted `public/` output, and keep deployment source access private. The two added files total **147,451 bytes**. Verify all four assets in the preview bundle and test that guessed static/source URLs cannot retrieve them. Do not put private binary contents or download tokens in Git or logs.

This is conditional, **not an approved or verified $0 hosting result**. Vercel's Hobby plan is personal/noncommercial; paid-product fulfillment cannot be treated as an eligible free Hobby workload. If the existing account already has a suitable commercial plan and sufficient included usage, this path may have $0 incremental cost. If it is Hobby, do not upgrade or incur spend; the no-spend constraint requires an already-owned suitable host or a separately approved alternative. No new architecture or paid service was provisioned.

Official references: https://vercel.com/docs/functions/limitations ; https://vercel.com/docs/project-configuration ; https://vercel.com/pricing ; https://vercel.com/legal/terms .

### Exact blocker and one next action

**First blocker:** authenticated access to the existing Vercel project, so its commercial plan/usage, deployment source, environment names and private assets can be inspected. **Next action:** connect the existing Vercel account/project to this workspace. Then inspect before choosing/deploying any path. Actual sandbox testing also requires connecting the Pause90 Stripe sandbox and an isolated authorized Apps Script worker. Preserve the draft and all cutover gates until deployed end-to-end tests pass.

Sandbox setup once access is available: use `DELIVERY_MODE=test`, `rk_test_` restricted key, both `TEST_CLIENT_READY_*` and `TEST_SOLO_PLANNER_*` Link/Price/Product IDs from sandbox readback, explicit preview `DELIVERY_PUBLIC_ORIGIN`, preview-only secrets and webhook. In a new Script project set `DELIVERY_MODE=test`, the matching preview origin, `TEST_PAYMENT_LINKS` as a JSON array, and the matching preview-only `GMAIL_DELIVERY_TOKEN`. Never edit the production worker properties to run tests. Redeem and hash each real downloaded product; replay signed events; check a single owner email and unchanged live checkout configuration before activation.
