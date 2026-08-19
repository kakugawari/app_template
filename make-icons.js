/*!
 * make-icons.js — icon.svg から、ホーム画面用の PNG を書き出す。
 *
 *   npm run icons
 *
 * iOS は apple-touch-icon に SVG を使えないので PNG が要る。
 * さらに iOS は渡された画像の角を自分で丸めるため、こちらで角を丸めた
 * PNG を渡すと、丸めた外側(透明)がそのまま黒く塗られて額縁のように残る。
 * なので PNG に書き出すときだけ、icon.svg の角丸 (rx) を外して正方形にする。
 *
 * ブラウザで実際に描かせて撮る。ラスタライザを別に入れずに済み、
 * 画面に出るのと同じ絵がそのまま PNG になる。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;

/** 書き出す大きさ。180 は iOS のホーム画面、192/512 は manifest 用 */
const TARGETS = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 }
];

async function main() {
  const svg = fs.readFileSync(path.join(ROOT, 'icon.svg'), 'utf8')
    // 角丸を外して正方形にする (理由は冒頭のコメント)
    .replace(/(<rect id="plate"[^>]*?)\srx="\d+"/, '$1');

  if (svg.includes('rx=')) {
    throw new Error('icon.svg の角丸 (rx) を外せなかった。rect id="plate" の書き方を確認する');
  }

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    for (const { file, size } of TARGETS) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1
      });
      await page.setContent(
        '<style>html,body{margin:0;padding:0}svg{display:block}</style>' +
        svg.replace(/width="512"\s+height="512"/, `width="${size}" height="${size}"`)
      );
      await page.locator('svg').screenshot({ path: path.join(ROOT, file) });
      await page.close();
      console.log(`${file} (${size}x${size})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
