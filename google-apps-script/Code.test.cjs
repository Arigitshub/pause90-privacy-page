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
function fixture() {
  const props=new Map([['ENABLED','true'],['GMAIL_DELIVERY_TOKEN',secret]]);
  let sends=0, fetched=0;
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
      if(url.endsWith('/api/email-link')) response={id:sid,email:'buyer@example.org',filename:'solo-income-planner.pdf',
        url:'https://pause90-pdf-delivery.vercel.app/api/redeem?token=mockgrant',expires_after_seconds:259200};
      else if(url.includes('/api/gmail-orders?')) response={orders:[],next:null};
      else throw Error('Unexpected fetch '+url);
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(response)};
    }},
    MailApp:{getRemainingDailyQuota:()=>50,sendEmail:()=>{sends++;}},
    ScriptApp:{getProjectTriggers:()=>[],newTrigger:()=>({timeBased:()=>({everyMinutes:()=>({create:()=>{}})})})},
  };
  vm.createContext(context);
  vm.runInContext(code,context,{filename:'Code.js'});
  return {context,props,get sends(){return sends},get fetched(){return fetched}};
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
