/*!
 * core.js — 将棋のルールとクイズの組み立て。DOM を触らないので node でテストできる。
 *
 * ここに「盤・駒・手」を素直に書いておくと、クイズのデータ(戦法の手順や詰将棋)が
 * 本当に正しいかをテストで機械的に確かめられる。目で見て確かめるより確実。
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

  /* ================= 乱数 ================= */

  /** 決まった順番で数を出す乱数 (mulberry32)。同じ seed なら必ず同じ並び。 */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 配列を混ぜた新しい配列を返す。rng を渡せば結果を再現できる。 */
  function shuffle(array, rng) {
    const random = rng || Math.random;
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ================= 盤と駒 ================= */

  const SENTE = 0;
  const GOTE = 1;

  const PROMOTE = { 歩: 'と', 香: '成香', 桂: '成桂', 銀: '成銀', 角: '馬', 飛: '龍' };
  const DEMOTE = { と: '歩', 成香: '香', 成桂: '桂', 成銀: '銀', 馬: '角', 龍: '飛' };
  const GOLDS = ['金', 'と', '成香', '成桂', '成銀'];
  const KING = ['玉', '王'];

  // 動きは先手から見た向き (段が減る方向が「前」)。後手は 180 度まわして使う。
  const KSTEP = [[0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [0, 1]];
  const GSTEP = [[0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1]];
  const STEPS = {
    歩: [[0, -1]],
    桂: [[1, -2], [-1, -2]],
    銀: [[0, -1], [1, -1], [-1, -1], [1, 1], [-1, 1]],
    玉: KSTEP, 王: KSTEP,
    馬: KSTEP, 龍: KSTEP
  };
  const SLIDES = {
    香: [[0, -1]],
    角: [[1, -1], [-1, -1], [1, 1], [-1, 1]],
    飛: [[0, -1], [0, 1], [1, 0], [-1, 0]],
    馬: [[1, -1], [-1, -1], [1, 1], [-1, 1]],
    龍: [[0, -1], [0, 1], [1, 0], [-1, 0]]
  };

  function stepsOf(k) {
    if (GOLDS.indexOf(k) >= 0) return GSTEP;
    return STEPS[k] || [];
  }
  function slidesOf(k) { return SLIDES[k] || []; }
  function isKing(k) { return KING.indexOf(k) >= 0; }
  function canPromote(k) { return !!PROMOTE[k]; }
  function baseKind(k) { return DEMOTE[k] || k; }

  function inside(f, r) { return f >= 1 && f <= 9 && r >= 1 && r <= 9; }
  function idx(f, r) { return (r - 1) * 9 + (9 - f); }

  /** 空の盤。sq[81] は null か {k, s}、hand は [先手の持駒, 後手の持駒]。 */
  function emptyBoard() {
    return { sq: new Array(81).fill(null), hand: [{}, {}] };
  }

  function cloneBoard(b) {
    return {
      sq: b.sq.slice(),
      hand: [Object.assign({}, b.hand[0]), Object.assign({}, b.hand[1])]
    };
  }

  function at(b, f, r) { return inside(f, r) ? b.sq[idx(f, r)] : undefined; }
  function put(b, f, r, piece) { b.sq[idx(f, r)] = piece; return b; }

  /** 盤の駒を [{k, s, f, r}] で取り出す (描画用)。 */
  function listPieces(b) {
    const out = [];
    for (let r = 1; r <= 9; r++) {
      for (let f = 9; f >= 1; f--) {
        const p = at(b, f, r);
        if (p) out.push({ k: p.k, s: p.s, f: f, r: r });
      }
    }
    return out;
  }

  /**
   * 文字で盤を書く。"v玉51 ^金53 ^龍55" のように、
   * ^ が先手 / v が後手、つづけて 駒 + 筋 + 段。
   */
  function parseBoard(text, handText) {
    const b = emptyBoard();
    for (const token of String(text || '').split(/\s+/).filter(Boolean)) {
      const s = token[0] === 'v' ? GOTE : SENTE;
      if (token[0] !== 'v' && token[0] !== '^') throw new Error('駒は ^ か v で始める: ' + token);
      const body = token.slice(1);
      const k = body.slice(0, body.length - 2);
      const f = Number(body[body.length - 2]);
      const r = Number(body[body.length - 1]);
      if (!inside(f, r)) throw new Error('盤の外: ' + token);
      if (at(b, f, r)) throw new Error('駒がかさなっている: ' + token);
      put(b, f, r, { k: k, s: s });
    }
    for (const token of String(handText || '').split(/\s+/).filter(Boolean)) {
      const s = token[0] === 'v' ? GOTE : SENTE;
      const body = token.slice(1);
      const m = body.match(/^(.+?)(\d*)$/);
      const k = m[1];
      const n = m[2] ? Number(m[2]) : 1;
      b.hand[s][k] = (b.hand[s][k] || 0) + n;
    }
    return b;
  }

  /** 平手の初期配置。 */
  function initialBoard() {
    const back = ['香', '桂', '銀', '金', '玉', '金', '銀', '桂', '香']; // 9筋 → 1筋
    const b = emptyBoard();
    back.forEach(function (k, i) {
      const f = 9 - i;
      put(b, f, 9, { k: k, s: SENTE });
      put(b, f, 1, { k: k === '玉' ? '玉' : k, s: GOTE });
    });
    put(b, 8, 8, { k: '角', s: SENTE });
    put(b, 2, 8, { k: '飛', s: SENTE });
    put(b, 2, 2, { k: '角', s: GOTE });
    put(b, 8, 2, { k: '飛', s: GOTE });
    for (let f = 1; f <= 9; f++) {
      put(b, f, 7, { k: '歩', s: SENTE });
      put(b, f, 3, { k: '歩', s: GOTE });
    }
    return b;
  }

  /* ================= 手を作る ================= */

  /** その駒が動ける場所 (自分の駒の上には行けない、というところまで)。 */
  function movesFrom(b, f, r) {
    const p = at(b, f, r);
    if (!p) return [];
    const dir = p.s === SENTE ? 1 : -1;
    const out = [];
    for (const [df, dr] of stepsOf(p.k)) {
      const nf = f + df * dir, nr = r + dr * dir;
      if (!inside(nf, nr)) continue;
      const q = at(b, nf, nr);
      if (q && q.s === p.s) continue;
      out.push([nf, nr]);
    }
    for (const [df, dr] of slidesOf(p.k)) {
      let nf = f + df * dir, nr = r + dr * dir;
      while (inside(nf, nr)) {
        const q = at(b, nf, nr);
        if (q && q.s === p.s) break;
        out.push([nf, nr]);
        if (q) break;
        nf += df * dir; nr += dr * dir;
      }
    }
    return out;
  }

  function findKing(b, side) {
    for (let r = 1; r <= 9; r++) {
      for (let f = 1; f <= 9; f++) {
        const p = at(b, f, r);
        if (p && p.s === side && isKing(p.k)) return [f, r];
      }
    }
    return null;
  }

  /** side の玉に王手がかかっているか (玉が盤にいなければ false)。 */
  function inCheck(b, side) {
    const king = findKing(b, side);
    if (!king) return false;
    for (let r = 1; r <= 9; r++) {
      for (let f = 1; f <= 9; f++) {
        const p = at(b, f, r);
        if (!p || p.s === side) continue;
        for (const [tf, tr] of movesFrom(b, f, r)) {
          if (tf === king[0] && tr === king[1]) return true;
        }
      }
    }
    return false;
  }

  function zoneOfPromotion(r, side) { return side === SENTE ? r <= 3 : r >= 7; }

  /** 動かしたあと、その駒が動けなくなる場所か (行き所のない駒)。 */
  function stuck(k, r, side) {
    const last = side === SENTE ? 1 : 9;
    const second = side === SENTE ? 2 : 8;
    if (k === '歩' || k === '香') return r === last;
    if (k === '桂') return r === last || r === second;
    return false;
  }

  /** 手を指した新しい盤を返す。move = {from,to,k,s,promote,drop} */
  function applyMove(b, move) {
    const nb = cloneBoard(b);
    const [tf, tr] = move.to;
    if (move.drop) {
      const hand = nb.hand[move.s];
      if (!hand[move.k]) throw new Error('持っていない駒を打とうとした: ' + move.k);
      hand[move.k]--;
      if (!hand[move.k]) delete hand[move.k];
      put(nb, tf, tr, { k: move.k, s: move.s });
      return nb;
    }
    const [ff, fr] = move.from;
    const p = at(nb, ff, fr);
    if (!p) throw new Error('動かす駒がない: ' + ff + fr);
    const captured = at(nb, tf, tr);
    if (captured) {
      const k = baseKind(captured.k);
      nb.hand[move.s][k] = (nb.hand[move.s][k] || 0) + 1;
    }
    put(nb, ff, fr, null);
    put(nb, tf, tr, { k: move.promote ? PROMOTE[p.k] : p.k, s: p.s });
    return nb;
  }

  /** side が指せる手をぜんぶ作る (自分の玉が王手のままになる手は除く)。 */
  function legalMoves(b, side) {
    const out = [];
    for (let r = 1; r <= 9; r++) {
      for (let f = 1; f <= 9; f++) {
        const p = at(b, f, r);
        if (!p || p.s !== side) continue;
        for (const [tf, tr] of movesFrom(b, f, r)) {
          const promo = canPromote(p.k) && (zoneOfPromotion(r, side) || zoneOfPromotion(tr, side));
          const variants = promo ? [true, false] : [false];
          for (const promote of variants) {
            if (!promote && stuck(p.k, tr, side)) continue;
            const move = { from: [f, r], to: [tf, tr], k: p.k, s: side, promote: promote, drop: false };
            if (!inCheck(applyMove(b, move), side)) out.push(move);
          }
        }
      }
    }
    for (const k of Object.keys(b.hand[side])) {
      if (!b.hand[side][k]) continue;
      for (let r = 1; r <= 9; r++) {
        for (let f = 1; f <= 9; f++) {
          if (at(b, f, r)) continue;
          if (stuck(k, r, side)) continue;
          if (k === '歩' && hasPawnOnFile(b, f, side)) continue;
          const move = { from: null, to: [f, r], k: k, s: side, promote: false, drop: true };
          const nb = applyMove(b, move);
          if (inCheck(nb, side)) continue;
          if (k === '歩' && isMate(nb, 1 - side)) continue; // 打ち歩詰めは反則
          out.push(move);
        }
      }
    }
    return out;
  }

  function hasPawnOnFile(b, f, side) {
    for (let r = 1; r <= 9; r++) {
      const p = at(b, f, r);
      if (p && p.s === side && p.k === '歩') return true;
    }
    return false;
  }

  /** side が詰んでいるか。 */
  function isMate(b, side) {
    if (!findKing(b, side)) return false;
    if (!inCheck(b, side)) return false;
    return legalMoves(b, side).length === 0;
  }

  /* ================= 棋譜の読み書き ================= */

  const FILE_CHARS = '123456789';
  const ZEN_FILE = '１２３４５６７８９';
  const RANK_KANJI = '一二三四五六七八九';

  function fileNum(ch) {
    let i = FILE_CHARS.indexOf(ch);
    if (i < 0) i = ZEN_FILE.indexOf(ch);
    return i + 1;
  }
  function rankNum(ch) {
    let i = RANK_KANJI.indexOf(ch);
    if (i < 0) i = FILE_CHARS.indexOf(ch);
    return i + 1;
  }

  /** 手を「▲7六歩」の形にする。 */
  function moveText(move, prevTo) {
    const mark = move.s === SENTE ? '▲' : '△';
    const same = prevTo && prevTo[0] === move.to[0] && prevTo[1] === move.to[1];
    const place = same ? '同' : ZEN_FILE[move.to[0] - 1] + RANK_KANJI[move.to[1] - 1];
    return mark + place + move.k + (move.promote ? '成' : '') + (move.drop ? '打' : '');
  }

  /**
   * 「7六歩」「同銀」「5二金打」「2二角成」を手に変える。
   * どの駒が動いたかは盤から探すので、書くほうは棋譜どおりでよい。
   * 同じ場所へ行ける駒が 2 枚あるときだけ「7七角(88)」と元の場所を書く。
   */
  function parseMove(b, text, side, prevTo) {
    let s = String(text).trim();
    let to;
    if (s[0] === '同') {
      if (!prevTo) throw new Error('「同」の前の手がない: ' + text);
      to = prevTo.slice();
      s = s.slice(1).replace(/^[ 　]+/, '');
    } else {
      to = [fileNum(s[0]), rankNum(s[1])];
      if (!inside(to[0], to[1])) throw new Error('場所が読めない: ' + text);
      s = s.slice(2);
    }
    let origin = null;
    const om = s.match(/\((\d)(\d)\)$/);
    if (om) {
      origin = [Number(om[1]), Number(om[2])];
      s = s.slice(0, om.index);
    }
    let drop = false, promote = false;
    if (s.endsWith('打')) { drop = true; s = s.slice(0, -1); }
    if (s.endsWith('不成')) { s = s.slice(0, -3); }
    else if (s.endsWith('成') && s !== '成' && !DEMOTE[s]) { promote = true; s = s.slice(0, -1); }
    const k = s;
    if (!k) throw new Error('駒が読めない: ' + text);

    if (drop) {
      if (!b.hand[side][k]) throw new Error('持駒に無い駒を打とうとした: ' + text);
      if (at(b, to[0], to[1])) throw new Error('駒のある場所に打とうとした: ' + text);
      return { from: null, to: to, k: k, s: side, promote: false, drop: true };
    }

    const candidates = [];
    for (let r = 1; r <= 9; r++) {
      for (let f = 1; f <= 9; f++) {
        const p = at(b, f, r);
        if (!p || p.s !== side || p.k !== k) continue;
        if (origin && (origin[0] !== f || origin[1] !== r)) continue;
        if (!movesFrom(b, f, r).some(function (m) { return m[0] === to[0] && m[1] === to[1]; })) continue;
        const move = { from: [f, r], to: to, k: k, s: side, promote: promote, drop: false };
        if (inCheck(applyMove(b, move), side)) continue;
        if (!promote && stuck(k, to[1], side)) continue;
        if (promote && !canPromote(k)) throw new Error('成れない駒: ' + text);
        if (promote && !zoneOfPromotion(r, side) && !zoneOfPromotion(to[1], side)) {
          throw new Error('成れない場所: ' + text);
        }
        candidates.push(move);
      }
    }
    if (candidates.length === 0) throw new Error('指せない手: ' + text);
    if (candidates.length > 1) {
      const where = candidates.map(function (m) { return m.from.join(''); }).join(' / ');
      throw new Error('どの駒か決まらない: ' + text + ' (' + where + ' のどれか。(88) のように元の場所を書く)');
    }
    return candidates[0];
  }

  /**
   * 棋譜の並びをぜんぶ指して、1 手ごとの盤と表示用の文字を返す。
   * @returns {{board, moves:[{move, text, board}]}}
   */
  function playKifu(start, kifu, firstSide) {
    let b = start;
    let side = firstSide === undefined ? SENTE : firstSide;
    let prevTo = null;
    const steps = [];
    for (const text of kifu) {
      const move = parseMove(b, text, side, prevTo);
      const shown = moveText(move, prevTo);
      b = applyMove(b, move);
      steps.push({ move: move, text: shown, board: b });
      prevTo = move.to;
      side = 1 - side;
    }
    return { board: b, moves: steps };
  }

  /**
   * 盤のどのあたりを見せればよいかを決める。
   * 駒のいる場所と、手の行き先がぜんぶ入る四角を作り、せまければ広げる。
   * 5×5 くらいまで寄せて見せたほうが、スマホでは駒がよく見える。
   */
  function cropFor(board, moves, minSize) {
    const min = minSize || 5;
    let f1 = 9, f2 = 1, r1 = 9, r2 = 1;
    const add = (f, r) => { f1 = Math.min(f1, f); f2 = Math.max(f2, f); r1 = Math.min(r1, r); r2 = Math.max(r2, r); };
    for (const p of listPieces(board)) add(p.f, p.r);
    for (const m of moves || []) { add(m.to[0], m.to[1]); if (m.from) add(m.from[0], m.from[1]); }
    if (f1 > f2) { f1 = 1; f2 = 9; r1 = 1; r2 = 9; }
    const grow = (a, b) => {
      while (b - a + 1 < min) {
        if (a > 1) a--;
        else if (b < 9) b++;
        else break;
      }
      return [a, b];
    };
    [f1, f2] = grow(f1, f2);
    [r1, r2] = grow(r1, r2);
    const files = [];
    for (let f = f2; f >= f1; f--) files.push(f); // 左が大きい筋
    const ranks = [];
    for (let r = r1; r <= r2; r++) ranks.push(r);
    return { files: files, ranks: ranks };
  }

  /* ================= クイズの組み立て ================= */

  function distractors(all, answer, sameKey, count, rng) {
    const same = shuffle(all.filter(function (x) {
      return x !== answer && sameKey && x[sameKey] === answer[sameKey];
    }), rng);
    const other = shuffle(all.filter(function (x) {
      return x !== answer && (!sameKey || x[sameKey] !== answer[sameKey]);
    }), rng);
    return same.concat(other).slice(0, count);
  }

  /** 選択肢は「にた仲間」を優先。ぼんやり選ぶと当たる、を防ぐ。 */
  function nameQuestion(type, all, answer, sameKey, rng, n) {
    const wrong = distractors(all, answer, sameKey, (n || 4) - 1, rng);
    return {
      type: type,
      item: answer,
      choices: shuffle([answer].concat(wrong), rng).map(function (c) {
        return { name: c.name, kana: c.kana, ok: c === answer };
      })
    };
  }

  function knowledgeQuestion(k, rng) {
    return {
      type: 'knowledge',
      item: k,
      choices: shuffle(k.choices.map(function (t, i) {
        return { name: t, ok: i === 0 };
      }), rng)
    };
  }

  function tsumeQuestion(t, rng) {
    return {
      type: 'tsume',
      item: t,
      choices: shuffle([{ name: t.answer, ok: true }].concat(
        t.wrong.map(function (w) { return { name: w, ok: false }; })
      ), rng)
    };
  }

  const MODES = {
    castle: { key: 'castles', count: 10, same: 'fam' },
    tesuji: { key: 'tesuji', count: 10, same: 'cat' },
    senpou: { key: 'senpou', count: 10, same: 'cat' },
    knowledge: { key: 'knowledge', count: 10 },
    tsume: { key: 'tsume', count: 8 }
  };

  function questionOf(type, item, data, rng) {
    if (type === 'castle') return nameQuestion('castle', data.castles, item, 'fam', rng);
    if (type === 'tesuji') return nameQuestion('tesuji', data.tesuji, item, 'cat', rng);
    if (type === 'senpou') return nameQuestion('senpou', data.senpou, item, 'cat', rng);
    if (type === 'knowledge') return knowledgeQuestion(item, rng);
    return tsumeQuestion(item, rng);
  }

  /** 1 回ぶんの問題を作る。おなじ問題は出さない。 */
  function buildRound(data, mode, rng) {
    if (mode === 'mix') {
      const plan = [['castle', 3], ['tesuji', 3], ['senpou', 2], ['knowledge', 3], ['tsume', 2]];
      let out = [];
      for (const [type, n] of plan) {
        out = out.concat(shuffle(data[MODES[type].key], rng).slice(0, n).map(function (item) {
          return questionOf(type, item, data, rng);
        }));
      }
      return shuffle(out, rng);
    }
    const spec = MODES[mode];
    if (!spec) throw new Error('知らないモード: ' + mode);
    return shuffle(data[spec.key], rng).slice(0, spec.count).map(function (item) {
      return questionOf(mode, item, data, rng);
    });
  }

  /** 正解率から段位を決める。 */
  function rankOf(rate) {
    if (rate >= 1) return { name: '名人', kana: 'めいじん', stars: 5, msg: 'パーフェクト！ もう将棋はかせだ。プロ棋士もびっくり！' };
    if (rate >= 0.9) return { name: '八段', kana: 'はちだん', stars: 5, msg: 'あと少しで名人！ まちがえた問題をおぼえたら完ぺきだ。' };
    if (rate >= 0.8) return { name: '五段', kana: 'ごだん', stars: 4, msg: 'すごい！ 有段者クラスの実力だよ。' };
    if (rate >= 0.6) return { name: '初段', kana: 'しょだん', stars: 3, msg: 'いいちょうし！ ずかんで復習して上をめざそう。' };
    if (rate >= 0.4) return { name: '三級', kana: 'さんきゅう', stars: 2, msg: 'ここからが本番！ 解説を読んでもう一回。' };
    if (rate >= 0.2) return { name: '八級', kana: 'はちきゅう', stars: 1, msg: 'だいじょうぶ、くりかえせば強くなる！' };
    return { name: 'みならい', kana: '', stars: 0, msg: '名人もさいしょはみならいから。まずはずかんを見てみよう。' };
  }

  return {
    SENTE: SENTE, GOTE: GOTE,
    PROMOTE: PROMOTE, DEMOTE: DEMOTE,
    mulberry32: mulberry32, shuffle: shuffle,
    emptyBoard: emptyBoard, cloneBoard: cloneBoard, parseBoard: parseBoard, initialBoard: initialBoard,
    at: at, put: put, idx: idx, listPieces: listPieces, findKing: findKing,
    movesFrom: movesFrom, legalMoves: legalMoves, applyMove: applyMove,
    inCheck: inCheck, isMate: isMate,
    parseMove: parseMove, moveText: moveText, playKifu: playKifu, cropFor: cropFor,
    buildRound: buildRound, questionOf: questionOf, rankOf: rankOf,
    baseKind: baseKind, isKing: isKing
  };
});
