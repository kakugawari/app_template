/*!
 * app.js — 画面まわり。操作と描画はここに書く。
 *
 * 画面は「準備 (warmup) → 実行 (running) → 完了 (done)」の一本道。
 * 実行画面は 1 ステップ(= 1 種目の片側ぶん)ずつ「できた」で進める。
 */
(function () {
  'use strict';

  const C = window.Core;

  const els = {
    screenWarmup: document.getElementById('screenWarmup'),
    screenRun: document.getElementById('screenRun'),
    screenDone: document.getElementById('screenDone'),
    screenCustom: document.getElementById('screenCustom'),
    mascot: document.getElementById('mascot'),
    mascotPreview: document.getElementById('mascotPreview'),
    stampSlots: document.getElementById('stampSlots'),
    stampNote: document.getElementById('stampNote'),
    cardCount: document.getElementById('cardCount'),
    skinChips: document.getElementById('skinChips'),
    gearChips: document.getElementById('gearChips'),
    btnResume: document.getElementById('btnResume'),
    btnCustom: document.getElementById('btnCustom'),
    btnCloseCustom: document.getElementById('btnCloseCustom'),
    warmupText: document.getElementById('warmupText'),
    progress: document.getElementById('progress'),
    progressBarFill: document.getElementById('progressBarFill'),
    illustrationRow: document.getElementById('illustrationRow'),
    exerciseName: document.getElementById('exerciseName'),
    side: document.getElementById('side'),
    reps: document.getElementById('reps'),
    btnStart: document.getElementById('btnStart'),
    btnBack: document.getElementById('btnBack'),
    btnDone: document.getElementById('btnDone'),
    btnAgain: document.getElementById('btnAgain'),
    btnRestart: document.getElementById('btnRestart')
  };

  /** 記録のしまい場所。読めなくても落とさない (プライベートモードなど) */
  const STORE_KEY = 'stretch-routine-record';

  function loadRecord() {
    try {
      return C.normalizeRecord(JSON.parse(localStorage.getItem(STORE_KEY)));
    } catch (e) {
      return C.createRecord();
    }
  }

  function saveRecord(record) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(record));
    } catch (e) {
      // 保存できなくても、その回のスタンプは画面に出したいので黙って続ける
    }
  }

  /** 途中でやめた位置。スタンプの記録とは別のものなので、しまう場所も分ける */
  const PROGRESS_KEY = 'stretch-routine-progress';

  function loadProgress(total) {
    try {
      return C.normalizeProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY)), total);
    } catch (e) {
      return null;
    }
  }

  function saveProgress(session) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(C.createProgress(session)));
    } catch (e) {
      // 保存できなくても、いまやっている 1 周は最後まで続けられる
    }
  }

  function clearProgress() {
    try {
      localStorage.removeItem(PROGRESS_KEY);
    } catch (e) {
      // 消せなくても、次に読むとき normalizeProgress が弾く
    }
  }

  const state = {
    screen: 'warmup', // 'warmup' | 'running' | 'done' | 'custom'
    session: C.createSession(C.DEFAULT_EXERCISES),
    record: loadRecord(),
    /** 前回とちゅうでやめた位置。無ければ null */
    resume: loadProgress(C.buildSteps(C.DEFAULT_EXERCISES).length),
    /** 押したてのスタンプ。準備画面に戻ったときに 1 度だけ動かす */
    freshStamp: false
  };

  /** パラパラ漫画の 1 コマぶんの長さ (ミリ秒)。動きの速さの目安にもなる */
  const FLIP_MS = 1000;

  /** 動かしている最中のアニメーション。止めるときに使う */
  let flipAnimations = [];

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function stopFlip() {
    flipAnimations.forEach(function (a) { a.cancel(); });
    flipAnimations = [];
  }

  // ---------------------------------------------------------------- 画面の消灯

  /**
   * ストレッチ中は画面を消さない。
   *
   * 20 回やっているあいだはスマホを触れないので、放っておくと必ず消灯し、
   * 次の種目に進むのに毎回ロック解除が要る。
   *
   * 使えない端末や、断られた場合は黙って諦める (画面が消えるだけで、
   * アプリとしては困らない)。
   */
  let screenLock = null;

  function keepScreenOn() {
    if (screenLock || !('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      // 待っているあいだに実行画面から離れていたら、すぐ返す
      if (state.screen !== 'running') {
        lock.release().catch(function () {});
        return;
      }
      screenLock = lock;
      // 画面を閉じたりタブを移ると、ブラウザが勝手に解除する。
      // 持っているつもりのまま握り直せなくなるので、参照も捨てる。
      lock.addEventListener('release', function () { screenLock = null; });
    }).catch(function () {
      // 電池残量が少ないときなどは断られる。そのまま続ける
    });
  }

  function letScreenSleep() {
    if (!screenLock) return;
    const lock = screenLock;
    screenLock = null;
    lock.release().catch(function () {});
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svgUse(className, href) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', href);
    svg.appendChild(use);
    return svg;
  }

  /**
   * ステップのコマ割りぶんだけイラストを並べ直す。
   *
   * 切り替えるときは全コマを同じマスに重ね (並べる位置は CSS が受け持つ)、
   * 動きを減らす設定のときは重複を除いたコマを矢印でつないで横に並べる。
   */
  function buildIllustration(step) {
    const calm = prefersReducedMotion();
    const frames = calm ? C.uniqueFrames(step.frames) : step.frames;
    const mirror = step.side === 'right' ? ' mirror' : '';

    els.illustrationRow.textContent = '';
    frames.forEach(function (frame, i) {
      if (calm && i > 0) {
        els.illustrationRow.appendChild(svgUse('illustrationArrow', '#iconArrow'));
      }
      els.illustrationRow.appendChild(
        svgUse('illustration' + mirror, '#' + step.art + '-' + frame));
    });
  }

  /**
   * 並べたコマを、1 コマずつ順ぐりに見せる。
   *
   * CSS アニメーションではなく element.animate() を使う。同じフレーム内で
   * 種目を差し替えると、CSS 側は途中の状態を見ないまま次の絵になってしまい、
   * コマが 1 度も切り替わらないことがあるため。
   * ステップが変わるたびに呼び直すので、必ず 1 コマめから始まる。
   */
  function startFlip() {
    stopFlip();
    // 動きを減らす設定のときは切り替えない。すでに横に並べてある
    if (prefersReducedMotion()) return;

    const shots = els.illustrationRow.querySelectorAll('.illustration');
    if (shots.length < 2) return;

    // ぱっと切り替える (パラパラ漫画なので、間をなめらかにつながない)。
    // i 番めのコマは i/n 〜 (i+1)/n のあいだだけ見せる。
    const n = shots.length;
    const eps = 0.001 / n;
    const timing = { duration: FLIP_MS * n, iterations: Infinity };

    flipAnimations = Array.prototype.map.call(shots, function (shot, i) {
      const from = i / n;
      const to = (i + 1) / n;
      const keys = [{ opacity: i === 0 ? 1 : 0, offset: 0 }];
      if (i > 0) {
        keys.push({ opacity: 0, offset: from - eps });
        keys.push({ opacity: 1, offset: from });
      }
      keys.push({ opacity: 1, offset: to - eps });
      keys.push({ opacity: 0, offset: to });
      if (to < 1) keys.push({ opacity: 0, offset: 1 });
      return shot.animate(keys, timing);
    });
  }

  // ---------------------------------------------------------------- アプリの人

  /**
   * 飾りつきの人を組み立てる。
   * symbol + <use> にしないのは、<use> の中身が影の木に複製されてしまい、
   * 飾りだけを外から出し入れできないため。ここは直に組み立てる。
   */
  function drawMascot(svg, gear) {
    const has = function (id) { return gear.indexOf(id) >= 0; };
    svg.innerHTML =
      // マントは体の後ろ。先に描いて下に敷く
      (has('cape') ? '<path class="gear-fill" opacity=".85" d="M50 52 L34 98 Q60 108 86 98 L70 52 Z"/>' : '') +
      '<circle cx="60" cy="34" r="13" fill="currentColor"/>' +
      '<path d="M60 50 L60 78" stroke="currentColor" stroke-width="17" stroke-linecap="round" fill="none"/>' +
      '<g stroke="currentColor" stroke-width="9" stroke-linecap="round" fill="none">' +
      '<path d="M60 56 L38 34"/><path d="M60 56 L82 34"/>' +
      '<path d="M60 78 L48 104"/><path d="M60 78 L72 104"/></g>' +
      (has('headband') ? '<path class="gear" stroke-width="6" d="M46 29 L74 29"/>' : '') +
      (has('wristband') ? '<g class="gear" stroke-width="6">'
        + '<path d="M37 39 L43 33"/><path d="M77 33 L83 39"/></g>' : '');
  }

  // ---------------------------------------------------------------- スタンプ

  /** マスごとの傾き。手で押したように少しずつ違えるが、毎回同じ角度にする
      (乱数にすると描き直すたびに動いて、押していないスタンプまで揺れる) */
  const STAMP_TILT = [-7, 5, -3, 8, -6, 4, -8, 6, -4, 7];

  function stampMarkup() {
    return '<svg class="stampMark" viewBox="0 0 40 40" aria-hidden="true">'
      + '<circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".9"/>'
      + '<path fill="currentColor" d="M20 8 L23.2 16.2 L32 16.6 L25.2 22.2 L27.4 30.6'
      + ' L20 25.8 L12.6 30.6 L14.8 22.2 L8 16.6 L16.8 16.2 Z"/></svg>';
  }

  function tiltOf(i) { return STAMP_TILT[i % STAMP_TILT.length]; }

  /**
   * スタンプを押す。大きく浮いた状態から一気に降りてきて、
   * 紙に当たって少し沈み、跳ね返って止まる。
   *
   * 動かし終わりの角度は CSS で当てている角度と同じにしてある。
   * ここがずれると、アニメが終わった瞬間にスタンプが跳ねて見える。
   */
  function pressStamp(mark, i) {
    if (prefersReducedMotion()) return;
    const tilt = tiltOf(i);
    const at = function (scale, deg, opacity, offset, easing) {
      return {
        transform: 'scale(' + scale + ') rotate(' + deg + 'deg)',
        opacity: opacity, offset: offset, easing: easing
      };
    };
    // イージングはコマごとに持たせる。timing 側にまとめてかけると
    // 進み方が曲がって、せっかく決めた offset が実時間とずれる
    // (浮いている時間がほぼ 0 になり、押した感じが出なかった)。
    mark.animate([
      at(2.9, tilt - 16, 0, 0, 'ease-out'),           // 大きく浮いた状態で現れ
      at(2.6, tilt - 13, 1, 0.22, 'cubic-bezier(.55,0,.35,1)'), // ここから一気に降りて
      at(0.86, tilt + 3, 1, 0.62, 'ease-out'),        // 紙に当たって少し沈み
      at(1.1, tilt - 2, 1, 0.78, 'ease-out'),         // 跳ね返って
      at(1, tilt, 1, 1)                               // 止まる
    ], { duration: 560 });
  }

  function renderStampCard(pressNewest) {
    const record = state.record;
    const filled = C.filledSlots(record);
    const cards = C.completedCards(record);
    els.cardCount.textContent = (C.justFilledCard(record) ? cards : cards + 1) + ' 枚目';

    els.stampSlots.textContent = '';
    for (let i = 0; i < C.CARD_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i < filled ? ' is-filled' : '');
      if (i < filled) {
        slot.innerHTML = stampMarkup();
        slot.firstChild.style.transform = 'rotate(' + tiltOf(i) + 'deg)';
      }
      els.stampSlots.appendChild(slot);
    }

    if (pressNewest && filled > 0) {
      pressStamp(els.stampSlots.children[filled - 1].firstChild, filled - 1);
    }
  }

  function stampNote(pressNewest) {
    const record = state.record;
    const reward = C.rewardAt(record);
    // 途中でやめていたら、まずどこまでやったかを知らせる。
    // いま開いた人がいちばん知りたいのはそこ
    if (state.resume) {
      return state.resume.index + 1 + ' / ' + state.resume.total + ' まで進んでいます。'
        + '通算スタンプ ' + record.stamps + ' 個。';
    }
    if (pressNewest && reward) {
      return 'カードが ' + C.completedCards(record) + ' 枚うまりました。'
        + '「' + reward.name + '」をもらいました。きせかえから使えます。';
    }
    if (record.stamps === 0) {
      return '1 周やりきるとスタンプが 1 つたまります。'
        + C.CARD_SIZE + ' 個でカードが 1 枚うまります。';
    }
    const left = C.CARD_SIZE - C.filledSlots(record);
    return '通算 ' + record.stamps + ' 個。'
      + (left === 0 ? '次のスタンプから新しいカードです。' : 'あと ' + left + ' 個でカードがうまります。');
  }

  // ---------------------------------------------------------------- きせかえ

  const SKIN_NAMES = { classic: 'クラシック' };
  C.REWARDS.forEach(function (r) { if (r.kind === 'skin') SKIN_NAMES[r.id] = r.name; });

  function applySkin() {
    document.documentElement.dataset.skin = state.record.skin;
  }

  function chip(label, pressed, locked, onPick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = locked ? label + '(まだ)' : label;
    b.setAttribute('aria-pressed', String(pressed));
    b.disabled = locked;
    if (!locked) b.addEventListener('click', onPick);
    return b;
  }

  function renderCustom() {
    const record = state.record;
    drawMascot(els.mascotPreview, record.gear);

    els.skinChips.textContent = '';
    [C.DEFAULT_SKIN].concat(C.REWARDS.filter(function (r) { return r.kind === 'skin'; })
      .map(function (r) { return r.id; })).forEach(function (id) {
      const locked = id !== C.DEFAULT_SKIN && !C.isUnlocked(record, id);
      els.skinChips.appendChild(chip(SKIN_NAMES[id], record.skin === id, locked, function () {
        state.record = Object.assign({}, state.record, { skin: id });
        saveRecord(state.record);
        applySkin();
        renderCustom();
      }));
    });

    els.gearChips.textContent = '';
    C.REWARDS.filter(function (r) { return r.kind === 'gear'; }).forEach(function (r) {
      const locked = !C.isUnlocked(record, r.id);
      const on = record.gear.indexOf(r.id) >= 0;
      els.gearChips.appendChild(chip(r.name, on, locked, function () {
        const gear = on
          ? state.record.gear.filter(function (g) { return g !== r.id; })
          : state.record.gear.concat([r.id]);
        state.record = Object.assign({}, state.record, { gear: gear });
        saveRecord(state.record);
        renderCustom();
      }));
    });
  }

  function render() {
    els.screenCustom.hidden = state.screen !== 'custom';
    els.screenWarmup.hidden = state.screen !== 'warmup';
    els.screenRun.hidden = state.screen !== 'running';
    els.screenDone.hidden = state.screen !== 'done';

    if (state.screen === 'running') {
      keepScreenOn();
    } else {
      stopFlip();
      letScreenSleep();
    }

    if (state.screen === 'custom') {
      renderCustom();
      return;
    }

    if (state.screen === 'warmup') {
      els.warmupText.textContent = C.WARMUP_NOTE;
      drawMascot(els.mascot, state.record.gear);
      // 押したてのスタンプは 1 度だけ動かす。描き直すたびに動くと、
      // きせかえから戻ってくるだけで何度も押されているように見える
      const pressNewest = state.freshStamp;
      state.freshStamp = false;
      renderStampCard(pressNewest);
      els.stampNote.textContent = stampNote(pressNewest);
      els.btnCustom.hidden = C.unlockedRewards(state.record).length === 0;

      // 途中でやめていたら「つづきから」を出し、そちらを主なボタンにする。
      // 「はじめる」は残しておく (最初からやり直したい日もある)
      // どこまで進んだかはボタンに入れず、下の文章に出す。
      // 狭い画面だとボタンの中で文字が折り返し、ボタンごと縦に伸びるため
      const canResume = !!state.resume;
      els.btnResume.hidden = !canResume;
      els.btnStart.classList.toggle('btn-primary', !canResume);
      return;
    }

    if (state.screen === 'running') {
      const step = C.currentStep(state.session);
      const progress = C.sessionProgress(state.session);
      els.progress.textContent = progress.current + ' / ' + progress.total;
      els.progressBarFill.style.width = (C.sessionRatio(state.session) * 100) + '%';
      buildIllustration(step);
      startFlip();
      els.exerciseName.textContent = step.name;
      els.reps.textContent = String(step.reps);
      els.side.classList.toggle('is-empty', !step.side);
      els.side.textContent = step.side ? C.sideLabel(step) : ' ';
    }
  }

  /** はじめから。途中の位置は捨てて 1 ステップめに戻す */
  function start() {
    state.session = C.createSession(C.DEFAULT_EXERCISES);
    clearProgress();
    enterRunning();
  }

  /** つづきから。閉じたところから再開する */
  function resume() {
    if (!state.resume) return start();
    state.session = Object.assign({}, state.session, { index: state.resume.index });
    enterRunning();
  }

  function enterRunning() {
    state.screen = 'running';
    state.resume = null;
    // 前のセッションで押した「できた」の連打よけがまだ解けていなくても、
    // 新しく始めるならここで必ず解いておく。解けるまで待たせると、
    // 最初のステップの「できた」が理由もなく反応しないことがある。
    doneLocked = false;
    els.btnDone.disabled = false;
    render();
  }

  /**
   * 「できた」を連打すると、実際にストレッチをしていなくても
   * 一瞬で 17 ステップぶん進んでスタンプまでついてしまう
   * (実測: 連続で押すと index が 0 → 2 のように 2 つ以上進む)。
   * 一定時間は次のタップを受け付けないことで、連打で素通りできないようにする。
   */
  const TAP_COOLDOWN_MS = 500;
  let doneLocked = false;

  function tapDone() {
    if (doneLocked) return;
    doneLocked = true;
    els.btnDone.disabled = true;
    complete();
    setTimeout(function () {
      doneLocked = false;
      els.btnDone.disabled = false;
    }, TAP_COOLDOWN_MS);
  }

  function complete() {
    state.session = C.advanceSession(state.session);
    if (C.isSessionFinished(state.session)) {
      state.screen = 'done';
      // 1 周やりきったのでスタンプが 1 つたまる。準備画面に戻ったときに押す
      state.record = C.addStamp(state.record);
      saveRecord(state.record);
      state.freshStamp = true;
      clearProgress(); // やりきったので、続きはもう無い
    } else {
      // 1 ステップ進むたびに位置を残す。ここで残しておかないと、
      // 電話や画面ロックで閉じたときに最初からやり直しになる
      saveProgress(state.session);
    }
    render();
  }

  function restart() {
    state.screen = 'warmup';
    state.session = C.createSession(C.DEFAULT_EXERCISES);
    state.resume = null;
    clearProgress();
    render();
  }

  /** 最初のステップなら準備画面へ、それ以外は1つ前のステップへ戻る。 */
  function goBack() {
    if (state.session.index === 0) {
      state.screen = 'warmup';
      // 1 ステップめまで戻ったので、続きとして残すものは無い
      clearProgress();
    } else {
      state.session = C.retreatSession(state.session);
      saveProgress(state.session);
    }
    render();
  }

  function main() {
    els.btnStart.addEventListener('click', start);
    els.btnResume.addEventListener('click', resume);
    els.btnBack.addEventListener('click', goBack);
    els.btnDone.addEventListener('click', tapDone);
    els.btnAgain.addEventListener('click', restart);
    els.btnRestart.addEventListener('click', restart);
    els.btnCustom.addEventListener('click', function () {
      state.screen = 'custom';
      render();
    });
    els.btnCloseCustom.addEventListener('click', function () {
      state.screen = 'warmup';
      render();
    });
    // 画面を閉じたりタブを移ると、ブラウザが Wake Lock を勝手に解除する。
    // 戻ってきたときに握り直さないと、そこから先は画面が消えるようになる。
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && state.screen === 'running') keepScreenOn();
    });

    applySkin();
    render();

    // 自動テストから中身をのぞくための入口
    window.__app = {
      state: function () { return state; },
      start: start,
      resume: resume,
      /** いま画面の消灯を止めているか */
      screenHeldOn: function () { return !!screenLock; },
      complete: complete,
      restart: restart,
      goBack: goBack,
      render: render,
      flipMs: FLIP_MS,
      tapCooldownMs: TAP_COOLDOWN_MS,
      /** テストから、たまった状態を作って見た目を確かめるための入口 */
      setStamps: function (n) {
        state.record = C.normalizeRecord({ stamps: n, skin: state.record.skin, gear: state.record.gear });
        saveRecord(state.record);
        applySkin();
        render();
      }
    };
  }

  main();
})();
