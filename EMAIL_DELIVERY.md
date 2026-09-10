# Automatic PDF email delivery

Status: the ordinary five-minute Gmail implementation is prepared but not activated. Payment-verified downloads are live and independent. The active six-hour Codex fallback below provides automated email recovery until the ordinary worker replaces it.

## Temporary fulfillment fallback

Codex automation `pause90-paid-pdf-fulfillment` is now active with a six-hour interval. It follows `D:\Ari\Dropzone\pause90-fulfillment-fallback.md` and records delivery state in `D:\Ari\Dropzone\pause90-fulfillment-state`. It uses connected Stripe and Gmail, with `ari532477@gmail.com` as sender. This agent workflow uses AI tokens, unlike the ordinary Apps Script timer. Initial live checks returned zero completed orders for both offers; no email was sent. Future execution depends on access to this local workspace and the connected tools.

Before activating Apps Script, pause automation `pause90-paid-pdf-fulfillment`, reconcile uncertain attempts, and import each sent order's full SHA-256 hash into Script Properties as `order_[hash]=sent`. Do not run independent workers concurrently or discard fulfillment history.

## Behavior

The Google Apps Script in `google-apps-script/` runs under the approved account `ari532477@gmail.com`. A five-minute timer invokes ordinary code and uses no AI tokens. The sender and reply address are that Gmail account. No domain mailbox, Resend account, or database is required.

`GET /api/gmail-orders` requires a private bearer token and an explicit enable flag. It retrieves completed Stripe Checkout Sessions for only the two existing offers since September 9, 2026. The shared entitlement check verifies live mode, payment, product, amount, currency, refund and dispute status. Only the paid order's email address receives its purchased PDF; no marketing subscription is created.

Before sending, the script downloads the PDF through the existing endpoint, which rechecks entitlement. A script lock prevents simultaneous runs. The script records each order's hashed ID before attempting delivery. Successful sends are marked sent. An interrupted or failed send is marked for review and is never blindly retried, because MailApp has no idempotency key. Review the sender's Sent folder using the short order reference before resolving such a record. Sending acceptance does not prove inbox delivery.

The worker checks remaining email quota and its runtime budget. Orders resume on a later run when either is exhausted. It scans paginated history, so a growing backlog may take multiple timer runs. It stops before its property store fills rather than deleting delivery history and risking duplicate messages.

## Activation still required

1. Create an Apps Script project owned by `ari532477@gmail.com`. Copy `Code.js` and `appsscript.json` from `google-apps-script/`.
2. Generate a random private token of at least 40 characters. Store it only in the project's Script Properties as `GMAIL_DELIVERY_TOKEN` and in Vercel as a sensitive environment variable of the same name. Never put it in source control or logs.
3. Deploy the order endpoint with the existing restricted Stripe read key, `DELIVERY_MODE=live`, and `GMAIL_DELIVERY_ENABLED=true` after the worker is configured.
4. Run `installDelivery` under the approved Gmail account and complete Google's authorization flow. It installs the timer; it does not make a purchase or immediately send an email. The timer will fulfill eligible real orders, including earlier unpaid-delivery backlog from the configured start date.
5. Check trigger installation and subsequent execution status. Keep the live customer wording limited to verified instant download plus automated email recovery; do not claim five-minute delivery until activation is confirmed. No purchase or payment simulation is required or authorized for this work.

To pause, run `pauseDelivery`. To stop order access, set Vercel's `GMAIL_DELIVERY_ENABLED=false` and deploy. Keep fulfillment history intact.

## Current limitation

Chrome retry on September 9, 2026: tab listing succeeds, but navigation to Google Apps Script and accessibility inspection both time out. Chrome is running and the ChatGPT extension is installed and enabled. The native-host diagnostic also reports a missing expected extension origin; this has not been established as the cause of the timeouts. The documented recovery is to reinstall the browser plugin through the app UI, then retry Chrome control.

The Apps Script project, token and trigger have not been created. No deployment or email send was performed during this retry. The ordinary five-minute timer is not running; the six-hour connector automation above is now the fallback. No buyer delivery has yet been observed because there are no completed orders.
