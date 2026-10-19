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

  /** 左右交互の万歳。下ろす → 左手 → 下ろす → 右手 (どれも左から始める) */
  const ALT_FRAMES = ['down', 'left', 'down', 'right'];

  /** 足を前後に振る。真ん中を通って前へ、また真ん中を通って後ろへ */
  const LEG_SWING_FRAMES = ['center', 'front', 'center', 'back'];

  /** 左右をまとめた種目で、反対側へ移る前に片側をくり返す回数 */
  const SIDE_REPEAT = 3;

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
  //   - 「できた」は 1 回 (右左あわせて)
  //   - コマは左側ぶん → 右側ぶんの順に並べ、コマごとにどちらの側かを
  //     持たせる (フェーズが変わるとき自動でミラーが切り替わる)。
  //     片側の動きを SIDE_REPEAT 回くり返してから反対側へ移る。1 回ごとに
  //     左右を入れ替えると、毎回寝返っているように見えて無理な動きになる
  //   - やる順番 (左 → 右) は名前に書かず、側バッジに出す。名前の後ろに
  //     「(左→右)」を足すと文が長くなり、括弧の途中で行が折れて読みにくい
  //
  // 名前は「姿勢、動き」の形で書き、読点 (、) の前後をそれぞれ 12 字以内に
  // おさめる。画面では読点の後ろでしか折り返さない (namePhrases) ので、
  // どちらかが長いと 3 行になってカードの高さが変わる。幅 375 / 390 の
  // 画面で 2 行に収まることをブラウザテストが見張っている。
  //
  // art はイラストの名前。`<art>-<コマ名>` の symbol を引く。
  // 並び順で引くと (ex0, ex1, …)、種目を足したり並べ替えたりするたびに
  // 全部のイラストがずれるので、名前で結びつけている。
  //
  // 並びは姿勢ごと。寝る → 四つん這い → 立つ → 座る の順にして、
  // 途中で体勢を変える回数をなるべく少なくしている。
  const DEFAULT_EXERCISES = [
    // --- 寝る (仰向け) ---
    { name: '仰向けで両膝を立て、左右に倒す', art: 'kneeFall', reps: 20, sides: null },
    {
      // 「腰をひねる」だと、どちらの足を動かすのか読む人によって割れる。
      // 動かす足そのものを書くほうが迷わない。
      name: '仰向けで、片足を反対の足にのせる',
      art: 'hipTwist',
      reps: 20,
      sides: ['left', 'right'],
      mergeSides: true
    },
    { name: '仰向けで膝を立て、両手で万歳する', art: 'armRaise', reps: 20, sides: null },
    {
      // 左右交互の万歳は、体の向きは変わらないので左右をまとめる種目ではない。
      // 首振りの種目と同じく 1 ステップで、下ろす → 左 → 下ろす → 右 と回す
      name: '仰向けで膝を立て、左右交互に万歳する',
      art: 'armAlt',
      reps: 20,
      sides: null,
      frames: ALT_FRAMES
    },
    { name: '仰向けで膝を立て、広げた両手を胸で合わせる', art: 'armHug', reps: 20, sides: null },
    // --- 寝る (横向き) ---
    {
      name: '横向きに寝て、曲げた膝を開いて閉じる',
      art: 'sideKnee',
      reps: 20,
      sides: ['left', 'right'],
      mergeSides: true
    },
    {
      name: '横向きに寝て、伸ばした腕を開いて閉じる',
      art: 'sideArm',
      reps: 20,
      sides: ['left', 'right'],
      mergeSides: true
    },
    {
      // 動かすのは上になっている側の腕。どちらの腕かは before/after の
      // 絵そのものが見せるので、名前では「上の腕」とだけ書けば迷わない。
      name: '横向きに寝て膝を曲げ、上の腕を反対側へ開く',
      art: 'sideOpen',
      reps: 20,
      sides: ['left', 'right'],
      mergeSides: true
    },
    {
      // sideOpen と近いが、腕ごと回すのではなく肩だけを後ろへ動かす別の種目
      name: '横向きで膝をくの字にし、上の肩だけ後ろに動かす',
      art: 'shoulderBack',
      reps: 20,
      sides: ['left', 'right'],
      mergeSides: true
    },
    // --- 四つん這い ---
    {
      name: '猫のポーズで、背中を丸めて反らす',
      art: 'catPose',
      reps: 20,
      sides: null,
      frames: CAT_FRAMES
    },
    {
      name: '四つん這いで、片手と反対の足を伸ばす',
      art: 'birdDog',
      secs: 10,
      sides: ['left', 'right'],
      mergeSides: true
    },
    // --- 立つ ---
    {
      name: '壁に手をつき、後ろ足の股関節を伸ばす',
      art: 'wallHip',
      reps: 20,
      sides: ['left', 'right'],
      mergeSides: true
    },
    {
      // 体が横に開かないよう、まっすぐ保つ (名前に入りきらないので、ここに残す)
      name: '階段2段目に片足をのせ、後ろ足のももを伸ばす',
      art: 'stairQuad',
      secs: 30,
      sides: ['left', 'right'],
      mergeSides: true
    },
    {
      // 段に横向きに立ち、段から外に出した足を前後同じくらいに振る
      name: '階段に片足で立ち、浮いた足を前後に振る',
      art: 'stairSwing',
      secs: 30,
      sides: ['left', 'right'],
      mergeSides: true,
      frames: LEG_SWING_FRAMES
    },
    { name: '肩幅に立ち、浅くスクワットする', art: 'shallowSquat', secs: 30, sides: null },
    { name: '何かにつかまり、股割りでスクワットする', art: 'sumoSquat', reps: 20, sides: null },
    // 無理をしない深さまで (名前に入りきらないので、ここに残す)
    { name: '何かにつかまり、お尻を後ろに引いて下げる', art: 'hipBackSquat', reps: 20, sides: null },
    // --- 座る ---
    // ボールは「ボール」とだけ書く。どのボールかは絵が見せている
    // (「バランスボール」と書くと後ろの句が 12 字を超えて 3 行になる)。
    {
      name: '椅子に浅く座り、ボールを抱えて体をひねる',
      art: 'chairTwist',
      reps: 20,
      sides: null,
      frames: SWING_FRAMES
    },
    {
      name: '椅子に浅く座り、ボールを抱えて体を傾ける',
      art: 'chairLean',
      reps: 20,
      sides: null,
      frames: SWING_FRAMES
    },
    { name: '椅子に浅く座り、ボールを上げ下げする', art: 'chairLift', reps: 20, sides: null },
    {
      // つま先立ちしながらお腹をへこませて骨盤を後ろへ倒し、足を下ろしながら起こす
      name: '座ってつま先立ちし、骨盤を倒して起こす',
      art: 'pelvisTilt',
      reps: 20,
      sides: null
    },
    // 次の 2 つは肘の位置だけが違う。肩甲骨を意識しながら後ろに開く
    { name: '座って腕を斜めに開き、外へ回して後ろへ開く', art: 'armOpen', reps: 20, sides: null },
    { name: '座って肘を脇につけ、腕を外へ回して開く', art: 'armRotate', reps: 20, sides: null },
    {
      // 座ったまま続けてやる種目なので、姿勢は前の種目にまかせて書かない
      // (「椅子に浅く座り、」を付けると後ろの句が長くなり 3 行になる)
      name: 'トゲトゲボールを踏んで、前後に転がす',
      art: 'footRoll',
      reps: 20,
      sides: ['left', 'right'],
      mergeSides: true
    }
  ];

  /**
   * 何回 (reps) か何秒 (secs) かを、表示する数と単位にする。
   * アプリは数えも計りもしない。「20 回」「30 秒」と見せるだけ。
   */
  function amountOf(exercise) {
    return exercise.secs ? { reps: exercise.secs, unit: '秒' } : { reps: exercise.reps, unit: '回' };
  }

  /** 種目リストを「1 ステップ = 1 回のできたボタン」の並びに崩す。 */
  function buildSteps(exercises) {
    const steps = [];
    exercises.forEach(function (exercise, exerciseIndex) {
      const baseFrames = exercise.frames || DEFAULT_FRAMES;

      if (exercise.mergeSides) {
        // 左側の動きを SIDE_REPEAT 回 → 右側の動きを SIDE_REPEAT 回、の順に
        // 並べて 1 ステップにする。コマごとに「どちらの側か」を持たせておき、
        // 描くときにそのコマだけミラーするかどうかを判断する
        // (ステップ全体で一括ミラーできないため)。
        const frames = [];
        exercise.sides.forEach(function (side) {
          for (let r = 0; r < SIDE_REPEAT; r++) {
            baseFrames.forEach(function (name) {
              frames.push({ name: name, side: side });
            });
          }
        });
        steps.push({
          exerciseIndex: exerciseIndex,
          art: exercise.art,
          name: exercise.name,
          reps: amountOf(exercise).reps,
          unit: amountOf(exercise).unit,
          side: null,
          sideNoun: '',
          sideOrder: exercise.sides.slice(),
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
          reps: amountOf(exercise).reps,
          unit: amountOf(exercise).unit,
          side: side,
          sideNoun: exercise.sideNoun || '',
          frames: baseFrames
        });
      });
    });
    return steps;
  }

  /**
   * 表示用の左右ラベル。sideNoun があれば「左足」のように部位つきで返す。
   * 左右をまとめたステップは、やる順番を「左 → 右」のように返す。
   */
  function sideLabel(step) {
    if (step.sideOrder) {
      return step.sideOrder.map(function (side) { return SIDE_LABELS[side]; }).join(' → ');
    }
    if (!step.side) return null;
    return SIDE_LABELS[step.side] + (step.sideNoun || '');
  }

  /**
   * 種目名を、画面で折り返してよい単位に区切る。読点 (、) の後ろだけで
   * 区切り、読点は前の句に残す。
   *
   * 日本語はどの字の間でも折り返せるので、ふつうに流すと
   * 「体を倒 / す」のように語の途中で行が変わって読みにくい。
   * 句ごとにまとめて置けば、行が変わるのは読点のところだけになる。
   */
  function namePhrases(name) {
    return name.split('、').map(function (part, i, all) {
      return i < all.length - 1 ? part + '、' : part;
    }).filter(function (part) { return part !== ''; });
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

  /**
   * 動きを止めて横に並べるときのコマ。重複を除き、左右をまとめたステップは
   * 最初の側だけにする。反対側は同じ絵を裏返しただけで、やる順番は
   * 側バッジが見せる。両側ぶん並べると 4 コマになり、カードからはみ出す。
   */
  function stillFrames(step) {
    const first = step.sideOrder ? step.sideOrder[0] : null;
    return uniqueFrames(step.frames.filter(function (frame) {
      return typeof frame === 'string' || !first || frame.side === first;
    }));
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

  /**
   * はじめから選べる色。ごほうびの色 (REWARDS の skin) とは別に持つ。
   * 色そのものは styles.css の [data-skin="…"] にある。
   */
  const FREE_SKINS = [
    { id: 'classic', name: 'クラシック' },
    { id: 'teal', name: 'ティール' },
    { id: 'plum', name: 'プラム' },
    { id: 'mustard', name: 'マスタード' }
  ];

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

  /** 使える色の一覧。はじめから選べる色 → もらった色の順 */
  function availableSkins(record) {
    return FREE_SKINS.map(function (s) { return s.id; }).concat(
      unlockedRewards(record)
        .filter(function (r) { return r.kind === 'skin'; })
        .map(function (r) { return r.id; }));
  }

  /** 色の名前 (はじめからの色も、ごほうびの色も) */
  function skinName(id) {
    const all = FREE_SKINS.concat(REWARDS.filter(function (r) { return r.kind === 'skin'; }));
    const hit = all.filter(function (s) { return s.id === id; })[0];
    return hit ? hit.name : id;
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
    FREE_SKINS: FREE_SKINS,
    skinName: skinName,
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
    namePhrases: namePhrases,
    DEFAULT_FRAMES: DEFAULT_FRAMES,
    SWING_FRAMES: SWING_FRAMES,
    ALT_FRAMES: ALT_FRAMES,
    LEG_SWING_FRAMES: LEG_SWING_FRAMES,
    amountOf: amountOf,
    SIDE_REPEAT: SIDE_REPEAT,
    uniqueFrames: uniqueFrames,
    stillFrames: stillFrames,
    frameKey: frameKey
  };
});
