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

/**
 * 目当ての種目のステップまで「できた」を押して進む。
 *
 * 「5 回押す」のような数え方だと、種目を足したり並べ替えたりするたびに
 * テストを数え直すことになるので、種目の名前 (art) で探して止まる。
 * 見つからなければ false を返す。
 */
async function goToArt(page, art) {
  const currentArt = () => page.evaluate(() => {
    const s = window.__app.state().session;
    return s.steps[s.index] ? s.steps[s.index].art : null;
  });
  for (let i = 0; i < 40; i++) {
    const now = await currentArt();
    if (now === art) return true;
    // 終わりまで来てしまったら打ち止め。ここで押し続けると完了画面に入り、
    // ボタンが消えてタップが延々と待たされる (探す順番を間違えたということ)
    if (now === null) return false;
    await page.locator('#btnDone').tap();
    await page.waitForTimeout(40);
  }
  return false;
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

    // ボタンを続けてタップすると、ブラウザが「ダブルタップで拡大」と
    // 勘違いして画面ごと拡大することがある。manipulation にしておくと
    // それだけを止められる (指を広げるピンチズームは残る)。
    const touchAction = await phone.evaluate(() => getComputedStyle(document.documentElement).touchAction);
    ok(touchAction === 'manipulation', `ダブルタップでの拡大を止めている (touch-action: ${touchAction})`);

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
    ok(/^1 \/ \d+$/.test(firstStep.progress), `進捗が 1 から始まる (${firstStep.progress})`);
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

    section('「できた」を連打しても、実際にストレッチしたぶんしか進まない');
    {
      // 直したきっかけの不具合: 連打すると、体を動かしていなくても
      // 一瞬で何ステップも進んでしまっていた
      // (実測: btn.click() を続けて呼ぶと index が 0 → 2 のように動いた)。
      //
      // Playwright の locator.tap() は要素が「押せる」状態になるまで
      // 待ってしまうので、それだと本物の連打を再現できない。指が追いつく
      // 間もなく撃つのが連打なので、ここでは素の click() を待たずに
      // 続けて呼ぶ (=同じタイミングで何度もタップした状態)。
      const cooldownMs = await phone.evaluate(() => window.__app.tapCooldownMs);
      // 直前の操作の連打よけが残っていると、はじめの 1 回まで
      // すり抜けなくなってしまうので、押せる状態になってから測る
      await phone.waitForFunction(() => !document.getElementById('btnDone').disabled);
      const indexBefore = await phone.evaluate(() => window.__app.state().session.index);

      await phone.evaluate(() => {
        const btn = document.getElementById('btnDone');
        for (let i = 0; i < 8; i++) btn.click();
      });
      const indexAfterMash = await phone.evaluate(() => window.__app.state().session.index);
      ok(indexAfterMash - indexBefore === 1,
        `8 連打しても 1 つしか進まない (${indexBefore} → ${indexAfterMash})`);

      const disabledRightAfter = await phone.evaluate(() => document.getElementById('btnDone').disabled);
      ok(disabledRightAfter, '連打した直後は、見た目にも押せない状態になっている');

      await phone.waitForTimeout(cooldownMs + 200);
      const afterCooldown = await phone.evaluate(() => document.getElementById('btnDone').disabled);
      ok(!afterCooldown, `${cooldownMs}ms 待つと、また押せる状態に戻る`);

      const indexAfterWait = await phone.evaluate(() => window.__app.state().session.index);
      await phone.locator('#btnDone').tap();
      const indexAfterNext = await phone.evaluate(() => window.__app.state().session.index);
      ok(indexAfterNext - indexAfterWait === 1,
        `待ってからならふつうに次へ進める (${indexAfterWait} → ${indexAfterNext})`);
    }

    section('連打でセッションをまたいでも、次の「はじめる」が固まらない');
    {
      // 前のセッションで押した連打よけがまだ解けていなくても、
      // 新しいセッションの最初の「できた」まで反応しなくなってはいけない
      await phone.locator('#btnRestart').tap();
      await phone.locator('#btnStart').tap();
      await phone.evaluate(() => { document.getElementById('btnDone').click(); });
      await phone.locator('#btnRestart').tap(); // クールダウンが残ったまま次を始める
      await phone.locator('#btnStart').tap();
      const idx0 = await phone.evaluate(() => window.__app.state().session.index);
      await phone.locator('#btnDone').tap();
      const idx1 = await phone.evaluate(() => window.__app.state().session.index);
      ok(idx1 - idx0 === 1,
        `間を置かずに次を始めても、最初の「できた」はすぐ反応する (${idx0} → ${idx1})`);
      // 続くテストが「実行画面の最初のステップ」を前提にしているので、そこへ戻す
      await phone.locator('#btnRestart').tap();
      await phone.locator('#btnStart').tap();
      await phone.waitForTimeout(80);
    }

    section('コマがパラパラ漫画のように入れ替わる');
    // どの種目でも「今どのコマが見えているか」を読む道具
    const readFrames = () => phone.evaluate(() => Array.from(
      document.querySelectorAll('#illustrationRow .illustration'),
      (el) => ({
        frame: el.querySelector('use').getAttribute('href'),
        opacity: Number(getComputedStyle(el).opacity)
      })));
    const shownFrame = (frames) => (frames.find((f) => f.opacity > 0.9) || {}).frame;

    // コマが同じ場所に重なっていること (横に並んでいない)
    const stacked = await phone.evaluate(() => {
      const els = document.querySelectorAll('#illustrationRow .illustration');
      const boxes = Array.from(els, (el) => el.getBoundingClientRect());
      return {
        n: els.length,
        sameSpot: boxes.every((b) => Math.abs(b.x - boxes[0].x) < 1 && Math.abs(b.y - boxes[0].y) < 1),
        w: Math.round(boxes[0].width),
        arrows: document.querySelectorAll('#illustrationRow .illustrationArrow').length
      };
    });
    ok(stacked.sameSpot, `コマが同じ場所に重なっている (${stacked.n} コマ / ${stacked.w}px)`);
    ok(stacked.arrows === 0, '重ねているあいだは矢印を置かない');
    ok(stacked.w >= 120, `1 コマが横並びのときより大きい (${stacked.w}px)`);

    // 1 コマぶんの時間をはさんで濃さを測り、実際に入れ替わるか見る。
    // 「アニメーションを作った」ではなく「絵が入れ替わった」ことを確かめる。
    const flipMs = await phone.evaluate(() => window.__app.flipMs);
    await phone.waitForTimeout(Math.round(flipMs * 0.3));
    const frame1 = await readFrames();
    await phone.waitForTimeout(flipMs);
    const frame2 = await readFrames();
    ok(shownFrame(frame1) === '#kneeFall-before', `1 コマめは before (${shownFrame(frame1)})`);
    ok(shownFrame(frame2) === '#kneeFall-after', `${flipMs}ms 後に after へ入れ替わる (${shownFrame(frame2)})`);

    // ステップが変わったら 1 コマめから始まる (途中のコマから始まらない)
    await phone.waitForTimeout(Math.round(flipMs * 0.6)); // 2 コマめを見ている最中に進める
    await phone.locator('#btnDone').tap();
    await phone.waitForTimeout(80);
    ok(shownFrame(await readFrames()) === '#hipTwist-before',
      '次のステップは必ず 1 コマめから始まる');
    await phone.locator('#btnBack').tap();
    await phone.waitForTimeout(60);

    section('猫のポーズ・ひねる・倒すは 4 コマで一周する');
    // 猫のポーズも 4 コマ。こちらは左右ではなく「丸める・反る」
    ok(await goToArt(phone, 'catPose'), '「猫のポーズ」のステップまで進める');
    await phone.waitForTimeout(80);
    const catFrames = await readFrames();
    ok(catFrames.map((f) => f.frame).join(' ')
        === '#catPose-center #catPose-round #catPose-center #catPose-arch',
      `猫のポーズは まん中 → 丸める → まん中 → 反る (${catFrames.length} コマ)`);
    const catSeen = [];
    for (let i = 0; i < 4; i++) {
      catSeen.push(shownFrame(await readFrames()));
      await phone.waitForTimeout(flipMs);
    }
    ok(catSeen.join(' ') === '#catPose-center #catPose-round #catPose-center #catPose-arch',
      `見えた順が まん中→丸める→まん中→反る (${catSeen.map((s) => String(s).replace('#catPose-', '')).join(' → ')})`);

    ok(await goToArt(phone, 'chairTwist'), '「ひねる」のステップまで進める');
    await phone.waitForTimeout(80);
    const swingName = await phone.evaluate(() => document.getElementById('exerciseName').textContent);
    ok(swingName.includes('ひねる'), `種目名が「ひねる」(${swingName})`);

    const swingFrames = await readFrames();
    ok(swingFrames.length === 4,
      `4 コマ並んでいる (${swingFrames.map((f) => f.frame).join(' ')})`);
    ok(swingFrames.map((f) => f.frame).join(' ')
        === '#chairTwist-center #chairTwist-left #chairTwist-center #chairTwist-right',
      '真ん中 → 左 → 真ん中 → 右 の順に並んでいる');

    // 1 コマずつ追いかけて、本当にこの順で見えるか確かめる
    const seen = [];
    for (let i = 0; i < 4; i++) {
      seen.push(shownFrame(await readFrames()));
      await phone.waitForTimeout(flipMs);
    }
    ok(seen.join(' ') === '#chairTwist-center #chairTwist-left #chairTwist-center #chairTwist-right',
      `見えた順が 真ん中→左→真ん中→右 (${seen.map((s) => String(s).replace('#chairTwist-', '')).join(' → ')})`);

    // 「倒す」も同じ 4 コマ
    ok(await goToArt(phone, 'chairLean'), '「倒す」のステップまで進める');
    await phone.waitForTimeout(80);
    const leanFrames = await readFrames();
    ok(leanFrames.map((f) => f.frame).join(' ')
        === '#chairLean-center #chairLean-left #chairLean-center #chairLean-right',
      '「倒す」も 真ん中 → 左 → 真ん中 → 右');

    // 頭が肩に食われていないこと。
    // 座標を見比べるだけでは、回した肩の「端」が頭に乗り上げるのを見逃す。
    // 頭だけを外した絵を実際に描かせて、頭のあった丸の中に体の墨が
    // 1 粒でも入っていないかを数える。家具は薄いので数えない。
    const HEAD_MARGIN = 2; // 頭のふちからこれだけは空けたい
    const headRoom = await phone.evaluate(async (args) => {
      const sprite = document.getElementById('sprite').innerHTML;
      const inkNearHead = (id) => new Promise((resolve) => {
        const sym = document.getElementById(id).cloneNode(true);
        const head = sym.querySelector(':scope > circle');
        if (!head) return resolve({ error: '頭が見つからない' });
        const hx = Number(head.getAttribute('cx'));
        const hy = Number(head.getAttribute('cy'));
        const hr = Number(head.getAttribute('r')) + args.margin;
        head.remove(); // 頭を外し、体だけを描く

        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"'
          + ' viewBox="0 0 120 120" style="color:#000">' + sprite + sym.innerHTML + '</svg>';
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = 120;
          c.height = 120;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          const px = g.getImageData(0, 0, 120, 120).data;
          let hits = 0;
          for (let y = 0; y < 120; y++) {
            for (let x = 0; x < 120; x++) {
              if ((x - hx) * (x - hx) + (y - hy) * (y - hy) > hr * hr) continue;
              if (px[(y * 120 + x) * 4 + 3] > 200) hits++; // 家具 (opacity .45) は数えない
            }
          }
          resolve({ hits: hits });
        };
        img.onerror = () => resolve({ error: '描けなかった' });
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      });
      const out = {};
      for (const id of args.ids) out[id] = await inkNearHead(id);
      return out;
    }, { ids: ['chairTwist-center', 'chairTwist-left', 'chairTwist-right'], margin: HEAD_MARGIN });

    const headHits = Object.keys(headRoom)
      .map((k) => k.replace('chairTwist-', '') + ':' + (headRoom[k].error || headRoom[k].hits));
    ok(Object.values(headRoom).every((r) => r.hits === 0),
      `ひねる 3 コマとも、頭の周りに体が入り込んでいない (${headHits.join(' ')})`);

    await phone.locator('#btnRestart').tap();
    await phone.locator('#btnStart').tap();
    await phone.waitForTimeout(80);

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
    ok(/^1 \/ \d+$/.test(resumed), `準備画面から再開すると同じ最初のステップに戻る (${resumed})`);

    section('横向きに寝る種目は、膝も手も左右にあわせて寝る向きが変わる');
    const stepText = () => phone.evaluate(() => ({
      name: document.getElementById('exerciseName').textContent,
      side: document.getElementById('side').textContent
    }));

    ok(await goToArt(phone, 'sideKnee'), '「横向きに寝て膝」のステップまで進める');
    await phone.waitForTimeout(60);
    const leftKneeStep = await stepText();
    ok(leftKneeStep.name.startsWith('左向きに寝て'), `左膝のときは「左向きに寝て」から始まる (${leftKneeStep.name})`);
    ok(leftKneeStep.side === '左足', `側バッジは「左足」(${leftKneeStep.side})`);

    await phone.locator('#btnDone').tap();
    await phone.waitForTimeout(60);
    const rightKneeStep = await stepText();
    ok(rightKneeStep.name.startsWith('右向きに寝て'), `右膝のときは「右向きに寝て」から始まる (${rightKneeStep.name})`);
    ok(rightKneeStep.side === '右足', `側バッジは「右足」(${rightKneeStep.side})`);

    ok(await goToArt(phone, 'sideArm'), '「横向きに寝て手」のステップまで進める');
    await phone.waitForTimeout(60);
    const leftHandStep = await stepText();
    ok(leftHandStep.name.startsWith('左向きに寝て'), `左手のときは「左向きに寝て」から始まる (${leftHandStep.name})`);
    ok(leftHandStep.side === '左手', `側バッジは「左手」(${leftHandStep.side})`);

    await phone.locator('#btnDone').tap();
    await phone.waitForTimeout(60);
    const rightHandStep = await stepText();
    ok(rightHandStep.name.startsWith('右向きに寝て'), `右手のときは「右向きに寝て」から始まる (${rightHandStep.name})`);
    ok(rightHandStep.side === '右手', `側バッジは「右手」(${rightHandStep.side})`);

    section('左右のない種目 (猫のポーズ) では側の表示が隠れる');
    ok(await goToArt(phone, 'catPose'), '「猫のポーズ」のステップまで進める');
    await phone.waitForTimeout(60);
    const noSideStep = Object.assign(await shownFlags(), await phone.evaluate(() => ({
      name: document.getElementById('exerciseName').textContent
    })));
    ok(!noSideStep.sideShown, `左右のない種目では側バッジが出ない (${noSideStep.name})`);

    section('最後まで進めると完了画面になる');
    // 途中まで進んでいるので、残りぶんだけ押す
    const remaining = await phone.evaluate(() => {
      const s = window.__app.state().session;
      return s.steps.length - s.index;
    });
    for (let i = 0; i < remaining; i++) await phone.locator('#btnDone').tap();
    await phone.waitForTimeout(120);
    const doneScreen = Object.assign(await shownFlags(), await phone.evaluate(() => ({
      finished: window.__app.state().session.index,
      total: window.__app.state().session.steps.length
    })));
    ok(doneScreen.doneVisible && !doneScreen.runVisible,
      `${doneScreen.total} ステップぶん進めると完了画面が本当に表示される`);
    ok(doneScreen.finished === doneScreen.total,
      `ステップの index が最後まで進んでいる (${doneScreen.finished} / ${doneScreen.total})`);

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

    section('色を変えても、文字の読みやすさ (コントラスト比 4.5) を割らない');
    {
      // WCAG の相対輝度からコントラスト比を出す。地と文字それぞれの
      // 色だけでなく、実際に使っている場所どうしを比べる
      const contrastFormula = `
        function lum(rgb) {
          const c = rgb.map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        }
        function ratio(a, b) {
          const l1 = lum(a), l2 = lum(b);
          return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        }
        function parse(css) { return (css.match(/\\d+/g) || []).slice(0, 3).map(Number); }
      `;
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: scheme });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push('contrast/' + scheme + ': ' + e.message));
        await page.goto(URL);
        await page.waitForFunction(() => window.__app);

        for (const skin of ['classic', 'midnight', 'forest', 'sunset']) {
          const r = await page.evaluate(({ formula, skin }) => {
            // eslint-disable-next-line no-eval
            eval(formula);
            document.documentElement.dataset.skin = skin;
            const cs = getComputedStyle(document.documentElement);
            const v = (n) => cs.getPropertyValue(n).trim();
            const probe = document.createElement('div');
            document.body.appendChild(probe);
            const rgb = (color) => { probe.style.color = color; return parse(getComputedStyle(probe).color); };
            const accent = rgb(v('--accent'));
            const ink = rgb(v('--accent-ink'));
            const bg2 = rgb(v('--bg-2'));
            probe.remove();
            return {
              // 「できた」ボタンなど、accent を地に ink を文字にする場所
              button: Math.round(ratio(accent, ink) * 100) / 100,
              // 見出し・回数の数字など、bg-2 の上に accent を文字として使う場所
              heading: Math.round(ratio(accent, bg2) * 100) / 100
            };
          }, { formula: contrastFormula, skin });
          ok(r.button >= 4.5, `${scheme}/${skin}: できたボタンの文字が読める (比 ${r.button})`);
          ok(r.heading >= 4.5, `${scheme}/${skin}: 見出し・回数の文字が読める (比 ${r.heading})`);
        }
        await ctx.close();
      }
    }

    // ------------------------------------------------ ステップをまたいだ位置の固定
    section('どのステップでもカードの高さと回数の位置が変わらない');
    {
      const walk = await browser.newContext({ ...devices['iPhone 13'] });
      const page = await walk.newPage();
      page.on('pageerror', (e) => errors.push('walk: ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app);
      await page.locator('#btnStart').tap();

      const stepCount = await page.evaluate(() => window.__app.state().session.steps.length);
      const seen = [];
      for (let i = 0; i < stepCount; i++) {
        await page.waitForTimeout(60);
        seen.push(await page.evaluate(() => {
          const box = (s) => document.querySelector(s).getBoundingClientRect();
          return {
            n: document.getElementById('progress').textContent.trim(),
            card: Math.round(box('#screenRun').height),
            side: Math.round(box('#side').height),
            repsY: Math.round(box('.reps').y)
          };
        }));
        if (i < stepCount - 1) await page.locator('#btnDone').tap();
      }

      // 側バッジは中身が「左足」でも空でも同じ高さでなければならない。
      // ここが変わるとカードが伸び縮みし、下にある回数が動く
      // (iOS ではそのずれが古い描画の残りとして「20 が二重」に見えた)。
      const sideHeights = [...new Set(seen.map((s) => s.side))];
      const cardHeights = [...new Set(seen.map((s) => s.card))];
      const repsTops = [...new Set(seen.map((s) => s.repsY))];
      ok(sideHeights.length === 1, `側バッジの高さが全ステップで同じ (${sideHeights.join(' / ')}px)`);
      ok(cardHeights.length === 1, `カードの高さが全ステップで同じ (${cardHeights.join(' / ')}px)`);
      ok(repsTops.length === 1, `回数の縦位置が全ステップで同じ (${repsTops.join(' / ')}px)`);
      await walk.close();
    }

    // ------------------------------------------------ 横向き
    section('横向きでも「できた」が画面に収まる');
    {
      const land = await browser.newContext({
        viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2
      });
      const page = await land.newPage();
      page.on('pageerror', (e) => errors.push('landscape: ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app);
      await page.locator('#btnStart').tap();
      await page.waitForTimeout(80);
      const fit = await page.evaluate(() => {
        const r = document.getElementById('btnDone').getBoundingClientRect();
        return { bottom: Math.round(r.bottom), vh: window.innerHeight };
      });
      ok(fit.bottom <= fit.vh,
        `できたボタンが画面の中に収まっている (下端 ${fit.bottom} / 画面 ${fit.vh})`);
      await land.close();
    }

    // ------------------------------------------------ 動きを減らす設定
    section('動きを減らす設定では、コマを切り替えず横に並べる');
    {
      const calm = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
      const page = await calm.newPage();
      page.on('pageerror', (e) => errors.push('reduce: ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app);
      await page.locator('#btnStart').tap();
      await page.waitForTimeout(1400); // 切り替わるなら十分な時間だけ待つ
      const calmShots = () => page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('#illustrationRow .illustration'));
        const boxes = els.map((el) => el.getBoundingClientRect());
        return {
          frames: els.map((el) => el.querySelector('use').getAttribute('href')),
          allShown: els.every((el) => Number(getComputedStyle(el).opacity) > 0.9),
          sideBySide: boxes.every((b, i) => i === 0 || b.x > boxes[i - 1].x + boxes[i - 1].width - 1),
          arrows: document.querySelectorAll('#illustrationRow .illustrationArrow').length,
          animations: document.getAnimations().length
        };
      });
      const calmView = await calmShots();
      ok(calmView.allShown, `コマがどれも消えずに出ている (${calmView.frames.length} コマ)`);
      ok(calmView.sideBySide, 'コマが横に並んでいる');
      ok(calmView.arrows === calmView.frames.length - 1, 'コマとコマのあいだに矢印が入っている');
      ok(calmView.animations === 0, `動くものが 1 つも走っていない (${calmView.animations} 件)`);

      // 4 コマの種目は、同じ絵を 2 度並べず 真ん中・左・右 の 3 枚にする
      ok(await goToArt(page, 'chairTwist'), '「ひねる」のステップまで進める');
      await page.waitForTimeout(80);
      const calmSwing = await calmShots();
      ok(calmSwing.frames.join(' ') === '#chairTwist-center #chairTwist-left #chairTwist-right',
        `4 コマの種目は重複を除いた 3 枚で並ぶ (${calmSwing.frames.join(' ')})`);
      await calm.close();
    }

    // ------------------------------------------------ 途中から再開
    section('途中で閉じても、開き直せば続きから再開できる');
    {
      const ctx = await browser.newContext({ ...devices['iPhone 13'] });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push('resume: ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app);

      const fresh = await page.evaluate(() => document.getElementById('btnResume').hidden);
      ok(fresh, 'はじめて開いたときは「つづきから」を出さない');

      // 8 ステップめまで進めたところで閉じる (電話・画面ロックを想定)
      await page.evaluate(() => {
        window.__app.start();
        for (let i = 0; i < 8; i++) window.__app.complete();
      });
      await page.reload();
      await page.waitForFunction(() => window.__app);

      const reopened = await page.evaluate(() => ({
        screen: window.__app.state().screen,
        shown: !document.getElementById('btnResume').hidden,
        note: document.getElementById('stampNote').textContent.trim(),
        startIsPrimary: document.getElementById('btnStart').classList.contains('btn-primary'),
        // 幅が足りないとボタンの中で文字が折り返し、ボタンごと縦に伸びて
        // 下のものを画面の外へ押し出す
        rowH: Math.round(document.querySelector('#screenWarmup .actions').getBoundingClientRect().height)
      }));
      ok(reopened.screen === 'warmup' && reopened.shown,
        '開き直すと準備画面に「つづきから」が出る');
      ok(reopened.note.startsWith('9 / 17 まで進んでいます'),
        `どこまでやったかが読める (${reopened.note})`);
      ok(!reopened.startIsPrimary, '続きがあるときは「つづきから」が主なボタンになる');
      ok(reopened.rowH <= 56, `ボタンが 1 段に収まっている (${reopened.rowH}px)`);

      await page.locator('#btnResume').tap();
      await page.waitForTimeout(80);
      const resumed = await page.evaluate(() => ({
        index: window.__app.state().session.index,
        progress: document.getElementById('progress').textContent.trim()
      }));
      ok(resumed.index === 8 && resumed.progress === '9 / 17',
        `閉じたところから再開する (${resumed.progress})`);

      // はじめから を選べば 1 ステップめに戻り、続きは消える
      await page.locator('#btnRestart').tap();
      await page.waitForTimeout(60);
      const afterRestart = await page.evaluate(() => ({
        shown: !document.getElementById('btnResume').hidden,
        saved: localStorage.getItem('stretch-routine-progress')
      }));
      ok(!afterRestart.shown && afterRestart.saved === null,
        'はじめからを選ぶと、続きは消える');

      // やりきったら続きは残らない (次の日また最初から始められる)
      await page.evaluate(() => {
        window.__app.start();
        const total = window.__app.state().session.steps.length;
        for (let i = 0; i < total; i++) window.__app.complete();
      });
      const afterFinish = await page.evaluate(() =>
        localStorage.getItem('stretch-routine-progress'));
      ok(afterFinish === null, 'やりきったあとは続きが残らない');

      // 種目の数が変わったら、古い続きは捨てる
      // (種目を足したあとに復元すると、違う種目から再開してしまう)
      await page.evaluate(() => localStorage.setItem('stretch-routine-progress',
        JSON.stringify({ index: 8, total: 10 })));
      await page.reload();
      await page.waitForFunction(() => window.__app);
      const stale = await page.evaluate(() => document.getElementById('btnResume').hidden);
      ok(stale, '種目の数が変わった古い続きは出さない');
      await ctx.close();
    }

    section('ストレッチ中は画面を消さない');
    {
      const ctx = await browser.newContext({ ...devices['iPhone 13'] });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push('wakelock: ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app);

      const onWarmup = await page.evaluate(() => window.__app.screenHeldOn());
      ok(!onWarmup, '準備画面では、画面の消灯を止めていない');

      await page.locator('#btnStart').tap();
      await page.waitForTimeout(150);
      const onRun = await page.evaluate(() => window.__app.screenHeldOn());
      ok(onRun, '実行画面に入ると、画面の消灯を止める');

      await page.locator('#btnRestart').tap();
      await page.waitForTimeout(150);
      const backOnWarmup = await page.evaluate(() => window.__app.screenHeldOn());
      ok(!backOnWarmup, '実行画面から離れたら、止めるのをやめる (電池を無駄にしない)');
      await ctx.close();
    }

    // ------------------------------------------------ スタンプカード
    section('1 周やりきるとスタンプがたまり、次に開いても残っている');
    {
      const ctx = await browser.newContext({ ...devices['iPhone 13'] });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push('stamp: ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app);

      const slots = await page.evaluate(() =>
        document.querySelectorAll('#stampSlots .slot').length);
      ok(slots === 10, `スタンプカードのマスが 10 個 (${slots})`);
      const before = await page.evaluate(() =>
        document.querySelectorAll('#stampSlots .slot.is-filled').length);
      ok(before === 0, `はじめは 1 つも押されていない (${before})`);

      // 1 周まるごとやりきる
      await page.evaluate(() => {
        window.__app.start();
        const total = window.__app.state().session.steps.length;
        for (let i = 0; i < total; i++) window.__app.complete();
      });
      const afterRun = await page.evaluate(() => ({
        stamps: window.__app.state().record.stamps,
        done: !document.getElementById('screenDone').hidden
      }));
      ok(afterRun.done && afterRun.stamps === 1,
        `やりきるとスタンプが 1 個たまる (${afterRun.stamps} 個)`);

      // 開き直しても残っている (保存できている)
      await page.reload();
      await page.waitForFunction(() => window.__app);
      const kept = await page.evaluate(() => ({
        stamps: window.__app.state().record.stamps,
        filled: document.querySelectorAll('#stampSlots .slot.is-filled').length
      }));
      ok(kept.stamps === 1 && kept.filled === 1,
        `開き直してもスタンプが残っている (${kept.stamps} 個 / ${kept.filled} マス)`);

      // 押すところが動く。「アニメを作った」ではなく「本当に動いた」を見る
      await page.evaluate(() => {
        window.__app.start();
        const total = window.__app.state().session.steps.length;
        for (let i = 0; i < total; i++) window.__app.complete();
      });
      await page.locator('#btnAgain').tap();
      const shape = () => page.evaluate(() => {
        const marks = document.querySelectorAll('#stampSlots .slot.is-filled .stampMark');
        const m = marks[marks.length - 1];
        const t = getComputedStyle(m).transform;
        const n = t.startsWith('matrix') ? t.slice(7, -1).split(',').map(Number) : null;
        return {
          running: document.getAnimations().length,
          scale: n ? Math.round(Math.sqrt(n[0] * n[0] + n[1] * n[1]) * 100) / 100 : null
        };
      });
      await page.waitForTimeout(60);
      const pressing = await shape();
      await page.waitForTimeout(180);
      const settling = await shape();
      await page.waitForTimeout(600);
      const settled = await shape();

      ok(pressing.running > 0, `押している最中は動きが走っている (${pressing.running} 件)`);
      ok(pressing.scale > 1.5, `はじめは大きく浮いている (${pressing.scale} 倍)`);
      ok(settling.scale < pressing.scale, `降りてきている (${pressing.scale} → ${settling.scale} 倍)`);
      ok(settled.running === 0 && Math.abs(settled.scale - 1) < 0.02,
        `押し終わると等倍で止まる (${settled.scale} 倍 / 動き ${settled.running} 件)`);
      await ctx.close();
    }

    section('動きを減らす設定では、スタンプを動かさずに押した状態で出す');
    {
      const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push('calm-stamp: ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app);
      await page.evaluate(() => {
        window.__app.start();
        const total = window.__app.state().session.steps.length;
        for (let i = 0; i < total; i++) window.__app.complete();
      });
      await page.locator('#btnAgain').tap();
      await page.waitForTimeout(80);
      const calm = await page.evaluate(() => ({
        running: document.getAnimations().length,
        filled: document.querySelectorAll('#stampSlots .slot.is-filled').length
      }));
      ok(calm.running === 0 && calm.filled === 1,
        `動かさずにスタンプが出ている (動き ${calm.running} 件 / ${calm.filled} マス)`);
      await ctx.close();
    }

    section('10 個たまるとごほうびがもらえて、きせかえができる');
    {
      const ctx = await browser.newContext({ ...devices['iPhone 13'] });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push('reward: ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app);

      const before = await page.evaluate(() =>
        document.getElementById('btnCustom').hidden);
      ok(before, 'ごほうびが無いうちは、きせかえボタンを出さない');

      await page.evaluate(() => window.__app.setStamps(10));
      const at10 = await page.evaluate(() => ({
        filled: document.querySelectorAll('#stampSlots .slot.is-filled').length,
        customShown: !document.getElementById('btnCustom').hidden,
        rewards: window.__app.state().record.stamps
      }));
      ok(at10.filled === 10, `10 個目でカードが満杯になる (${at10.filled} マス)`);
      ok(at10.customShown, 'きせかえボタンが出る');

      // 色を変えると、本当に画面の色が変わる
      await page.locator('#btnCustom').tap();
      await page.waitForTimeout(80);
      const accentBefore = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
      await page.locator('#skinChips .chip:not(:disabled)').nth(1).tap();
      await page.waitForTimeout(80);
      const accentAfter = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
      ok(accentBefore !== accentAfter, `色が本当に変わる (${accentBefore} → ${accentAfter})`);

      // まだもらっていないごほうびは選べない (10 個の時点で飾りは 1 つも無い)
      const locked = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#gearChips .chip')).map((b) => b.disabled));
      ok(locked.length > 0 && locked.every(Boolean),
        `まだのごほうびは押せない (${locked.join(',')})`);

      // 20 個たまると飾りが 1 つ使える。きせかえ画面にいるまま増やす
      await page.evaluate(() => window.__app.setStamps(20));
      await page.waitForTimeout(80);
      const gearBefore = await page.evaluate(() =>
        document.querySelectorAll('#mascotPreview .gear, #mascotPreview .gear-fill').length);
      await page.locator('#gearChips .chip:not(:disabled)').first().tap();
      await page.waitForTimeout(80);
      const gearAfter = await page.evaluate(() => ({
        preview: document.querySelectorAll('#mascotPreview .gear, #mascotPreview .gear-fill').length,
        saved: window.__app.state().record.gear.length
      }));
      ok(gearBefore === 0 && gearAfter.preview > 0 && gearAfter.saved === 1,
        `飾りをつけると人に増える (${gearBefore} → ${gearAfter.preview} 個)`);

      // とじると準備画面に戻り、飾りがついたままの人が出る
      await page.locator('#btnCloseCustom').tap();
      await page.waitForTimeout(80);
      const back = await page.evaluate(() => ({
        warmup: getComputedStyle(document.getElementById('screenWarmup')).display !== 'none',
        gear: document.querySelectorAll('#mascot .gear, #mascot .gear-fill').length
      }));
      ok(back.warmup && back.gear > 0, `とじると飾りつきの人が準備画面に出る (${back.gear} 個)`);
      await ctx.close();
    }

    section('記録が壊れていても落ちない');
    {
      const ctx = await browser.newContext({ ...devices['iPhone 13'] });
      const page = await ctx.newPage();
      const broke = [];
      page.on('pageerror', (e) => broke.push(e.message));
      await page.goto(URL);
      await page.evaluate(() => localStorage.setItem('stretch-routine-record', 'こわれている{{'));
      await page.reload();
      await page.waitForFunction(() => window.__app);
      const recovered = await page.evaluate(() => window.__app.state().record.stamps);
      ok(broke.length === 0 && recovered === 0,
        `読めない記録でも 0 個から始まる (エラー ${broke.length} 件)`);

      // もらっていないごほうびを書き足しても、そのままは通さない
      await page.evaluate(() => localStorage.setItem('stretch-routine-record',
        JSON.stringify({ stamps: 0, skin: 'sunset', gear: ['cape'] })));
      await page.reload();
      await page.waitForFunction(() => window.__app);
      const cheat = await page.evaluate(() => window.__app.state().record);
      ok(cheat.skin === 'classic' && cheat.gear.length === 0,
        `もらっていないごほうびは落とす (${cheat.skin} / ${cheat.gear.length} 個)`);
      await ctx.close();
    }

    section('「つづきから」が増えても、狭い画面でボタンが崩れない');
    for (const [label, opts] of [
      ['縦 390x664', { ...devices['iPhone 13'] }],
      ['小 320x568', { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]
    ]) {
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(label + ': ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app);
      // ボタンが 3 つ出る、いちばん混む状態を作る
      await page.evaluate(() => {
        window.__app.setStamps(24);
        window.__app.start();
        for (let i = 0; i < 8; i++) window.__app.complete();
      });
      await page.reload();
      await page.waitForFunction(() => window.__app);
      await page.waitForTimeout(80);
      const m = await page.evaluate(() => {
        const row = document.querySelector('#screenWarmup .actions').getBoundingClientRect();
        const btns = ['btnCustom', 'btnStart', 'btnResume']
          .map((id) => document.getElementById(id).getBoundingClientRect());
        return {
          rowH: Math.round(row.height),
          bottom: Math.round(Math.max(...btns.map((b) => b.bottom))),
          vh: window.innerHeight,
          shown: btns.filter((b) => b.width > 0).length
        };
      });
      ok(m.shown === 3, `${label}: ボタンが 3 つ出ている (${m.shown})`);
      ok(m.rowH <= 56, `${label}: ボタンの中で文字が折り返していない (段の高さ ${m.rowH}px)`);
      ok(m.bottom <= m.vh, `${label}: 画面に収まっている (下端 ${m.bottom} / 画面 ${m.vh})`);
      await ctx.close();
    }

    section('スタンプカードを足しても「はじめる」が画面に収まる');
    for (const [label, opts] of [
      ['縦 390x664', { ...devices['iPhone 13'] }],
      ['横 844x390', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
      ['小 320x568', { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]
    ]) {
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(label + ': ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app);
      await page.evaluate(() => window.__app.setStamps(40));
      await page.waitForTimeout(80);
      const fit = await page.evaluate(() => {
        const r = document.getElementById('btnStart').getBoundingClientRect();
        return { bottom: Math.round(r.bottom), vh: window.innerHeight };
      });
      ok(fit.bottom <= fit.vh, `${label}: はじめるが収まる (下端 ${fit.bottom} / 画面 ${fit.vh})`);
      await ctx.close();
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

    // ------------------------------------------------ ホーム画面から独立起動
    section('ホーム画面から、ブラウザではなくアプリとして開ける');
    {
      const page = await browser.newPage();
      page.on('pageerror', (e) => errors.push('manifest: ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app);

      const href = await page.evaluate(() => {
        const l = document.querySelector('link[rel="manifest"]');
        return l ? l.getAttribute('href') : null;
      });
      ok(href === './manifest.json', `manifest が読み込まれている (${href})`);

      // ブラウザ自身に読ませて、書き方の間違いを見つけてもらう。
      // 自分で JSON.parse するだけだと、アイコンの綴り違いなどは通ってしまう
      const cdp = await page.context().newCDPSession(page);
      const parsed = await cdp.send('Page.getAppManifest');
      ok(parsed.errors.length === 0,
        parsed.errors.length ? 'ブラウザが見つけた間違い: ' + JSON.stringify(parsed.errors)
                             : 'ブラウザが manifest を読めて、間違いも無い');

      const mf = await (await page.request.get(URL + 'manifest.json')).json();
      ok(mf.display === 'standalone',
        `アドレスバー無しで開く指定 (display: ${mf.display})`);
      // GitHub Pages は /リポジトリ名/ の下に置かれるので、絶対パスだと壊れる
      ok(mf.start_url === './' && mf.scope === './',
        `パスが相対 (start_url: ${mf.start_url} / scope: ${mf.scope})`);

      // 宣言した大きさと、実物の大きさが合っているか
      const icons = [];
      for (const icon of mf.icons) {
        const real = await page.evaluate((src) => new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img.width + 'x' + img.height);
          img.onerror = () => resolve('読めない');
          img.src = src;
        }), icon.src);
        icons.push({ src: icon.src, real: real, said: icon.sizes });
      }
      const wrong = icons.filter((i) => i.real !== i.said);
      ok(wrong.length === 0,
        wrong.length ? '大きさが宣言と違う: ' + JSON.stringify(wrong)
                     : `アイコンが宣言どおりの大きさ (${icons.map((i) => i.said).join(', ')})`);
      ok(mf.icons.some((i) => i.purpose === 'maskable'),
        'Android で好きな形に切り抜かれる用のアイコンがある');
      await page.close();
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
