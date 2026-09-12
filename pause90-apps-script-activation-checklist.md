# Pause90 Gmail Delivery Activation Checklist

Status: prepared, not active. The local delivery worker passes JavaScript syntax validation.

## What the worker does

- Runs every five minutes only after `installDelivery` is authorized.
- Checks only the two existing live Pause90 Stripe payment links.
- Sends only a verified buyer's purchased PDF to the checkout email.
- Records a hashed checkout-session identifier before calling Gmail, so uncertain sends are held for review instead of retried blindly.

## Live activation sequence

1. In `ari532477@gmail.com`, create an Apps Script project and paste `google-apps-script/Code.js` and `google-apps-script/appsscript.json`.
2. Create one new random token of at least 40 characters. Put it in the project Script Properties as `GMAIL_DELIVERY_TOKEN`.
3. Add that same value to the production deployment as the sensitive `GMAIL_DELIVERY_TOKEN` environment variable. Set `GMAIL_DELIVERY_ENABLED=true`; retain the existing restricted Stripe read key and `DELIVERY_MODE=live`; deploy.
4. In Apps Script, run `installDelivery` while signed into `ari532477@gmail.com`; review and approve the Gmail, external-request, trigger, and account-identity permissions.
5. Verify exactly one `deliverPaidOrders` five-minute trigger and a successful execution. Then pause the six-hour Codex fallback after reconciling its no-order state.

## Verification boundary

No self-purchase is needed. Do not claim five-minute email delivery until the trigger and production endpoint are both confirmed. Until then, checkout retains immediate protected download and the six-hour recovery fallback.