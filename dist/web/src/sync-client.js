// Background sync: pushes queued changes and pulls everything newer, whenever the app is open and online.
// Nothing the user logs waits for this; it only copies saved records between devices.

import { get, getAll, getLocal, setLocal, write, count } from './db.js';
import { applyRemote, emit } from './store.js';
import { toChange, newSyncKey,                   } from '../../src/sync/protocol.js';
                                                                   

                                                                                              
                             
                   
                  
                          
                         
 

let status             = { state: 'not-set-up', pending: 0, lastSync: null, message: null };
let running                       = null;
let again = false;
let timer                                       = null;

export const getStatus = ()             => status;
const setStatus = (s                     )       => {
  status = { ...status, ...s };
  emit('sync', status);
};

const API = (path        )         => new URL(path, location.origin).toString();

async function key()                         {
  return getLocal               ('syncKey', null);
}

async function post(path        , body         , k               )                    {
  return fetch(API(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(k ? { authorization: `Bearer ${k}` } : {}) },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

/** Run a sync now (or once more after the current one finishes). */
export function syncNow()                {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Ask for a sync shortly (several quick edits become one upload). */
export function syncSoon(delayMs = 1500)       {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}

async function syncOnce()                {
  const pendingCount = await count('outbox');
  const k = await key();
  if (!k) return setStatus({ state: 'not-set-up', pending: pendingCount });
  if (!navigator.onLine) return setStatus({ state: 'offline', pending: pendingCount });
  setStatus({ state: 'syncing', pending: pendingCount, message: null });
  try {
    for (let round = 0; round < 500; round++) {
      const outbox = (await getAll                                                    ('outbox')).slice(0, 250);
      const recs                                                               = [];
      for (const entry of outbox) {
        const rec = await get              (entry.t, entry.id);
        if (rec) recs.push({ entry, rec });
      }
      const since = await getLocal        ('cursor', 0);
      const res = await post('/api/sync', { changes: recs.map((x) => toChange(x.entry.t, x.rec)), since, limit: 1000 }, k);
      if (res.status === 401) return setStatus({ state: 'error', message: 'This device has the wrong sync key. Enter it again in More › Sync.' });
      if (res.status === 428) return setStatus({ state: 'error', message: 'Sync is not set up on the server yet. Set it up from More › Sync.' });
      if (!res.ok) throw new Error(`Server answered ${res.status}`);
      const data = (await res.json())                ;
      // Remove uploaded entries, unless the record changed again while uploading.
      await write(['outbox'], (tx) => {
        const store = tx.objectStore('outbox');
        for (const { entry } of recs) {
          const req = store.get(entry.key);
          req.onsuccess = () => {
            if ((req.result                                )?.rev === entry.rev) store.delete(entry.key);
          };
        }
      });
      await applyRemote(data.records.map((x) => ({ t: x.t, r: x.r })));
      await setLocal('cursor', data.cursor);
      const left = await count('outbox');
      setStatus({ state: 'syncing', pending: left });
      if (!data.more && left === 0) break;
    }
    const now = new Date().toISOString();
    await setLocal('lastSync', now);
    setStatus({ state: 'synced', pending: 0, lastSync: now, message: null });
  } catch (e) {
    const left = await count('outbox');
    setStatus({ state: navigator.onLine ? 'error' : 'offline', pending: left, message: navigator.onLine ? `Sync failed: ${(e         ).message}. Your data is safe on this device; it will retry.` : null });
  }
}

export async function startSync()                {
  status = { ...status, lastSync: await getLocal               ('lastSync', null), pending: await count('outbox') };
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 60_000);
  void syncNow();
}

// ---------- pairing ----------
/** First device: use the one-time setup code to register a new sync key. */
export async function setUpSync(setupCode        )                  {
  const k = newSyncKey();
  const res = await post('/api/setup', { setupCode, syncKey: k }, null);
  const body = (await res.json().catch(() => ({})))                      ;
  if (!res.ok) throw new Error(body.error ?? `Setup failed (${res.status}).`);
  await setLocal('syncKey', k);
  await setLocal('cursor', 0);
  void syncNow();
  return k;
}

/** Other devices: enter the sync key shown on the first device. */
export async function useSyncKey(k        )                {
  const res = await post('/api/sync', { since: 0, limit: 1 }, k.trim());
  if (res.status === 401) throw new Error('That sync key is not right. Check it on your other device.');
  if (res.status === 428) throw new Error('Sync is not set up yet. Set it up on your Mac first.');
  if (!res.ok) throw new Error(`Could not reach the server (${res.status}).`);
  await setLocal('syncKey', k.trim());
  await setLocal('cursor', 0);
  void syncNow();
}

export const currentKey = key;
