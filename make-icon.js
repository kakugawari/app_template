/*
 * make-icon.js — icon.svg から、iPhone のホーム画面用の PNG (apple-touch-icon.png, 180x180) を作る。
 *
 *   node make-icon.js
 *
 * iOS は apple-touch-icon に SVG を使えない (CLAUDE.md の落とし穴)。
 * 角は iOS が丸めるので、PNG は角を丸めず四角いまま塗りつぶす (透けた角は黒く出る)。
 * icon.svg を描き替えたら、これをもう一度流す。
 */
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const { chromium } = require('playwright');
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8')
    .replace(/(<rect\b[^>]*?)\s+rx="[^"]*"/, '$1');   // いちばん外の地だけ角を四角に
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', '<svg style="width:180px;height:180px;display:block" ')}</body></html>`);
  const out = path.join(__dirname, 'apple-touch-icon.png');
  await page.screenshot({ path: out, omitBackground: false });
  await browser.close();
  console.log('書いた: apple-touch-icon.png (' + fs.statSync(out).size + ' バイト)');
})();
