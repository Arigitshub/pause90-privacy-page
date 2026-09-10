const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const name of ['one-tiny-win.pdf', 'pocket-reset-kit.pdf']) {
  const file = path.join(root, 'private-products', name);
  if (!fs.existsSync(file) || fs.readFileSync(file).subarray(0,5).toString() !== '%PDF-') {
    throw new Error(`Missing approved PDF: private-products/${name}. Do not deploy or change live checkout.`);
  }
}
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
// Explicit allowlist: paid PDFs and server code can never enter static output.
for (const name of ['index.html', 'kit.html', 'one-tiny-win.html', 'Pause90_One_Tiny_Win_Sample_v1.pdf', 'one-tiny-win-preview.png', 'pocket-reset-kit-preview.png', 'make-a-task-smaller.html', 'sitemap.xml']) {
  fs.copyFileSync(path.join(root, name), path.join(root, 'public', name));
}
