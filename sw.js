/*!
 * sw.js — 電波が無くても開けるようにする。
 *
 * **ネット優先**にしてある。つながっていれば必ず最新を取りに行き、
 * 取れなかったときだけ、しまってあるものを出す。
 *
 * キャッシュ優先にすると「直したのに古い画面が出る」が必ず起きる。
 * 毎日開くアプリでこれをやると、直した本人にも直った実感が来ない。
 * 起動は少し遅くなるが、このアプリは全部で 70KB ほどなので気にならない。
 */
'use strict';

/* 中身を変えたらここを上げる。古いキャッシュは activate で捨てる */
const CACHE = 'stretch-routine-v1';

/* 最初にまとめてしまっておくもの。これだけあれば 1 周まわせる */
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './core.js',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ASSETS); })
      // 1 つでも取れないと丸ごと失敗して、オフラインで何も出なくなる。
      // 取れなかったぶんは fetch のときに拾えばよいので、ここでは止めない
      .catch(function () {})
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names
          .filter(function (n) { return n !== CACHE; })
          .map(function (n) { return caches.delete(n); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;

  // 自分のところのファイルだけ面倒を見る。GET 以外は素通し
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        // 取れたぶんはしまい直しておく (次にオフラインでも出せるように)。
        // レスポンスは 1 度しか読めないので、複製をしまう
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          // ページを開こうとして届かなかったときは、しまってある画面を出す
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
  );
});
