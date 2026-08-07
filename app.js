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
    illustration: document.getElementById('illustration'),
    illustrationUse: document.getElementById('illustrationUse'),
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

  function render() {
    els.screenWarmup.hidden = state.screen !== 'warmup';
    els.screenRun.hidden = state.screen !== 'running';
    els.screenDone.hidden = state.screen !== 'done';

    if (state.screen === 'warmup') {
      els.warmupText.textContent = C.WARMUP_NOTE;
      return;
    }

    if (state.screen === 'running') {
      const step = C.currentStep(state.session);
      const progress = C.sessionProgress(state.session);
      els.progress.textContent = progress.current + ' / ' + progress.total;
      els.illustrationUse.setAttribute('href', '#ex' + step.exerciseIndex);
      els.illustration.classList.toggle('mirror', step.side === 'right');
      els.exerciseName.textContent = step.name;
      els.reps.textContent = String(step.reps);
      if (step.side) {
        els.side.hidden = false;
        els.side.textContent = C.SIDE_LABELS[step.side];
      } else {
        els.side.hidden = true;
      }
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
      render: render
    };
  }

  main();
})();
