// Runs in Apps Script as ari532477@gmail.com. NEVER commit delivery secrets here.
// GMAIL_DELIVERY_TOKEN must be stored in Script Properties and Vercel sensitive env.
const P90_ORIGIN = 'https://pause90-pdf-delivery.vercel.app';
const P90_OWNER = 'ari532477@gmail.com';
const P90_OFFERS = [
  'plink_1UC6NeFUkdXDZAscCZfPzSQ4',
  'plink_1UC07eFUkdXDZAscxNJnQkvk',
  'plink_1UPUhuFUkdXDZAscmOmda3aw',
  'plink_1UPUi3FUkdXDZAsc6WpS7cnF',
];
const P90_TITLES = {
  'one-tiny-win.pdf': 'One Tiny Win',
  'pocket-reset-kit.pdf': 'Pocket Reset Kit',
  'client-ready-kickoff-kit.zip': 'Client-Ready: The Freelancer Project Kickoff Kit',
  'solo-income-planner.pdf': 'The Solo Income Planner',
};
const P90_LINKED = ['client-ready-kickoff-kit.zip', 'solo-income-planner.pdf'];

function p90Hash(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function p90Output(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
function p90Hmac(value,secret) {
  return Utilities.computeHmacSha256Signature(value,secret)
    .map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');
}
function p90EqualHex(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length) return false;
  let unequal=0;
  for(let i=0;i<a.length;i++) unequal |= (a.charCodeAt(i)^b.charCodeAt(i));
  return unequal===0;
}
// Called by Vercel only AFTER Stripe signature verification. This does not send
// mail itself: enqueue under a lock, acknowledge fast, worker rechecks purchase.
function doPost(event) {
  try {
    if(Session.getEffectiveUser().getEmail()!==P90_OWNER) return p90Output({ok:false});
    const props=PropertiesService.getScriptProperties();
    if(props.getProperty('ENABLED')!=='true') return p90Output({ok:false});
    const secret=props.getProperty('GMAIL_DELIVERY_TOKEN');
    if(!secret||secret.length<40) return p90Output({ok:false});
    const body=JSON.parse(event.postData.contents);
    if(!Number.isSafeInteger(body.ts)||Math.abs(Math.floor(Date.now()/1000)-body.ts)>300||
       !/^cs_live_[A-Za-z0-9]+$/.test(body.session_id||'')||
       !/^evt_[A-Za-z0-9]+$/.test(body.event_id||'')||
       !/^[0-9a-f]{64}$/.test(body.sig||'')) return p90Output({ok:false});
    const message='p90-webhook-v1:'+body.ts+':'+body.session_id+':'+body.event_id;
    if(!p90EqualHex(p90Hmac(message,secret),body.sig)) return p90Output({ok:false});
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(2000)) return p90Output({ok:false});
    try {
      if(Utilities.newBlob(JSON.stringify(props.getProperties())).getBytes().length>400000)
        return p90Output({ok:false});
      const orderHash=p90Hash(body.session_id);
      if(props.getProperty('order_'+orderHash)!=='sent')
        props.setProperty('queue_'+orderHash, body.session_id);
      props.setProperty('LAST_WEBHOOK_AT',new Date().toISOString());
    } finally {lock.releaseLock();}
    return p90Output({ok:true});
  } catch {return p90Output({ok:false});}
}

function installDelivery() {
  if(Session.getEffectiveUser().getEmail()!==P90_OWNER) throw new Error('Use approved sender account.');
  const props=PropertiesService.getScriptProperties();
  if((props.getProperty('GMAIL_DELIVERY_TOKEN')||'').length<40)
    throw new Error('Configure GMAIL_DELIVERY_TOKEN in Script Properties first.');
  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='deliverPaidOrders'))
    ScriptApp.newTrigger('deliverPaidOrders').timeBased().everyMinutes(5).create();
  props.setProperty('ENABLED','true');
}
function pauseDelivery() {PropertiesService.getScriptProperties().setProperty('ENABLED','false');}

function p90FetchEmailLink(sessionId, token) {
  const response=UrlFetchApp.fetch(P90_ORIGIN+'/api/email-link', {
    method:'post',contentType:'application/json',
    payload:JSON.stringify({session_id:sessionId}),
    headers:{Authorization:'Bearer '+token},followRedirects:false,muteHttpExceptions:true,
  });
  if(response.getResponseCode()===403) return null;
  if(response.getResponseCode()!==200) throw new Error('Email recovery link unavailable');
  const data=JSON.parse(response.getContentText());
  if(data.id!==sessionId || P90_LINKED.indexOf(data.filename)<0 ||
     typeof data.url!=='string' || !data.url.startsWith(P90_ORIGIN+'/api/redeem?token=') ||
     data.expires_after_seconds!==72*3600 ||
     typeof data.email!=='string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(data.email))
    throw new Error('Invalid email delivery response');
  return data;
}

// Never send twice on uncertain outcomes. The hash is stable across webhook replays
// and reconciliation scans. The saved state is preserved indefinitely.
function p90SendOrder(order, token, props) {
  if(typeof order.id!=='string'||!/^cs_live_[A-Za-z0-9]+$/.test(order.id))
    throw new Error('Invalid Stripe order ID');
  const hash=p90Hash(order.id), key='order_'+hash;
  const prior=props.getProperty(key);
  if(prior==='sent') return true;
  if(prior) throw new Error('Manual delivery review needed for '+hash.slice(0,12));
  let email=order.email, filename=order.filename, body, attachment=null;
  if(!filename) { // Webhook queue knows the session but never trusts its claimed product.
    const info=p90FetchEmailLink(order.id,token);
    if(!info) return false;
    email=info.email; filename=info.filename;
  }
  if(!Object.prototype.hasOwnProperty.call(P90_TITLES,filename))
    throw new Error('Unexpected product');
  const title=P90_TITLES[filename];
  if(P90_LINKED.indexOf(filename)!==-1) {
    const info=p90FetchEmailLink(order.id,token); // Fresh Stripe verification before send.
    if(!info) return false;
    if(info.filename!==filename || (email && info.email.toLowerCase()!==email.toLowerCase()))
      throw new Error('Order email/product mismatch');
    email=info.email;
    body='Thanks for purchasing '+title+'.\n\nDownload your file here (link valid for 72 hours):\n'+
      info.url+'\n\nIf your link expires, reply to this email for help.\n\nAri\nThe New Mind AI';
  } else {
    const url=P90_ORIGIN+'/api/download?session_id='+encodeURIComponent(order.id);
    const download=UrlFetchApp.fetch(url,{followRedirects:false,muteHttpExceptions:true});
    if(download.getResponseCode()===403) return false;
    if(download.getResponseCode()!==200) throw new Error('Legacy paid PDF unavailable');
    const bytes=download.getContent();
    if(bytes.length<5||String.fromCharCode.apply(null,bytes.slice(0,5))!=='%PDF-')
      throw new Error('Invalid PDF');
    attachment=Utilities.newBlob(bytes,'application/pdf','Pause90-'+filename);
    body='Thanks for purchasing '+title+'. Your PDF is attached.\n\n'+
      'Save it to your phone or computer for later use.\n\nAri\nPause90';
  }
  if(typeof email!=='string'||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    props.setProperty(key,'needs_review_missing_email');
    throw new Error('Missing buyer email for '+hash.slice(0,12));
  }
  if(MailApp.getRemainingDailyQuota()<1) throw new Error('Mail quota reached');
  props.setProperty(key,'sending_'+Date.now());
  try {
    MailApp.sendEmail({to:email,name:'Ari | Pause90',replyTo:P90_OWNER,
      subject:'Your '+title+' download',body:body+'\nOrder reference: '+hash.slice(0,12),
      ...(attachment?{attachments:[attachment]}:{})});
    props.setProperty(key,'sent');
    return true;
  } catch {
    props.setProperty(key,'needs_review_send');
    throw new Error('Delivery attempt uncertain for '+hash.slice(0,12));
  }
}

function deliverPaidOrders() {
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('ENABLED')!=='true') return;
  if(Session.getEffectiveUser().getEmail()!==P90_OWNER) throw new Error('Wrong sender');
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000)) return;
  try {
    if(Utilities.newBlob(JSON.stringify(props.getProperties())).getBytes().length>400000)
      throw new Error('Fulfillment state needs larger storage; stop safely.');
    const token=props.getProperty('GMAIL_DELIVERY_TOKEN');
    if(!token||token.length<40) throw new Error('Delivery token missing');
    const started=Date.now();
    // Webhook hints first. Each order is freshly checked against Stripe by Vercel.
    const review=[];
    const queued=Object.keys(props.getProperties()).filter(k=>k.startsWith('queue_'));
    for(const q of queued) {
      if(Date.now()-started>210000) return;
      const sid=props.getProperty(q);
      if(!/^cs_live_[A-Za-z0-9]+$/.test(sid||'')) throw new Error('Invalid queued ID');
      try {
        if(p90SendOrder({id:sid},token,props)) props.deleteProperty(q);
      } catch { review.push(p90Hash(sid).slice(0,12)); }
    }
    // Independent reconciliation catches deliveries missed by webhook or failed relay.
    for(const link of P90_OFFERS) {
      if(Date.now()-started>210000) return;
      const cursorKey='cursor_'+link, cursor=props.getProperty(cursorKey);
      const endpoint=P90_ORIGIN+'/api/gmail-orders?payment_link='+encodeURIComponent(link)+
        (cursor?'&starting_after='+encodeURIComponent(cursor):'');
      const response=UrlFetchApp.fetch(endpoint,{
        headers:{Authorization:'Bearer '+token},followRedirects:false,muteHttpExceptions:true,
      });
      if(response.getResponseCode()!==200) throw new Error('Verified orders unavailable');
      const page=JSON.parse(response.getContentText());
      if(!Array.isArray(page.orders)) throw new Error('Invalid order response');
      for(const order of page.orders) {
        if(Date.now()-started>210000) return;
        try {p90SendOrder(order,token,props);}
        catch {review.push(p90Hash(order.id).slice(0,12));}
      }
      if(page.next) {
        if(!/^cs_live_[A-Za-z0-9]+$/.test(page.next)) throw new Error('Invalid cursor');
        props.setProperty(cursorKey,page.next);
      } else props.deleteProperty(cursorKey);
    }
    props.setProperty('LAST_SCAN_AT',new Date().toISOString());
    if(review.length) throw new Error('Review delivery attempts: '+[...new Set(review)].join(', '));
  } finally {lock.releaseLock();}
}
