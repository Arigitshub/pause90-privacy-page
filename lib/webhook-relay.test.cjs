const {test}=require('node:test');
const assert=require('node:assert/strict');
const {signEnvelope,verifyEnvelope}=require('./webhook-relay.cjs');
const key='development-test-key-'+'r'.repeat(64);
const sid='cs_live_123Aabb098';const evt='evt_1Cce1234433';
test('webhook relay signs and validates',()=>{
  const env=signEnvelope(sid,evt,key,987654);
  assert.equal(verifyEnvelope(env,key,987700),true);
  assert.equal(verifyEnvelope(env,key,988001),false);
});
test('webhook relay denies altered or unknown sessions',()=>{
  const env=signEnvelope(sid,evt,key,987654);
  assert.equal(verifyEnvelope({...env,event_id:'evt_Changed'},key,987700),false);
  assert.equal(verifyEnvelope({...env,sig:'a'.repeat(64)},key,987700),false);
  assert.throws(()=>signEnvelope('cs_unknown_123',evt,key,987654));
});
