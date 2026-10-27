// Strength Ledger service worker: keeps the app usable with no signal.
// The build fills in the version and the offline file list.
const VERSION = '__VERSION__';
const CACHE = `ledger-${VERSION}`;
const FILES = __FILES__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ledger-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = event.request.mode === 'navigate' ? './index.html' : event.request;
      const hit = await cache.match(key, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(event.request);
      } catch {
        return (await cache.match('./index.html')) ?? Response.error();
      }
    }),
  );
});
