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
    illustrationBefore: document.getElementById('illustrationBefore'),
    illustrationBeforeUse: document.getElementById('illustrationBeforeUse'),
    illustrationAfter: document.getElementById('illustrationAfter'),
    illustrationAfterUse: document.getElementById('illustrationAfterUse'),
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

  /**
   * 2 コマを同じ場所で切り替える。
   *
   * CSS アニメーションではなく element.animate() を使う。同じフレーム内で
   * 種目を差し替えると、CSS 側は途中の状態を見ないまま次の絵になってしまい、
   * コマが 1 度も切り替わらないことがあるため。
   * ステップが変わるたびに呼び直すので、必ず 1 コマめ (before) から始まる。
   */
  function startFlip() {
    stopFlip();
    // 動きを減らす設定のときは切り替えない。CSS 側で 2 コマを横に並べている
    if (prefersReducedMotion()) return;

    // ぱっと切り替える (パラパラ漫画なので、間をなめらかにつながない)
    function cut(showsFirst) {
      const a = showsFirst ? 1 : 0;
      const b = showsFirst ? 0 : 1;
      return [
        { opacity: a, offset: 0 },
        { opacity: a, offset: 0.499 },
        { opacity: b, offset: 0.5 },
        { opacity: b, offset: 1 }
      ];
    }

    const timing = { duration: FLIP_MS * 2, iterations: Infinity };
    flipAnimations = [
      els.illustrationBefore.animate(cut(true), timing),
      els.illustrationAfter.animate(cut(false), timing)
    ];
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
      els.illustrationBeforeUse.setAttribute('href', '#ex' + step.exerciseIndex + '-before');
      els.illustrationAfterUse.setAttribute('href', '#ex' + step.exerciseIndex + '-after');
      const mirror = step.side === 'right';
      els.illustrationBefore.classList.toggle('mirror', mirror);
      els.illustrationAfter.classList.toggle('mirror', mirror);
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
