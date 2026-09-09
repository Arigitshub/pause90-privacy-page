const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entitledFile } = require('./entitlement.cjs');
const paid = () => ({payment_link:'plink_1UC6NeFUkdXDZAscCZfPzSQ4',livemode:true,mode:'payment',status:'complete',payment_status:'paid',currency:'usd',amount_total:300,payment_intent:{latest_charge:{paid:true,refunded:false,amount_refunded:0,disputed:false}}});
test('matching paid live order gets only its purchased file',()=>{
  assert.equal(entitledFile(paid(),true),'one-tiny-win.pdf');
  assert.equal(entitledFile({...paid(),payment_link:'plink_1UC07eFUkdXDZAscxNJnQkvk',amount_total:900},true),'pocket-reset-kit.pdf');
});
test('reject unpaid, unrelated, underpaid, foreign currency, subscriptions and wrong mode',()=>{
  for(const change of [{status:'open'},{payment_status:'unpaid'},{payment_link:'other'},{amount_total:0},{currency:'eur'},{mode:'subscription'},{livemode:false},{payment_intent:null}])
    assert.equal(entitledFile({...paid(),...change},true),null);
});
test('reject refunded, partially refunded, disputed, unexpanded or missing charge',()=>{
  for(const change of [{refunded:true},{amount_refunded:1},{disputed:true},{paid:false}]) {
    const s=paid(); Object.assign(s.payment_intent.latest_charge,change); assert.equal(entitledFile(s,true),null);
  }
  assert.equal(entitledFile({...paid(),payment_intent:{latest_charge:'ch_example'}},true),null);
});
