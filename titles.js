/*!
 * titles.js — 歴代タイトルホルダーの年表。
 *
 * ★ このファイルだけは、将棋エンジンで検算できない ★
 * 囲い・手筋・戦法は core.js が実際に指して確かめているが、
 * 「何年に誰がタイトルを取ったか」は将棋のルールから導けない。
 * だから中身は日本将棋連盟の歴代一覧を写して入れる。写しまちがいだけは
 * titles.test.js が調べる (期が1つずつ増えるか、年が前へもどっていないか、
 * 同じ期が2回出ていないか)。名前そのものが合っているかは、写す人の責任。
 *
 * provisional: true のあいだは、画面の上に「仮データ」の帯が出る。
 * 本物を写し終えたら false にする。
 *
 * 書き方:
 *   { key: 'ryuou', name: '竜王', kana: 'りゅうおう', since: 1988,
 *     note: '一行で棋戦の紹介',
 *     holders: [ { ki: 1, year: 1988, name: '島朗' }, ... ] }
 *   ki   … 期 (第何期)
 *   year … その期の決着した年
 *   name … タイトルを取った人 (連続で防衛したときも、期ごとに 1 行書く)
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.Titles = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PROVISIONAL = true;

  const TITLES = [
    { key: 'ryuou', name: '竜王', kana: 'りゅうおう', since: 1988,
      note: '賞金がいちばん高いタイトル。1988年にできた、八大タイトルの中では新しいほう',
      holders: [
        { ki: 1, year: 1988, name: '島朗' },
        { ki: 2, year: 1989, name: '羽生善治' },
        { ki: 3, year: 1990, name: '谷川浩司' },
        { ki: 4, year: 1991, name: '谷川浩司' },
        { ki: 5, year: 1992, name: '羽生善治' },
        { ki: 6, year: 1993, name: '佐藤康光' },
        { ki: 7, year: 1994, name: '羽生善治' },
        { ki: 8, year: 1995, name: '羽生善治' },
        { ki: 9, year: 1996, name: '谷川浩司' },
        { ki: 10, year: 1997, name: '谷川浩司' }
      ] },

    { key: 'meijin', name: '名人', kana: 'めいじん', since: 1937,
      note: 'いちばん古いタイトル。順位戦のA級で1位になった人だけが挑戦できる',
      holders: [
        { ki: 1, year: 1937, name: '木村義雄' },
        { ki: 2, year: 1940, name: '木村義雄' },
        { ki: 3, year: 1942, name: '木村義雄' },
        { ki: 4, year: 1943, name: '木村義雄' },
        { ki: 5, year: 1945, name: '木村義雄' },
        { ki: 6, year: 1947, name: '塚田正夫' },
        { ki: 7, year: 1948, name: '塚田正夫' },
        { ki: 8, year: 1949, name: '木村義雄' },
        { ki: 9, year: 1950, name: '木村義雄' },
        { ki: 10, year: 1951, name: '木村義雄' }
      ] }
  ];

  return { TITLES: TITLES, PROVISIONAL: PROVISIONAL };
});
