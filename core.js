/*!
 * core.js — ロジック。DOM を触らないので node でテストできる。
 *
 * ブラウザでは <script> で読み込むと window.Core になり、
 * node からは require() できる。
 *
 * このアプリは「決まった種目を、順番に、左右ぶんこなす」だけの
 * 一本道。回数(20回など)は表示するだけで、アプリ側では数えない
 * — 運動中はボールを抱えていたり寝転んでいたりでタップしづらいため。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.Core = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WARMUP_NOTE = '肩と膝の上を温めてから始めましょう。';

  const SIDE_LABELS = { left: '左', right: '右' };

  // 左右のある種目は sides に ['left', 'right'] (または指定された順) を、無いものは null を入れる。
  // sideNoun を付けると「左足」のように部位つきで表示する (省略すると「左」だけ)。
  // 扇風機の首振りや振り子のように、両足(両手)をくっつけたまま左右へ振り続け、
  // 止めて数えないような動きは 1 ステップ (sides: null) にする
  // — 左右に分けると実際の動きと合わなくなる。
  // 横向きに寝て左右で体の向きそのものが変わる種目は、sideNames で
  // 「左向きに寝て…」のように片側ごとに文面を変えられる。
  const DEFAULT_EXERCISES = [
    { name: '仰向けに寝て、足を膝立ちにして右に倒す・左に倒す', reps: 20, sides: null },
    { name: '横向きに寝て、膝を曲げて開く・閉じる', reps: 20, sides: null },
    {
      name: '横向きに寝て、手を伸ばして開く・閉じる',
      reps: 20,
      sides: ['left', 'right'],
      sideNoun: '手',
      sideNames: {
        left: '左向きに寝て、左手を伸ばして開く・閉じる',
        right: '右向きに寝て、右手を伸ばして開く・閉じる'
      }
    },
    { name: '椅子に浅く座り、バランスボールを抱えて体をひねる', reps: 20, sides: null },
    { name: '椅子に浅く座り、バランスボールを抱えて体を倒す', reps: 20, sides: null },
    { name: '椅子に浅く座り、バランスボールを持って上げ下げする', reps: 20, sides: null },
    { name: '椅子に浅く座り、トゲトゲボールを足で踏んで転がす', reps: 20, sides: ['left', 'right'], sideNoun: '足' }
  ];

  /** 種目リストを「1 ステップ = 1 回のできたボタン」の並びに崩す。 */
  function buildSteps(exercises) {
    const steps = [];
    exercises.forEach(function (exercise, exerciseIndex) {
      const sides = exercise.sides && exercise.sides.length ? exercise.sides : [null];
      sides.forEach(function (side) {
        const name = (exercise.sideNames && side && exercise.sideNames[side]) || exercise.name;
        steps.push({
          exerciseIndex: exerciseIndex,
          name: name,
          reps: exercise.reps,
          side: side,
          sideNoun: exercise.sideNoun || ''
        });
      });
    });
    return steps;
  }

  /** 表示用の左右ラベル。sideNoun があれば「左足」のように部位つきで返す。 */
  function sideLabel(step) {
    if (!step.side) return null;
    return SIDE_LABELS[step.side] + (step.sideNoun || '');
  }

  function createSession(exercises) {
    return { steps: buildSteps(exercises), index: 0 };
  }

  function isSessionFinished(session) {
    return session.index >= session.steps.length;
  }

  function currentStep(session) {
    return isSessionFinished(session) ? null : session.steps[session.index];
  }

  /** 終わっていれば何もしない (index が範囲外に出るのを防ぐ)。 */
  function advanceSession(session) {
    if (isSessionFinished(session)) return session;
    return Object.assign({}, session, { index: session.index + 1 });
  }

  /** 最初のステップより前には戻らない。 */
  function retreatSession(session) {
    if (session.index <= 0) return session;
    return Object.assign({}, session, { index: session.index - 1 });
  }

  /** 進捗表示用。current は total を超えない。 */
  function sessionProgress(session) {
    const total = session.steps.length;
    const current = Math.min(session.index + 1, total);
    return { current: current, total: total };
  }

  return {
    WARMUP_NOTE: WARMUP_NOTE,
    SIDE_LABELS: SIDE_LABELS,
    DEFAULT_EXERCISES: DEFAULT_EXERCISES,
    buildSteps: buildSteps,
    createSession: createSession,
    isSessionFinished: isSessionFinished,
    currentStep: currentStep,
    advanceSession: advanceSession,
    retreatSession: retreatSession,
    sessionProgress: sessionProgress,
    sideLabel: sideLabel
  };
});
