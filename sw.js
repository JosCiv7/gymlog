// Bump VERSION on every release so the app fetches the new files.
const VERSION = 'v6';
const CACHE = `gymlog-${VERSION}`;
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/logic.js', 'js/db.js', 'js/backup.js', 'js/chart.js', 'js/demo.js', 'js/humor.js', 'js/body.js', 'js/plan.js', 'js/theme.js', 'js/coach.js',
  'icons/logo-v6-192.png', 'icons/logo-v6-512.png', 'icons/logo-v6-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  // Fonts are kept after the first visit, so they also work offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })),
    );
    return;
  }
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request.mode === 'navigate' ? './' : event.request)
      .then((hit) => hit || fetch(event.request)),
  );
});
