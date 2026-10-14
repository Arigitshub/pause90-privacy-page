const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {signEnvelope}=require('../lib/webhook-relay.cjs');
const code=fs.readFileSync(path.join(__dirname,'Code.js'),'utf8');
const secret='local-only-mock-secret-'+ 'z'.repeat(64);
const sid='cs_live_1Aaa111test';
function fixture({mode='live',sessionId=sid,filename='solo-income-planner.pdf',failMail=false} = {}) {
  const props=new Map([['ENABLED','true'],['GMAIL_DELIVERY_TOKEN',secret]]);
  if(mode === 'test') {
    props.set('DELIVERY_MODE','test');
    props.set('DELIVERY_PUBLIC_ORIGIN','https://pause90-fixture-preview.vercel.app');
    props.set('TEST_PAYMENT_LINKS',JSON.stringify(['plink_TestPlanner','plink_TestKit']));
  }
  let sends=0, fetched=0, recipient=null;
  const properties={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,String(v)),
    deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)};
  const context={
    Date,Math,JSON,Object,String,Array,Number,
    Session:{getEffectiveUser:()=>({getEmail:()=> 'ari532477@gmail.com'})},
    PropertiesService:{getScriptProperties:()=>properties},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},
      computeDigest:(_alg,value)=>[...crypto.createHash('sha256').update(value).digest()],
      computeHmacSha256Signature:(value,key)=>[...crypto.createHmac('sha256',key).update(value).digest()],
      newBlob:(value)=>({getBytes:()=>[...Buffer.from(value)]})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:(str)=>({value:str,setMimeType(){return this;}})},
    UrlFetchApp:{fetch:(url,opts)=>{
      fetched++;
      let response={};
      if(url.endsWith('/api/email-link')) response={id:sessionId,email:'buyer@example.org',filename,
        url:(mode === 'test' ? props.get('DELIVERY_PUBLIC_ORIGIN') : 'https://pause90-pdf-delivery.vercel.app')+'/api/redeem?token=mockgrant',expires_after_seconds:259200};
      else if(url.includes('/api/gmail-orders?')) response={orders:[],next:null};
      else throw Error('Unexpected fetch '+url);
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(response)};
    }},
    MailApp:{getRemainingDailyQuota:()=>50,sendEmail:message=>{sends++;recipient=message.to;if(failMail)throw Error('Mock mail uncertainty');}},
    ScriptApp:{getProjectTriggers:()=>[],newTrigger:()=>({timeBased:()=>({everyMinutes:()=>({create:()=>{}})})})},
  };
  vm.createContext(context);
  vm.runInContext(code,context,{filename:'Code.js'});
  return {context,props,get sends(){return sends},get fetched(){return fetched},get recipient(){return recipient}};
}
test('signed webhook is accepted and replay is deduplicated into one session queue',()=>{
  const f=fixture(); const envelope=signEnvelope(sid,'evt_123456abc',secret);
  const call=()=>JSON.parse(f.context.doPost({postData:{contents:JSON.stringify(envelope)}}).value);
  assert.equal(call().ok,true);
  assert.equal(call().ok,true);
  assert.equal([...f.props.keys()].filter(k=>k.startsWith('queue_')).length,1);
});
test('forged webhook is rejected without enqueuing',()=>{
  const f=fixture();const envelope=signEnvelope(sid,'evt_123456abc',secret);
  const result=JSON.parse(f.context.doPost({postData:{contents:JSON.stringify({...envelope,sig:'f'.repeat(64)})}}).value);
  assert.equal(result.ok,false);
  assert.equal([...f.props.keys()].filter(k=>k.startsWith('queue_')).length,0);
});
test('webhook queue triggers once-only email after independent Stripe verification endpoint',()=>{
  const f=fixture();const envelope=signEnvelope(sid,'evt_123456abc',secret);
  assert.equal(JSON.parse(f.context.doPost({postData:{contents:JSON.stringify(envelope)}}).value).ok,true);
  f.context.deliverPaidOrders();
  assert.equal(f.sends,1);
  assert.equal([...f.props.keys()].some(k=>k.startsWith('order_')&&f.props.get(k)==='sent'),true);
  assert.equal([...f.props.keys()].some(k=>k.startsWith('queue_')),false);
  f.context.deliverPaidOrders();
  assert.equal(f.sends,1);
});

for(const filename of ['solo-income-planner.pdf','client-ready-kickoff-kit.zip']) {
  test('isolated sandbox queues and emails only the owner once: '+filename,()=>{
    const sessionId='cs_test_Sandbox123';
    const f=fixture({mode:'test',sessionId,filename});
    const envelope=signEnvelope(sessionId,'evt_Sandbox123',secret);
    const post=()=>JSON.parse(f.context.doPost({postData:{contents:JSON.stringify(envelope)}}).value);
    assert.equal(post().ok,true);f.context.deliverPaidOrders();
    assert.equal(f.sends,1);assert.equal(f.recipient,'ari532477@gmail.com');
    assert.equal(post().ok,true);f.context.deliverPaidOrders();assert.equal(f.sends,1);
  });
}
test('live Script rejects test IDs; sandbox rejects live IDs and production origin',()=>{
  const post=(f,id)=>JSON.parse(f.context.doPost({postData:{contents:JSON.stringify(signEnvelope(id,'evt_Mode123',secret))}}).value);
  assert.equal(post(fixture(),'cs_test_Mode123').ok,false);
  const f=fixture({mode:'test',sessionId:'cs_test_Mode123'});
  assert.equal(post(f,sid).ok,false);
  f.props.set('DELIVERY_PUBLIC_ORIGIN','https://pause90-pdf-delivery.vercel.app');
  assert.equal(post(f,'cs_test_Mode123').ok,false);
  assert.equal(f.sends,0);
});
test('uncertain email attempt is marked for review and never automatically retried',()=>{
  const f=fixture({failMail:true});
  const post=()=>f.context.doPost({postData:{contents:JSON.stringify(signEnvelope(sid,'evt_Fail123',secret))}});
  post();assert.throws(()=>f.context.deliverPaidOrders());
  assert.equal(f.sends,1);
  assert.equal([...f.props.values()].includes('needs_review_send'),true);
  post();assert.throws(()=>f.context.deliverPaidOrders());assert.equal(f.sends,1);
});
