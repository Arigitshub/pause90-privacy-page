// Single authoritative catalog. Stripe ids came from live Payment Link readback.
// New digital offers additionally require an exact Stripe Price and Product match.
const offers = Object.freeze({
  plink_1UC6NeFUkdXDZAscCZfPzSQ4: { amount: 300, file: 'one-tiny-win.pdf' },
  plink_1UC07eFUkdXDZAscxNJnQkvk: { amount: 900, file: 'pocket-reset-kit.pdf' },
  plink_1UPUhuFUkdXDZAscmOmda3aw: {
    amount: 1200, file: 'client-ready-kickoff-kit.zip',
    price: 'price_1UPUhuFUkdXDZAscQGurjoEa', product: 'prod_VQLOboh1xHZ5ji',
  },
  plink_1UPUi3FUkdXDZAsc6WpS7cnF: {
    amount: 900, file: 'solo-income-planner.pdf',
    price: 'price_1UPUi3FUkdXDZAscePDC1gnN', product: 'prod_VQLOhNHTVd6EPa',
  },
});

function entitledFile(session, live, catalog = offers, lineItems = null) {
  const offer = catalog[session?.payment_link];
  const charge = session?.payment_intent?.latest_charge;
  if (!offer || session.livemode !== live || session.mode !== 'payment' ||
      session.status !== 'complete' || session.payment_status !== 'paid' ||
      session.currency !== 'usd' || session.amount_total !== offer.amount ||
      !charge || typeof charge !== 'object' || charge.paid !== true ||
      charge.refunded !== false || charge.amount_refunded !== 0 || charge.disputed !== false)
    return null;
  if (offer.price) {
    if (!Array.isArray(lineItems) || lineItems.length !== 1) return null;
    const item = lineItems[0];
    const product = typeof item?.price?.product === 'string'
      ? item.price.product : item?.price?.product?.id;
    if (item?.price?.id !== offer.price || product !== offer.product ||
        item?.quantity !== 1 || item?.amount_total !== offer.amount) return null;
  }
  return offer.file;
}

module.exports = { entitledFile, offers };
