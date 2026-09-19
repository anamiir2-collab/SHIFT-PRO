/* ShiftPro Service Worker - v2.0
   Strategy:
   - precache: app shell (HTML, CSS, JS, icons, manifest)
   - runtime: network-first for navigations, cache-first for static assets
   - cleanup: drop old caches on activate
*/
const SW_VERSION = 'shifpro-v2.1.0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/utils.js',
  './js/storage.js',
  './js/calendar.js',
  './js/attendance.js',
  './js/salary.js',
  './js/reports.js',
  './js/settings.js',
  './js/app.js',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SW_VERSION).then((cache) => {
      // Cache individually so one missing file doesn't break the whole install
      return Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Skip caching', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Message: skip waiting on demand (used for "apply update" button)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Ignore cross-origin requests (e.g., dicebear avatar)
  if (url.origin !== self.location.origin) return;

  // Navigations -> network first, fall back to cached index.html (offline)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SW_VERSION).then((c) => c.put('./index.html', copy)).catch(()=>{});
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static assets -> cache first, then network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Only cache same-origin successful responses
          if (!res || res.status !== 200 || res.type !== 'basic') return res;
          const copy = res.clone();
          caches.open(SW_VERSION).then((c) => c.put(req, copy)).catch(()=>{});
          return res;
        })
        .catch(() => cached);
    })
  );
});
