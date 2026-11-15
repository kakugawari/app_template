/*
 * make-icon.js — icon.svg から、iPhone のホーム画面用の PNG (apple-touch-icon.png, 180x180) を作る。
 *
 *   node make-icon.js                         → apple-touch-icon.png (180)
 *   node make-icon.js icon-180.png:180 icon-192.png:192 icon-512.png:512   → 名前と大きさを指定して作る
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
  const jobs = process.argv.slice(2).map((a) => { const [name, size] = a.split(':'); return { name, size: Number(size) || 180 }; });
  if (!jobs.length) jobs.push({ name: 'apple-touch-icon.png', size: 180 });
  for (const { name, size } of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg style="width:${size}px;height:${size}px;display:block" `)}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(__dirname, name);
    await page.screenshot({ path: out, omitBackground: false });
    await page.close();
    console.log(`書いた: ${name} (${size}x${size}, ${fs.statSync(out).size} バイト)`);
  }
  await browser.close();
})();
