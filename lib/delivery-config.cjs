const { offers } = require('./entitlement.cjs');
function deliveryConfig(env = process.env) {
  const live = env.DELIVERY_MODE === 'live';
  const key = env.STRIPE_RESTRICTED_KEY;
  if (!['live', 'test'].includes(env.DELIVERY_MODE) ||
      typeof key !== 'string' || !key.startsWith(live ? 'rk_live_' : 'rk_test_')) return null;
  const catalog = live ? offers : Object.create(null);
  if (!live) {
    const definitions = [
      ['TINY_WIN', 300, 'one-tiny-win.pdf', false],
      ['KIT', 900, 'pocket-reset-kit.pdf', false],
      ['CLIENT_READY', 1200, 'client-ready-kickoff-kit.zip', true],
      ['SOLO_PLANNER', 900, 'solo-income-planner.pdf', true],
    ];
    for (const [name, amount, file, strict] of definitions) {
      const link = env[`TEST_${name}_PAYMENT_LINK`];
      if (!link) continue;
      const price = env[`TEST_${name}_PRICE_ID`], product = env[`TEST_${name}_PRODUCT_ID`];
      if (!/^plink_[A-Za-z0-9]+$/.test(link) || Object.hasOwn(offers, link) ||
          Object.hasOwn(catalog, link)) return null;
      if (strict && (!/^price_[A-Za-z0-9]+$/.test(price || '') ||
                     !/^prod_[A-Za-z0-9]+$/.test(product || '') ||
                     Object.values(offers).some(o => o.price === price || o.product === product))) return null;
      catalog[link] = { amount, file, ...(strict ? { price, product } : {}) };
    }
  }
  return { live, key, catalog, sessionPattern: live ? /^cs_live_[A-Za-z0-9]+$/ : /^cs_test_[A-Za-z0-9]+$/ };
}
module.exports = { deliveryConfig };
