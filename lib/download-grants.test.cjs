const { test } = require('node:test');
const assert = require('node:assert/strict');
const { signGrant, verifyGrant } = require('./download-grants.cjs');
const secret='TEST_ONLY_'+'y'.repeat(64);
const sid='cs_live_1234567890Abcdef';
test('signed token authenticates and expires',()=>{
  const token=signGrant(sid,'solo-income-planner.pdf',secret,100000,900);
  assert.deepEqual(verifyGrant(token,secret,100100),{sessionId:sid,filename:'solo-income-planner.pdf',expiresAt:100900});
  assert.equal(verifyGrant(token,secret,100900),null);
  assert.equal(verifyGrant(token,secret+'z',100100),null);
});
test('tampered signed token or wrong product rejected',()=>{
  const token=signGrant(sid,'client-ready-kickoff-kit.zip',secret,100000);
  assert.equal(verifyGrant(token+'x',secret,100100),null);
  assert.throws(()=>signGrant(sid,'../../secrets.txt',secret,100000));
  assert.throws(()=>signGrant(sid,'client-ready-kickoff-kit.zip',secret,100000,3*24*3600+1));
});
