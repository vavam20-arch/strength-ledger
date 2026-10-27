import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeClock, observe, tick } from '../src/sync/hlc.ts';
import { merge, sameRecord, stamp, type SyncedRecord } from '../src/sync/merge.ts';
import { newSyncKey, toChange, type SyncResponse } from '../src/sync/protocol.ts';
import worker, { normaliseKey, type Env } from '../worker/src/index.ts';
import { makeD1, makeKV } from './d1-shim.ts';

// ---------- clock ----------
test('clock stamps increase even when the device clock goes backwards', () => {
  const c = makeClock('iphone');
  const a = tick(c, 1000);
  const b = tick(c, 900); // clock went backwards
  const d = tick(c, 900);
  assert.ok(a < b && b < d);
  observe(c, tick(makeClock('mac'), 5000));
  assert.ok(tick(c, 1000) > '0000000005000');
});

// ---------- merge ----------
test('merge keeps edits to different fields from both devices', () => {
  const base = stamp({ id: 's1', weight: 190, reps: 8, note: null }, '0000000000001-0000-a');
  const phone = stamp({ ...base, reps: 9 }, '0000000000002-0000-phone', ['reps']);
  const mac = stamp({ ...base, weight: 195 }, '0000000000003-0000-mac', ['weight']);
  const m = merge(phone, mac);
  assert.equal(m['weight'], 195);
  assert.equal(m['reps'], 9);
  assert.ok(sameRecord(m, merge(mac, phone)), 'commutative');
  assert.ok(sameRecord(m, merge(m, phone)), 'idempotent');
});

test('the later edit wins on the same field, and deletes do not come back', () => {
  const a = stamp({ id: 's1', reps: 8 }, '0000000000001-0000-a');
  const b = stamp({ ...a, reps: 10 }, '0000000000005-0000-b', ['reps']);
  const c = stamp({ ...a, reps: 7 }, '0000000000003-0000-c', ['reps']);
  assert.equal(merge(b, c)['reps'], 10);
  const del = stamp({ ...a, deleted: true }, '0000000000009-0000-a', ['deleted']);
  assert.equal(merge(merge(del, b), c)['deleted'], true);
});

test('merge is commutative and associative on random edits', () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < 500; i++) {
    const base = stamp({ id: 'r', a: 1, b: 2, c: 3 }, '0000000000001-0000-x');
    const copies = ['p', 'q', 'r'].map((dev, k) => {
      const f = ['a', 'b', 'c'][Math.floor(rnd() * 3)]!;
      return stamp({ ...base, [f]: Math.floor(rnd() * 100) }, `00000000000${10 + Math.floor(rnd() * 80)}-000${k}-${dev}`, [f]);
    });
    const [x, y, z] = copies as [SyncedRecord, SyncedRecord, SyncedRecord];
    assert.ok(sameRecord(merge(merge(x, y), z), merge(x, merge(y, z))));
    assert.ok(sameRecord(merge(x, y), merge(y, x)));
  }
});

// ---------- server ----------
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function server(): Promise<{ env: Env; call: (path: string, init?: RequestInit, key?: string) => Promise<Response>; key: string }> {
  const env: Env = { DB: makeD1(), BACKUPS: makeKV() };
  const call = (path: string, init: RequestInit = {}, k?: string) =>
    worker.fetch(new Request(`https://app.example${path}`, { ...init, headers: { 'content-type': 'application/json', ...(k ? { authorization: `Bearer ${k}` } : {}), ...(init.headers ?? {}) } }), env);
  // One-time setup code, as Claude stores it through the Cloudflare connector.
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('setup_code_sha256', ?)").bind(sha('LEDGER2026')).run();
  const key = newSyncKey();
  const r = await call('/api/setup', { method: 'POST', body: JSON.stringify({ setupCode: 'ledger-2026', syncKey: key }) });
  assert.equal(r.status, 200);
  return { env, call, key };
}

test('setup: the one-time code works once; wrong keys are refused', async () => {
  const { call, key } = await server();
  assert.match(key, /^([A-Z2-9]{5}-){5}[A-Z2-9]{5}$/);
  const again = await call('/api/setup', { method: 'POST', body: JSON.stringify({ setupCode: 'LEDGER2026', syncKey: newSyncKey() }) });
  assert.equal(again.status, 409);
  assert.equal((await call('/api/sync', { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await call('/api/sync', { method: 'POST', body: '{}' }, 'WRONG-KEY')).status, 401);
  // Keys work with or without dashes, in any case.
  assert.equal((await call('/api/sync', { method: 'POST', body: '{}' }, normaliseKey(key).toLowerCase())).status, 200);
});

test('sync: push, pull, field-level merge on the server, history kept, new seq on change', async () => {
  const { env, call, key } = await server();
  const push = async (records: SyncedRecord[], since = 0) =>
    (await (await call('/api/sync', { method: 'POST', body: JSON.stringify({ changes: records.map((r) => toChange('sets', r)), since }) }, key)).json()) as SyncResponse;

  const s1 = stamp({ id: 'set-1', weight: 190, reps: 8 }, '0000000000010-0000-phone');
  const r1 = await push([s1]);
  assert.equal(r1.accepted, 1);
  assert.equal(r1.records.length, 1);
  const seq1 = r1.cursor;

  // Mac edits weight, phone (offline) edits reps; both reach the server.
  await push([stamp({ ...s1, weight: 195 }, '0000000000020-0000-mac', ['weight'])], seq1);
  const r3 = await push([stamp({ ...s1, reps: 9 }, '0000000000030-0000-phone', ['reps'])], seq1);
  const last = r3.records.at(-1)!.r;
  assert.equal(last['weight'], 195);
  assert.equal(last['reps'], 9);
  assert.ok(r3.cursor > seq1, 'changed rows get a new seq so other devices pull them');
  const hist = (env.DB as unknown as { raw: { prepare(s: string): { all(): unknown[] } } }).raw.prepare('SELECT * FROM history').all();
  assert.equal(hist.length, 2, 'overwritten versions are kept in history');

  // A stale copy changes nothing.
  const r4 = await push([s1], r3.cursor);
  assert.equal(r4.accepted, 0);
  assert.equal(r4.records.length, 0);
});

test('sync: pulls page through large histories', async () => {
  const { call, key } = await server();
  const recs = Array.from({ length: 600 }, (_, i) => stamp({ id: `set-${i}`, reps: i }, '0000000000010-0000-mac'));
  for (let i = 0; i < recs.length; i += 250) {
    const r = await call('/api/sync', { method: 'POST', body: JSON.stringify({ changes: recs.slice(i, i + 250).map((x) => toChange('sets', x)), limit: 1 }) }, key);
    assert.equal(r.status, 200);
  }
  let since = 0;
  let got = 0;
  for (;;) {
    const r = (await (await call('/api/sync', { method: 'POST', body: JSON.stringify({ since, limit: 250 }) }, key)).json()) as SyncResponse;
    got += r.records.length;
    since = r.cursor;
    if (!r.more) break;
  }
  assert.equal(got, 600);
  const tooMany = await call('/api/sync', { method: 'POST', body: JSON.stringify({ changes: recs.slice(0, 251).map((x) => toChange('sets', x)) }) }, key);
  assert.equal(tooMany.status, 413);
});

test('backups: store, list and fetch a daily snapshot', async () => {
  const { call, key } = await server();
  const body = new TextEncoder().encode('{"hello":1}');
  const put = await call('/api/backups/2026-10-28', { method: 'PUT', body, headers: { 'content-type': 'application/gzip', 'content-length': String(body.length), 'x-record-count': '1' } }, key);
  assert.equal(put.status, 200);
  const list = (await (await call('/api/backups', {}, key)).json()) as { backups: Array<{ name: string }> };
  assert.deepEqual(list.backups.map((b) => b.name), ['2026-10-28']);
  assert.equal(await (await call('/api/backups/2026-10-28', {}, key)).text(), '{"hello":1}');
});
