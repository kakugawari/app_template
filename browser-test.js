/*
 * ブラウザで実際に動かして確かめるテスト。
 *
 *   npm i -D playwright && npm run test:ui
 *
 * 画面まわりの不具合は node のテストでは捕まらない。ここでは本物の
 * ブラウザを立ち上げ、指の操作をそのまま再現して確かめる。
 *
 * ★ アプリを作ったら「ここにアプリごとの確認を足す」に書き足すこと。
 *   直した不具合には、かならず見張り役をここに置く。
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

const PORT = Number(process.env.PORT || 8123);
const URL = `http://localhost:${PORT}/`;
const ROOT = __dirname;
const CHROMIUM = process.env.CHROMIUM_PATH;   // 手元の Chromium を使いたいとき

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) {
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + message);
  } else {
    failed++;
    console.log('  \x1b[31m✗ FAIL\x1b[0m ' + message);
  }
}

function skip(message) {
  console.log('  \x1b[90m- とばした: ' + message + '\x1b[0m');
}

/** 外から借りている web フォントの読み込み失敗は、アプリの不具合ではない。 */
function isOurs(msg) {
  const url = (msg.location && msg.location().url) || '';
  return !/fonts\.(googleapis|gstatic)\.com/.test(url);
}

function section(name) {
  console.log('\n' + name);
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      http.get(URL, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - started > 10000) reject(new Error('サーバーが起動しない'));
          else setTimeout(tick, 100);
        });
    };
    tick();
  });
}

/**
 * 何かした直後に、その要素が本来の場所からどれだけずれるかを
 * 1 フレームずつ測る。「置いた瞬間に一瞬とぶ」たぐいの不具合はこれで見つかる。
 *
 * @returns {Promise<number>} 最大のずれ (px)
 */
function measureJump(page, selector, act) {
  return page.evaluate(async ({ sel, code }) => {
    const before = document.querySelector(sel).getBoundingClientRect();
    // eslint-disable-next-line no-new-func
    new Function(code)();
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const el = document.querySelector(sel);
      if (!el) { worst = Infinity; break; }
      const now = el.getBoundingClientRect();
      worst = Math.max(worst, Math.abs(now.left - before.left), Math.abs(now.top - before.top));
    }
    return Math.round(worst);
  }, { sel: selector, code: act });
}

async function run() {
  let chromium;
  let devices;
  try {
    ({ chromium, devices } = require('playwright'));
  } catch (e) {
    console.error('playwright が必要です:  npm i -D playwright');
    process.exit(1);
  }

  const server = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(PORT)], {
    stdio: 'ignore'
  });
  await waitForServer();

  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  const errors = [];

  try {
    // ------------------------------------------------ スマホで開く
    section('スマホで開く');
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    const phone = await context.newPage();
    phone.on('pageerror', (e) => errors.push('スマホ: ' + e.message));
    phone.on('console', (m) => { if (m.type() === 'error' && isOurs(m)) errors.push('スマホ: ' + m.text()); });
    await phone.goto(URL);
    await phone.waitForFunction(() => window.__app);
    ok(true, 'ページが開いて、画面のしくみが立ち上がる');

    const fit = await phone.evaluate(() => ({
      wide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : ''
    }));
    ok(fit.wide <= 1, 'スマホ幅で横スクロールが出ない');
    ok(fit.title.includes('しょうぎクイズ道場'), `見出しが出ている (${fit.title})`);

    // ------------------------------------------------ タイトル
    section('タイトル');
    const modes = await phone.locator('.mode-btn').count();
    ok(modes >= 6, `モードのボタンが並ぶ (${modes} 個)`);
    const totalNote = await phone.textContent('#total-note');
    ok(/全 \d+ 問/.test(totalNote), `問題数が出ている (${totalNote.trim()})`);

    // ------------------------------------------------ 囲いクイズ
    section('囲いクイズ');
    await phone.evaluate(() => window.__app.start('castle'));
    await phone.waitForTimeout(300);
    ok(await phone.locator('#screen-quiz.is-active').count() === 1, 'クイズ画面になる');
    ok(await phone.locator('.koma-choice').count() === 4, '選択肢が 4 つ出る');
    ok(await phone.locator('#stage .koma').count() > 5, '盤に駒が並ぶ');
    // 回帰: 囲いクイズにパラパラ再生バーは出ない (hidden が効かず出てしまったことがある)
    ok(await phone.locator('#player').isHidden(), '囲いクイズでは再生バーが隠れている');

    const jump = await measureJump(phone, '#stage .koma', 'void 0');
    ok(jump < 4, `駒が勝手に動かない (最大ずれ ${jump}px)`);

    await phone.evaluate(() => window.__app.answerCorrect());
    await phone.waitForTimeout(700);
    ok(await phone.locator('#judge').isVisible(), '答えると判定シートが出る');
    ok((await phone.textContent('#judge-mark')).includes('◯'), '正解すると ◯ が出る');
    ok(await phone.textContent('#hud-score') === '1', 'せいかい数が増える');
    await phone.locator('#btn-next').tap();
    await phone.waitForTimeout(300);
    ok(await phone.textContent('#hud-count') === '第2問', 'つぎへ で次の問題になる');

    // ------------------------------------------------ パラパラ漫画 (戦法)
    section('パラパラ漫画');
    await phone.evaluate(() => window.__app.start('senpou'));
    await phone.waitForTimeout(300);
    ok(await phone.locator('#player').isVisible(), '戦法クイズでは再生バーが出る');
    ok(await phone.locator('#stage .koma').count() === 40, '平手の初形 40 枚が並ぶ');
    const kifuChips = await phone.locator('#kifu-strip span').count();
    ok(kifuChips >= 5, `棋譜が並ぶ (${kifuChips} 手)`);

    // 1 手すすめると、盤の駒がほんとうに動く
    const before = await phone.evaluate(() =>
      [...document.querySelectorAll('#stage .koma')].map((e) => e.style.left + ',' + e.style.top).join('|'));
    await phone.locator('#btn-next-move').tap();
    await phone.waitForTimeout(700);
    const after = await phone.evaluate(() =>
      [...document.querySelectorAll('#stage .koma')].map((e) => e.style.left + ',' + e.style.top).join('|'));
    ok(before !== after, '1手すすむボタンで駒が動く');
    ok(await phone.locator('#stage .hl').isVisible(), '動かした場所に印がつく');

    // 自動再生が最後まで進む (2 手目以降も動く)
    await phone.locator('#btn-play').tap();
    await phone.waitForTimeout(2500);
    const played = await phone.evaluate(() => window.__app.player().index);
    ok(played >= 3, `自動再生で手が進む (${played} 手目まで)`);

    // ------------------------------------------------ 詰将棋
    section('1手詰クイズ');
    await phone.evaluate(() => window.__app.start('tsume'));
    await phone.waitForTimeout(300);
    ok(await phone.locator('#hands').isVisible(), '持ち駒が出ている');
    ok(await phone.locator('#player').isHidden(), '詰将棋では再生バーが隠れている');
    const moveChoices = await phone.locator('.pill.move').count();
    ok(moveChoices === 4, `指し手の選択肢が 4 つ (${moveChoices})`);

    // ------------------------------------------------ 最後まで通す
    section('最後まで通す');
    await phone.evaluate(async () => {
      window.__app.start('knowledge');
      for (let i = 0; i < 20; i++) {
        if (!document.getElementById('screen-quiz').classList.contains('is-active')) break;
        window.__app.answerCorrect();
        await new Promise((r) => setTimeout(r, 480));
        document.getElementById('btn-next').click();
        await new Promise((r) => setTimeout(r, 120));
      }
    });
    await phone.waitForTimeout(400);
    ok(await phone.locator('#screen-result.is-active').count() === 1, '最後まで解くと結果画面になる');
    ok((await phone.textContent('#result-rank')).length > 0, `段位が出る (${await phone.textContent('#result-rank')})`);
    const saved = await phone.evaluate(() => localStorage.getItem('shogi-quiz-dojo/v1'));
    ok(saved && saved.includes('knowledge'), '最高記録がほぞんされる');

    // ------------------------------------------------ ずかん
    section('ずかん');
    await phone.evaluate(() => window.__app.showZukan('castle'));
    await phone.waitForTimeout(400);
    const cards = await phone.locator('.z-card').count();
    ok(cards >= 20, `囲いずかんに全部ならぶ (${cards} 枚)`);
    await phone.locator('#zukan-tabs .tab[data-tab="senpou"]').tap();
    await phone.waitForTimeout(400);
    const senpouCards = await phone.locator('.z-card').count();
    ok(senpouCards >= 10, `戦法ずかんにならぶ (${senpouCards} 枚)`);
    ok(await phone.locator('.z-card .board .koma').first().isVisible(), 'ずかんの盤にも駒が出る');

    // ------------------------------------------------ 画面のはみ出し
    section('スマホ幅');
    for (const [name, go] of [
      ['タイトル', "window.__app.showScreen('screen-title')"],
      ['戦法クイズ', "window.__app.start('senpou')"],
      ['ずかん', "window.__app.showZukan('tesuji')"]
    ]) {
      await phone.evaluate(go);
      await phone.waitForTimeout(250);
      const over = await phone.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(over <= 1, `${name}: 横スクロールが出ない (はみ出し ${over}px)`);
    }

    // ------------------------------------------------ 明るい画面・暗い画面
    section('明るい画面と暗い画面');
    for (const scheme of ['light', 'dark']) {
      const themed = await browser.newContext({ ...devices['iPhone 13'], colorScheme: scheme });
      const page = await themed.newPage();
      page.on('pageerror', (e) => errors.push(scheme + ': ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app);
      const colors = await page.evaluate(() => ({
        bg: getComputedStyle(document.body).backgroundColor,
        fg: getComputedStyle(document.body).color
      }));
      ok(colors.bg !== colors.fg, `${scheme}: 文字と背景の色が違う (${colors.bg} / ${colors.fg})`);
      await themed.close();
    }

    // ------------------------------------------------ アイコン (用意していれば)
    section('アイコン');
    const desk = await browser.newPage();
    await desk.goto(URL);
    const apple = await desk.evaluate(() =>
      document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'));
    if (!apple) {
      skip('ホーム画面用のアイコンはまだ無い (PWA にするときに用意する)');
    } else {
      // iOS は SVG のアイコンを使えない
      ok(apple.endsWith('.png'), `ホーム画面用アイコンが PNG (${apple})`);
      const res = await desk.request.get(URL + apple.replace('./', ''));
      ok(res.ok(), `${apple} が配信される`);
    }

    // ------------------------------------------------ 更新とオフライン (sw.js があれば)
    section('更新とオフライン');
    if (!fs.existsSync(path.join(ROOT, 'sw.js'))) {
      skip('サービスワーカーはまだ無い (オフライン対応するときに用意する)');
    } else {
      const swCtx = await browser.newContext();
      const swPage = await swCtx.newPage();
      await swPage.goto(URL);
      await swPage.waitForFunction(() => window.__app);
      ok(await swPage.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active).catch(() => false)),
        'サービスワーカーが動く');
      await swPage.waitForTimeout(800);

      // 直したものが 1 回のリロードで出るか (キャッシュ優先だと古い画面が出る)
      const indexPath = path.join(ROOT, 'index.html');
      const original = fs.readFileSync(indexPath, 'utf8');
      // <title> にも同じ文字列があるので、h1 の中身だけを置きかえる
      const marker = original.match(/(<h1[^>]*>)([^<]*)/);
      fs.writeFileSync(indexPath, original.replace(marker[0], marker[1] + 'こうしんかくにん'));
      await swPage.reload();
      await swPage.waitForTimeout(400);
      const title = await swPage.textContent('h1');
      fs.writeFileSync(indexPath, original);
      ok(title.trim().startsWith('こうしんかくにん'), `直したものが 1 回のリロードで出る (${title.trim()})`);

      await swPage.reload();
      await swPage.waitForTimeout(500);
      await swCtx.setOffline(true);
      await swPage.reload().catch(() => {});
      await swPage.waitForTimeout(400);
      ok(await swPage.evaluate(() => !!window.__app).catch(() => false),
        'ネットにつながらなくても開ける');
      await swCtx.setOffline(false);
    }

    section('エラー');
    ok(errors.length === 0, errors.length ? '画面のエラー: ' + errors.join(' / ') : 'JS エラーなし');
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n${passed} 件合格 / ${failed} 件失敗`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
