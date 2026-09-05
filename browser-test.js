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
    ok(fit.title.includes('将棋'), `見出しが出ている (${fit.title})`);

    // ------------------------------------------------ タイトル
    section('タイトル');
    const modes = await phone.locator('.mode-btn').count();
    ok(modes === 6, `モードのボタンが並ぶ (${modes} 個: クイズ4 + ずかん + 年表)`);
    const totalNote = await phone.textContent('#total-note');
    ok(/全 \d+ 問/.test(totalNote), `問題数が出ている (${totalNote.trim()})`);

    // ずかんの札の数は data.js の中身と合っていること (手で書くと古くなる)
    const zukanDesc = await phone.evaluate(() => {
      const d = window.Data;
      return {
        text: document.querySelector('.mode-btn.is-zukan .desc').textContent,
        want: '囲い' + d.castles.length + '・手筋' + d.tesuji.length +
              '・戦法' + d.senpou.length
      };
    });
    ok(zukanDesc.text.startsWith(zukanDesc.want),
      `ずかんの札の数が中身と合う (${zukanDesc.want})`);

    // ------------------------------------------------ 囲いクイズ
    section('囲いクイズ');
    await phone.evaluate(() => window.__app.start('castle'));
    await phone.waitForTimeout(300);
    ok(await phone.locator('#screen-quiz.is-active').count() === 1, 'クイズ画面になる');
    ok(await phone.locator('.koma-choice').count() === 4, '選択肢が 4 つ出る');
    ok(await phone.locator('#stage .koma').count() > 5, '盤に駒が並ぶ');
    // 回帰: 囲いクイズにパラパラ再生バーは出ない (hidden が効かず出てしまったことがある)
    ok(await phone.locator('#player').isHidden(), '囲いクイズでは再生バーが隠れている');

    // 画面の入場アニメ (12px 上げる) が終わってから測る。
    // 途中で測ると、そのぶんを「駒が勝手に動いた」と数えてしまう。
    await phone.waitForTimeout(500);
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
    const komaSize = await phone.evaluate(() => {
      const k = document.querySelector('#stage .koma .face');
      const cs = getComputedStyle(k);
      return { font: parseFloat(cs.fontSize), w: k.getBoundingClientRect().width };
    });
    /* 9×9 の盤は、画面の高さから「選択肢 1 行ぶん」を残して大きさを決めている。
       せまい画面 (高さ664) では、盤を最大 (マス36px) にすると選択肢が 27px 隠れる。
       押せない選択肢のほうが困るので、そちらを優先して盤を少し小さくしている。
       実機 (高さ734〜) ではマス36px 以上、ホーム画面から開けばさらに大きい。 */
    ok(komaSize.font >= 16, `9×9 でも駒の字が読める大きさ (${komaSize.font.toFixed(1)}px)`);
    ok(komaSize.w >= 25, `駒じたいも十分な大きさ (${komaSize.w.toFixed(1)}px)`);

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
    // 直前の手: もといたマスが塗られ、動いた駒のふちが光る
    ok(await phone.locator('#stage .hl').isVisible(), 'もといたマスに印がつく');
    ok(await phone.locator('#stage .koma.last').count() === 1, '動いた駒のふちが光る');

    // 自動再生が最後まで進む (2 手目以降も動く)
    await phone.locator('#btn-play').tap();
    await phone.waitForTimeout(2500);
    const played = await phone.evaluate(() => window.__app.player().index);
    ok(played >= 3, `自動再生で手が進む (${played} 手目まで)`);

    // ------------------------------------------------ 詰将棋
    // 1手詰は「項目が多い」のでメニューには出していないが、
    // 中身とコードは残してある。いつでも戻せるよう、ここで動くことを見張る。
    section('1手詰クイズ (メニュー外)');
    await phone.evaluate(() => window.__app.start('tsume'));
    await phone.waitForTimeout(300);
    ok(await phone.locator('#hands').isVisible(), '持ち駒が出ている');
    // 持ち駒が空の問題 (開き王手など) もあるので、
    // 「持ち駒のある問題」を名ざしで出して駒札を確かめる
    await phone.evaluate(() => {
      const D = window.__app.data;
      window.__app.showOne('tsume', D.tsume.find((t) => t.hand));
    });
    await phone.waitForTimeout(200);
    ok(await phone.locator('#hands .hk').count() >= 1, '持ち駒が駒の形でならぶ');
    ok(await phone.locator('#player').isHidden(), '詰将棋では再生バーが隠れている');
    const moveChoices = await phone.locator('.pill.move').count();
    ok(moveChoices === 4, `指し手の選択肢が 4 つ (${moveChoices})`);

    // ------------------------------------------------ 選択肢が画面に入るか
    // 盤の切り取りが縦長 (5×9 など) だと、盤だけで画面がうまり、
    // 選択肢がスクロールしないと見えなくなっていた。全問ぶん測って見張る。
    section('選択肢が画面に入る');
    const overflow = await phone.evaluate(async () => {
      const D = window.__app.data;
      const ng = [];
      let minCell = 999;
      for (const [type, list] of [['castle', D.castles], ['tesuji', D.tesuji],
                                  ['tsume', D.tsume], ['senpou', D.senpou]]) {
        for (const item of list) {
          window.__app.showOne(type, item);
          await new Promise((r) => setTimeout(r, 25));
          const board = document.querySelector('.board');
          const cols = Number(getComputedStyle(board).getPropertyValue('--cols'));
          minCell = Math.min(minCell, board.getBoundingClientRect().width / cols);
          const top = document.querySelector('.choices').getBoundingClientRect().top;
          // 選択肢の 1 行 (88px) が画面に入っているか
          if (top + 88 > window.innerHeight) ng.push(item.name + ' (' + Math.round(top) + 'px)');
        }
      }
      return { ng: ng, minCell: Math.round(minCell) };
    });
    ok(overflow.ng.length === 0,
      overflow.ng.length ? '選択肢が画面からはみ出す問題がある: ' + overflow.ng.slice(0, 4).join(' / ')
                         : '全問で、選択肢の1行目がスクロールなしで見える');
    ok(overflow.minCell >= 24, `いちばん縦長の盤でも、マスが小さくなりすぎない (${overflow.minCell}px)`);

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

    // ------------------------------------------------ 年表
    section('年表');
    await phone.evaluate(() => window.__app.showNenpyo('ryuou'));
    await phone.waitForTimeout(400);
    const nTabs = await phone.locator('#nenpyo-tabs .tab').count();
    const nRows = await phone.locator('#nenpyo-list .n-row').count();
    // 「ぜんぶ」 + 棋戦ごとのタブ
    ok(nTabs === (await phone.evaluate(() => window.Titles.TITLES.length)) + 1,
      `棋戦のタブが全部出る (${nTabs} 個: ぜんぶ + 棋戦10)`);
    ok(nRows >= 3, `年表がならぶ (${nRows} 行)`);
    const nenpyo = await phone.evaluate(() => {
      const t = window.Titles.TITLES.find((x) => x.key === 'ryuou');
      const rows = [...document.querySelectorAll('#nenpyo-list .n-row')];
      const first = rows[0].querySelector('.n-name').textContent;
      // 連覇でまとめているので、行数は期の数以下になる
      return { first: first, rows: rows.length, ki: t.holders.length,
               want: t.holders[0].name,
               gaps: document.querySelectorAll('#nenpyo-list .n-gap').length,
               range: document.getElementById('nenpyo-range').textContent };
    });
    ok(nenpyo.first === nenpyo.want, `いちばん古い期の人が先頭に出る (${nenpyo.first})`);
    ok(nenpyo.rows < nenpyo.ki, `連覇はひとまとめになる (${nenpyo.ki} 年 → ${nenpyo.rows} 行)`);
    ok(/\d{4}年度 〜 \d{4}年度/.test(nenpyo.range), `収録の年度が出ている (${nenpyo.range.slice(0, 22)}…)`);
    // 名人戦には、行われなかった年度が 5 つある。その札が出るか
    await phone.evaluate(() => window.__app.showNenpyo('meijin'));
    await phone.waitForTimeout(300);
    const meijinGaps = await phone.evaluate(() => ({
      gaps: document.querySelectorAll('#nenpyo-list .n-gap').length,
      want: Object.keys(window.Titles.TITLES.find((t) => t.key === 'meijin').gaps).length
    }));
    ok(meijinGaps.gaps === meijinGaps.want,
      `行われなかった年度の札が出る (${meijinGaps.gaps} 件)`);
    // 8タイトルを横にならべた一覧
    await phone.evaluate(() => window.__app.showNenpyo('all'));
    await phone.waitForTimeout(500);
    const grid = await phone.evaluate(() => {
      const rows = [...document.querySelectorAll('.n-grid tbody tr')];
      const hs = rows.map((tr) => Math.round(tr.getBoundingClientRect().height));
      // 名前が何行に折り返されたか (1文字ずつ y 座標を見る)
      let ooi = 0;
      for (const nm of document.querySelectorAll('.n-nm')) {
        const t = nm.firstChild;
        const ys = new Set();
        for (let i = 0; i < t.length; i++) {
          const r = document.createRange();
          r.setStart(t, i); r.setEnd(t, i + 1);
          ys.add(Math.round(r.getBoundingClientRect().y));
        }
        if (ys.size > 2) ooi++;
      }
      return {
        head: [...document.querySelectorAll('.n-gh')].map((e) => e.textContent).join(''),
        cells: document.querySelectorAll('.n-cell').length,
        named: document.querySelectorAll('.n-nm').length,
        over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        first: rows[0].querySelector('.n-gy').textContent,
        last: rows[rows.length - 1].querySelector('.n-gy').textContent,
        lo: Math.min.apply(null, hs), hi: Math.max.apply(null, hs),
        ooi: ooi
      };
    });
    ok(grid.head === '年度竜王名人叡王王位王座棋王王将棋聖',
      `8タイトルが横にならぶ (${grid.head})`);
    ok(grid.cells > 300 && grid.named === grid.cells,
      `どのマスにも名前が入る (${grid.named} / ${grid.cells} マス)`);
    // まだ指していない年度は「まだ」。棋戦が無かった年 (ハッチ) とは別もの
    const mada = await phone.evaluate(() => {
      const rows = [...document.querySelectorAll('.n-grid tbody tr')];
      const ue = rows[0];
      return { ue: ue.querySelectorAll('.n-mada').length,
               shita: rows[rows.length - 1].querySelectorAll('.n-mada').length,
               nashi: document.querySelectorAll('.n-none').length };
    });
    ok(mada.ue > 0 && mada.shita === 0 && mada.nashi > 0,
      `これから指す年は「まだ」、棋戦が無かった年とは別に出る (いちばん上の年に ${mada.ue} 件)`);
    ok(grid.over <= 1, `一覧が画面の幅におさまる (はみ出し ${grid.over}px)`);
    ok(Number(grid.first) > Number(grid.last),
      `新しい年が上にくる (${grid.first} → ${grid.last})`);
    ok(grid.ooi === 0, `名前が 2 行におさまる (3行になったもの ${grid.ooi} 件)`);
    ok(grid.hi - grid.lo <= 6, `行の高さがそろう (${grid.lo}〜${grid.hi}px)`);
    await phone.locator('.n-cell').first().tap();
    await phone.waitForTimeout(200);
    const pick = await phone.evaluate(() => {
      const p = document.getElementById('nenpyo-pick');
      return { hidden: p.hidden, text: p.textContent };
    });
    ok(!pick.hidden && /年度/.test(pick.text), `マスをおすと、だれか出る (${pick.text})`);

    // 棋聖戦は1994年度まで年2回。前期/後期が年に付くか
    await phone.evaluate(() => window.__app.showNenpyo('kisei'));
    await phone.waitForTimeout(300);
    const kiseiYear = await phone.evaluate(() =>
      document.querySelector('#nenpyo-list .n-row .n-year b').textContent);
    ok(/^\d{4}(前|後)$/.test(kiseiYear), `棋聖戦は前期・後期が付く (${kiseiYear})`);
    await phone.locator('#nenpyo-tabs .tab').nth(1).tap();
    await phone.waitForTimeout(300);
    ok(await phone.locator('#nenpyo-list .n-row').count() >= 3, 'タブを変えると別の棋戦が出る');

    // ------------------------------------------------ 画面のはみ出し
    section('スマホ幅');
    for (const [name, go] of [
      ['タイトル', "window.__app.showScreen('screen-title')"],
      ['戦法クイズ', "window.__app.start('senpou')"],
      ['ずかん', "window.__app.showZukan('tesuji')"],
      ['年表', "window.__app.showNenpyo()"]
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
      ok(false, 'ホーム画面用のアイコン指定が無い (1枚ものに焼くとき落としていないか)');
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
