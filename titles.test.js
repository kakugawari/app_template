/*
 * titles.test.js — 年表の写しまちがいを見つけるテスト。
 *
 * このデータだけは将棋エンジンで検算できない (「何年度に誰が取ったか」は
 * 将棋のルールから導けない)。だから「名前が合っているか」は調べられない。
 * そのかわり、表を写すときに起きるまちがい ── 年のとばし・重複・逆順、
 * 前期/後期の書きもれ、名前のゆれ、肩書きや数字の混入 ── はぜんぶここで落とす。
 */
const test = require('node:test');
const assert = require('node:assert');
const T = require('./titles.js');

const NOW = 2026;   // これより新しい年度は、まだ終わっていないので入らない

test('棋戦の書き方がそろっている', () => {
  assert.ok(T.TITLES.length >= 1, '棋戦が 1 つもない');
  const keys = T.TITLES.map((t) => t.key);
  assert.strictEqual(new Set(keys).size, keys.length, '同じ key の棋戦が 2 つある');
  for (const t of T.TITLES) {
    for (const f of ['key', 'name', 'kana', 'note']) {
      assert.ok(typeof t[f] === 'string' && t[f].length > 0, t.key + ': ' + f + ' が空');
    }
    assert.ok(t.holders.length > 0, t.name + ': 中身が 1 つもない');
  }
});

test('年は古い順にならび、同じ年度の同じ期が 2 回出てこない', () => {
  for (const t of T.TITLES) {
    const seen = new Set();
    let prev = 0;
    for (const h of t.holders) {
      const where = t.name + ' ' + h.year + '年度' + h.term;
      assert.ok(h.year >= 1937 && h.year <= NOW, where + ': 年度が ' + h.year);
      assert.ok(h.year >= prev, where + ': 年が前へもどっている (' + prev + ' のあと)');
      const key = h.year + h.term;
      assert.ok(!seen.has(key), where + ': 同じ年度が 2 回出ている');
      seen.add(key);
      prev = h.year;
    }
  }
});

test('年がとぶところには、かならず理由が書いてある', () => {
  // 理由のない飛びは「写すときに 1 行落とした」とみなす
  for (const t of T.TITLES) {
    for (let i = 1; i < t.holders.length; i++) {
      const prev = t.holders[i - 1].year;
      const now = t.holders[i].year;
      for (let y = prev + 1; y < now; y++) {
        assert.ok(t.gaps[y],
          t.name + ': ' + y + '年度がぬけている。写しもれなら足す、ほんとうに行われて'
          + 'いないなら gaps に理由を書く');
      }
    }
  }
});

test('gaps に書いた年度が、ほんとうに空いている', () => {
  // 直したあとに理由だけ残っていると、うそが残る
  for (const t of T.TITLES) {
    const years = new Set(t.holders.map((h) => h.year));
    for (const y of Object.keys(t.gaps)) {
      assert.ok(!years.has(Number(y)),
        t.name + ': gaps に ' + y + ' と書いてあるのに、その年度の中身がある');
      assert.ok(Number(y) > t.holders[0].year && Number(y) < t.holders[t.holders.length - 1].year,
        t.name + ': gaps の ' + y + ' が、この棋戦のある期間の外にある');
    }
  }
});

test('前期・後期の書き方がそろっている', () => {
  for (const t of T.TITLES) {
    const withTerm = t.holders.filter((h) => h.term);
    if (!withTerm.length) continue;
    // 前期・後期があるのは棋聖戦だけ。前だけ・後だけの年がないか見る
    const byYear = new Map();
    for (const h of withTerm) byYear.set(h.year, (byYear.get(h.year) || '') + h.term);
    const years = [...byYear.keys()].sort();
    years.forEach((y, i) => {
      const terms = byYear.get(y);
      // いちばん古い年だけは後期しかないことがある (棋聖戦の第1期)
      if (i === 0) return;
      assert.ok(terms.includes('前') && terms.includes('後'),
        t.name + ' ' + y + '年度: 前期か後期が書かれていない (' + terms + ')');
    });
    // 前期・後期があるのは、ある年より前だけ (途中でまざらない)
    const lastTerm = withTerm[withTerm.length - 1].year;
    for (const h of t.holders) {
      if (h.year <= lastTerm) assert.ok(h.term,
        t.name + ' ' + h.year + '年度: 前期/後期が書かれていない');
    }
  }
});

test('名前の書き方がそろっている (空白・数字・肩書きが混ざっていない)', () => {
  for (const t of T.TITLES) {
    for (const h of t.holders) {
      const where = t.name + ' ' + h.year + '年度' + h.term;
      assert.ok(h.name.length >= 2, where + ': 名前が短すぎる (' + h.name + ')');
      assert.ok(!/[\s　]/.test(h.name), where + ': 名前に空白が入っている (' + h.name + ')');
      assert.ok(!/[０-９0-9]/.test(h.name), where + ': 名前に数字が入っている (' + h.name + ')');
      assert.ok(!/(段|冠|初|終|永|全冠)$/.test(h.name),
        where + ': 名前に印や肩書きが付いたまま (' + h.name + ')');
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

test('1 つの年度に、同じ棋戦のタイトルを 2 人が持っていない', () => {
  // 棋聖戦の前期・後期をのぞけば、1 年度 1 人。列をずらして写すと崩れる
  for (const t of T.TITLES) {
    const byYear = new Map();
    for (const h of t.holders) {
      if (h.term) continue;
      assert.ok(!byYear.has(h.year), t.name + ' ' + h.year + '年度: 2 人書かれている');
      byYear.set(h.year, h.name);
    }
  }
});

test('いまの保持者と獲得期数が、出どころの表と合う', () => {
  // この 1 つの検算で「その人がその棋戦で取った年ぜんぶ」を裏取りできる。
  // どこか 1 年でも写しまちがえていれば、期数がずれて落ちる
  const g = T.GENZAI;
  assert.strictEqual(g.list.length, 8, '八大タイトルぶん書かれていない');
  for (const w of g.list) {
    const t = T.TITLES.find((x) => x.key === w.key);
    assert.ok(t, w.key + ' という棋戦がない');
    const ki = t.holders.filter((h) => h.name === w.name).length;
    assert.strictEqual(ki, w.ki,
      t.name + ': ' + w.name + ' は表では ' + w.ki + '期。数えると ' + ki + '期');
    const last = t.holders[t.holders.length - 1];
    assert.strictEqual(last.name, w.name,
      t.name + ': いまの保持者は ' + w.name + ' のはずが、最後の年度は ' + last.name);
  }
});

test('次回の防衛戦の予定と、入っている年度が合う', () => {
  // 年度は 4月はじまり。1〜3月に指す王将戦・棋王戦は、たとえば 2027年1月の
  // 対局が「2026年度」ぶんになる。カレンダーの年で数えるとここを取りちがえる
  const g = T.GENZAI;
  for (const w of g.list) {
    const m = /^(\d{4})年(\d{1,2})月/.exec(w.next);
    assert.ok(m, w.key + ': next の書き方がちがう (' + w.next + ')');
    const nendo = Number(m[2]) >= 4 ? Number(m[1]) : Number(m[1]) - 1;
    const t = T.TITLES.find((x) => x.key === w.key);
    const last = t.holders[t.holders.length - 1].year;
    assert.strictEqual(last, nendo - 1,
      t.name + ': 次回が ' + w.next + ' = ' + nendo + '年度ぶん。'
      + 'それなら入っているのは ' + (nendo - 1) + '年度までのはずが ' + last + '年度まで');
  }
});
