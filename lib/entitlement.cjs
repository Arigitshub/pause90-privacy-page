const offers = Object.freeze({
  plink_1UC6NeFUkdXDZAscCZfPzSQ4: { amount: 300, file: 'one-tiny-win.pdf' },
  plink_1UC07eFUkdXDZAscxNJnQkvk: { amount: 900, file: 'pocket-reset-kit.pdf' },
});

function entitledFile(session, live, catalog = offers) {
  const offer = catalog[session?.payment_link];
  const charge = session?.payment_intent?.latest_charge;
  if (!offer || session.livemode !== live || session.mode !== 'payment' ||
      session.status !== 'complete' || session.payment_status !== 'paid' ||
      session.currency !== 'usd' || session.amount_total !== offer.amount ||
      !charge || typeof charge !== 'object' || charge.paid !== true ||
      charge.refunded !== false || charge.amount_refunded !== 0 || charge.disputed !== false) return null;
  return offer.file;
}
module.exports = { entitledFile, offers };
