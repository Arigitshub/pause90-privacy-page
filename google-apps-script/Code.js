// Runs in Google Apps Script, owned by ari532477@gmail.com.
// Store GMAIL_DELIVERY_TOKEN in Script Properties, never in this source file.
const P90_ORIGIN = 'https://pause90-pdf-delivery.vercel.app';
const P90_OWNER = 'ari532477@gmail.com';
const P90_OFFERS = ['plink_1UC6NeFUkdXDZAscCZfPzSQ4', 'plink_1UC07eFUkdXDZAscxNJnQkvk'];
const P90_TITLES = { 'one-tiny-win.pdf': 'One Tiny Win', 'pocket-reset-kit.pdf': 'Pocket Reset Kit' };

function installDelivery() {
  if (Session.getEffectiveUser().getEmail() !== P90_OWNER) throw new Error('Use the approved sender account.');
  const properties = PropertiesService.getScriptProperties();
  if ((properties.getProperty('GMAIL_DELIVERY_TOKEN') || '').length < 40)
    throw new Error('Configure the delivery token in Script Properties first.');
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'deliverPaidOrders'))
    ScriptApp.newTrigger('deliverPaidOrders').timeBased().everyMinutes(5).create();
  properties.setProperty('ENABLED', 'true');
  // Installing the trigger does not send email or make a test purchase.
}

function pauseDelivery() {
  PropertiesService.getScriptProperties().setProperty('ENABLED', 'false');
}

function deliverPaidOrders() {
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('ENABLED') !== 'true') return;
  if (Session.getEffectiveUser().getEmail() !== P90_OWNER) throw new Error('Unexpected sender account.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    // Stop before filling the property store. Never delete fulfilled-order IDs
    // automatically: old orders remain eligible for scans and must not resend.
    if (Utilities.newBlob(JSON.stringify(properties.getProperties())).getBytes().length > 400000)
      throw new Error('Delivery history needs migration to larger storage.');
    const token = properties.getProperty('GMAIL_DELIVERY_TOKEN');
    if (!token || token.length < 40) throw new Error('Delivery token missing.');
    const started = Date.now();
    const review = [];
    for (const link of P90_OFFERS) {
      const cursorKey = 'cursor_' + link;
      const cursor = properties.getProperty(cursorKey);
      const endpoint = P90_ORIGIN + '/api/gmail-orders?payment_link=' + encodeURIComponent(link) +
        (cursor ? '&starting_after=' + encodeURIComponent(cursor) : '');
      const response = UrlFetchApp.fetch(endpoint, {
        headers: { Authorization: 'Bearer ' + token }, followRedirects: false, muteHttpExceptions: true,
      });
      if (response.getResponseCode() !== 200) throw new Error('Unable to retrieve verified orders.');
      const page = JSON.parse(response.getContentText());
      if (!Array.isArray(page.orders)) throw new Error('Invalid order response.');
      for (const order of page.orders) {
        if (typeof order.id !== 'string' || !/^cs_live_[A-Za-z0-9]+$/.test(order.id) ||
            !Object.prototype.hasOwnProperty.call(P90_TITLES, order.filename))
          throw new Error('Invalid order data.');
        const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, order.id)
          .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
        const recordKey = 'order_' + hash;
        const state = properties.getProperty(recordKey);
        if (state === 'sent') continue;
        if (state) { review.push(hash.slice(0, 12)); continue; }
        if (Date.now() - started > 210000 || MailApp.getRemainingDailyQuota() < 1) return;
        if (typeof order.email !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(order.email)) {
          properties.setProperty(recordKey, 'needs_review_missing_email');
          review.push(hash.slice(0, 12)); continue;
        }
        // This endpoint rechecks payment/refund/dispute status immediately before download.
        const download = UrlFetchApp.fetch(P90_ORIGIN + '/api/download?session_id=' + encodeURIComponent(order.id),
          { followRedirects: false, muteHttpExceptions: true });
        if (download.getResponseCode() === 403) continue;
        if (download.getResponseCode() !== 200) throw new Error('Purchased PDF unavailable.');
        const bytes = download.getContent();
        if (bytes.length < 5 || String.fromCharCode.apply(null, bytes.slice(0, 5)) !== '%PDF-')
          throw new Error('Invalid PDF attachment.');
        const title = P90_TITLES[order.filename];
        const attachment = Utilities.newBlob(bytes, 'application/pdf', 'Pause90-' + order.filename);
        // MailApp has no idempotency key. Record the intent BEFORE sending. An
        // interrupted or uncertain send requires Sent-folder review, never blind retry.
        properties.setProperty(recordKey, 'sending_' + Date.now());
        try {
          MailApp.sendEmail({ to: order.email, name: 'Ari | Pause90', replyTo: P90_OWNER,
            subject: 'Your Pause90 ' + title + ' PDF',
            body: 'Thanks for purchasing ' + title + '. Your PDF is attached.\n\n' +
              'Save it to your phone or computer so you can open it whenever you need it. ' +
              'Start with one page and one small step.\n\n' +
              'If you have trouble opening the file, reply to this email and I will help.\n\n' +
              'Ari\nPause90\nOrder reference: ' + hash.slice(0, 12),
            attachments: [attachment] });
          properties.setProperty(recordKey, 'sent');
        } catch {
          properties.setProperty(recordKey, 'needs_review_send');
          review.push(hash.slice(0, 12));
        }
      }
      if (page.next) {
        if (!/^cs_live_[A-Za-z0-9]+$/.test(page.next)) throw new Error('Invalid next cursor.');
        properties.setProperty(cursorKey, page.next);
      } else {
        properties.deleteProperty(cursorKey);
      }
    }
    properties.setProperty('LAST_SCAN_AT', new Date().toISOString());
    if (review.length) throw new Error('Check delivery attempts for order references: ' + review.join(', '));
  } finally { lock.releaseLock(); }
}
