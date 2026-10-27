// Strength Ledger service worker: keeps the app usable with no signal.
// The build fills in the version and the offline file list.
const VERSION = '3e2edecc65';
const CACHE = `ledger-${VERSION}`;
const FILES = [
 "./icons/icon-180.png",
 "./icons/icon-192.png",
 "./icons/icon-512.png",
 "./icons/icon.svg",
 "./index.html",
 "./manifest.webmanifest",
 "./src/decisions.js",
 "./src/engine.js",
 "./src/import/catalog.js",
 "./src/import/earlier-app.js",
 "./src/import/fitbod.js",
 "./src/import/store.js",
 "./src/import/types.js",
 "./src/import/xlsx.js",
 "./src/model.js",
 "./src/program/block1.js",
 "./src/sync/hlc.js",
 "./src/sync/merge.js",
 "./src/sync/protocol.js",
 "./styles.css",
 "./web/src/app.js",
 "./web/src/backup.js",
 "./web/src/coach.js",
 "./web/src/dates.js",
 "./web/src/db.js",
 "./web/src/importer.js",
 "./web/src/store.js",
 "./web/src/sync-client.js",
 "./web/src/ui.js",
 "./web/src/version.js",
 "./web/src/views/body.js",
 "./web/src/views/history.js",
 "./web/src/views/more.js",
 "./web/src/views/train.js",
 "./web/src/views/workout.js"
];

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
