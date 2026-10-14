const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Stripe = require('stripe');
const { deliveryConfig } = require('./delivery-config.cjs');
const { signGrant } = require('./download-grants.cjs');
const { verifyEnvelope } = require('./webhook-relay.cjs');
const env = () => ({ DELIVERY_MODE: 'test', STRIPE_RESTRICTED_KEY: 'rk_test_fixture',
  DELIVERY_LINK_SECRET: 'local-test-only-' + 's'.repeat(64),
  GMAIL_DELIVERY_TOKEN: 'local-test-only-' + 'g'.repeat(64), GMAIL_DELIVERY_ENABLED: 'true',
  STRIPE_WEBHOOK_SECRET: 'whsec_local_fixture',
  GMAIL_WEB_APP_URL: 'https://script.google.com/macros/s/fixture/exec',
  DELIVERY_PUBLIC_ORIGIN: 'https://pause90-fixture-preview.vercel.app',
  TEST_CLIENT_READY_PAYMENT_LINK: 'plink_TestKit', TEST_CLIENT_READY_PRICE_ID: 'price_TestKit', TEST_CLIENT_READY_PRODUCT_ID: 'prod_TestKit',
  TEST_SOLO_PLANNER_PAYMENT_LINK: 'plink_TestPlanner', TEST_SOLO_PLANNER_PRICE_ID: 'price_TestPlanner', TEST_SOLO_PLANNER_PRODUCT_ID: 'prod_TestPlanner',
  TEST_TINY_WIN_PAYMENT_LINK: 'plink_TestTiny', TEST_KIT_PAYMENT_LINK: 'plink_TestPocket',
});
function fixture(file = 'solo-income-planner.pdf') {
  const e = env(), config = deliveryConfig(e);
  const [link, offer] = Object.entries(config.catalog).find(([,o]) => o.file === file);
  const session = { id: 'cs_test_Fixture123', object: 'checkout.session', payment_link: link, livemode: false,
    mode: 'payment', status: 'complete', payment_status: 'paid', currency: 'usd', amount_total: offer.amount,
    customer_details: { email: 'buyer@example.org' },
    payment_intent: { latest_charge: { paid: true, refunded: false, amount_refunded: 0, disputed: false } } };
  const items = [{ price: { id: offer.price, product: offer.product }, quantity: 1, amount_total: offer.amount }];
  const bytes = Buffer.from(file.endsWith('.zip') ? 'PK\x03\x04mock-product' : '%PDF-mock-product');
  let relay = null, reads = 0, relayOk = true;
  const mockStripe = function () { return { checkout: { sessions: {
    retrieve: async () => { reads++; return session; },
    listLineItems: async () => ({ data: items, has_more: false }),
    list: async () => ({ data: [session], has_more: false }),
  } }, webhooks: new Stripe('rk_test_fixture').webhooks }; };
  function handler(route) {
    const full = path.resolve(__dirname, '../api', route + '.js');
    const realRequire = createRequire(full);
    const context = { module: { exports: {} }, process: { env: e, cwd: () => path.resolve(__dirname, '..') },
      Buffer, Date, Math, AbortSignal,
      fetch: async (_url, options) => { relay = JSON.parse(options.body); return { ok: relayOk, json: async () => ({ ok: relayOk }) }; },
      require: name => name === 'stripe' ? mockStripe :
        name === '../lib/delivery-config.cjs' ? { deliveryConfig: () => deliveryConfig(e) } :
        name === 'node:fs/promises' ? { readFile: async () => bytes } : realRequire(name),
    };
    vm.runInNewContext(fs.readFileSync(full, 'utf8'), context, { filename: full });
    return context.module.exports;
  }
  async function call(route, input = {}) {
    const req = { method: 'GET', headers: {}, query: {}, ...input };
    const res = { code: 200, headers: {}, body: undefined,
      setHeader(k,v) { this.headers[k] = v; }, status(n) { this.code = n; return this; },
      send(v) { this.body = v; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
    await handler(route)(req, res); return res;
  }
  return { e, session, items, bytes, call, get relay() { return relay; }, get reads() { return reads; }, set relayOk(value) { relayOk = value; } };
}
test('sandbox catalog requires exact new IDs and excludes live catalog', () => {
  const e = env(); assert.equal(Object.keys(deliveryConfig(e).catalog).length,4);
  delete e.TEST_CLIENT_READY_PRICE_ID; assert.equal(deliveryConfig(e), null);
  e.TEST_CLIENT_READY_PRICE_ID = 'price_TestKit'; e.STRIPE_RESTRICTED_KEY = 'rk_live_wrong';
  assert.equal(deliveryConfig(e), null);
  e.STRIPE_RESTRICTED_KEY = 'rk_test_fixture'; e.TEST_SOLO_PLANNER_PAYMENT_LINK = 'plink_1UPUi3FUkdXDZAsc6WpS7cnF';
  assert.equal(deliveryConfig(e), null);
});
for (const file of ['solo-income-planner.pdf','client-ready-kickoff-kit.zip']) {
  test(`sandbox download -> signed redemption -> recovery -> reconciliation: ${file}`, async () => {
    const f = fixture(file);
    const download = await f.call('download', { query: { session_id: f.session.id } });
    assert.equal(download.code, 303);
    const token = new URL(download.headers.Location,'https://fixture.invalid').searchParams.get('token');
    const redemption = await f.call('redeem', { query: { token } });
    assert.equal(redemption.code,200); assert.deepEqual(redemption.body,f.bytes);
    assert.equal(redemption.headers['Content-Type'],file.endsWith('.zip') ? 'application/zip' : 'application/pdf');
    const recovery = await f.call('email-link', { method: 'POST', headers: { authorization: 'Bearer '+f.e.GMAIL_DELIVERY_TOKEN }, body: { session_id: f.session.id, email: 'attacker@example.org' } });
    assert.equal(recovery.code,200); assert.equal(recovery.body.email,'buyer@example.org');
    assert.ok(recovery.body.url.startsWith(f.e.DELIVERY_PUBLIC_ORIGIN+'/api/redeem?token='));
    const receipt = await f.call('redeem', { query: { token: new URL(recovery.body.url).searchParams.get('token') } });
    assert.equal(receipt.code,200); assert.deepEqual(receipt.body,f.bytes);
    const orders = await f.call('gmail-orders', { query: { payment_link: f.session.payment_link }, headers: { authorization: 'Bearer '+f.e.GMAIL_DELIVERY_TOKEN } });
    assert.equal(orders.code,200); assert.equal(orders.body.orders[0].filename,file);
  });
  test(`reject invalid or revoked sandbox entitlement: ${file}`, async () => {
    const changes = [s=>s.payment_status='unpaid',s=>s.livemode=true,s=>s.currency='eur',
      s=>s.amount_total=1,s=>s.payment_link='plink_Unknown',s=>s.payment_intent.latest_charge.refunded=true,
      s=>s.payment_intent.latest_charge.amount_refunded=1,s=>s.payment_intent.latest_charge.disputed=true];
    for (const change of changes) {
      const f=fixture(file); const token=signGrant(f.session.id,file,f.e.DELIVERY_LINK_SECRET);
      change(f.session);
      assert.equal((await f.call('download',{query:{session_id:f.session.id}})).code,403);
      assert.equal((await f.call('redeem',{query:{token}})).code,403);
    }
    for (const change of [i=>i.quantity=2,i=>i.price.id='price_Wrong',i=>i.price.product='prod_Wrong']) {
      const f=fixture(file);change(f.items[0]);
      assert.equal((await f.call('download',{query:{session_id:f.session.id}})).code,403);
    }
    const f=fixture(file);
    assert.equal((await f.call('download')).code,400);
    assert.equal((await f.call('download',{query:{session_id:'cs_live_WrongMode'}})).code,403);
    const other=file.endsWith('.zip')?'solo-income-planner.pdf':'client-ready-kickoff-kit.zip';
    assert.equal((await f.call('redeem',{query:{token:signGrant(f.session.id,other,f.e.DELIVERY_LINK_SECRET)}})).code,403);
    assert.equal((await f.call('redeem',{query:{token:signGrant(f.session.id,file,f.e.DELIVERY_LINK_SECRET)+'x'}})).code,403);
    assert.equal((await f.call('redeem',{query:{token:signGrant(f.session.id,file,f.e.DELIVERY_LINK_SECRET,1)}})).code,403);
    assert.equal((await f.call('email-link',{method:'POST',body:{session_id:f.session.id}})).code,401);
    assert.equal((await f.call('gmail-orders')).code,401);
  });
}
test('legacy sandbox downloads still return PDFs directly', async () => {
  for (const file of ['one-tiny-win.pdf','pocket-reset-kit.pdf']) {
    const f=fixture(file);
    assert.equal((await f.call('download',{query:{session_id:f.session.id}})).code,200);
  }
});
test('sandbox email cannot point at production origin', async () => {
  const f=fixture();f.e.DELIVERY_PUBLIC_ORIGIN='https://pause90-pdf-delivery.vercel.app';
  assert.equal((await f.call('email-link',{method:'POST',headers:{authorization:'Bearer '+f.e.GMAIL_DELIVERY_TOKEN},body:{session_id:f.session.id}})).code,503);
});
test('Stripe SDK validates exact raw bytes; signed sandbox event relays and forged event fails', async () => {
  const f=fixture();
  const raw=Buffer.from(JSON.stringify({id:'evt_Fixture123',type:'checkout.session.completed',livemode:false,data:{object:f.session}},null,2));
  const signature=new Stripe('rk_test_fixture').webhooks.generateTestHeaderString({payload:raw.toString(),secret:f.e.STRIPE_WEBHOOK_SECRET});
  const input={method:'POST',rawBody:raw,headers:{'stripe-signature':signature}};
  assert.equal((await f.call('stripe-webhook',input)).code,200);
  assert.equal(verifyEnvelope(f.relay,f.e.GMAIL_DELIVERY_TOKEN),true);
  assert.equal((await f.call('stripe-webhook',{...input,rawBody:Buffer.from(JSON.stringify(JSON.parse(raw)))})).code,400);
  assert.equal((await f.call('stripe-webhook',{...input,headers:{}})).code,400);
  f.e.GMAIL_DELIVERY_ENABLED='false';
  assert.equal((await f.call('stripe-webhook',input)).code,503);
});

test('raw stream signatures are checked and unqueued webhooks are not acknowledged',async()=>{
  const f=fixture();
  const raw=Buffer.from(JSON.stringify({id:'evt_Stream123',type:'checkout.session.async_payment_succeeded',livemode:false,data:{object:f.session}}));
  const signature=new Stripe('rk_test_fixture').webhooks.generateTestHeaderString({payload:raw.toString(),secret:f.e.STRIPE_WEBHOOK_SECRET});
  const input={method:'POST',headers:{'stripe-signature':signature},async *[Symbol.asyncIterator](){yield raw;}};
  assert.equal((await f.call('stripe-webhook',input)).code,200);
  f.relayOk=false;assert.equal((await f.call('stripe-webhook',input)).code,503);
  assert.equal((await f.call('stripe-webhook',{...input,async *[Symbol.asyncIterator](){yield Buffer.alloc(65537);}})).code,413);
});
