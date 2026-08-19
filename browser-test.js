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
    phone.on('console', (m) => { if (m.type() === 'error') errors.push('スマホ: ' + m.text()); });
    await phone.goto(URL);
    await phone.waitForFunction(() => window.__app);
    ok(true, 'ページが開いて、画面のしくみが立ち上がる');

    const fit = await phone.evaluate(() => ({
      wide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      title: document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : ''
    }));
    ok(fit.wide <= 1, 'スマホ幅で横スクロールが出ない');
    ok(fit.title.length > 0, `見出しが出ている (${fit.title})`);

    // ------------------------------------------------ ここにアプリごとの確認を足す
    // hidden 属性の有無 (el.hidden) だけでは、CSS が display:flex で上書きして
    // 実際には表示されたままになる事故を見逃す。getComputedStyle で実際の見え方を見る。
    // #side は display ではなく visibility で切り替える (高さを保つため) ので両方見る。
    const shownFlags = () => phone.evaluate(() => {
      const isShown = (sel) => {
        const style = getComputedStyle(document.querySelector(sel));
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      return {
        warmupVisible: isShown('#screenWarmup'),
        runVisible: isShown('#screenRun'),
        doneVisible: isShown('#screenDone'),
        sideShown: isShown('#side')
      };
    });

    section('準備画面 → 実行画面');
    // 隠れているボタンは大きさが 0 になるので、その画面が出ているうちに測る。
    const startSize = await phone.evaluate(() => {
      const r = document.getElementById('btnStart').getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    ok(startSize.h >= 44 && startSize.w >= 44,
      `はじめるボタンが 44px 以上 (${startSize.w}x${startSize.h})`);

    await phone.locator('#btnStart').tap();
    await phone.waitForTimeout(120);
    const firstStep = Object.assign(await shownFlags(), await phone.evaluate(() => ({
      progress: document.getElementById('progress').textContent,
      side: document.getElementById('side').textContent,
      reps: document.getElementById('reps').textContent
    })));
    ok(firstStep.runVisible && !firstStep.warmupVisible && !firstStep.doneVisible,
      '実行画面だけが表示され、準備・完了画面は本当に隠れている');
    ok(firstStep.progress === '1 / 10', `進捗が 1 / 10 から始まる (${firstStep.progress})`);
    ok(!firstStep.sideShown, `1 種目め (両足そろえて振る動き) では側バッジが出ない (${firstStep.side})`);
    ok(firstStep.reps === '20', `回数が 20 と出る (${firstStep.reps})`);

    section('進捗バー・タップ領域・読み上げ');
    const barAtStart = await phone.evaluate(() =>
      document.getElementById('progressBarFill').getBoundingClientRect().width);
    ok(barAtStart < 1, `最初のステップではバーが伸びていない (${Math.round(barAtStart)}px)`);

    await phone.locator('#btnDone').tap();
    await phone.waitForTimeout(300);
    const barAfterOne = await phone.evaluate(() => ({
      fill: document.getElementById('progressBarFill').getBoundingClientRect().width,
      track: document.querySelector('.progressBar').getBoundingClientRect().width
    }));
    ok(barAfterOne.fill > 1 && barAfterOne.fill < barAfterOne.track,
      `1 つ進めるとバーが少しだけ伸びる (${Math.round(barAfterOne.fill)} / ${Math.round(barAfterOne.track)}px)`);
    await phone.locator('#btnBack').tap();
    await phone.waitForTimeout(300);

    // 指で押す目安の 44px。小さいと押しそこねる。
    const tapSizes = await phone.evaluate(() =>
      ['btnBack', 'btnDone', 'btnRestart'].map((id) => {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        return { id: id, w: Math.round(r.width), h: Math.round(r.height) };
      }));
    const tooSmall = tapSizes.filter((b) => b.h < 44 || b.w < 44);
    ok(tooSmall.length === 0,
      tooSmall.length ? '44px 未満のボタン: ' + JSON.stringify(tooSmall)
                      : `ボタンが全部 44px 以上 (${tapSizes.map((b) => b.id + ' ' + b.h).join(', ')})`);

    const live = await phone.evaluate(() => {
      const el = document.querySelector('#screenRun [aria-live]');
      if (!el) return null;
      return {
        value: el.getAttribute('aria-live'),
        hasName: el.contains(document.getElementById('exerciseName')),
        hasButton: !!el.querySelector('button')
      };
    });
    ok(live && live.value === 'polite' && live.hasName && !live.hasButton,
      '種目名まわりが読み上げ対象になっていて、ボタンは含まれていない');

    section('もどるで1つ前のステップに、最初のステップからは準備画面に戻る');
    await phone.locator('#btnDone').tap();
    await phone.locator('#btnDone').tap();
    await phone.waitForTimeout(60);
    const beforeBack = await phone.evaluate(() => window.__app.state().session.index);
    ok(beforeBack === 2, `2 回できたを押すと index が 2 (${beforeBack})`);

    await phone.locator('#btnBack').tap();
    await phone.waitForTimeout(60);
    const afterBack = await phone.evaluate(() => window.__app.state().session.index);
    ok(afterBack === 1, `もどるで 1 つ前のステップに戻る (${afterBack})`);

    await phone.locator('#btnBack').tap();
    await phone.locator('#btnBack').tap();
    await phone.waitForTimeout(60);
    const atStart = Object.assign(await shownFlags(), await phone.evaluate(() => ({
      index: window.__app.state().session.index
    })));
    ok(atStart.warmupVisible && !atStart.runVisible && atStart.index === 0,
      `最初のステップでもどるを押すと準備画面に戻る (index ${atStart.index})`);

    await phone.locator('#btnStart').tap();
    await phone.waitForTimeout(60);
    const resumed = await phone.evaluate(() => document.getElementById('progress').textContent);
    ok(resumed === '1 / 10', `準備画面から再開すると同じ最初のステップに戻る (${resumed})`);

    section('横向きに寝る種目は、膝も手も左右にあわせて寝る向きが変わる');
    const stepText = () => phone.evaluate(() => ({
      name: document.getElementById('exerciseName').textContent,
      side: document.getElementById('side').textContent
    }));

    await phone.locator('#btnDone').tap();
    await phone.waitForTimeout(60);
    const leftKneeStep = await stepText();
    ok(leftKneeStep.name.startsWith('左向きに寝て'), `左膝のときは「左向きに寝て」から始まる (${leftKneeStep.name})`);
    ok(leftKneeStep.side === '左足', `側バッジは「左足」(${leftKneeStep.side})`);

    await phone.locator('#btnDone').tap();
    await phone.waitForTimeout(60);
    const rightKneeStep = await stepText();
    ok(rightKneeStep.name.startsWith('右向きに寝て'), `右膝のときは「右向きに寝て」から始まる (${rightKneeStep.name})`);
    ok(rightKneeStep.side === '右足', `側バッジは「右足」(${rightKneeStep.side})`);

    await phone.locator('#btnDone').tap();
    await phone.waitForTimeout(60);
    const leftHandStep = await stepText();
    ok(leftHandStep.name.startsWith('左向きに寝て'), `左手のときは「左向きに寝て」から始まる (${leftHandStep.name})`);
    ok(leftHandStep.side === '左手', `側バッジは「左手」(${leftHandStep.side})`);

    await phone.locator('#btnDone').tap();
    await phone.waitForTimeout(60);
    const rightHandStep = await stepText();
    ok(rightHandStep.name.startsWith('右向きに寝て'), `右手のときは「右向きに寝て」から始まる (${rightHandStep.name})`);
    ok(rightHandStep.side === '右手', `側バッジは「右手」(${rightHandStep.side})`);

    section('左右のない種目 (6 種目め) では側の表示が隠れる');
    for (let i = 0; i < 3; i++) await phone.locator('#btnDone').tap();
    await phone.waitForTimeout(60);
    const noSideStep = Object.assign(await shownFlags(), await phone.evaluate(() => ({
      name: document.getElementById('exerciseName').textContent
    })));
    ok(!noSideStep.sideShown, `左右のない種目では側バッジが出ない (${noSideStep.name})`);

    section('最後まで進めると完了画面になる');
    for (let i = 0; i < 3; i++) await phone.locator('#btnDone').tap();
    await phone.waitForTimeout(120);
    const doneScreen = Object.assign(await shownFlags(), await phone.evaluate(() => ({
      finished: window.__app.state().session.index
    })));
    ok(doneScreen.doneVisible && !doneScreen.runVisible, '10 ステップぶん進めると完了画面が本当に表示される');
    ok(doneScreen.finished === 10, `ステップの index が 10 まで進んでいる (${doneScreen.finished})`);

    section('もう一度で最初からやり直せる');
    await phone.locator('#btnAgain').tap();
    await phone.waitForTimeout(120);
    const restarted = Object.assign(await shownFlags(), await phone.evaluate(() => ({
      index: window.__app.state().session.index
    })));
    ok(restarted.warmupVisible && restarted.index === 0, 'もう一度を押すと準備画面・最初のステップに戻る');

    // 準備画面に戻った直後、見出しが飛ばないか (CSS アニメーションの上書き事故よけ)
    await phone.locator('#btnStart').tap();
    const jump = await measureJump(phone, '#exerciseName', 'document.getElementById("btnDone").click()');
    ok(jump < 12, `「できた」を押した直後に種目名が飛ばない (最大ずれ ${jump}px)`);

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

      // PNG を実際に読み込んで、大きさと四隅を確かめる。
      // iOS は角を自分で丸めるので、こちらで丸めた (= 角が透明な) 画像を渡すと
      // 透明なぶんが黒く塗られて額縁のように残る。角は必ず不透明にしておく。
      const px = await desk.evaluate((src) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          const corners = [[0, 0], [img.width - 1, 0], [0, img.height - 1], [img.width - 1, img.height - 1]]
            .map(([x, y]) => Array.from(g.getImageData(x, y, 1, 1).data));
          resolve({ w: img.width, h: img.height, corners });
        };
        img.onerror = () => resolve(null);
        img.src = src;
      }), apple);

      ok(px !== null, 'ホーム画面用アイコンが画像として読める');
      if (px) {
        ok(px.w === 180 && px.h === 180, `ホーム画面用アイコンが 180x180 (${px.w}x${px.h})`);
        ok(px.corners.every((c) => c[3] === 255),
          '四隅が透明でない (角を丸めていない = iOS で黒い額縁が出ない)');
      }

      // manifest 用の PNG も配信できること
      for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512]]) {
        const r = await desk.request.get(URL + file);
        ok(r.ok(), `${file} が配信される (${size}x${size} 用)`);
      }
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
      const marker = original.match(/<h1[^>]*>([^<]*)<\/h1>/);
      fs.writeFileSync(indexPath, original.replace(marker[1], 'こうしんかくにん'));
      await swPage.reload();
      await swPage.waitForTimeout(400);
      const title = await swPage.textContent('h1');
      fs.writeFileSync(indexPath, original);
      ok(title.trim() === 'こうしんかくにん', `直したものが 1 回のリロードで出る (${title.trim()})`);

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
