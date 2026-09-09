const { readFile } = require('node:fs/promises');
const path = require('node:path');
const titles = Object.freeze({
  'one-tiny-win.pdf': 'One Tiny Win',
  'pocket-reset-kit.pdf': 'Pocket Reset Kit',
});

async function emailPayload(session, filename, from) {
  const title = titles[filename];
  const to = session.customer_details?.email;
  if (!title || typeof to !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to))
    throw new Error('Delivery address unavailable');
  if (typeof from !== 'string' || /[\r\n]/.test(from) || !from.includes('@'))
    throw new Error('Sender unavailable');
  const pdf = await readFile(path.join(process.cwd(), 'private-products', filename));
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Product unavailable');
  return {
    from, to: [to], reply_to: 'arimail@duck.com',
    subject: `Your Pause90 ${title} PDF`,
    text: `Thanks for purchasing ${title}. Your PDF is attached.\n\nSave it to your phone or computer so you can open it whenever you need it. Start with one page and one small step.\n\nIf you have trouble opening the file, reply to this email and I'll help.\n\nAri\nPause90`,
    attachments: [{ filename: `Pause90-${filename}`, content: pdf.toString('base64') }],
  };
}
module.exports = { emailPayload };
