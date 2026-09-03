/*
 * titles.test.js — 年表の写しまちがいを見つけるテスト。
 *
 * このデータだけは将棋エンジンで検算できない (「何年度に誰が取ったか」は
 * 将棋のルールから導けない)。だから「名前が合っているか」は調べられない。
 * そのかわり、表を写すときに起きるまちがい ── 年のとばし・重複・逆順、
 * 列のずれ、名前のゆれ、肩書きや数字の混入 ── はぜんぶここで落とす。
 */
const test = require('node:test');
const assert = require('node:assert');
const T = require('./titles.js');

test('表の形がそろっている (列のずれ・行のとばしがない)', () => {
  assert.ok(T.ROWS.length > 0, '年度の行が 1 つもない');
  for (const row of T.ROWS) {
    assert.strictEqual(row.length, T.META.length + 1,
      row[0] + '年度: マスの数が ' + (row.length - 1) + ' 個 (棋戦は ' + T.META.length + ' つ)');
  }
  T.ROWS.forEach((row, i) => {
    if (i === 0) return;
    assert.strictEqual(row[0], T.ROWS[i - 1][0] + 1,
      row[0] + '年度の 1 つ前が ' + T.ROWS[i - 1][0] + '年度 (年のとばしか重複、または並びが古い順でない)');
  });
});

test('棋戦の書き方がそろっている', () => {
  const keys = T.META.map((m) => m.key);
  assert.strictEqual(new Set(keys).size, keys.length, '同じ key の棋戦が 2 つある');
  for (const t of T.TITLES) {
    for (const f of ['key', 'name', 'kana', 'note']) {
      assert.ok(typeof t[f] === 'string' && t[f].length > 0, t.key + ': ' + f + ' が空');
    }
    assert.ok(t.holders.length > 0, t.name + ': 中身が 1 つもない');
  }
});

test('どの棋戦も、はじまった年度からとぎれずに続いている', () => {
  // 途中の年度が空だと「タイトル戦が 1 年なかった」ことになる。まず写しまちがい
  for (const t of T.TITLES) {
    t.holders.forEach((h, i) => {
      if (i === 0) return;
      assert.strictEqual(h.year, t.holders[i - 1].year + 1,
        t.name + ': ' + t.holders[i - 1].year + '年度の次が ' + h.year + '年度 (途中が空)');
    });
    const last = T.ROWS[T.ROWS.length - 1][0];
    assert.strictEqual(t.holders[t.holders.length - 1].year, last,
      t.name + ': いちばん新しい年度 (' + last + ') が空になっている');
  }
});

test('名前の書き方がそろっている (空白・数字・肩書きが混ざっていない)', () => {
  for (const t of T.TITLES) {
    for (const h of t.holders) {
      const where = t.name + ' ' + h.year + '年度';
      assert.ok(h.name.length >= 2, where + ': 名前が短すぎる (' + h.name + ')');
      assert.ok(!/[\s　]/.test(h.name), where + ': 名前に空白が入っている (' + h.name + ')');
      assert.ok(!/[０-９0-9]/.test(h.name), where + ': 名前に数字が入っている (' + h.name + ')');
      assert.ok(!/(段|冠|位|名人|竜王|王将|棋聖)$/.test(h.name),
        where + ': 名前に肩書きが付いている (' + h.name + ')');
    }
  }
});

test('同じ人の名前が、ゆれずに書かれている', () => {
  // 「羽生善治」と「羽生 善治」が混ざると、通算の数え方がずれる
  const seen = new Map();
  for (const t of T.TITLES) {
    for (const h of t.holders) {
      const key = h.name.replace(/[\s　]/g, '');
      if (seen.has(key)) assert.strictEqual(seen.get(key), h.name,
        '同じ人が別の書き方で入っている: ' + seen.get(key) + ' / ' + h.name);
      else seen.set(key, h.name);
    }
  }
});

test('空マスは、棋戦がはじまる前にしかない', () => {
  // 列をずらして写すと、空マスが変なところに移る。その見張り
  T.META.forEach((m, col) => {
    const start = T.ROWS.findIndex((row) => row[col + 1]);
    assert.ok(start >= 0, m.name + ': 中身が 1 つもない');
    T.ROWS.forEach((row, i) => {
      const filled = !!row[col + 1];
      assert.strictEqual(filled, i >= start,
        m.name + ' ' + row[0] + '年度: ' + (filled ? 'はじまる前なのに名前がある' : '空になっている'));
    });
  });
});

test('タイトルの数が、その年度に開かれた棋戦の数と合う', () => {
  const total = T.TITLES.reduce((n, t) => n + t.holders.length, 0);
  const cells = T.ROWS.reduce((n, row) => n + row.slice(1).filter(Boolean).length, 0);
  assert.strictEqual(total, cells, '表のマスの数と、棋戦ごとに数えた数が合わない');
});
