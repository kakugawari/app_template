const test = require('node:test');
const assert = require('node:assert');
const Core = require('./core.js');

test('既定の種目は 11 種目、左右ぶんも合わせて 17 ステップになる', () => {
  const steps = Core.buildSteps(Core.DEFAULT_EXERCISES);
  assert.strictEqual(Core.DEFAULT_EXERCISES.length, 11);
  assert.strictEqual(steps.length, 17);
});

test('すべての種目に art (イラストの名前) がついていて、重複していない', () => {
  const arts = Core.DEFAULT_EXERCISES.map((e) => e.art);
  assert.ok(arts.every((a) => typeof a === 'string' && a.length > 0), JSON.stringify(arts));
  assert.strictEqual(new Set(arts).size, arts.length, '重複あり: ' + arts.join(', '));
});

test('並びは 寝る → 四つん這い → 立つ → 座る の順になっている', () => {
  assert.deepStrictEqual(Core.DEFAULT_EXERCISES.map((e) => e.art), [
    'kneeFall', 'hipTwist', 'sideKnee', 'sideArm', 'sideOpen',
    'catPose',
    'wallHip',
    'chairTwist', 'chairLean', 'chairLift', 'footRoll'
  ]);
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

test('sideNames があれば、side ごとに違う name を返す', () => {
  const exercises = [{
    name: '既定の名前',
    reps: 10,
    sides: ['left', 'right'],
    sideNames: { left: '左向きに寝て', right: '右向きに寝て' }
  }];
  const steps = Core.buildSteps(exercises);
  assert.strictEqual(steps[0].name, '左向きに寝て');
  assert.strictEqual(steps[1].name, '右向きに寝て');
});

test('sideNames が無ければ既定の name を使う', () => {
  const exercises = [{ name: '既定の名前', reps: 10, sides: ['left', 'right'] }];
  const steps = Core.buildSteps(exercises);
  assert.strictEqual(steps[0].name, '既定の名前');
  assert.strictEqual(steps[1].name, '既定の名前');
});

test('sideLabel は部位つきで表示する (例: 左足)', () => {
  assert.strictEqual(Core.sideLabel({ side: 'left', sideNoun: '足' }), '左足');
});

test('sideLabel は sideNoun が無ければ左右だけを返す', () => {
  assert.strictEqual(Core.sideLabel({ side: 'left', sideNoun: '' }), '左');
});

test('sideLabel は side が無ければ null を返す', () => {
  assert.strictEqual(Core.sideLabel({ side: null, sideNoun: '' }), null);
});

test('セッションは index 0 から始まり、最初の種目名と回数を引ける', () => {
  const session = Core.createSession(Core.DEFAULT_EXERCISES);
  const step = Core.currentStep(session);
  assert.strictEqual(step.name, Core.DEFAULT_EXERCISES[0].name);
  assert.strictEqual(step.reps, 20);
});

test('advanceSession でステップが 1 つずつ進む', () => {
  const exercises = [
    { name: 'A', reps: 10, sides: null },
    { name: 'B', reps: 10, sides: ['left', 'right'] }
  ];
  let session = Core.createSession(exercises);
  assert.strictEqual(Core.currentStep(session).exerciseIndex, 0);
  session = Core.advanceSession(session);
  assert.strictEqual(Core.currentStep(session).exerciseIndex, 1);
  assert.strictEqual(Core.currentStep(session).side, 'left');
  session = Core.advanceSession(session);
  assert.strictEqual(Core.currentStep(session).side, 'right');
});

test('retreatSession でステップが 1 つずつ戻る', () => {
  const exercises = [
    { name: 'A', reps: 10, sides: null },
    { name: 'B', reps: 10, sides: ['left', 'right'] }
  ];
  let session = Core.createSession(exercises);
  session = Core.advanceSession(session);
  session = Core.advanceSession(session);
  assert.strictEqual(session.index, 2);
  session = Core.retreatSession(session);
  assert.strictEqual(session.index, 1);
  assert.strictEqual(Core.currentStep(session).side, 'left');
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
  assert.deepStrictEqual(Core.sessionProgress(session), { current: 1, total: 17 });
});

test('sessionRatio は最初のステップでは 0 (まだ何も終わっていない)', () => {
  const session = Core.createSession(Core.DEFAULT_EXERCISES);
  assert.strictEqual(Core.sessionRatio(session), 0);
});

test('sessionRatio は終わったステップ数ぶんだけ増える', () => {
  const exercises = [
    { name: 'A', reps: 10, sides: null },
    { name: 'B', reps: 10, sides: null },
    { name: 'C', reps: 10, sides: null },
    { name: 'D', reps: 10, sides: null }
  ];
  let session = Core.createSession(exercises);
  assert.strictEqual(Core.sessionRatio(session), 0);
  session = Core.advanceSession(session);
  assert.strictEqual(Core.sessionRatio(session), 0.25);
  session = Core.advanceSession(session);
  assert.strictEqual(Core.sessionRatio(session), 0.5);
});

test('sessionRatio は最後まで進むと 1 になり、それ以上増えない', () => {
  let session = Core.createSession(Core.DEFAULT_EXERCISES);
  const total = session.steps.length;
  for (let i = 0; i < total + 5; i++) session = Core.advanceSession(session);
  assert.strictEqual(Core.sessionRatio(session), 1);
});

test('コマ割りは既定で before → after の 2 コマ', () => {
  const steps = Core.buildSteps([{ name: 'A', reps: 10, sides: null }]);
  assert.deepStrictEqual(steps[0].frames, ['before', 'after']);
});

test('左右に振る種目は 真ん中 → 左 → 真ん中 → 右 の 4 コマ', () => {
  const steps = Core.buildSteps([
    { name: 'A', reps: 10, sides: null, frames: Core.SWING_FRAMES }
  ]);
  assert.deepStrictEqual(steps[0].frames, ['center', 'left', 'center', 'right']);
});

test('4 コマなのは 猫のポーズ・ひねる・倒す の 3 種目', () => {
  const steps = Core.buildSteps(Core.DEFAULT_EXERCISES);
  const swing = steps.filter((s) => s.frames.length === 4);
  assert.deepStrictEqual(swing.map((s) => s.art), ['catPose', 'chairTwist', 'chairLean']);
});

test('猫のポーズは まん中 → 丸める → まん中 → 反る の 4 コマ', () => {
  const cat = Core.buildSteps(Core.DEFAULT_EXERCISES).find((s) => s.art === 'catPose');
  assert.deepStrictEqual(cat.frames, ['center', 'round', 'center', 'arch']);
  assert.strictEqual(cat.frames[0], cat.frames[2]);
});

test('4 コマの往復は、真ん中を挟んで左右がそろっている', () => {
  // 真ん中を飛ばして左 → 右 とつなぐと、通り道が抜けて瞬間移動に見える
  assert.deepStrictEqual(Core.SWING_FRAMES, ['center', 'left', 'center', 'right']);
  assert.strictEqual(Core.SWING_FRAMES[0], Core.SWING_FRAMES[2]);
});

test('uniqueFrames は出てきた順のまま重複だけ取り除く', () => {
  assert.deepStrictEqual(Core.uniqueFrames(Core.SWING_FRAMES), ['center', 'left', 'right']);
  assert.deepStrictEqual(Core.uniqueFrames(['before', 'after']), ['before', 'after']);
});

// ------------------------------------------------------------ スタンプカード

test('スタンプは 0 から始まり、1 周やるごとに 1 個増える', () => {
  let record = Core.createRecord();
  assert.strictEqual(record.stamps, 0);
  assert.strictEqual(Core.filledSlots(record), 0);
  record = Core.addStamp(record);
  assert.strictEqual(record.stamps, 1);
  assert.strictEqual(Core.filledSlots(record), 1);
});

test('10 個目でカードが 1 枚うまり、そのときだけ満杯の 10 マスを見せる', () => {
  let record = Core.createRecord();
  for (let i = 0; i < 10; i++) record = Core.addStamp(record);
  assert.strictEqual(Core.filledSlots(record), 10, '10 個目は満杯のカードを見せる');
  assert.strictEqual(Core.completedCards(record), 1);
  assert.ok(Core.justFilledCard(record));
});

test('11 個目から新しいカードの 1 マス目になる', () => {
  let record = Core.createRecord();
  for (let i = 0; i < 11; i++) record = Core.addStamp(record);
  assert.strictEqual(Core.filledSlots(record), 1);
  assert.strictEqual(Core.completedCards(record), 1);
  assert.ok(!Core.justFilledCard(record));
});

test('ごほうびはカードを 1 枚うめるごとに 1 つずつ、決まった順で増える', () => {
  let record = Core.createRecord();
  assert.deepStrictEqual(Core.unlockedRewards(record), []);
  for (let i = 0; i < 10; i++) record = Core.addStamp(record);
  assert.deepStrictEqual(Core.unlockedRewards(record).map((r) => r.id), ['midnight']);
  assert.deepStrictEqual(Core.rewardAt(record), Core.REWARDS[0]);
  for (let i = 0; i < 10; i++) record = Core.addStamp(record);
  assert.deepStrictEqual(Core.unlockedRewards(record).map((r) => r.id), ['midnight', 'headband']);
});

test('カードがうまっていない回では、ごほうびは出ない', () => {
  let record = Core.createRecord();
  for (let i = 0; i < 5; i++) record = Core.addStamp(record);
  assert.strictEqual(Core.rewardAt(record), null);
});

test('ごほうびを配り終えても、スタンプは増え続けて落ちない', () => {
  let record = Core.createRecord();
  for (let i = 0; i < Core.CARD_SIZE * (Core.REWARDS.length + 3); i++) record = Core.addStamp(record);
  assert.strictEqual(Core.unlockedRewards(record).length, Core.REWARDS.length);
  assert.strictEqual(Core.rewardAt(record), null, '配り終えたあとは新しいごほうびは無い');
});

test('既定の色はスタンプ 0 個でも使える', () => {
  assert.deepStrictEqual(Core.availableSkins(Core.createRecord()), [Core.DEFAULT_SKIN]);
});

test('normalizeRecord: 壊れた記録でも必ず使える形にする', () => {
  assert.deepStrictEqual(Core.normalizeRecord(null), Core.createRecord());
  assert.deepStrictEqual(Core.normalizeRecord('こわれた'), Core.createRecord());
  assert.deepStrictEqual(Core.normalizeRecord({ stamps: -5 }).stamps, 0);
  assert.deepStrictEqual(Core.normalizeRecord({ stamps: 'あ' }).stamps, 0);
  assert.deepStrictEqual(Core.normalizeRecord({ stamps: 3.7 }).stamps, 3);
});

test('normalizeRecord: もらっていないごほうびは落とす', () => {
  // 書き換えられた記録でも、スタンプの数に見合ったものしか残さない
  const cheated = Core.normalizeRecord({ stamps: 0, skin: 'sunset', gear: ['cape', 'headband'] });
  assert.strictEqual(cheated.skin, Core.DEFAULT_SKIN);
  assert.deepStrictEqual(cheated.gear, []);

  const earned = Core.normalizeRecord({ stamps: 20, skin: 'midnight', gear: ['headband', 'cape'] });
  assert.strictEqual(earned.skin, 'midnight');
  assert.deepStrictEqual(earned.gear, ['headband'], 'まだの cape は落ちる');
});

test('normalizeRecord: 同じ飾りが重なっていたら 1 つにする', () => {
  const r = Core.normalizeRecord({ stamps: 20, gear: ['headband', 'headband'] });
  assert.deepStrictEqual(r.gear, ['headband']);
});
