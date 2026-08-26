/*
 * アイコンを作る:  node make-icon.js
 *
 * icon.png (1024×1024 の絵) を元に、必要な大きさへ焼き直す (要 playwright)。
 *   apple-touch-icon.png … 180×180 (iOS のホーム画面用。SVG は使えない)
 *   icon-192.png         … 192×192 (manifest / favicon 用)
 *   icon-512.png         … 512×512 (manifest 用)
 */
const path = require('node:path');
const fs = require('node:fs');

const SIZES = [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512]
];

async function main() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const src = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'icon.png')).toString('base64');

  for (const [file, size] of SIZES) {
    const dataUrl = await page.evaluate(async ({ src, size }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = size; cv.height = size;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, size, size);
      return cv.toDataURL('image/png');
    }, { src, size });
    fs.writeFileSync(path.join(__dirname, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(file, '(' + size + '×' + size + ') を作った');
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
