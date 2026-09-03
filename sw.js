/*
 * サービスワーカー。
 * 「直したのに古い画面が出る」を防ぐため、つながっているときは必ず最新を取りにいき、
 * つながらないときだけキャッシュを使う (ネットワーク優先)。
 */
const CACHE = 'shogi-quiz-dojo-v1';
const FILES = [
  './', './index.html', './styles.css', './core.js', './data.js', './titles.js', './app.js',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png', './app.webmanifest'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});
