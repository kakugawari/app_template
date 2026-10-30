const test = require('node:test');
const assert = require('node:assert');
const Core = require('./core.js');

test('既定の種目は 25 種目、左右まとめたぶんも含めて 25 ステップになる', () => {
  const steps = Core.buildSteps(Core.DEFAULT_EXERCISES);
  assert.strictEqual(Core.DEFAULT_EXERCISES.length, 25);
  assert.strictEqual(steps.length, 25);
});

test('回数で数える種目は「回」、秒数で数える種目は「秒」で表示する', () => {
  const steps = Core.buildSteps(Core.DEFAULT_EXERCISES);
  const secs = steps.filter((s) => s.unit === '秒').map((s) => s.art + ':' + s.reps);
  assert.deepStrictEqual(secs, ['birdDog:10', 'stairQuad:10', 'stairSwing:10', 'shallowSquat:10']);
  assert.ok(steps.filter((s) => s.unit === '回').every((s) => s.reps === 10));
  assert.ok(steps.every((s) => s.unit === '回' || s.unit === '秒'));
});

test('すべての種目に art (イラストの名前) がついていて、重複していない', () => {
  const arts = Core.DEFAULT_EXERCISES.map((e) => e.art);
  assert.ok(arts.every((a) => typeof a === 'string' && a.length > 0), JSON.stringify(arts));
  assert.strictEqual(new Set(arts).size, arts.length, '重複あり: ' + arts.join(', '));
});

test('並びは 寝る → 四つん這い → 立つ → 座る の順になっている', () => {
  assert.deepStrictEqual(Core.DEFAULT_EXERCISES.map((e) => e.art), [
    'kneeFall', 'hipTwist', 'armRaise', 'armAlt', 'armHug',
    'sideKnee', 'sideArm', 'sideOpen', 'shoulderBack',
    'catPose', 'catRock', 'birdDog',
    'wallHip', 'stairQuad', 'stairSwing', 'shallowSquat', 'sumoSquat', 'hipBackSquat',
    'chairTwist', 'chairLean', 'chairLift', 'pelvisTilt', 'armOpen', 'armRotate', 'footRoll'
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

test('sideLabel は side も順番も無ければ null を返す', () => {
  assert.strictEqual(Core.sideLabel({ side: null, sideNoun: '' }), null);
});

test('セッションは index 0 から始まり、最初の種目名と回数を引ける', () => {
  const session = Core.createSession(Core.DEFAULT_EXERCISES);
  const step = Core.currentStep(session);
  assert.strictEqual(step.name, Core.DEFAULT_EXERCISES[0].name);
  assert.strictEqual(step.reps, 10);
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
  assert.deepStrictEqual(Core.sessionProgress(session), { current: 1, total: 25 });
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

test('mergeSides: 体を寝返らせる種目は、左右を分けず 1 ステップにまとめる', () => {
  const steps = Core.buildSteps([
    { name: 'A', reps: 10, sides: ['left', 'right'], mergeSides: true, art: 'x' }
  ]);
  assert.strictEqual(steps.length, 1, '2 ステップに分かれていないこと');
  assert.strictEqual(steps[0].side, null, '片側だけのステップではない');
  assert.deepStrictEqual(steps[0].sideOrder, ['left', 'right'], 'やる順番を持っている');
});

test('mergeSides: 側バッジには、やる順番を「左 → 右」と出す', () => {
  const [step] = Core.buildSteps([
    { name: 'A', reps: 10, sides: ['left', 'right'], mergeSides: true, art: 'x' }
  ]);
  assert.strictEqual(Core.sideLabel(step), '左 → 右');
});

test('種目名には「(左→右)」を書かない (順番は側バッジが受け持つ)', () => {
  Core.DEFAULT_EXERCISES.forEach((e) => {
    assert.ok(!/[()（）]/.test(e.name), `括弧が入っていない: ${e.name}`);
  });
});

test('stillFrames: 左右まとめたステップは、動きを止めると最初の側の 2 コマだけになる', () => {
  const [step] = Core.buildSteps([
    { name: 'A', reps: 10, sides: ['left', 'right'], mergeSides: true, art: 'x' }
  ]);
  assert.deepStrictEqual(Core.stillFrames(step), [
    { name: 'before', side: 'left' },
    { name: 'after', side: 'left' }
  ]);
});

test('stillFrames: 左右のない種目は、重複を除いたコマのまま', () => {
  const [swing] = Core.buildSteps([{ name: 'A', reps: 10, sides: null, frames: Core.SWING_FRAMES }]);
  assert.deepStrictEqual(Core.stillFrames(swing), ['center', 'left', 'right']);
});

test('namePhrases は読点の後ろで区切り、読点は前の句に残す', () => {
  assert.deepStrictEqual(Core.namePhrases('仰向けで両膝を立て、左右に倒す'), ['仰向けで両膝を立て、', '左右に倒す']);
  assert.deepStrictEqual(Core.namePhrases('読点なし'), ['読点なし']);
  assert.deepStrictEqual(Core.namePhrases('A、B、C'), ['A、', 'B、', 'C']);
  assert.strictEqual(Core.namePhrases('A、B、C').join(''), 'A、B、C', 'つなげ直すと元に戻る');
});

test('既定の種目名は、どの句も 12 字以内 (幅 375 の画面で 2 行に収まる目安)', () => {
  // 本当に収まるかはブラウザテストが実際に描いて確かめる。ここは
  // 種目を足したときにすぐ気づくための、安い目安
  Core.DEFAULT_EXERCISES.forEach((e) => {
    const phrases = Core.namePhrases(e.name);
    assert.ok(phrases.length <= 2, `2 句まで: ${e.name}`);
    phrases.forEach((p) => assert.ok([...p].length <= 12, `「${p}」は ${[...p].length} 字 (${e.name})`));
  });
});

test('mergeSides: 片側の動きを 3 回くり返してから反対側へ移る (左左左 → 右右右)', () => {
  // 1 回ごとに左右を入れ替えると、毎回寝返っているように見えて無理な動きになる
  const steps = Core.buildSteps([
    { name: 'A', reps: 10, sides: ['left', 'right'], mergeSides: true, art: 'x' }
  ]);
  assert.strictEqual(Core.SIDE_REPEAT, 3);
  const one = (side) => [{ name: 'before', side }, { name: 'after', side }];
  assert.deepStrictEqual(steps[0].frames, [
    ...one('left'), ...one('left'), ...one('left'),
    ...one('right'), ...one('right'), ...one('right')
  ]);
});

test('mergeSides: 左右が入れ替わるのは 1 周で 1 回だけ', () => {
  Core.buildSteps(Core.DEFAULT_EXERCISES).filter((s) => s.sideOrder).forEach((s) => {
    const switches = s.frames.filter((f, i) => i > 0 && f.side !== s.frames[i - 1].side).length;
    assert.strictEqual(switches, 1, s.art);
  });
});

test('mergeSides: before/after 以外のコマ割り (frames 指定) も、側ごとに展開する', () => {
  const steps = Core.buildSteps([
    { name: 'A', reps: 10, sides: ['left', 'right'], mergeSides: true, art: 'x', frames: ['a', 'b', 'c'] }
  ]);
  assert.strictEqual(steps[0].frames.length, 3 * Core.SIDE_REPEAT * 2);
  assert.deepStrictEqual(steps[0].frames.slice(0, 3).map((f) => f.name), ['a', 'b', 'c']);
  assert.ok(steps[0].frames.slice(0, 9).every((f) => f.side === 'left'));
  assert.ok(steps[0].frames.slice(9).every((f) => f.side === 'right'));
});

test('既定の種目のうち、左右を入れ替えてやる 10 種目が mergeSides で 1 ステップにまとまっている', () => {
  const steps = Core.buildSteps(Core.DEFAULT_EXERCISES);
  const merged = steps.filter((s) => typeof s.frames[0] === 'object');
  assert.deepStrictEqual(
    merged.map((s) => s.art).sort(),
    ['birdDog', 'footRoll', 'hipTwist', 'shoulderBack', 'sideArm', 'sideKnee', 'sideOpen',
      'stairQuad', 'stairSwing', 'wallHip'].sort()
  );
  merged.forEach((s) => assert.strictEqual(s.side, null, s.art + ' はバッジを出さない'));
});

test('スイング系 (体は動かさず手足だけ振る) は、今まで通り文字列のコマのまま', () => {
  const steps = Core.buildSteps(Core.DEFAULT_EXERCISES);
  const swing = steps.filter((s) => s.frames.length === 4 && typeof s.frames[0] === 'string');
  assert.deepStrictEqual(swing.map((s) => s.art), ['armAlt', 'catPose', 'catRock', 'chairTwist', 'chairLean']);
});

test('猫のポーズで前後に揺れる種目は まん中 → 後ろ → まん中 → 前 の 4 コマ', () => {
  const rock = Core.buildSteps(Core.DEFAULT_EXERCISES).find((s) => s.art === 'catRock');
  assert.deepStrictEqual(rock.frames, ['center', 'back', 'center', 'front']);
  const arts = Core.DEFAULT_EXERCISES.map((e) => e.art);
  assert.strictEqual(arts.indexOf('catRock'), arts.indexOf('catPose') + 1, '猫のポーズのすぐ後ろ');
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

test('uniqueFrames は { name, side } のコマでも、中身が同じなら重複と見なす', () => {
  // mergeSides のコマは毎回新しいオブジェクトで作られるため、参照の比較だけでは
  // 「中身は同じでも別物」に見えて重複を見逃す。中身で比べられているか確認する
  const frames = [
    { name: 'before', side: 'left' },
    { name: 'after', side: 'left' },
    { name: 'before', side: 'left' } // 1 つめと中身は同じ、参照は別
  ];
  assert.deepStrictEqual(Core.uniqueFrames(frames), [
    { name: 'before', side: 'left' },
    { name: 'after', side: 'left' }
  ]);
});

test('frameKey は文字列のコマと { name, side } のコマを区別できる形にする', () => {
  assert.strictEqual(Core.frameKey('before'), 'before');
  assert.strictEqual(Core.frameKey({ name: 'before', side: 'left' }), 'before:left');
  assert.notStrictEqual(
    Core.frameKey({ name: 'before', side: 'left' }),
    Core.frameKey({ name: 'before', side: 'right' })
  );
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

test('はじめから選べる 4 色は、スタンプ 0 個でも使える', () => {
  assert.deepStrictEqual(Core.availableSkins(Core.createRecord()), ['classic', 'teal', 'plum', 'mustard']);
  assert.strictEqual(Core.availableSkins(Core.createRecord())[0], Core.DEFAULT_SKIN);
});

test('ごほうびの色は、もらうまで使えない (はじめからの色の後ろに増える)', () => {
  assert.ok(Core.availableSkins({ stamps: 9, skin: 'classic', gear: [] }).indexOf('midnight') < 0);
  assert.deepStrictEqual(Core.availableSkins({ stamps: 50, skin: 'classic', gear: [] }),
    ['classic', 'teal', 'plum', 'mustard', 'midnight', 'forest', 'sunset']);
});

test('はじめからの色は保存しておけば残り、もらっていない色は既定に戻る', () => {
  assert.strictEqual(Core.normalizeRecord({ stamps: 0, skin: 'plum', gear: [] }).skin, 'plum');
  assert.strictEqual(Core.normalizeRecord({ stamps: 0, skin: 'sunset', gear: [] }).skin, 'classic');
});

test('どの色にも名前がある', () => {
  Core.availableSkins({ stamps: 999, skin: 'classic', gear: [] }).forEach((id) => {
    assert.notStrictEqual(Core.skinName(id), id, id);
  });
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

// ------------------------------------------------------------ 途中の位置

test('createProgress は今の位置とステップ数を持つ', () => {
  let session = Core.createSession(Core.DEFAULT_EXERCISES);
  session = Core.advanceSession(session);
  session = Core.advanceSession(session);
  assert.deepStrictEqual(Core.createProgress(session), { index: 2, total: 25 });
});

test('途中まで進んだ位置は、続きとして取り出せる', () => {
  assert.deepStrictEqual(Core.normalizeProgress({ index: 8, total: 17 }, 17), { index: 8, total: 17 });
});

test('まだ始めていない (0) 位置は、続きにしない', () => {
  assert.strictEqual(Core.normalizeProgress({ index: 0, total: 17 }, 17), null);
});

test('もう終わっている位置は、続きにしない', () => {
  assert.strictEqual(Core.normalizeProgress({ index: 17, total: 17 }, 17), null);
  assert.strictEqual(Core.normalizeProgress({ index: 99, total: 17 }, 17), null);
});

test('種目の数が変わっていたら、古い続きは捨てる', () => {
  // 種目を足したあとに古い位置を復元すると、まったく違う種目から再開してしまう
  assert.strictEqual(Core.normalizeProgress({ index: 8, total: 10 }, 17), null);
});

test('normalizeProgress は壊れた値でも落ちない', () => {
  assert.strictEqual(Core.normalizeProgress(null, 17), null);
  assert.strictEqual(Core.normalizeProgress('こわれた', 17), null);
  assert.strictEqual(Core.normalizeProgress({ index: 'あ', total: 17 }, 17), null);
  assert.strictEqual(Core.normalizeProgress({ index: -3, total: 17 }, 17), null);
  assert.deepStrictEqual(Core.normalizeProgress({ index: 4.7, total: 17 }, 17), { index: 4, total: 17 });
});
