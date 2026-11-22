// Offline-First Service Worker (Network-First with Full Precache Offline Fallback)
const CACHE_NAME = 'cashewflow-v1.0.2';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
  './css/tokens.css',
  './css/layout.css',
  './css/components.css',
  './js/app.js',
  './js/auth.js',
  './js/charts.js',
  './js/crypto.js',
  './js/db.js',
  './js/format.js',
  './js/icons.js',
  './js/parser.js',
  './js/reminders.js',
  './js/rules.js',
  './js/sync.js',
  './js/views/budgets.js',
  './js/views/capture.js',
  './js/views/dashboard.js',
  './js/views/settings.js',
  './js/views/transactions.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
      }
      return res;
    }).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(cached => cached || caches.match('./index.html'))
    )
  );
});
