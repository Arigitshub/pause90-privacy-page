// Read-only weekly cash-receipts report. No customer emails or names are printed.
const Stripe = require('stripe');
const { offers } = require('../lib/entitlement.cjs');

async function main() {
  const key = process.env.STRIPE_RESTRICTED_KEY;
  if (!key?.startsWith('rk_live_')) throw new Error('A live restricted read key is required; test data cannot count as revenue.');
  const stripe = new Stripe(key, { maxNetworkRetries: 1, timeout: 15000 });
  const end = Math.floor(Date.now() / 1000), start = end - 7 * 86400;
  const report = { periodStart: new Date(start*1000).toISOString(), periodEnd: new Date(end*1000).toISOString(), targetCents: 30500, currency: 'usd', paidOrderCount: 0, grossCents: 0, refundedCents: 0, disputedCents: 0, excludedSelfOrTestOrders: 0, unclassifiedOrders: 0, feesCents: null, netAfterFeesCents: null, offers: [] };
  const seen = new Set();
  for (const [payment_link, offer] of Object.entries(offers)) {
    const row = { product: offer.file, paidOrders: 0, grossCents: 0, refundedCents: 0, disputedCents: 0 };
    // Paginate all completed sessions so a checkout opened earlier but paid this week is included.
    for await (const s of stripe.checkout.sessions.list({ payment_link, status: 'complete', limit: 100 })) {
      if (!s.livemode || s.payment_status !== 'paid' || s.mode !== 'payment' || s.currency !== 'usd' || seen.has(s.id)) continue;
      seen.add(s.id);
      if (!s.payment_intent) { report.unclassifiedOrders++; continue; }
      const pi = await stripe.paymentIntents.retrieve(typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent.id, { expand: ['latest_charge'] });
      const charge = pi.latest_charge;
      if (!charge || typeof charge !== 'object' || !charge.paid || !charge.captured || !Number.isInteger(charge.created)) { report.unclassifiedOrders++; continue; }
      if (charge.created < start || charge.created >= end) continue;
      if (s.metadata?.internal_test === 'true' || s.metadata?.self_purchase === 'true' || pi.metadata?.internal_test === 'true' || pi.metadata?.self_purchase === 'true') { report.excludedSelfOrTestOrders++; continue; }
      if (s.amount_total !== offer.amount || charge.amount !== s.amount_total || charge.currency !== 'usd') { report.unclassifiedOrders++; continue; }
      row.paidOrders++; row.grossCents += charge.amount;
      row.refundedCents += charge.amount_refunded || 0;
      if (charge.disputed) row.disputedCents += Math.max(0, charge.amount - (charge.amount_refunded || 0));
    }
    report.paidOrderCount += row.paidOrders; report.grossCents += row.grossCents;
    report.refundedCents += row.refundedCents; report.disputedCents += row.disputedCents;
    report.offers.push(row);
  }
  report.receiptsAfterRefundsAndDisputesCents = report.grossCents - report.refundedCents - report.disputedCents;
  report.remainingBeforeFeesCents = Math.max(0, report.targetCents - report.receiptsAfterRefundsAndDisputesCents);
  report.notes = ['Cash receipts for charges created in the trailing seven days, adjusted for their current refunds/disputes. Not accounting profit or a historical refund ledger.', 'Fees, tax and other costs are not deducted. Buyer independence cannot be inferred from payment alone; unidentified self-purchases require reconciliation.', 'Automated fulfillment and recurring weekly performance require separate evidence. This report never declares the overall goal achieved.'];
  console.log(JSON.stringify(report, null, 2));
}
main().catch(() => { console.error('Revenue check failed. Verify the restricted key permissions and Stripe availability; no revenue total can be asserted.'); process.exitCode = 1; });
