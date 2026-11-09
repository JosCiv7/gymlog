// Bump VERSION on every release so the app fetches the new files.
const VERSION = 'v9';
const CACHE = `gymlog-${VERSION}`;
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/logic.js', 'js/db.js', 'js/backup.js', 'js/chart.js', 'js/demo.js', 'js/humor.js', 'js/body.js', 'js/plan.js', 'js/theme.js', 'js/coach.js',
  'icons/logo-v6-192.png', 'icons/logo-v6-512.png', 'icons/logo-v6-maskable-512.png',
];
const NETWORK_WAIT_MS = 3000;

self.addEventListener('install', (event) => {
  // 'reload' skips the browser's own short-term copies, so a new version never stores old files.
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * The page itself and the app manifest come from the network when it answers within a few
 * seconds, so a new logo or version shows up right away. Offline, the stored copy is used.
 */
function networkFirst(request, key) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (response) => {
      if (settled || !response) return;
      settled = true;
      resolve(response);
    };
    const fallback = () => caches.match(key).then(finish);
    const timer = setTimeout(fallback, NETWORK_WAIT_MS);
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        clearTimeout(timer);
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(key, copy));
        }
        finish(response);
      })
      .catch(() => {
        clearTimeout(timer);
        caches.match(key).then((hit) => finish(hit || Response.error()));
      });
  });
}

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
  if (event.request.mode === 'navigate') {
    const isApp = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
    event.respondWith(isApp ? networkFirst(event.request, './') : fetch(event.request));
    return;
  }
  if (url.pathname.endsWith('/manifest.webmanifest')) {
    event.respondWith(networkFirst(event.request, 'manifest.webmanifest'));
    return;
  }
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
});
