// Backups: a daily snapshot uploaded to the sync server (kept 90 days), and an on-demand export file.

import { getAll, getLocal, setLocal, count } from './db.js';
import { TABLES } from '../../src/sync/merge.js';
import { currentKey, getStatus } from './sync-client.js';
import { today } from './dates.js';

export async function snapshot()                                             {
  const tables                            = {};
  let records = 0;
  for (const t of TABLES) {
    tables[t] = await getAll(t);
    records += tables[t] .length;
  }
  return { json: JSON.stringify({ app: 'Strength Ledger', format: 1, exportedAt: new Date().toISOString(), tables }), records };
}

async function gzip(text        )                       {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/** Upload today's snapshot if no device has done so yet. Runs only when everything is synced. */
export async function maybeDailyBackup()                         {
  const k = await currentKey();
  const day = today();
  if (!k || !navigator.onLine || getStatus().state !== 'synced') return null;
  if ((await getLocal               ('lastBackup', null)) === day) return null;
  if ((await count('sets')) === 0) return null;
  const list = await fetch(new URL('/api/backups', location.origin), { headers: { authorization: `Bearer ${k}` }, cache: 'no-store' });
  if (!list.ok) return null;
  const { backups } = (await list.json())                                        ;
  if (backups.some((b) => b.name === day)) {
    await setLocal('lastBackup', day);
    return null;
  }
  const snap = await snapshot();
  const body = await gzip(snap.json);
  const res = await fetch(new URL(`/api/backups/${day}`, location.origin), {
    method: 'PUT',
    headers: { authorization: `Bearer ${k}`, 'content-type': 'application/gzip', 'x-record-count': String(snap.records) },
    body,
  });
  if (res.ok) {
    await setLocal('lastBackup', day);
    return day;
  }
  return null;
}

/** Save a full export file (JSON) to the device; on the Mac, save it to iCloud Drive. */
export async function exportFile()                                             {
  const snap = await snapshot();
  const name = `strength-ledger-${today()}.json`;
  const url = URL.createObjectURL(new Blob([snap.json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await setLocal('lastExport', today());
  return { name, records: snap.records };
}
