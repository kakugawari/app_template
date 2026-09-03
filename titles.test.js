/*
 * titles.test.js — 年表の写しまちがいを見つけるテスト。
 *
 * このデータだけは将棋エンジンで検算できない (「何年に誰が取ったか」は
 * 将棋のルールから導けない)。だから「名前が合っているか」は調べられない。
 * そのかわり、写すときに起きるまちがい ── 期のとばし、期の重複、年の
 * さかのぼり、全角の数字、名前の中の空白 ── はぜんぶここで落とす。
 */
const test = require('node:test');
const assert = require('node:assert');
const T = require('./titles.js');

test('棋戦の書き方がそろっている', () => {
  assert.ok(T.TITLES.length >= 1, '棋戦が 1 つもない');
  const keys = T.TITLES.map((t) => t.key);
  assert.strictEqual(new Set(keys).size, keys.length, '同じ key の棋戦が 2 つある');
  for (const t of T.TITLES) {
    for (const f of ['key', 'name', 'kana', 'note']) {
      assert.strictEqual(typeof t[f], 'string', t.key + ': ' + f + ' が文字列でない');
      assert.ok(t[f].length > 0, t.key + ': ' + f + ' が空');
    }
    assert.ok(Number.isInteger(t.since), t.name + ': since が整数でない');
    assert.ok(Array.isArray(t.holders) && t.holders.length > 0, t.name + ': holders が空');
  }
});

test('期は 1 から 1 つずつ増える (とばし・重複・順番ちがいがない)', () => {
  for (const t of T.TITLES) {
    t.holders.forEach((h, i) => {
      assert.strictEqual(h.ki, i + 1,
        t.name + ': ' + (i + 1) + ' 番目が第' + h.ki + '期になっている (期のとばしか重複)');
    });
  }
});

test('年は前へもどらない。最初の年は since と合う', () => {
  for (const t of T.TITLES) {
    assert.strictEqual(t.holders[0].year, t.since,
      t.name + ': 第1期が ' + t.holders[0].year + ' 年なのに since が ' + t.since);
    let prev = 0;
    for (const h of t.holders) {
      assert.ok(Number.isInteger(h.year), t.name + ' 第' + h.ki + '期: 年が整数でない');
      assert.ok(h.year >= prev, t.name + ' 第' + h.ki + '期: 年が前の期 (' + prev + ') より前になっている');
      assert.ok(h.year >= 1935 && h.year <= 2100, t.name + ' 第' + h.ki + '期: 年が ' + h.year);
      prev = h.year;
    }
  }
});

test('名前の書き方がそろっている (空白・全角数字が混ざっていない)', () => {
  for (const t of T.TITLES) {
    for (const h of t.holders) {
      const where = t.name + ' 第' + h.ki + '期';
      assert.strictEqual(typeof h.name, 'string', where + ': 名前が文字列でない');
      assert.ok(h.name.length >= 2, where + ': 名前が短すぎる (' + h.name + ')');
      assert.ok(!/[\s　]/.test(h.name), where + ': 名前に空白が入っている (' + h.name + ')');
      assert.ok(!/[０-９0-9]/.test(h.name), where + ': 名前に数字が入っている (' + h.name + ')');
      assert.ok(!/[段位王将名人竜]$/.test(h.name) || h.name.length > 3,
        where + ': 名前に段位や肩書きが付いているかも (' + h.name + ')');
    }
  }
});

test('同じ人の名前が、ゆれずに書かれている', () => {
  // 「羽生善治」と「羽生 善治」のような書きわけがあると、通算の数え方がずれる
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
