#!/usr/bin/env node
/*!
 * import-artifact.js — Claude のチャットで作ったアーティファクト (1 枚の HTML) を、
 * この雛形の形 (index.html / styles.css / app.js) に分けて置く。
 *
 *   node import-artifact.js <アーティファクトの HTML> [書き出す先のフォルダ (既定: ここ)]
 *
 * やること
 *   - <style> の中身を styles.css へ、ふつうの <script> の中身を app.js へ、
 *     type="module" の <script> の中身を app.module.js へ移し、読み込みに差し替える
 *   - iPhone のホーム画面から開いたとき帯の下まで描く指定 (CLAUDE.md の落とし穴) を足す
 *   - <!doctype>・charset・viewport・lang・アイコンが無ければ足す
 *   - HTML の断片 (<html> や <body> が無い) なら、骨組みで包む
 * やらないこと
 *   - React (JSX) のアーティファクトの変換。CLAUDE.md の「アーティファクトを取り込む」を見る
 *   - window.claude.* (Claude 側でしか動かない機能) の置き換え。見つけたら警告だけ出す
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_META = [
  ['apple-mobile-web-app-capable', 'yes'],
  ['apple-mobile-web-app-status-bar-style', 'black-translucent']
];

/** 属性の文字列から値を 1 つ取り出す (無ければ null)。 */
function attr(attrs, name) {
  const m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

/** 中身を「何もしない」とみなせる script の type (JSON やテンプレートなど) か。 */
function isDataScript(type) {
  if (!type) return false;
  const t = type.trim().toLowerCase();
  return !(t === 'text/javascript' || t === 'application/javascript' || t === 'module' || t === '');
}

/**
 * 1 枚の HTML を分ける。DOM を使わない (node でテストできる)。
 * @returns {{ html: string, css: string, js: string, moduleJs: string, warnings: string[] }}
 */
function splitArtifact(source) {
  let html = String(source).replace(/^\uFEFF/, '');
  const warnings = [];

  if (/^\s*(import|export)\s|from\s+['"]react['"]|<\w+[^>]*\bclassName=/m.test(html) && !/<html|<body|<head/i.test(html)) {
    throw new Error('React (JSX) のアーティファクトに見える。この道具では変換しない (CLAUDE.md の「アーティファクトを取り込む」)');
  }

  // 断片なら骨組みで包む
  if (!/<html[\s>]/i.test(html)) {
    if (!/<body[\s>]/i.test(html)) {
      const headBits = [];
      html = html.replace(/<(title|meta|link)\b[^>]*>(?:[^<]*<\/title>)?/gi, (m) => { headBits.push(m); return ''; });
      html = '<head>\n' + headBits.join('\n') + '\n</head>\n<body>\n' + html.trim() + '\n</body>';
    }
    html = '<html lang="ja">\n' + html + '\n</html>';
  }
  if (!/<head[\s>]/i.test(html)) html = html.replace(/<html\b[^>]*>/i, (m) => m + '\n<head>\n</head>');
  if (!/<body[\s>]/i.test(html)) {
    html = html.replace(/<\/head>/i, '</head>\n<body>').replace(/<\/html>/i, '</body>\n</html>');
  }

  // 1) <style> → styles.css (中身が空のものも消す)。最初にあった場所に <link> を置く
  const cssParts = [];
  let cssLinkPlaced = false;
  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (whole, attrs, body) => {
    const media = attr(attrs, 'media');
    const text = body.replace(/^\s*\n|\s+$/g, '');
    if (text) cssParts.push(media && media !== 'all' ? `@media ${media} {\n${text}\n}` : text);
    if (cssLinkPlaced) return '';
    cssLinkPlaced = true;
    return '<link rel="stylesheet" href="./styles.css">';
  });

  // 2) <script> → app.js / app.module.js。最後にあった場所に読み込みを置く (前後の外部 script との順番を保つため)
  const jsParts = [];
  const modParts = [];
  const scripts = [];
  html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (whole, attrs, body, offset) => {
    scripts.push({ whole, attrs, body, offset });
    return whole;
  });
  const inline = scripts.filter((s) => !attr(s.attrs, 'src') && !isDataScript(attr(s.attrs, 'type')) && s.body.trim());
  const classic = inline.filter((s) => (attr(s.attrs, 'type') || '').toLowerCase() !== 'module');
  const modules = inline.filter((s) => (attr(s.attrs, 'type') || '').toLowerCase() === 'module');

  // ふつうの script のあいだに外部 script が挟まっていると、まとめると順番が変わる
  if (classic.length > 1) {
    const first = classic[0].offset;
    const last = classic[classic.length - 1].offset;
    const between = scripts.filter((s) => attr(s.attrs, 'src') && s.offset > first && s.offset < last
      && (attr(s.attrs, 'type') || '').toLowerCase() !== 'module');
    if (between.length) {
      warnings.push('外部 script (' + between.map((s) => attr(s.attrs, 'src')).join(', ') +
        ') が埋め込みの script のあいだにある。app.js にまとめたので、読み込む順番が変わっていないか確かめること');
    }
  }

  const lastClassic = classic[classic.length - 1];
  const lastModule = modules[modules.length - 1];
  for (const s of classic) jsParts.push(s.body.replace(/^\s*\n|\s+$/g, ''));
  for (const s of modules) modParts.push(s.body.replace(/^\s*\n|\s+$/g, ''));

  // 後ろから置き換える (offset がずれないように)
  const targets = classic.concat(modules).sort((a, b) => b.offset - a.offset);
  for (const s of targets) {
    let replacement = '';
    if (s === lastClassic) {
      const defer = /\bdefer\b/i.test(s.attrs) ? ' defer' : '';
      replacement = `<script src="./app.js"${defer}></script>`;
    } else if (s === lastModule) {
      replacement = '<script type="module" src="./app.module.js"></script>';
    }
    html = html.slice(0, s.offset) + replacement + html.slice(s.offset + s.whole.length);
  }

  // 3) 頭に要るもの
  // 足すものは集めておき、最後に <head> の頭へ順番どおりに入れる (charset がいちばん先)
  const headFirst = [];
  const headRest = [];
  const head = (bits) => { headRest.push(bits); };
  const hasMeta = (name) => new RegExp('<meta\\b[^>]*name\\s*=\\s*["\']?' + name + '["\'\\s>]', 'i').test(html);

  if (!/<meta\b[^>]*name\s*=\s*["']?viewport/i.test(html)) {
    head('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
  } else {
    html = html.replace(/(<meta\b[^>]*name\s*=\s*["']?viewport["']?[^>]*content\s*=\s*["'])([^"']*)(["'])/i,
      (m, a, content, b) => (/viewport-fit\s*=/.test(content) ? m : a + content.replace(/\s*,?\s*$/, '') + ', viewport-fit=cover' + b));
  }
  for (const [name, value] of REQUIRED_META) {
    if (hasMeta(name)) {
      html = html.replace(new RegExp('(<meta\\b[^>]*name\\s*=\\s*["\']?' + name + '["\']?[^>]*content\\s*=\\s*["\'])([^"\']*)(["\'])', 'i'),
        (m, a, v, b) => a + value + b);
    } else {
      head(`<meta name="${name}" content="${value}">`);
    }
  }
  if (!hasMeta('theme-color')) {
    head('<meta name="theme-color" content="#151a2e">');
    warnings.push('theme-color が無かったので #151a2e を入れた。画面のいちばん上の色に合わせて直すこと');
  }
  if (!/<link\b[^>]*rel\s*=\s*["']?(?:shortcut )?icon/i.test(html)) {
    head('<link rel="icon" href="./icon.svg" type="image/svg+xml">');
  }
  // iOS のホーム画面は SVG を使えない。PNG は make-icon.js で作る
  if (!/<link\b[^>]*rel\s*=\s*["']?apple-touch-icon/i.test(html)) {
    head('<link rel="apple-touch-icon" href="./apple-touch-icon.png">');
  }
  if (!/<title\b/i.test(html)) {
    head('<title>アプリ</title>');
    warnings.push('<title> が無かったので「アプリ」にした');
  }
  if (!/<meta\b[^>]*charset/i.test(html)) headFirst.push('<meta charset="utf-8">');
  const added = headFirst.concat(headRest);
  if (added.length) html = html.replace(/<head\b[^>]*>/i, (m) => m + '\n' + added.join('\n'));
  if (!/<html\b[^>]*\blang\s*=/i.test(html)) html = html.replace(/<html\b/i, '<html lang="ja"');
  if (!/^\s*<!doctype html/i.test(html)) html = '<!DOCTYPE html>\n' + html.replace(/^\s*<!doctype[^>]*>\s*/i, '');

  const all = html + cssParts.join('\n') + jsParts.join('\n') + modParts.join('\n');
  if (/window\.claude\b/.test(all)) {
    warnings.push('window.claude を使っている。Claude の外では動かないので、置き換えが要る (保存なら localStorage など)');
  }
  if (!/safe-area-inset/.test(all)) {
    warnings.push('env(safe-area-inset-*) が無い。iPhone のホーム画面から開くと、上の端が時計や電池の帯の下にもぐる。上下に余白を足すこと');
  }
  if (/\b(?:localStorage|sessionStorage)\b/.test(all)) {
    warnings.push('localStorage を使っている。公開先のアドレスでは中身が空から始まる (アーティファクトで遊んだ記録は引き継がれない)');
  }

  return {
    html: html.replace(/\n{3,}/g, '\n\n'),
    css: cssParts.length ? cssParts.join('\n\n') + '\n' : '',
    js: jsParts.length ? jsParts.join('\n\n') + '\n' : '',
    moduleJs: modParts.length ? modParts.join('\n\n') + '\n' : '',
    warnings
  };
}

function main(argv) {
  const [input, outDir = __dirname] = argv;
  if (!input) {
    console.error('使い方: node import-artifact.js <アーティファクトの HTML> [書き出す先]');
    process.exit(2);
  }
  const result = splitArtifact(fs.readFileSync(input, 'utf8'));
  const write = (name, text) => {
    const file = path.join(outDir, name);
    fs.writeFileSync(file, text);
    console.log(`  書いた: ${name} (${Buffer.byteLength(text)} バイト)`);
  };
  fs.mkdirSync(outDir, { recursive: true });
  write('index.html', result.html);
  write('styles.css', result.css);
  write('app.js', result.js);
  if (result.moduleJs) write('app.module.js', result.moduleJs);
  else if (fs.existsSync(path.join(outDir, 'app.module.js'))) fs.unlinkSync(path.join(outDir, 'app.module.js'));
  for (const w of result.warnings) console.log('  \x1b[33m注意\x1b[0m ' + w);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { splitArtifact };
