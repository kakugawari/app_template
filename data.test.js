/*
 * クイズの中身が正しいかを、将棋のルールで機械的に確かめるテスト。
 * 手順の書きまちがい・指せない手・詰んでいない詰将棋は、ここで落ちる。
 */
const test = require('node:test');
const assert = require('node:assert');
const C = require('./core.js');
const D = require('./data.js');

/* ---------------- 囲い ---------------- */

test('囲いの名前とふりがなはダブりなし', () => {
  const names = D.castles.map((c) => c.name);
  assert.strictEqual(new Set(names).size, names.length);
  for (const c of D.castles) {
    assert.ok(c.kana && c.expl, c.name + ' に かな か 解説がない');
    assert.ok(c.lv >= 1 && c.lv <= 3, c.name + ' の むずかしさが 1〜3 でない');
    assert.ok(c.crop === 'left' || c.crop === 'right');
  }
});

test('囲いの完成形は駒がかさなっていない', () => {
  for (const c of D.castles) {
    const seen = new Set();
    for (const [k, f, r] of c.pieces) {
      const key = f + '-' + r;
      assert.ok(!seen.has(key), c.name + ' の ' + key + ' に駒がかさなっている');
      seen.add(key);
      assert.ok(f >= 1 && f <= 9 && r >= 1 && r <= 9, c.name + ' の駒が盤の外: ' + k);
    }
  }
});

test('囲いの組み上がり手順は、ちゃんと完成形にたどりつく', () => {
  for (const c of D.castles) {
    const init = (c.crop === 'left' ? D.INIT_L : D.INIT_R).concat(D.EXTRA_INIT[c.name] || []);
    const map = new Map(init.map(([k, f, r]) => [f + '-' + r, k]));
    assert.ok(c.moves.length > 0, c.name + ' の手順がない');
    c.moves.forEach(([k, f1, r1, f2, r2], i) => {
      if (f1 !== 0) {
        assert.strictEqual(map.get(f1 + '-' + r1), k,
          c.name + ' の ' + (i + 1) + '手目: ' + f1 + r1 + ' に ' + k + ' がいない');
        map.delete(f1 + '-' + r1);
      }
      map.set(f2 + '-' + r2, k);
    });
    const got = [...map.entries()].map(([p, k]) => k + p).sort().join(' ');
    const want = c.pieces.map(([k, f, r]) => k + f + '-' + r).sort().join(' ');
    assert.strictEqual(got, want, c.name + ' の手順を最後まで進めても完成形にならない');
  }
});

/* ---------------- 手筋 ---------------- */

test('手筋の手順はぜんぶ実際に指せる', () => {
  for (const t of D.tesuji) {
    const start = C.parseBoard(t.board, t.hand);
    let played;
    assert.doesNotThrow(() => { played = C.playKifu(start, t.kifu, C.SENTE); },
      new RegExp('.*'), t.name);
    assert.ok(played.moves.length === t.kifu.length, t.name + ' の手数がおかしい');
  }
});

test('手筋の最初の局面は、いきなり王手になっていない', () => {
  for (const t of D.tesuji) {
    const b = C.parseBoard(t.board, t.hand);
    assert.strictEqual(C.inCheck(b, C.GOTE), false, t.name + ': 後手がいきなり王手されている');
  }
});

test('「詰み」と書いた手筋は、ほんとうに詰んでいる', () => {
  for (const t of D.tesuji.filter((x) => x.mate)) {
    const end = C.playKifu(C.parseBoard(t.board, t.hand), t.kifu, C.SENTE).board;
    assert.strictEqual(C.isMate(end, C.GOTE), true, t.name + ' は詰んでいない');
  }
});

test('手筋の名前・分類・解説がそろっている', () => {
  const names = D.tesuji.map((t) => t.name);
  assert.strictEqual(new Set(names).size, names.length);
  for (const t of D.tesuji) {
    assert.ok(t.kana && t.expl && t.cat, t.name + ' の項目が足りない');
    assert.ok(t.lv >= 1 && t.lv <= 3);
  }
});

/* ---------------- 戦法 ---------------- */

test('戦法の手順は、平手の初形からぜんぶ指せる', () => {
  for (const s of D.senpou) {
    let played = null;
    try {
      played = C.playKifu(C.initialBoard(), s.kifu, C.SENTE);
    } catch (e) {
      assert.fail(s.name + ': ' + e.message);
    }
    assert.ok(played.moves.length >= 5, s.name + ' は手数が短すぎる (パラパラ漫画にならない)');
  }
});

test('戦法の名前・分類・解説がそろっている', () => {
  const names = D.senpou.map((s) => s.name);
  assert.strictEqual(new Set(names).size, names.length);
  for (const s of D.senpou) {
    assert.ok(s.kana && s.expl && s.cat, s.name + ' の項目が足りない');
    assert.ok(s.lv >= 1 && s.lv <= 3);
  }
});

/* ---------------- 知識 ---------------- */

test('知識クイズは 4 択で、選択肢がダブっていない', () => {
  for (const k of D.knowledge) {
    assert.strictEqual(k.choices.length, 4, k.q + ' の選択肢が 4 つでない');
    assert.strictEqual(new Set(k.choices).size, 4, k.q + ' の選択肢がダブっている');
    assert.ok(k.expl && k.q, '問題文か解説がない');
  }
  const qs = D.knowledge.map((k) => k.q);
  assert.strictEqual(new Set(qs).size, qs.length, '同じ問題が 2 回ある');
});

/* ---------------- 詰将棋 ---------------- */

test('1手詰は「答えの手で詰み、ほかの手では詰まない」', () => {
  for (const t of D.tsume) {
    const b = C.parseBoard(t.board, t.hand);
    assert.strictEqual(C.inCheck(b, C.GOTE), false, t.name + ': 出題の時点で王手になっている');

    const ans = C.parseMove(b, t.answer, C.SENTE, null);
    assert.strictEqual(C.isMate(C.applyMove(b, ans), C.GOTE), true, t.name + ': ' + t.answer + ' で詰まない');

    for (const w of t.wrong) {
      let move;
      try { move = C.parseMove(b, w, C.SENTE, null); } catch (e) {
        assert.fail(t.name + ': まちがい選択肢 ' + w + ' がそもそも指せない (' + e.message + ')');
      }
      assert.strictEqual(C.isMate(C.applyMove(b, move), C.GOTE), false,
        t.name + ': まちがい選択肢のはずの ' + w + ' でも詰んでしまう');
    }
    assert.strictEqual(new Set([t.answer].concat(t.wrong)).size, 4, t.name + ': 選択肢がダブっている');
  }
});

test('1手詰の答えは 1 つだけ (ほかに詰む手がない)', () => {
  for (const t of D.tsume) {
    const b = C.parseBoard(t.board, t.hand);
    const mates = C.legalMoves(b, C.SENTE)
      .filter((m) => C.isMate(C.applyMove(b, m), C.GOTE))
      .map((m) => C.moveText(m, null));
    assert.strictEqual(mates.length, 1, t.name + ': 詰む手が ' + mates.length + ' つある (' + mates.join(' ') + ')');
  }
});

/* ---------------- 出題の組み立て ---------------- */

test('どのモードでも、正解がちょうど 1 つの問題ができる', () => {
  for (const mode of ['castle', 'tesuji', 'senpou', 'knowledge', 'tsume', 'mix']) {
    for (let seed = 1; seed <= 30; seed++) {
      const round = C.buildRound(D, mode, C.mulberry32(seed));
      assert.ok(round.length >= 8, mode + ': 問題数が少ない');
      for (const q of round) {
        const oks = q.choices.filter((c) => c.ok);
        assert.strictEqual(oks.length, 1, mode + ': 正解が 1 つでない');
        const labels = q.choices.map((c) => c.name);
        assert.strictEqual(new Set(labels).size, labels.length, mode + ': 同じ選択肢が 2 つ出た');
        assert.ok(q.choices.length === 4, mode + ': 選択肢が 4 つでない');
      }
    }
  }
});

test('同じ問題が 1 回のクイズに 2 回出てこない', () => {
  for (const mode of ['castle', 'tesuji', 'senpou', 'knowledge', 'tsume', 'mix']) {
    for (let seed = 1; seed <= 20; seed++) {
      const round = C.buildRound(D, mode, C.mulberry32(seed));
      const keys = round.map((q) => q.type + ':' + (q.item.name || q.item.q));
      assert.strictEqual(new Set(keys).size, keys.length, mode + ': 同じ問題が 2 回出た');
    }
  }
});

test('同じ seed なら、まったく同じ問題が出る (作り直せる)', () => {
  const a = C.buildRound(D, 'mix', C.mulberry32(123));
  const b = C.buildRound(D, 'mix', C.mulberry32(123));
  assert.deepStrictEqual(a.map((q) => q.choices.map((c) => c.name)), b.map((q) => q.choices.map((c) => c.name)));
});
