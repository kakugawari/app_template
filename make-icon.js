/*
 * アイコンを作る:  node make-icon.js
 *
 * iOS のホーム画面は SVG のアイコンを使えないので、icon.svg を
 * ブラウザで描いて apple-touch-icon.png に焼き直す (要 playwright)。
 */
const path = require('node:path');
const fs = require('node:fs');

async function main() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
  await page.setContent(
    '<body style="margin:0;background:#16223c">' +
    svg.replace('<svg ', '<svg width="180" height="180" ') + '</body>'
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, 'apple-touch-icon.png'), omitBackground: false });
  await browser.close();
  console.log('apple-touch-icon.png を作った');
}

main().catch((e) => { console.error(e); process.exit(1); });
