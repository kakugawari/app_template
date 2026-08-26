/*
 * 1 枚の HTML に焼く:  node build-single.js
 *
 *   shogi-quiz-dojo.html   … そのまま開ける 1 ファイル版 (テストプレイ用に配る)
 *   dist-artifact.html     … Artifact 用 (<html>/<head>/<body> はあちらが用意する)
 *
 * CSS も JS もアイコンも埋めこむので、ネットにつながらなくても
 * (Google フォントが当たらないだけで) そのまま動く。
 */
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

function build() {
  const css = read('styles.css');
  const js = ['core.js', 'data.js', 'app.js'].map(read).join('\n')
    .replace(/\/\* build:strip-start[\s\S]*?build:strip-end \*\//g, '');
  const icon = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(__dirname, 'icon.svg')).toString('base64');

  let html = read('index.html')
    .replace('<link rel="stylesheet" href="./styles.css">', '<style>\n' + css + '\n</style>')
    .replace(/<link rel="icon"[^>]*>/, '<link rel="icon" href="' + icon + '" type="image/svg+xml">')
    .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
    .replace(/\s*<link rel="manifest"[^>]*>/, '')
    .replace(
      /<script src="\.\/core\.js"><\/script>\s*<script src="\.\/data\.js"><\/script>\s*<script src="\.\/app\.js"><\/script>/,
      '<script>\n' + js + '\n</script>'
    );

  // 焼きのこしがないか確かめる (外に取りにいくのはフォントだけ)
  const left = html.match(/(src|href)="\.\/[^"]+"/g);
  if (left) throw new Error('埋めこめていないファイルがある: ' + left.join(' '));

  fs.writeFileSync(path.join(__dirname, 'shogi-quiz-dojo.html'), html);

  // Artifact 版: <html>/<head>/<body> は向こうが用意するので、中身だけ渡す
  const head = html.slice(html.indexOf('<title>'), html.indexOf('</head>'));
  const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
  fs.writeFileSync(path.join(__dirname, 'dist-artifact.html'), head.trim() + '\n' + body.trim() + '\n');

  const kb = (f) => Math.round(fs.statSync(path.join(__dirname, f)).size / 1024) + ' KB';
  console.log('shogi-quiz-dojo.html', kb('shogi-quiz-dojo.html'));
  console.log('dist-artifact.html  ', kb('dist-artifact.html'));
}

build();
