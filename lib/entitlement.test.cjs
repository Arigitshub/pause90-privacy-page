const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entitledFile } = require('./entitlement.cjs');
const paid = () => ({payment_link:'plink_1UC6NeFUkdXDZAscCZfPzSQ4',livemode:true,mode:'payment',status:'complete',payment_status:'paid',currency:'usd',amount_total:300,payment_intent:{latest_charge:{paid:true,refunded:false,amount_refunded:0,disputed:false}}});
test('legacy paid products still authorize their respective PDF',()=>{
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
const newPaid=(link,amount)=>({...paid(),payment_link:link,amount_total:amount});
const kit = ()=>[{price:{id:'price_1UPUhuFUkdXDZAscQGurjoEa',product:'prod_VQLOboh1xHZ5ji'},quantity:1,amount_total:1200}];
const planner = ()=>[{price:{id:'price_1UPUi3FUkdXDZAscePDC1gnN',product:'prod_VQLOhNHTVd6EPa'},quantity:1,amount_total:900}];
test('both new products require exact Stripe price AND product AND paid charge',()=>{
  assert.equal(entitledFile(newPaid('plink_1UPUhuFUkdXDZAscmOmda3aw',1200),true,undefined,kit()),'client-ready-kickoff-kit.zip');
  assert.equal(entitledFile(newPaid('plink_1UPUi3FUkdXDZAsc6WpS7cnF',900),true,undefined,planner()),'solo-income-planner.pdf');
});
test('new products reject missing or mismatched line items even at correct total',()=>{
  const s=newPaid('plink_1UPUhuFUkdXDZAscmOmda3aw',1200);
  assert.equal(entitledFile(s,true),null);
  assert.equal(entitledFile(s,true,undefined,planner()),null);
  const changes=[[],[{...kit()[0],quantity:2}], [{...kit()[0],amount_total:900}], [{...kit()[0],price:{...kit()[0].price,id:'price_other'}}], [{...kit()[0],price:{...kit()[0].price,product:'prod_other'}}], [kit()[0],kit()[0]]];
  for(const items of changes) assert.equal(entitledFile(s,true,undefined,items),null);
});
