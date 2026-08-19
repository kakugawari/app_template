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

  const state = {
    screen: 'warmup', // 'warmup' | 'running' | 'done'
    session: C.createSession(C.DEFAULT_EXERCISES)
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
        svgUse('illustration' + mirror, '#ex' + step.exerciseIndex + '-' + frame));
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

  function render() {
    els.screenWarmup.hidden = state.screen !== 'warmup';
    els.screenRun.hidden = state.screen !== 'running';
    els.screenDone.hidden = state.screen !== 'done';

    if (state.screen !== 'running') stopFlip();

    if (state.screen === 'warmup') {
      els.warmupText.textContent = C.WARMUP_NOTE;
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

  function start() {
    state.screen = 'running';
    render();
  }

  function complete() {
    state.session = C.advanceSession(state.session);
    if (C.isSessionFinished(state.session)) {
      state.screen = 'done';
    }
    render();
  }

  function restart() {
    state.screen = 'warmup';
    state.session = C.createSession(C.DEFAULT_EXERCISES);
    render();
  }

  /** 最初のステップなら準備画面へ、それ以外は1つ前のステップへ戻る。 */
  function goBack() {
    if (state.session.index === 0) {
      state.screen = 'warmup';
    } else {
      state.session = C.retreatSession(state.session);
    }
    render();
  }

  function main() {
    els.btnStart.addEventListener('click', start);
    els.btnBack.addEventListener('click', goBack);
    els.btnDone.addEventListener('click', complete);
    els.btnAgain.addEventListener('click', restart);
    els.btnRestart.addEventListener('click', restart);
    render();

    // 自動テストから中身をのぞくための入口
    window.__app = {
      state: function () { return state; },
      start: start,
      complete: complete,
      restart: restart,
      goBack: goBack,
      render: render,
      flipMs: FLIP_MS
    };
  }

  main();
})();
