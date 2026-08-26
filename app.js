/*!
 * app.js — 画面まわり。盤の描画、パラパラ再生、クイズの進行。
 * ロジック (将棋のルール・出題) は core.js、中身は data.js。
 */
(function () {
  'use strict';

  const C = window.Core;
  const D = window.Data;
  const $ = (id) => document.getElementById(id);

  const RANK_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const ZEN_FILE = ['１', '２', '３', '４', '５', '６', '７', '８', '９'];
  // 成った駒は、実際の駒と同じように 1 文字の略字で書く
  const SHORT = { と: 'と', 成香: '杏', 成桂: '圭', 成銀: '全', 馬: '馬', 龍: '龍' };
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* ============================================================
     盤
     位置は left / top (%) で決める。transform は「はねる」演出に使うので、
     位置決めに使うと上書きされてしまう (CLAUDE.md の落とし穴の表を参照)。
     ============================================================ */

  function createBoard(files, ranks) {
    const wrap = el('div', 'board-wrap');
    if (files.length >= 8) wrap.classList.add('is-wide');

    const filesEl = el('div', 'files');
    files.forEach((f) => filesEl.appendChild(el('span', null, String(f))));
    const board = el('div', 'board');
    board.style.setProperty('--cols', files.length);
    board.style.setProperty('--rows', ranks.length);
    // 盤の大きさの上限は入れ物側で決めるので、筋と段の数を両方わたす
    wrap.style.setProperty('--cols', files.length);
    wrap.style.setProperty('--rows', ranks.length);
    const ranksEl = el('div', 'ranks');
    ranks.forEach((r) => ranksEl.appendChild(el('span', null, RANK_KANJI[r - 1])));

    const hl = el('div', 'hl');
    hl.hidden = true;
    board.appendChild(hl);

    // 9×9 のときは星を打つ (本物の盤と同じ 4 か所)
    if (files.length === 9 && ranks.length === 9) {
      for (const [a, b] of [[3, 3], [6, 3], [3, 6], [6, 6]]) {
        const dot = el('div', 'star');
        dot.style.left = (a * 100) / 9 + '%';
        dot.style.top = (b * 100) / 9 + '%';
        board.appendChild(dot);
      }
    }
    wrap.append(filesEl, board, ranksEl);

    const map = new Map(); // 'f-r' → 駒の要素
    const key = (f, r) => f + '-' + r;
    const has = (f, r) => files.indexOf(f) >= 0 && ranks.indexOf(r) >= 0;
    const left = (f) => (files.indexOf(f) * 100) / files.length + '%';
    const top = (r) => (ranks.indexOf(r) * 100) / ranks.length + '%';

    // 1 マスの大きさを CSS 変数にしておくと、駒の字の大きさが盤に追従する
    const sync = () => board.style.setProperty('--cell', board.clientWidth / files.length + 'px');
    if (window.ResizeObserver) new ResizeObserver(sync).observe(board);
    setTimeout(sync, 0);

    function makeKoma(k, side) {
      const e = el('div', 'koma');
      if (side === C.GOTE) e.classList.add('gote');
      if (C.isKing(k)) e.classList.add('king');
      if (SHORT[k]) e.classList.add('pro');
      e.appendChild(el('div', 'edge'));            // ふち (五角形で切り抜くと枠線が消えるため)
      e.appendChild(el('div', 'face', SHORT[k] || k));
      e.dataset.k = k;
      return e;
    }

    const api = {
      el: wrap,
      files: files,
      ranks: ranks,
      has: has,
      clear() {
        map.forEach((e) => e.remove());
        map.clear();
        hl.hidden = true;
      },
      /** 駒の一覧をそのまま並べ直す (アニメなし)。 */
      set(pieces) {
        api.clear();
        for (const p of pieces) api.place(p.k, p.s, p.f, p.r);
      },
      place(k, side, f, r) {
        if (!has(f, r)) return null;
        const e = makeKoma(k, side);
        e.style.left = left(f);
        e.style.top = top(r);
        board.appendChild(e);
        map.set(key(f, r), e);
        return e;
      },
      /**
       * 直前の手を示す。もといたマスを桃色に塗り、動いた駒はふちを光らせる。
       * 行った先までベタ塗りにすると駒の字が読みにくくなるため (棋譜ノートと同じ)。
       */
      showLast(from, to) {
        board.querySelectorAll('.koma.last').forEach((e) => e.classList.remove('last'));
        if (from && has(from[0], from[1])) {
          hl.style.left = left(from[0]);
          hl.style.top = top(from[1]);
          hl.hidden = false;
        } else {
          hl.hidden = true;
        }
        const moved = to && map.get(key(to[0], to[1]));
        if (moved) moved.classList.add('last');
      },
      /** 1 手ぶん動かす。持駒や盤の外から来る駒は from を null にする。 */
      move(from, to, opt) {
        const o = opt || {};
        const ms = reduceMotion() ? 0 : (o.ms === undefined ? 420 : o.ms);
        const taken = map.get(key(to[0], to[1]));
        if (taken) {
          taken.remove();
          map.delete(key(to[0], to[1]));
        }
        let e = from ? map.get(key(from[0], from[1])) : null;
        if (from) map.delete(key(from[0], from[1]));

        if (!e) {
          // 外から来る駒。入場方向は「外側の筋」から
          e = makeKoma(o.k || '歩', o.side === undefined ? C.SENTE : o.side);
          const edge = o.fromEdge;
          e.style.left = edge ? edge.left : left(to[0]);
          e.style.top = edge ? edge.top : top(to[1]);
          if (!edge) e.classList.add('pop');
          board.appendChild(e);
        }
        map.set(key(to[0], to[1]), e);
        api.showLast(from, to);

        const nl = left(to[0]), nt = top(to[1]);
        const ol = e.style.left, ot = e.style.top;
        e.style.left = nl;
        e.style.top = nt;
        if (o.promote) {
          const face = e.querySelector('.face');
          const promoted = C.PROMOTE[e.dataset.k] || e.dataset.k;
          e.dataset.k = promoted;
          face.textContent = SHORT[promoted] || promoted;
          e.classList.add('pro');
        }
        if (!ms || (ol === nl && ot === nt)) return Promise.resolve();
        // 同じフレームで書きかえると 1 コマも動かないので、Web Animations で動かす
        const anim = e.animate(
          [{ left: ol, top: ot }, { left: nl, top: nt }],
          { duration: ms, easing: 'cubic-bezier(.25,.9,.3,1)' }
        );
        return anim.finished.catch(() => {});
      },
      edgeOf(side) {
        // 囲いアニメで、外から入ってくる駒のスタート位置
        const outside = files[0] > files[files.length - 1] ? -1 : 1;
        return { left: (outside > 0 ? 100 : -18) + '%', top: '78%', side: side };
      },
      sync: sync
    };
    return api;
  }

  /* ============================================================
     パラパラ再生
     frames[i] = i 手目まで進めたときの駒の並び。moves[i] = i+1 手目の情報。
     ============================================================ */

  function createPlayer(boardApi, frames, moves, opts) {
    const o = opts || {};
    let onEnd = o.onEnd || null;
    let i = 0;
    let timer = null;
    let speed = 1;
    let chain = Promise.resolve();   // 1 手ずつ順番に動かすための待ち行列
    let gen = 0;                     // goto でジャンプしたら、待っている手は捨てる
    const listeners = [];

    function emit() { listeners.forEach((fn) => fn(i, moves.length)); }

    async function runStep() {
      if (i >= moves.length) return false;
      const m = moves[i];
      i++;                       // 先に数えておくと、続けて押されても手順がずれない
      emit();
      await boardApi.move(m.from, m.to, {
        k: m.k, side: m.side, promote: m.promote,
        fromEdge: m.fromEdge, ms: 420 / speed
      });
      emit();
      return true;
    }

    const api = {
      get index() { return i; },
      get length() { return moves.length; },
      get playing() { return timer !== null; },
      onChange(fn) { listeners.push(fn); return api; },
      /** 最後まで再生し終わったときに 1 回だけ呼ぶ処理 */
      setOnEnd(fn) { onEnd = fn; },
      setSpeed(s) { speed = s; },
      get speed() { return speed; },
      goto(n) {
        api.pause();
        gen++;
        i = Math.max(0, Math.min(moves.length, n));
        boardApi.set(frames[i]);
        if (i > 0) boardApi.showLast(moves[i - 1].from, moves[i - 1].to);
        emit();
      },
      /**
       * 1 手すすめる。動かしている途中に押されても取りこぼさないよう、
       * 待ち行列につないで順番に動かす (連打しても二重に動かない)。
       */
      step() {
        const g = gen;
        chain = chain.then(() => (g === gen ? runStep() : false), () => false);
        return chain;
      },
      async play() {
        if (timer) return;
        if (i >= moves.length) api.goto(0);
        emit();
        const tick = async () => {
          const moved = await api.step();
          if (!moved) { api.pause(); if (onEnd) { const fn = onEnd; onEnd = null; fn(); } return; }
          if (timer === null) return;
          timer = setTimeout(tick, 480 / speed);
        };
        timer = setTimeout(tick, 220);
        emit();
      },
      pause() {
        if (timer) { clearTimeout(timer); timer = null; emit(); }
      },
      destroy() { api.pause(); listeners.length = 0; }
    };
    return api;
  }

  /** 棋譜 (core の再生結果) を、盤アニメ用の frames / moves に直す。 */
  function fromKifu(start, kifu) {
    const played = C.playKifu(start, kifu, C.SENTE);
    const frames = [C.listPieces(start)];
    const moves = played.moves.map((s) => {
      frames.push(C.listPieces(s.board));
      return {
        from: s.move.from, to: s.move.to, k: s.move.k, side: s.move.s,
        promote: s.move.promote, drop: s.move.drop, text: s.text
      };
    });
    return { frames: frames, moves: moves, boards: [start].concat(played.moves.map((s) => s.board)) };
  }

  /** 囲いの組み上がり手順を、盤アニメ用に直す。 */
  function fromCastle(castle) {
    const init = (castle.crop === 'left' ? D.INIT_L : D.INIT_R).concat(D.EXTRA_INIT[castle.name] || []);
    let now = init.map(([k, f, r]) => ({ k: k, s: C.SENTE, f: f, r: r }));
    const frames = [now];
    const moves = castle.moves.map(([k, f1, r1, f2, r2], n) => {
      const from = f1 === 0 ? null : [f1, r1];
      now = now
        .filter((p) => !(p.f === f2 && p.r === r2))                       // 行き先の駒はどく
        .filter((p) => !(from && p.f === f1 && p.r === r1))                // 元の場所から消す
        .concat([{ k: k, s: C.SENTE, f: f2, r: r2 }]);
      frames.push(now);
      return {
        from: from, to: [f2, r2], k: k, side: C.SENTE, promote: false, drop: !from,
        text: (n + 1) + '手目 ▲' + ZEN_FILE[f2 - 1] + RANK_KANJI[r2 - 1] + k
      };
    });
    return { frames: frames, moves: moves };
  }

  function castleCrop(castle) {
    return castle.crop === 'left'
      ? { files: [9, 8, 7, 6, 5], ranks: [5, 6, 7, 8, 9] }
      : { files: [5, 4, 3, 2, 1], ranks: [5, 6, 7, 8, 9] };
  }

  /** 持ち駒を、盤の駒と同じ形の小さな板でならべる (枚数はバッジで出す)。 */
  function handsEl(board) {
    const wrap = el('div', 'hands');
    [C.SENTE, C.GOTE].forEach((side) => {
      const row = el('div', 'side');
      row.appendChild(el('span', 'who', (side === C.SENTE ? '先手（自分）' : '後手（相手）') + ' 持駒'));
      const plates = el('div', 'plates');
      const h = board.hand[side];
      const keys = Object.keys(h).filter((k) => h[k] > 0);
      if (!keys.length) {
        plates.appendChild(el('span', 'none', 'なし'));
      } else {
        for (const k of keys) {
          const hk = el('div', 'hk');
          hk.appendChild(el('div', 'p'));
          hk.appendChild(el('div', 'c', SHORT[k] || k));
          if (h[k] > 1) hk.appendChild(el('span', 'n', String(h[k])));
          plates.appendChild(hk);
        }
      }
      row.appendChild(plates);
      wrap.appendChild(row);
    });
    return wrap;
  }

  /* ============================================================
     画面の切りかえ
     ============================================================ */

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-active', s.id === id));
    window.scrollTo(0, 0);
  }

  /* ============================================================
     成績のほぞん (まとめて 1 回だけ書く)
     ============================================================ */

  const STORE_KEY = 'shogi-quiz-dojo/v1';
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { best: {} }; }
    catch (e) { return { best: {} }; }
  }
  function saveBest(mode, score, total) {
    const s = loadStore();
    const rate = score / total;
    if (!s.best[mode] || s.best[mode].rate < rate) s.best[mode] = { score: score, total: total, rate: rate };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* 使えなくても続ける */ }
  }

  /* ============================================================
     タイトル
     ============================================================ */

  // 絵文字ではなく、駒の形の札に漢字を一文字。和紙の見た目にそろえる
  const MODES = [
    { id: 'castle', icon: '囲', name: '囲いクイズ', desc: '盤の形を見て、囲いの名前を当てよう', count: () => D.castles.length },
    { id: 'tesuji', icon: '筋', name: '手筋パラパラ', desc: '動く絵で出る手筋の名前は？ 全部アニメで出題', count: () => D.tesuji.length },
    { id: 'senpou', icon: '戦', name: '戦法パラパラ', desc: '序盤の指し手をパラパラ漫画で。何の戦法かな', count: () => D.senpou.length },
    { id: 'tsume', icon: '詰', name: '1手詰クイズ', desc: 'この局面、1手で詰ますのはどれ？', count: () => D.tsume.length },
    { id: 'knowledge', icon: '言', name: '知識・格言', desc: 'ルール、戦法、将棋のことわざ', count: () => D.knowledge.length },
    { id: 'mix', icon: '番', name: 'ミックス十番勝負', desc: 'ぜんぶまぜて実力チェック！', count: () => 0 }
  ];

  function renderTitle() {
    const list = $('mode-list');
    list.innerHTML = '';
    const store = loadStore();
    for (const m of MODES) {
      const b = el('button', 'mode-btn');
      b.type = 'button';
      b.dataset.mode = m.id;
      b.appendChild(el('span', 'medal', m.icon));
      const body = el('span', 'body');
      body.appendChild(el('span', 'name', m.name));
      const n = m.count();
      body.appendChild(el('span', 'desc', m.desc + (n ? '（全' + n + '問から出題）' : '')));
      b.appendChild(body);
      const best = store.best[m.id];
      if (best) b.appendChild(el('span', 'best', '最高 ' + best.score + '/' + best.total));
      b.addEventListener('click', () => start(m.id));
      list.appendChild(b);
    }
    const z = el('button', 'mode-btn is-zukan');
    z.type = 'button';
    z.appendChild(el('span', 'medal', '図'));
    const zb = el('span', 'body');
    zb.appendChild(el('span', 'name', 'ずかん'));
    zb.appendChild(el('span', 'desc', '囲い27・手筋15・戦法19。動く絵でひとつずつ見られる'));
    z.appendChild(zb);
    z.addEventListener('click', () => showZukan());
    list.appendChild(z);

    const total = D.castles.length + D.tesuji.length + D.senpou.length + D.knowledge.length + D.tsume.length;
    $('total-note').textContent = '全 ' + total + ' 問 ／ 出題のたびに順番も選択肢も変わるよ';
  }

  /* ============================================================
     クイズ
     ============================================================ */

  const state = { mode: 'castle', round: [], idx: 0, score: 0, wrong: [], player: null, answered: false };

  function start(mode) {
    state.mode = mode;
    state.round = C.buildRound(D, mode, Math.random);
    state.idx = 0;
    state.score = 0;
    state.wrong = [];
    $('hud-score').textContent = '0';
    showScreen('screen-quiz');
    renderQuestion();
  }

  function renderProgress() {
    const p = $('progress');
    p.innerHTML = '';
    state.round.forEach((q, n) => {
      const i = el('i');
      if (q.result === true) i.classList.add('ok');
      else if (q.result === false) i.classList.add('ng');
      else if (n === state.idx) i.classList.add('now');
      p.appendChild(i);
    });
  }

  function stopPlayer() {
    if (state.player) { state.player.destroy(); state.player = null; }
  }

  function buildPlayerUI(boardApi, frames, moves, autoplay) {
    const stage = $('stage');
    stage.innerHTML = '';
    stage.hidden = false;
    stage.appendChild(boardApi.el);
    boardApi.set(frames[0]);

    const strip = $('kifu-strip');
    strip.innerHTML = '';
    const chips = moves.map((m) => {
      const s = el('span', null, m.text.replace(/^\d+手目 /, ''));
      strip.appendChild(s);
      return s;
    });

    const player = createPlayer(boardApi, frames, moves, {});
    player.onChange((i) => {
      chips.forEach((c, n) => {
        c.classList.toggle('now', n === i - 1);
        c.classList.toggle('done', n < i - 1);
      });
      if (chips[i - 1]) chips[i - 1].scrollIntoView({ block: 'nearest', inline: 'center' });
      $('btn-play').textContent = player.playing ? '⏸ ていし' : (i >= moves.length ? '⟲ もういちど' : '▶ さいせい');
      $('btn-play').classList.toggle('is-on', player.playing);
      $('btn-prev').disabled = i === 0;
      $('btn-next-move').disabled = i >= moves.length;
    });

    $('player').hidden = false;
    $('btn-play').onclick = () => { player.playing ? player.pause() : player.play(); };
    $('btn-prev').onclick = () => player.goto(player.index - 1);
    $('btn-next-move').onclick = () => { player.pause(); player.step(); };
    $('btn-speed').onclick = () => {
      const next = { 1: 1.5, 1.5: 2, 2: 1 }[player.speed];
      player.setSpeed(next);
      $('btn-speed').textContent = '×' + next;
    };
    $('btn-speed').textContent = '×' + player.speed;
    player.goto(0);
    if (autoplay) player.play();
    state.player = player;
    return player;
  }

  /**
   * 盤の高さの取り置き (px)。盤より下に出るものの合計 + 選択肢 1 行ぶん。
   * これを引いた高さに盤をおさめるので、選択肢がスクロールなしで見える。
   */
  const RESERVE = { castle: 320, senpou: 370, tesuji: 430, tsume: 430 };

  function renderQuestion() {
    stopPlayer();
    const q = state.round[state.idx];
    $('screen-quiz').style.setProperty('--reserve', (RESERVE[q.type] || 430) + 'px');
    state.answered = false;
    $('hud-count').textContent = '第' + (state.idx + 1) + '問';
    renderProgress();
    $('stage').hidden = true;
    $('stage').innerHTML = '';
    $('player').hidden = true;
    $('kifu-strip').innerHTML = '';
    $('hands').hidden = true;
    $('judge').hidden = true;

    const stars = (lv) => '★'.repeat(lv) + '☆'.repeat(3 - lv);
    const choicesEl = $('choices');
    choicesEl.innerHTML = '';

    if (q.type === 'castle') {
      $('q-label').textContent = stars(q.item.lv);
      $('q-text').innerHTML = 'この囲（かこ）いの名前はどれ？';
      const crop = castleCrop(q.item);
      const board = createBoard(crop.files, crop.ranks);
      $('stage').hidden = false;
      $('stage').appendChild(board.el);
      board.set(q.item.pieces.map(([k, f, r]) => ({ k: k, s: C.SENTE, f: f, r: r })));
    } else if (q.type === 'tesuji' || q.type === 'senpou') {
      const isT = q.type === 'tesuji';
      $('q-label').textContent = stars(q.item.lv);
      // 手筋は再生ボタンがすぐ下に見えているので、説明の行は足さない (そのぶん選択肢が上がる)
      $('q-text').innerHTML = isT
        ? 'この手筋（てすじ）はどれ？'
        : 'この指し方をする戦法（せんぽう）はどれ？<small>初形からの出だしをパラパラ漫画にしたよ</small>';
      const startBoard = isT ? C.parseBoard(q.item.board, q.item.hand) : C.initialBoard();
      const seq = fromKifu(startBoard, q.item.kifu);
      const crop = isT
        ? C.cropFor(startBoard, seq.moves.map((m) => ({ to: m.to, from: m.from })), 5)
        : { files: [9, 8, 7, 6, 5, 4, 3, 2, 1], ranks: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
      const board = createBoard(crop.files, crop.ranks);
      buildPlayerUI(board, seq.frames, seq.moves, true);
      if (isT && q.item.hand) showHands(startBoard);
    } else if (q.type === 'tsume') {
      $('q-label').textContent = stars(q.item.lv);
      $('q-text').innerHTML = '<b>1手</b>で詰ますのはどれ？<small>先手（下）の手番だよ</small>';
      const b = C.parseBoard(q.item.board, q.item.hand);
      const crop = C.cropFor(b, [], 5);
      const board = createBoard(crop.files, crop.ranks);
      $('stage').hidden = false;
      $('stage').appendChild(board.el);
      board.set(C.listPieces(b));
      showHands(b);
    } else {
      $('q-label').textContent = '';
      $('q-text').textContent = q.item.q;
    }

    // 選択肢
    if (q.type === 'knowledge') {
      choicesEl.className = 'choices pill-list';
      q.choices.forEach((c, i) => {
        const b = el('button', 'pill', c.name);
        b.type = 'button';
        b.dataset.i = i;
        choicesEl.appendChild(b);
      });
    } else if (q.type === 'tsume') {
      choicesEl.className = 'choices move-grid';
      q.choices.forEach((c, i) => {
        const b = el('button', 'pill move', '▲' + c.name);
        b.type = 'button';
        b.dataset.i = i;
        choicesEl.appendChild(b);
      });
    } else {
      choicesEl.className = 'choices koma-grid';
      q.choices.forEach((c, i) => {
        const b = el('button', 'koma-choice');
        b.type = 'button';
        b.dataset.i = i;
        const shape = el('span', 'shape');
        shape.appendChild(el('span', 'kana', c.kana || ''));
        shape.appendChild(el('span', 'kanji', c.name));
        b.appendChild(shape);
        choicesEl.appendChild(b);
      });
    }
    choicesEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', onAnswer));
  }

  function showHands(board) {
    const h = $('hands');
    h.innerHTML = handsEl(board).innerHTML;
    h.hidden = false;
  }

  const OK_WORDS = ['せいかい！', 'おみごと！', 'するどい！', 'よく見てる！'];
  const NG_WORDS = ['ざんねん…', 'おしい！', 'つぎは当てよう！'];

  function onAnswer(e) {
    if (state.answered) return;
    state.answered = true;
    const q = state.round[state.idx];
    const picked = q.choices[Number(e.currentTarget.dataset.i)];
    const ok = !!picked.ok;
    q.result = ok;
    if (state.player) state.player.pause();

    document.querySelectorAll('#choices button').forEach((b, i) => {
      b.disabled = true;
      b.classList.add(q.choices[i].ok ? 'ok' : 'ng');
    });
    if (ok) {
      state.score++;
      $('hud-score').textContent = String(state.score);
    } else {
      state.wrong.push(q);
    }
    renderProgress();
    setTimeout(() => openJudge(q, ok), 420);
  }

  function answerLabel(q) {
    if (q.type === 'knowledge') return { main: q.item.choices[0], kana: '' };
    if (q.type === 'tsume') return { main: '▲' + q.item.answer, kana: q.item.name };
    return { main: q.item.name, kana: q.item.kana };
  }

  function openJudge(q, ok) {
    const mark = $('judge-mark');
    mark.className = 'judge-mark ' + (ok ? 'ok' : 'ng');
    mark.querySelector('.mark').textContent = ok ? '◯' : '✕';
    $('judge-word').textContent = (ok ? OK_WORDS : NG_WORDS)[Math.floor(Math.random() * (ok ? OK_WORDS : NG_WORDS).length)];
    const a = answerLabel(q);
    $('judge-answer').innerHTML = '';
    $('judge-answer').appendChild(document.createTextNode('こたえ：' + a.main));
    if (a.kana) $('judge-answer').appendChild(el('span', 'kana', a.kana));
    $('judge-expl').textContent = q.item.expl;

    const replay = $('btn-replay');
    replay.hidden = !state.player;
    $('judge').hidden = false;
  }

  $('btn-replay').addEventListener('click', () => {
    if (!state.player) return;
    const p = state.player;
    $('judge').hidden = true;
    p.goto(0);
    // 再生が終わったら、自動でこたえの紙にもどる
    p.setOnEnd(() => { $('judge').hidden = false; });
    p.play();
  });

  $('btn-next').addEventListener('click', () => {
    $('judge').hidden = true;
    state.idx++;
    if (state.idx < state.round.length) renderQuestion();
    else showResult();
  });

  $('btn-quit').addEventListener('click', () => { stopPlayer(); showScreen('screen-title'); renderTitle(); });

  /* ============================================================
     結果
     ============================================================ */

  function showResult() {
    stopPlayer();
    const total = state.round.length;
    const rate = state.score / total;
    const rank = C.rankOf(rate);
    $('result-rank').textContent = rank.name;
    $('result-kana').textContent = rank.kana;
    $('result-stars').textContent = '★'.repeat(rank.stars) + '☆'.repeat(5 - rank.stars);
    $('result-score').textContent = String(state.score);
    $('result-total').textContent = String(total);
    $('result-msg').textContent = rank.msg;

    const list = $('review-list');
    list.innerHTML = '';
    state.wrong.forEach((q) => {
      const a = answerLabel(q);
      const li = el('li');
      li.appendChild(el('b', null, a.main + (a.kana ? '（' + a.kana + '）' : '')));
      li.appendChild(document.createTextNode(' — ' + q.item.expl));
      list.appendChild(li);
    });
    $('review').hidden = state.wrong.length === 0;

    saveBest(state.mode, state.score, total);
    showScreen('screen-result');
    if (rate >= 0.8) komaFubuki();
  }

  function komaFubuki() {
    if (reduceMotion()) return;
    const chars = ['歩', '香', '桂', '銀', '金', '角', '飛', '王', 'と'];
    for (let i = 0; i < 24; i++) {
      const s = el('span', 'confetti', chars[Math.floor(Math.random() * chars.length)]);
      s.style.left = Math.random() * 96 + 'vw';
      s.style.color = ['#b23a2e', '#8a6a34', '#2f5d8a', '#4f7f5f'][i % 4];
      s.style.animationDuration = 2.2 + Math.random() * 2.4 + 's';
      s.style.animationDelay = Math.random() * 0.8 + 's';
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 6200);
    }
  }

  $('btn-retry').addEventListener('click', () => start(state.mode));
  $('btn-home').addEventListener('click', () => { showScreen('screen-title'); renderTitle(); });
  $('btn-zukan-from-result').addEventListener('click', () => showZukan());

  /* ============================================================
     ずかん
     ============================================================ */

  let zukanTab = 'castle';

  function zukanCard(item, kind) {
    const card = el('div', 'z-card');
    const name = el('div', 'z-name', item.name);
    name.appendChild(el('span', 'kana', item.kana));
    card.appendChild(name);
    card.appendChild(el('div', 'z-lv', 'むずかしさ ' + '★'.repeat(item.lv) + '☆'.repeat(3 - item.lv)));

    let boardApi, frames, moves, startBoard = null;
    if (kind === 'castle') {
      const crop = castleCrop(item);
      boardApi = createBoard(crop.files, crop.ranks);
      const seq = fromCastle(item);
      frames = seq.frames;
      moves = seq.moves.map((m) => Object.assign({}, m, { fromEdge: m.from ? null : boardApi.edgeOf(C.SENTE) }));
    } else if (kind === 'tesuji') {
      startBoard = C.parseBoard(item.board, item.hand);
      const seq = fromKifu(startBoard, item.kifu);
      const crop = C.cropFor(startBoard, seq.moves.map((m) => ({ to: m.to, from: m.from })), 5);
      boardApi = createBoard(crop.files, crop.ranks);
      frames = seq.frames;
      moves = seq.moves;
    } else {
      startBoard = C.initialBoard();
      const seq = fromKifu(startBoard, item.kifu);
      boardApi = createBoard([9, 8, 7, 6, 5, 4, 3, 2, 1], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
      frames = seq.frames;
      moves = seq.moves;
    }
    card.appendChild(boardApi.el);
    boardApi.set(kind === 'castle' ? frames[frames.length - 1] : frames[0]);

    if (kind === 'tesuji' && item.hand) card.appendChild(handsEl(startBoard));

    const bar = el('div', 'player-btns');
    const play = el('button', 'ctrl', '▶ ' + (kind === 'castle' ? 'くみたてを見る' : '手順を見る'));
    play.type = 'button';
    const cap = el('div', 'z-lv', '');
    const player = createPlayer(boardApi, frames, moves, {});
    player.onChange((i, n) => {
      cap.textContent = i === 0 ? '' : (kind === 'castle' ? moves[i - 1].text : i + '手目 ' + moves[i - 1].text);
      play.textContent = player.playing ? '⏸ ていし' : (i >= n ? '⟲ もういちど' : '▶ ' + (kind === 'castle' ? 'くみたてを見る' : '手順を見る'));
      play.classList.toggle('is-on', player.playing);
    });
    play.addEventListener('click', () => {
      if (player.playing) { player.pause(); return; }
      if (player.index >= moves.length || (kind === 'castle' && player.index === 0)) player.goto(0);
      player.play();
    });
    bar.appendChild(play);
    card.appendChild(bar);
    card.appendChild(cap);
    card.appendChild(el('p', 'z-expl', item.expl));
    return card;
  }

  function buildZukan(tab) {
    const list = $('zukan-list');
    list.innerHTML = '';
    if (tab === 'castle') {
      $('zukan-note').textContent = '▶ボタンで、囲いができるまでを1手ずつ見られるよ（飛車・角などは省略）';
      const order = ['yagura', 'mino', 'ana', 'fune'];
      const famOf = (c) => (c.fam === 'anaR' ? 'ana' : c.fam);
      for (const f of order) {
        list.appendChild(el('div', 'zukan-fam', D.FAM_LABEL[f]));
        D.castles.filter((c) => famOf(c) === f).forEach((c) => list.appendChild(zukanCard(c, 'castle')));
      }
      $('zukan-count').textContent = D.castles.length + '種類';
    } else if (tab === 'tesuji') {
      $('zukan-note').textContent = '▶ボタンで、手筋が決まるまでをパラパラ漫画で見られるよ';
      for (const cat of ['tsumi', 'ryoutori', 'fu', 'uke', 'seme']) {
        const items = D.tesuji.filter((t) => t.cat === cat);
        if (!items.length) continue;
        list.appendChild(el('div', 'zukan-fam', D.CAT_LABEL[cat]));
        items.forEach((t) => list.appendChild(zukanCard(t, 'tesuji')));
      }
      $('zukan-count').textContent = D.tesuji.length + '種類';
    } else {
      $('zukan-note').textContent = '▶ボタンで、平手の初形からの出だしを1手ずつ見られるよ';
      for (const cat of ['furi', 'ibisha', 'kishu']) {
        const items = D.senpou.filter((s) => s.cat === cat);
        if (!items.length) continue;
        list.appendChild(el('div', 'zukan-fam', D.CAT_LABEL[cat]));
        items.forEach((s) => list.appendChild(zukanCard(s, 'senpou')));
      }
      $('zukan-count').textContent = D.senpou.length + '種類';
    }
  }

  function showZukan(tab) {
    stopPlayer();
    zukanTab = tab || zukanTab;
    document.querySelectorAll('#zukan-tabs .tab').forEach((t) => t.classList.toggle('is-on', t.dataset.tab === zukanTab));
    buildZukan(zukanTab);
    showScreen('screen-zukan');
  }

  document.querySelectorAll('#zukan-tabs .tab').forEach((t) =>
    t.addEventListener('click', () => showZukan(t.dataset.tab)));
  $('btn-zukan-back').addEventListener('click', () => { showScreen('screen-title'); renderTitle(); });

  /* ============================================================
     はじまり
     ============================================================ */

  function main() {
    renderTitle();
    /* build:strip-start (1 枚ものに焼くときは、この中を落とす) */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    /* build:strip-end */
    // 自動テストから中をのぞくための入口
    window.__app = {
      state: () => state,
      start: start,
      showScreen: showScreen,
      showZukan: showZukan,
      answer: (i) => {
        const btn = document.querySelector('#choices button[data-i="' + i + '"]');
        if (btn) btn.click();
      },
      answerCorrect: () => {
        const q = state.round[state.idx];
        window.__app.answer(q.choices.findIndex((c) => c.ok));
      },
      player: () => state.player,
      /** テスト用: 決まった 1 問だけを出して描く */
      showOne: (type, item) => {
        state.mode = type;
        state.round = [C.questionOf(type, item, D, Math.random)];
        state.idx = 0;
        state.score = 0;
        state.wrong = [];
        showScreen('screen-quiz');
        renderQuestion();
      },
      data: D,
      core: C
    };
  }

  main();
})();
