// Strength Ledger service worker: keeps the app usable with no signal.
// The build fills in the version and the offline file list.
const VERSION = 'b984d27c54';
const CACHE = `ledger-${VERSION}`;
const FILES = [
 "./",
 "./icons/icon-180.png",
 "./icons/icon-192.png",
 "./icons/icon-512.png",
 "./icons/icon.svg",
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
 "./src/trends.js",
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
 "./web/src/views/cardio.js",
 "./web/src/views/history.js",
 "./web/src/views/more.js",
 "./web/src/views/strength.js",
 "./web/src/views/train.js",
 "./web/src/views/workout.js"
];
const START = './';

// Browsers refuse to show a redirected response to a page load, and Cloudflare redirects
// /index.html to /. Store and serve plain copies only.
async function plain(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const f of FILES) {
        const res = await fetch(new Request(f, { cache: 'reload' }));
        if (!res.ok) throw new Error(`Could not cache ${f} (${res.status})`);
        await cache.put(f, await plain(res));
      }
      // A new version takes over straight away; the page offers a reload.
      await self.skipWaiting();
    })(),
  );
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
    (async () => {
      const cache = await caches.open(CACHE);
      const navigate = event.request.mode === 'navigate';
      const hit = await cache.match(navigate ? START : event.request, { ignoreSearch: true });
      if (hit) return plain(hit);
      try {
        return await plain(await fetch(event.request));
      } catch {
        return (await cache.match(START)) ?? Response.error();
      }
    })(),
  );
});
