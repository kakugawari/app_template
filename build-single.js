/*
 * 1 枚の HTML に焼く:  node build-single.js
 *
 *   shogi-quiz-dojo.html   … 公開用 (GitHub Pages に置く。ホーム画面に追加できる)
 *   dist-artifact.html     … Artifact 用 (<html>/<head>/<body> はあちらが用意する)
 *
 * CSS も JS も画面に出す絵も埋めこむので、1 ファイルだけで動く。
 *
 * ただし **ホーム画面用のアイコンだけは埋めこまない。** iOS は
 * apple-touch-icon に data: の絵を受けつけないので、本物の PNG ファイルを
 * 隣に置いて指し示す必要がある。公開用にはこの指定を残し、
 * Artifact 版 (PNG を隣に置けない) からは外す。
 */
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

/** GitHub Pages に index.html といっしょに置くファイル */
const DEPLOY_FILES = ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'app.webmanifest'];

function build() {
  const css = read('styles.css');
  const js = ['core.js', 'data.js', 'app.js'].map(read).join('\n')
    .replace(/\/\* build:strip-start[\s\S]*?build:strip-end \*\//g, '');
  // 画面に出す絵と favicon は icon-192.png (小さいほう) を埋めこむ。
  // 原寸の icon.png は 1MB を超えるので、ページの重さのためにここでは使わない。
  const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'icon-192.png')).toString('base64');

  const html = read('index.html')
    .replace('<link rel="stylesheet" href="./styles.css">', '<style>\n' + css + '\n</style>')
    .replace(/<link rel="icon"[^>]*>/, '<link rel="icon" href="' + icon + '" type="image/png">')
    .replace('src="./icon-192.png"', 'src="' + icon + '"')
    .replace(
      /<script src="\.\/core\.js"><\/script>\s*<script src="\.\/data\.js"><\/script>\s*<script src="\.\/app\.js"><\/script>/,
      '<script>\n' + js + '\n</script>'
    );

  // 焼きのこしがないか確かめる。隣に置くファイル (アイコンと manifest) だけは
  // 参照が残っていてよいので、そこは見のがす。
  const left = (html.match(/(src|href)="\.\/([^"]+)"/g) || [])
    .filter((m) => !DEPLOY_FILES.some((f) => m.endsWith('/' + f + '"')));
  if (left.length) throw new Error('埋めこめていないファイルがある: ' + left.join(' '));

  fs.writeFileSync(path.join(__dirname, 'shogi-quiz-dojo.html'), html);

  // Artifact 版: <html>/<head>/<body> は向こうが用意するので中身だけ渡す。
  // PNG を隣に置けないので、そこを指している行はここで落とす。
  const stripped = html
    .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
    .replace(/\s*<link rel="manifest"[^>]*>/, '');
  const head = stripped.slice(stripped.indexOf('<title>'), stripped.indexOf('</head>'));
  const body = stripped.slice(stripped.indexOf('<body>') + 6, stripped.lastIndexOf('</body>'));
  fs.writeFileSync(path.join(__dirname, 'dist-artifact.html'), head.trim() + '\n' + body.trim() + '\n');

  const kb = (f) => Math.round(fs.statSync(path.join(__dirname, f)).size / 1024) + ' KB';
  console.log('shogi-quiz-dojo.html', kb('shogi-quiz-dojo.html'), '(+ 隣に置くファイル:', DEPLOY_FILES.join(' '), ')');
  console.log('dist-artifact.html  ', kb('dist-artifact.html'));
}

build();
