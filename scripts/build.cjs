const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
for (const name of ['one-tiny-win.pdf', 'pocket-reset-kit.pdf']) {
  const file = path.join(root, 'private-products', name);
  if (!fs.existsSync(file) || fs.readFileSync(file).subarray(0,5).toString() !== '%PDF-')
    throw new Error(`Missing approved PDF: private-products/${name}. Do not deploy or change live checkout.`);
}
// New assets are intentionally untracked server-only Vercel deployment assets.
const protectedAssets = {
  'solo-income-planner.pdf': '51049e292f1ffd75900ec102b71571478ecc231e0c8c90c1711c1dcbcdba4258',
  'client-ready-kickoff-kit.zip': 'ea4666ab15a7f7413d465fa4cb8725d6774358679c1c3be3118d4d81a4aff7b6',
};
for (const [name,expected] of Object.entries(protectedAssets)) {
  const file=path.join(root,'private-products',name);
  if (!fs.existsSync(file) || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected)
    throw new Error(`Missing or changed private product ${name}. Do not deploy or update Stripe links.`);
}
fs.rmSync(path.join(root, 'public'), { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
// Only public marketing assets; paid products and server code never copied.
for (const name of ['index.html', 'privacy.html', 'kit.html', 'one-tiny-win.html', 'Pause90_One_Tiny_Win_Sample_v1.pdf', 'one-tiny-win-preview.png', 'pocket-reset-kit-preview.png', 'make-a-task-smaller.html', 'sitemap.xml', '759d9d15023d4a54875c45e4e2fff712.txt']) {
  fs.copyFileSync(path.join(root, name), path.join(root, 'public', name));
}
