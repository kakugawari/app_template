/* 将棋のルールまわりのテスト。node --test で動く。 */
const test = require('node:test');
const assert = require('node:assert');
const C = require('./core.js');

test('同じ seed からは同じ数が出る', () => {
  const a = C.mulberry32(42), b = C.mulberry32(42);
  for (let i = 0; i < 10; i++) assert.strictEqual(a(), b());
});

test('shuffle は中身を減らさず、元の配列を変えない', () => {
  const source = [1, 2, 3, 4, 5, 6, 7, 8];
  const mixed = C.shuffle(source, C.mulberry32(7));
  assert.deepStrictEqual(mixed.slice().sort((x, y) => x - y), source);
  assert.deepStrictEqual(source, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('平手の初形は 40 枚', () => {
  const b = C.initialBoard();
  assert.strictEqual(C.listPieces(b).length, 40);
  assert.strictEqual(C.at(b, 8, 8).k, '角');
  assert.strictEqual(C.at(b, 2, 8).k, '飛');
  assert.strictEqual(C.at(b, 5, 9).k, '玉');
  assert.strictEqual(C.at(b, 5, 1).s, C.GOTE);
});

test('歩は前に 1 マス、後手は逆向き', () => {
  const b = C.parseBoard('^歩57 v歩53');
  assert.deepStrictEqual(C.movesFrom(b, 5, 7), [[5, 6]]);
  assert.deepStrictEqual(C.movesFrom(b, 5, 3), [[5, 4]]);
});

test('桂馬は駒をとびこえる', () => {
  const b = C.parseBoard('^桂89 ^歩87');
  const to = C.movesFrom(b, 8, 9).map((m) => m.join(''));
  assert.deepStrictEqual(to.sort(), ['77', '97']);
});

test('香車は味方の駒で止まり、敵の駒は取れる', () => {
  const blocked = C.parseBoard('^香19 ^歩17');
  assert.deepStrictEqual(C.movesFrom(blocked, 1, 9), [[1, 8]]);
  const open = C.parseBoard('^香19 v歩17');
  assert.strictEqual(C.movesFrom(open, 1, 9).length, 2);
});

test('取った駒は持駒になり、成ると駒が変わる', () => {
  const b = C.parseBoard('^角88 v歩34 v飛22');
  const after = C.applyMove(b, C.parseMove(b, '2二角成', C.SENTE, null));
  assert.strictEqual(C.at(after, 2, 2).k, '馬');
  assert.strictEqual(after.hand[C.SENTE]['飛'], 1);
});

test('王手されているかが分かる', () => {
  const b = C.parseBoard('v玉51 ^飛59');
  assert.strictEqual(C.inCheck(b, C.GOTE), true);
  const blocked = C.parseBoard('v玉51 ^飛59 v歩55');
  assert.strictEqual(C.inCheck(blocked, C.GOTE), false);
});

test('自分の玉が王手になる手は指せない', () => {
  const b = C.parseBoard('^玉59 ^金58 v飛51');
  const golds = C.legalMoves(b, C.SENTE).filter((m) => m.k === '金');
  // ピン (しばられている) 状態。5筋から外れる手はぜんぶ反則で、5七だけ指せる。
  assert.deepStrictEqual(golds.map((m) => m.to.join('')), ['57']);
});

test('詰みが分かる', () => {
  const b = C.parseBoard('v玉11 ^歩13', '^金');
  const mate = C.applyMove(b, C.parseMove(b, '1二金打', C.SENTE, null));
  assert.strictEqual(C.isMate(mate, C.GOTE), true);
  const not = C.applyMove(b, C.parseMove(b, '2二金打', C.SENTE, null));
  assert.strictEqual(C.isMate(not, C.GOTE), false);
});

test('二歩は指し手に出てこない', () => {
  const b = C.parseBoard('^歩57 ^玉59 v玉51', '^歩');
  const drops = C.legalMoves(b, C.SENTE).filter((m) => m.drop && m.to[0] === 5);
  assert.strictEqual(drops.length, 0);
});

test('打ち歩詰めは指し手に出てこない', () => {
  const b = C.parseBoard('v玉11 v桂12 v桂21 ^香15 ^玉99', '^歩');
  const uchifu = C.legalMoves(b, C.SENTE)
    .filter((m) => m.drop && m.k === '歩' && m.to[0] === 1 && m.to[1] === 2);
  assert.strictEqual(uchifu.length, 0, '1二歩打は詰みなので反則');
});

test('棋譜は駒の場所から自動で読み取れる', () => {
  const r = C.playKifu(C.initialBoard(), ['7六歩', '3四歩', '2二角成', '同銀']);
  assert.deepStrictEqual(r.moves.map((m) => m.text), ['▲７六歩', '△３四歩', '▲２二角成', '△同銀']);
  assert.strictEqual(C.at(r.board, 2, 2).k, '銀');
});

test('どの駒か決まらない棋譜はエラーになる (書きまちがい防止)', () => {
  const b = C.initialBoard();
  assert.throws(() => C.parseMove(b, '5八金', C.SENTE, null), /決まらない/);
  assert.doesNotThrow(() => C.parseMove(b, '5八金(49)', C.SENTE, null));
});

test('指せない手はエラーになる', () => {
  const b = C.initialBoard();
  assert.throws(() => C.parseMove(b, '7五歩', C.SENTE, null), /指せない/);
});

test('段位は正解率で上がる', () => {
  assert.strictEqual(C.rankOf(1).name, '名人');
  assert.ok(C.rankOf(0.5).stars < C.rankOf(0.9).stars);
});
