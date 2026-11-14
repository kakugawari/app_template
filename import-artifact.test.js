const test = require('node:test');
const assert = require('node:assert');
const { splitArtifact } = require('./import-artifact.js');

const FULL = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>はかり</title>
<style>
:root { --bg: #111; }
body { background: var(--bg); }
</style>
<style media="(prefers-color-scheme: light)">:root { --bg: #fff; }</style>
</head>
<body>
<h1>はかり</h1>
<script src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js"></script>
<script type="application/json" id="data">{"a":1}</script>
<script>
const a = 1;
</script>
<script>
console.log(a);
</script>
</body>
</html>`;

test('style と script を外へ出し、読み込みに差し替える', () => {
  const r = splitArtifact(FULL);
  assert.match(r.css, /--bg: #111/);
  assert.match(r.css, /@media \(prefers-color-scheme: light\) \{\n:root \{ --bg: #fff; \}\n\}/);
  assert.strictEqual(r.js, 'const a = 1;\n\nconsole.log(a);\n');
  assert.doesNotMatch(r.html, /<style/);
  assert.strictEqual((r.html.match(/href="\.\/styles\.css"/g) || []).length, 1);
  assert.strictEqual((r.html.match(/src="\.\/app\.js"/g) || []).length, 1);
  assert.strictEqual(r.moduleJs, '');
});

test('外部 script とデータの script は残し、順番を保つ', () => {
  const r = splitArtifact(FULL);
  const lib = r.html.indexOf('lodash.min.js');
  const app = r.html.indexOf('./app.js');
  assert.ok(lib > 0 && app > lib, '外部ライブラリが app.js より先に読まれる');
  assert.match(r.html, /<script type="application\/json" id="data">\{"a":1\}<\/script>/);
});

test('iPhone のホーム画面用の指定を足す (CLAUDE.md の落とし穴)', () => {
  const r = splitArtifact(FULL);
  assert.match(r.html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(r.html, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/);
  assert.match(r.html, /content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.match(r.html, /<meta name="theme-color"/);
  assert.match(r.html, /<html lang="ja"/);
  assert.match(r.html, /rel="icon"/);
});

test('すでにある指定は重ねず、違う値なら直す', () => {
  const r = splitArtifact(`<!DOCTYPE html><html lang="en"><head>
<meta name="viewport" content="width=device-width, viewport-fit=cover">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#000000">
<title>x</title></head><body></body></html>`);
  assert.strictEqual((r.html.match(/viewport-fit/g) || []).length, 1);
  assert.strictEqual((r.html.match(/status-bar-style/g) || []).length, 1);
  assert.match(r.html, /status-bar-style" content="black-translucent"/);
  assert.strictEqual((r.html.match(/theme-color/g) || []).length, 1);
  assert.match(r.html, /<html lang="en">/);
});

test('断片 (html も body も無い) を骨組みで包む', () => {
  const r = splitArtifact(`<title>小物</title>
<style>p { color: red; }</style>
<p>こんにちは</p>
<script>document.querySelector('p').textContent += '!';</script>`);
  assert.match(r.html, /^<!DOCTYPE html>\n<html lang="ja">/);
  assert.match(r.html, /<head>[\s\S]*<title>小物<\/title>[\s\S]*<\/head>\s*<body>[\s\S]*<p>こんにちは<\/p>[\s\S]*<\/body>/);
  assert.match(r.css, /color: red/);
  assert.match(r.js, /textContent/);
});

test('type="module" は app.module.js へ分ける', () => {
  const r = splitArtifact(`<html><head><title>m</title></head><body>
<script type="module">import x from './x.js'; x();</script></body></html>`);
  assert.strictEqual(r.js, '');
  assert.match(r.moduleJs, /import x/);
  assert.match(r.html, /<script type="module" src="\.\/app\.module\.js"><\/script>/);
});

test('外部 script が埋め込みのあいだに挟まると警告する', () => {
  const r = splitArtifact(`<html><head><title>w</title></head><body>
<script>var a = 1;</script>
<script src="lib.js"></script>
<script>use(a);</script></body></html>`);
  assert.ok(r.warnings.some((w) => w.includes('lib.js')), r.warnings.join('\n'));
});

test('Claude 側でしか動かない機能と localStorage を警告する', () => {
  const r = splitArtifact(`<html><head><title>c</title></head><body>
<script>window.claude.complete('x'); localStorage.setItem('k', 1);</script></body></html>`);
  assert.ok(r.warnings.some((w) => w.includes('window.claude')));
  assert.ok(r.warnings.some((w) => w.includes('localStorage')));
});

test('React (JSX) のアーティファクトは断る', () => {
  assert.throws(() => splitArtifact(`import { useState } from 'react';
export default function App() { return <div className="p-4">hi</div>; }`), /React/);
});

test('足した頭の指定は charset が先頭、そのあと viewport の順', () => {
  const r = splitArtifact('<p>x</p>');
  const order = ['charset', 'name="viewport"', 'apple-mobile-web-app-capable', 'theme-color', '<title>']
    .map((k) => r.html.indexOf(k));
  assert.ok(order.every((v) => v > 0), JSON.stringify(order));
  assert.deepStrictEqual(order.slice().sort((a, b) => a - b), order);
});

test('上の安全域の余白が無ければ警告する', () => {
  const r = splitArtifact('<style>body{margin:0}</style><p>x</p>');
  assert.ok(r.warnings.some((w) => w.includes('safe-area-inset')));
  const ok = splitArtifact('<style>body{padding-top:env(safe-area-inset-top)}</style><p>x</p>');
  assert.ok(!ok.warnings.some((w) => w.includes('safe-area-inset')));
});
