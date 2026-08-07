const test = require('node:test');
const assert = require('node:assert');
const Core = require('./core.js');

test('既定の種目は 7 種目、左右ぶんも合わせて 11 ステップになる', () => {
  const steps = Core.buildSteps(Core.DEFAULT_EXERCISES);
  assert.strictEqual(steps.length, 11);
});

test('左右のある種目は左→右の順で並ぶ', () => {
  const exercises = [{ name: 'テスト', reps: 20, sides: ['left', 'right'] }];
  const steps = Core.buildSteps(exercises);
  assert.deepStrictEqual(steps.map((s) => s.side), ['left', 'right']);
});

test('左右の無い種目は 1 ステップだけで、side は null', () => {
  const exercises = [{ name: 'テスト', reps: 20, sides: null }];
  const steps = Core.buildSteps(exercises);
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].side, null);
});

test('セッションは index 0 から始まり、種目名と回数を引ける', () => {
  const session = Core.createSession(Core.DEFAULT_EXERCISES);
  const step = Core.currentStep(session);
  assert.strictEqual(step.name, Core.DEFAULT_EXERCISES[0].name);
  assert.strictEqual(step.reps, 20);
  assert.strictEqual(step.side, 'left');
});

test('sideLabel は部位つきで表示する (例: 左足)', () => {
  const session = Core.createSession(Core.DEFAULT_EXERCISES);
  assert.strictEqual(Core.sideLabel(Core.currentStep(session)), '左足');
});

test('sideLabel は sideNoun が無ければ左右だけを返す', () => {
  assert.strictEqual(Core.sideLabel({ side: 'left', sideNoun: '' }), '左');
});

test('sideLabel は side が無ければ null を返す', () => {
  assert.strictEqual(Core.sideLabel({ side: null, sideNoun: '' }), null);
});

test('advanceSession でステップが 1 つずつ進む', () => {
  let session = Core.createSession(Core.DEFAULT_EXERCISES);
  session = Core.advanceSession(session);
  assert.strictEqual(Core.currentStep(session).side, 'right');
  session = Core.advanceSession(session);
  assert.strictEqual(Core.currentStep(session).exerciseIndex, 1);
});

test('retreatSession でステップが 1 つずつ戻る', () => {
  let session = Core.createSession(Core.DEFAULT_EXERCISES);
  session = Core.advanceSession(session);
  session = Core.advanceSession(session);
  assert.strictEqual(session.index, 2);
  session = Core.retreatSession(session);
  assert.strictEqual(session.index, 1);
  assert.strictEqual(Core.currentStep(session).side, 'right');
});

test('最初のステップより前には retreatSession しても戻らない', () => {
  const session = Core.createSession(Core.DEFAULT_EXERCISES);
  const retreated = Core.retreatSession(session);
  assert.strictEqual(retreated.index, 0);
});

test('最後まで進むと isSessionFinished が true になり、currentStep は null', () => {
  let session = Core.createSession(Core.DEFAULT_EXERCISES);
  const total = session.steps.length;
  for (let i = 0; i < total; i++) session = Core.advanceSession(session);
  assert.strictEqual(Core.isSessionFinished(session), true);
  assert.strictEqual(Core.currentStep(session), null);
});

test('終わったあとに advanceSession しても index が範囲外にはみ出さない', () => {
  let session = Core.createSession(Core.DEFAULT_EXERCISES);
  const total = session.steps.length;
  for (let i = 0; i < total + 5; i++) session = Core.advanceSession(session);
  assert.strictEqual(session.index, total);
});

test('sessionProgress は current が total を超えない', () => {
  let session = Core.createSession(Core.DEFAULT_EXERCISES);
  const total = session.steps.length;
  for (let i = 0; i < total + 3; i++) {
    session = Core.advanceSession(session);
    const progress = Core.sessionProgress(session);
    assert.ok(progress.current <= progress.total, `${progress.current} <= ${progress.total}`);
  }
});

test('sessionProgress は 1 始まりで、途中経過を正しく返す', () => {
  const session = Core.createSession(Core.DEFAULT_EXERCISES);
  assert.deepStrictEqual(Core.sessionProgress(session), { current: 1, total: 11 });
});
