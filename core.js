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

  /**
   * イラストのコマ割り。`ex<種目番号>-<コマ名>` の symbol を順に見せる。
   *
   * 既定は「はじめ → 動いた先」の 2 コマ。
   * 左右に振る種目は、真ん中を通って反対側へ行くのが本当の動きなので、
   * 真ん中 → 左 → 真ん中 → 右 の 4 コマで一周させる。真ん中を挟まずに
   * 左 → 右 とつなぐと、通り道を飛ばして瞬間移動するように見えてしまう。
   */
  const DEFAULT_FRAMES = ['before', 'after'];
  const SWING_FRAMES = ['center', 'left', 'center', 'right'];

  const CAT_FRAMES = ['center', 'round', 'center', 'arch'];

  // 左右のある種目は sides に ['left', 'right'] (または指定された順) を、無いものは null を入れる。
  // sideNoun を付けると「左足」のように部位つきで表示する (省略すると「左」だけ)。
  // 扇風機の首振りや振り子のように、両足(両手)をくっつけたまま左右へ振り続け、
  // 止めて数えないような動きは 1 ステップ (sides: null) にする
  // — 左右に分けると実際の動きと合わなくなる。
  // 横向きに寝て左右で体の向きそのものが変わる種目は、sideNames で
  // 「左向きに寝て…」のように片側ごとに文面を変えられる。
  //
  // mergeSides: true を付けると、左右を別ステップに分けず 1 ステップにまとめる。
  // 体を寝返らせて反対側をやる種目 (sideKnee など) 向け。スイング系
  // (扇風機の首振りのように体を動かさず手足だけ振る) はもともと 1 ステップ
  // なので関係ない。まとめたステップは:
  //   - 「できた」は 1 回 (右左あわせて)。バッジは出さない (side: null)
  //   - コマは左側ぶん → 右側ぶんの順にすべて並べ、コマごとに
  //     どちらの側かを持たせる (フェーズが変わるとき自動でミラーが切り替わる)
  //   - 名前には (左→右) のように順番を書いておく。2 つの文を
  //     1 つにまとめると長くなるので、もとの文はそのまま流用する
  //
  // art はイラストの名前。`<art>-<コマ名>` の symbol を引く。
  // 並び順で引くと (ex0, ex1, …)、種目を足したり並べ替えたりするたびに
  // 全部のイラストがずれるので、名前で結びつけている。
  //
  // 並びは姿勢ごと。寝る → 四つん這い → 立つ → 座る の順にして、
  // 途中で体勢を変える回数をなるべく少なくしている。
  const DEFAULT_EXERCISES = [
    // --- 寝る ---
    { name: '仰向けに寝て、両膝を立てて左右に倒す', art: 'kneeFall', reps: 20, sides: null },
    {
      // 「腰を左にひねる」だと、どちらの足を動かすのか読む人によって割れる。
      // 動かす足そのものを書くほうが迷わない。
      name: '仰向けに寝て、片足を反対の足の上に持っていく (左→右)',
      art: 'hipTwist',
      reps: 20,
      sides: ['left', 'right'],
      mergeSides: true
    },
    {
      name: '横向きに寝て、膝を曲げて開く・閉じる (左→右)',
      art: 'sideKnee',
      reps: 20,
      sides: ['left', 'right'],
      mergeSides: true
    },
    {
      name: '横向きに寝て、手を伸ばして開く・閉じる (左→右)',
      art: 'sideArm',
      reps: 20,
      sides: ['left', 'right'],
      mergeSides: true
    },
    {
      // 動かすのは上になっている側の手。どちらの手かは before/after の
      // 絵そのものが見せるので、名前では「上の手」とだけ書けば迷わない。
      name: '横向きに寝て膝を曲げ、上の手を反対側へ開く (左→右)',
      art: 'sideOpen',
      reps: 20,
      sides: ['left', 'right'],
      mergeSides: true
    },
    // --- 四つん這い ---
    {
      name: '猫のポーズで、背中を丸める・反る',
      art: 'catPose',
      reps: 20,
      sides: null,
      frames: CAT_FRAMES
    },
    // --- 立つ ---
    {
      name: '壁に手をついて、片足を広げて股関節を伸ばす (左→右)',
      art: 'wallHip',
      reps: 20,
      sides: ['left', 'right'],
      mergeSides: true
    },
    // --- 座る ---
    {
      name: '椅子に浅く座り、バランスボールを抱えて体をひねる',
      art: 'chairTwist',
      reps: 20,
      sides: null,
      frames: SWING_FRAMES
    },
    {
      name: '椅子に浅く座り、バランスボールを抱えて体を倒す',
      art: 'chairLean',
      reps: 20,
      sides: null,
      frames: SWING_FRAMES
    },
    { name: '椅子に浅く座り、バランスボールを持って上げ下げする', art: 'chairLift', reps: 20, sides: null },
    {
      name: '椅子に浅く座り、トゲトゲボールを足で転がす (左→右)',
      art: 'footRoll',
      reps: 20,
      sides: ['left', 'right'],
      mergeSides: true
    }
  ];

  /** 種目リストを「1 ステップ = 1 回のできたボタン」の並びに崩す。 */
  function buildSteps(exercises) {
    const steps = [];
    exercises.forEach(function (exercise, exerciseIndex) {
      const baseFrames = exercise.frames || DEFAULT_FRAMES;

      if (exercise.mergeSides) {
        // 左側ぶんのコマ → 右側ぶんのコマの順に、すべて並べて 1 ステップにする。
        // コマごとに「どちらの側か」を持たせておき、描くときにそのコマだけ
        // ミラーするかどうかを判断する (ステップ全体で一括ミラーできないため)。
        const frames = [];
        exercise.sides.forEach(function (side) {
          baseFrames.forEach(function (name) {
            frames.push({ name: name, side: side });
          });
        });
        steps.push({
          exerciseIndex: exerciseIndex,
          art: exercise.art,
          name: exercise.name,
          reps: exercise.reps,
          side: null,
          sideNoun: '',
          frames: frames
        });
        return;
      }

      const sides = exercise.sides && exercise.sides.length ? exercise.sides : [null];
      sides.forEach(function (side) {
        const name = (exercise.sideNames && side && exercise.sideNames[side]) || exercise.name;
        steps.push({
          exerciseIndex: exerciseIndex,
          art: exercise.art,
          name: name,
          reps: exercise.reps,
          side: side,
          sideNoun: exercise.sideNoun || '',
          frames: baseFrames
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

  /**
   * コマ割りから、重複を取り除いて出てきた順に並べたもの。
   * 動きを止めて横に並べるときに使う (真ん中を 2 回並べても意味がないため)。
   *
   * コマは文字列 ('before' など) か、{ name, side } のどちらかで来る
   * (mergeSides の種目は後者)。後者は毎回新しいオブジェクトで作られるため
   * 中身が同じでも参照は別物になる — indexOf だけで見ると「重複なし」に
   * 誤判定するので、中身を文字列化してから比べる。
   */
  function frameKey(frame) {
    return typeof frame === 'string' ? frame : frame.name + ':' + frame.side;
  }

  function uniqueFrames(frames) {
    const seen = [];
    return frames.filter(function (frame) {
      const key = frameKey(frame);
      if (seen.indexOf(key) >= 0) return false;
      seen.push(key);
      return true;
    });
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

  /**
   * 進捗バー用に「終わったぶん」の割合 (0〜1) を返す。
   * 表示中のステップはまだ終わっていないので数えない
   * — 最初のステップを開いた時点でバーが伸びていると、
   *   何もしていないのに進んだように見えてしまう。
   */
  function sessionRatio(session) {
    const total = session.steps.length;
    if (total === 0) return 0;
    return Math.min(session.index, total) / total;
  }

  // ------------------------------------------------------------------
  // スタンプカード
  //
  // 1 周やりきるごとにスタンプが 1 個たまる。10 個でカードが 1 枚うまり、
  // ごほうびが 1 つ増える。ごほうびは見た目 (色と、タイトル画面の人の飾り)。
  //
  // 持っているのは「通算いくつ押したか」だけにしてある。カードの枚数も
  // 何がもらえたかも、そこから毎回計算する。2 か所に数を持つと必ずずれる。
  // ------------------------------------------------------------------

  /** カード 1 枚のマス目 */
  const CARD_SIZE = 10;

  /** カードを 1 枚うめるたびに、この順で 1 つずつもらえる */
  const REWARDS = [
    { id: 'midnight', kind: 'skin', name: 'ミッドナイト' },
    { id: 'headband', kind: 'gear', name: 'ヘッドバンド' },
    { id: 'forest', kind: 'skin', name: 'フォレスト' },
    { id: 'wristband', kind: 'gear', name: 'リストバンド' },
    { id: 'sunset', kind: 'skin', name: 'サンセット' },
    { id: 'cape', kind: 'gear', name: 'マント' }
  ];

  const DEFAULT_SKIN = 'classic';

  function createRecord() {
    return { stamps: 0, skin: DEFAULT_SKIN, gear: [] };
  }

  function addStamp(record) {
    return Object.assign({}, record, { stamps: record.stamps + 1 });
  }

  /** うまったカードの枚数 */
  function completedCards(record) {
    return Math.floor(record.stamps / CARD_SIZE);
  }

  /**
   * いま見えているカードの、押されているマスの数。
   *
   * ちょうど 10 個目を押した直後は「新しい空のカード」ではなく
   * 「うまったカード」を見せたいので、0 ではなく CARD_SIZE を返す。
   */
  function filledSlots(record) {
    if (record.stamps === 0) return 0;
    return ((record.stamps - 1) % CARD_SIZE) + 1;
  }

  /** もらったごほうび (もらった順) */
  function unlockedRewards(record) {
    return REWARDS.slice(0, Math.min(completedCards(record), REWARDS.length));
  }

  function isUnlocked(record, id) {
    return unlockedRewards(record).some(function (r) { return r.id === id; });
  }

  /** このスタンプでカードがちょうどうまったか (ごほうびを見せる合図) */
  function justFilledCard(record) {
    return record.stamps > 0 && record.stamps % CARD_SIZE === 0;
  }

  /** そのスタンプでもらえたごほうび。無ければ null */
  function rewardAt(record) {
    if (!justFilledCard(record)) return null;
    return REWARDS[completedCards(record) - 1] || null;
  }

  /** 使える色の一覧 (既定はいつでも使える) */
  function availableSkins(record) {
    return [DEFAULT_SKIN].concat(
      unlockedRewards(record)
        .filter(function (r) { return r.kind === 'skin'; })
        .map(function (r) { return r.id; }));
  }

  /**
   * 保存されていた記録を、安全な形に整える。
   * 壊れていても、書き換えられていても、必ず使える記録を返す
   * (もらっていないごほうびが混ざっていたら落とす)。
   */
  function normalizeRecord(raw) {
    const base = createRecord();
    if (!raw || typeof raw !== 'object') return base;

    const stamps = Number(raw.stamps);
    base.stamps = Number.isFinite(stamps) && stamps > 0 ? Math.floor(stamps) : 0;

    if (availableSkins(base).indexOf(raw.skin) >= 0) base.skin = raw.skin;

    base.gear = (Array.isArray(raw.gear) ? raw.gear : []).filter(function (id, i, all) {
      return all.indexOf(id) === i && isUnlocked(base, id);
    });
    return base;
  }

  // ------------------------------------------------------------------
  // 途中でやめたときの位置
  //
  // 17 ステップは何分もかかるので、電話が来たり画面がロックされたりして
  // 閉じることがある。どこまでやったかを覚えておいて、次に開いたときに
  // 「つづきから」を出せるようにする。
  //
  // スタンプの記録とは別ものなので、しまう場所も分ける。途中の位置が
  // 壊れても、積み上げたスタンプまで巻き添えにしないため。
  // ------------------------------------------------------------------

  function createProgress(session) {
    return { index: session.index, total: session.steps.length };
  }

  /**
   * しまってあった位置を、いま使える形にする。続きが無ければ null。
   *
   * total を一緒に見るのは、種目を足したり並べ替えたりしたあとで
   * 古い位置を復元すると、まったく違う種目から再開してしまうため。
   * 数が変わっていたら、その位置はもう意味がないので捨てる。
   */
  function normalizeProgress(raw, total) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.total !== total) return null;
    const index = Number(raw.index);
    // 0 は「まだ始めていない」、total 以上は「もう終わっている」。
    // どちらも続きではないので出さない。
    if (!Number.isFinite(index) || index <= 0 || index >= total) return null;
    return { index: Math.floor(index), total: total };
  }

  return {
    WARMUP_NOTE: WARMUP_NOTE,
    SIDE_LABELS: SIDE_LABELS,
    createProgress: createProgress,
    normalizeProgress: normalizeProgress,
    CARD_SIZE: CARD_SIZE,
    REWARDS: REWARDS,
    DEFAULT_SKIN: DEFAULT_SKIN,
    createRecord: createRecord,
    addStamp: addStamp,
    completedCards: completedCards,
    filledSlots: filledSlots,
    unlockedRewards: unlockedRewards,
    isUnlocked: isUnlocked,
    justFilledCard: justFilledCard,
    rewardAt: rewardAt,
    availableSkins: availableSkins,
    normalizeRecord: normalizeRecord,
    DEFAULT_EXERCISES: DEFAULT_EXERCISES,
    buildSteps: buildSteps,
    createSession: createSession,
    isSessionFinished: isSessionFinished,
    currentStep: currentStep,
    advanceSession: advanceSession,
    retreatSession: retreatSession,
    sessionProgress: sessionProgress,
    sessionRatio: sessionRatio,
    sideLabel: sideLabel,
    DEFAULT_FRAMES: DEFAULT_FRAMES,
    SWING_FRAMES: SWING_FRAMES,
    uniqueFrames: uniqueFrames,
    frameKey: frameKey
  };
});
