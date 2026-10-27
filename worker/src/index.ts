// Strength Ledger sync service (Cloudflare Worker + D1 + KV), free-plan friendly.
// - Serves the web app's static files (Workers static assets); only /api/* reaches this code.
// - POST /api/sync: push local changes (field-merged on the server) and pull everything newer than a cursor.
// - POST /api/setup: one-time pairing that stores the hash of the user's sync key.
// - PUT/GET /api/backups: daily snapshots made by the app, stored gzipped in KV for 90 days.
// Work per request stays small (a few queries, no parsing of unchanged records) to fit the free plan's CPU limit.

import { isTable, maxStamp, merge, sameRecord, type SyncedRecord } from '../../src/sync/merge.ts';

// ---- minimal platform types (no @cloudflare/workers-types dependency) ----
export interface D1Result<T = Record<string, unknown>> {
  results: T[];
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}
export interface KVNamespace {
  put(key: string, value: ArrayBuffer | ReadableStream | string, options?: { expirationTtl?: number; metadata?: Record<string, unknown> }): Promise<void>;
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  list(options?: { prefix?: string; cursor?: string }): Promise<{ keys: Array<{ name: string; metadata?: unknown }>; list_complete: boolean; cursor?: string }>;
}
export interface Env {
  DB: D1Database;
  BACKUPS: KVNamespace;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

// ---- limits ----
const MAX_PUSH = 250;
const MAX_PULL = 1000;
const BACKUP_TTL_S = 90 * 24 * 3600;
const MAX_BACKUP_BYTES = 24 * 1024 * 1024;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fail = (status: number, message: string): Response => json({ error: message }, status);

async function sha256Hex(text: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function meta(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

/** Normalises a key as typed or pasted: uppercase, no spaces or dashes. */
export const normaliseKey = (k: string): string => k.toUpperCase().replace(/[^A-Z0-9]/g, '');

async function authorised(request: Request, env: Env): Promise<boolean | 'not-set-up'> {
  const stored = await meta(env, 'sync_key_sha256');
  if (!stored) return 'not-set-up';
  const header = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return false;
  return equalHex(await sha256Hex(normaliseKey(m[1]!)), stored);
}

// ---- /api/setup ----
async function setup(request: Request, env: Env): Promise<Response> {
  if (await meta(env, 'sync_key_sha256')) return fail(409, 'Sync is already set up. Use your sync key on each device.');
  const body = (await request.json().catch(() => null)) as { setupCode?: string; syncKey?: string } | null;
  const codeHash = await meta(env, 'setup_code_sha256');
  if (!codeHash) return fail(403, 'No setup code is waiting. Ask Claude to issue one.');
  if (!body?.setupCode || !body.syncKey) return fail(400, 'Send setupCode and syncKey.');
  if (!equalHex(await sha256Hex(normaliseKey(body.setupCode)), codeHash)) return fail(403, 'That setup code is not right.');
  const key = normaliseKey(body.syncKey);
  if (key.length < 24) return fail(400, 'The sync key is too short.');
  await env.DB.batch([
    env.DB.prepare("INSERT INTO meta (key, value) VALUES ('sync_key_sha256', ?)").bind(await sha256Hex(key)),
    env.DB.prepare("DELETE FROM meta WHERE key = 'setup_code_sha256'"),
  ]);
  return json({ ok: true });
}

// ---- /api/sync ----
interface PushChange {
  /** table */
  t: string;
  /** the record as a JSON string (kept as text so unchanged records are never parsed) */
  d: string;
  id: string;
  /** latest stamp in the record */
  h: string;
  /** deleted flag */
  x: 0 | 1;
}
interface SyncBody {
  changes?: PushChange[];
  since?: number;
  limit?: number;
}

export async function sync(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as SyncBody | null;
  if (!body) return fail(400, 'Body must be JSON.');
  const changes = body.changes ?? [];
  if (changes.length > MAX_PUSH) return fail(413, `Send at most ${MAX_PUSH} changes per request.`);
  for (const c of changes) {
    if (!isTable(c.t) || typeof c.id !== 'string' || !c.id || typeof c.d !== 'string' || typeof c.h !== 'string') return fail(400, 'Malformed change.');
  }

  let accepted = 0;
  if (changes.length) {
    // Latest copy per key if the same record appears twice in one push.
    const incoming = new Map<string, PushChange>();
    for (const c of changes) {
      const k = `${c.t}\u001f${c.id}`;
      const prev = incoming.get(k);
      incoming.set(k, prev ? mergeChange(prev, c) : c);
    }
    const keys = [...incoming.keys()];
    const existing = await env.DB.prepare(
      "SELECT tbl, id, hlc, data FROM records WHERE tbl || char(31) || id IN (SELECT value FROM json_each(?))",
    )
      .bind(JSON.stringify(keys))
      .all<{ tbl: string; id: string; hlc: string; data: string }>();
    const have = new Map(existing.results.map((r) => [`${r.tbl}\u001f${r.id}`, r]));

    const writes: Array<{ t: string; id: string; h: string; x: number; d: string }> = [];
    const replaced: Array<{ t: string; id: string; h: string; d: string }> = [];
    for (const [k, c] of incoming) {
      const old = have.get(k);
      if (!old) {
        writes.push({ t: c.t, id: c.id, h: c.h, x: c.x ? 1 : 0, d: c.d });
        continue;
      }
      if (old.data === c.d) continue; // identical copy
      const merged = merge(JSON.parse(old.data) as SyncedRecord, JSON.parse(c.d) as SyncedRecord);
      const oldRec = JSON.parse(old.data) as SyncedRecord;
      if (sameRecord(merged, oldRec)) continue; // nothing new for the server
      writes.push({ t: c.t, id: c.id, h: maxStamp(merged), x: merged.deleted ? 1 : 0, d: JSON.stringify(merged) });
      replaced.push({ t: old.tbl, id: old.id, h: old.hlc, d: old.data });
    }
    const stmts: D1PreparedStatement[] = [];
    if (replaced.length) {
      stmts.push(
        env.DB.prepare(
          "INSERT INTO history (tbl, id, hlc, data) SELECT j.value->>'$.t', j.value->>'$.id', j.value->>'$.h', j.value->>'$.d' FROM json_each(?) j",
        ).bind(JSON.stringify(replaced)),
      );
    }
    if (writes.length) {
      // REPLACE gives the row a new, larger seq, so other devices pull it.
      stmts.push(
        env.DB.prepare(
          "INSERT OR REPLACE INTO records (tbl, id, hlc, deleted, data) SELECT j.value->>'$.t', j.value->>'$.id', j.value->>'$.h', j.value->>'$.x', j.value->>'$.d' FROM json_each(?) j",
        ).bind(JSON.stringify(writes)),
      );
    }
    if (stmts.length) await env.DB.batch(stmts);
    accepted = writes.length;
  }

  // Pull: everything after the client's cursor. Record text is passed through without parsing.
  const since = Number.isFinite(body.since) ? Math.max(0, Math.floor(body.since!)) : 0;
  const limit = Math.min(MAX_PULL, Math.max(1, Math.floor(body.limit ?? 500)));
  const rows = await env.DB.prepare('SELECT seq, tbl, data FROM records WHERE seq > ? ORDER BY seq LIMIT ?')
    .bind(since, limit + 1)
    .all<{ seq: number; tbl: string; data: string }>();
  const more = rows.results.length > limit;
  const page = more ? rows.results.slice(0, limit) : rows.results;
  const cursor = page.length ? page[page.length - 1]!.seq : since;
  const recordsJson = page.map((r) => `{"t":${JSON.stringify(r.tbl)},"s":${r.seq},"r":${r.data}}`).join(',');
  return new Response(`{"accepted":${accepted},"cursor":${cursor},"more":${more},"serverTime":${Date.now()},"records":[${recordsJson}]}`, {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function mergeChange(a: PushChange, b: PushChange): PushChange {
  const m = merge(JSON.parse(a.d) as SyncedRecord, JSON.parse(b.d) as SyncedRecord);
  return { t: a.t, id: a.id, d: JSON.stringify(m), h: maxStamp(m), x: m.deleted ? 1 : 0 };
}

// ---- /api/backups ----
async function putBackup(request: Request, env: Env, name: string): Promise<Response> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) return fail(400, 'Backup name must be a date (YYYY-MM-DD).');
  const size = Number(request.headers.get('content-length') ?? '0');
  if (!size || size > MAX_BACKUP_BYTES) return fail(413, 'Backup is empty or too large.');
  const records = request.headers.get('x-record-count') ?? '';
  await env.BACKUPS.put(`snapshot/${name}`, await request.arrayBuffer(), { expirationTtl: BACKUP_TTL_S, metadata: { records, bytes: size, at: new Date().toISOString() } });
  return json({ ok: true, name });
}

async function listBackups(env: Env): Promise<Response> {
  const out: Array<{ name: string; metadata?: unknown }> = [];
  let cursor: string | undefined;
  do {
    const page = await env.BACKUPS.list({ prefix: 'snapshot/', ...(cursor ? { cursor } : {}) });
    out.push(...page.keys.map((k) => ({ name: k.name.slice('snapshot/'.length), metadata: k.metadata })));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return json({ backups: out.sort((a, b) => b.name.localeCompare(a.name)) });
}

async function getBackup(env: Env, name: string): Promise<Response> {
  const data = await env.BACKUPS.get(`snapshot/${name}`, 'arrayBuffer');
  if (!data) return fail(404, 'No backup with that date.');
  return new Response(data, { headers: { 'content-type': 'application/gzip', 'cache-control': 'no-store' } });
}

// ---- router ----
export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/api/health') return json({ ok: true, serverTime: Date.now(), setUp: !!(await meta(env, 'sync_key_sha256')) });
  if (path === '/api/setup' && request.method === 'POST') return setup(request, env);
  const auth = await authorised(request, env);
  if (auth === 'not-set-up') return fail(428, 'Sync is not set up yet. Open the app on your Mac and enter the setup code.');
  if (!auth) return fail(401, 'Wrong or missing sync key.');
  if (path === '/api/sync' && request.method === 'POST') return sync(request, env);
  if (path === '/api/backups' && request.method === 'GET') return listBackups(env);
  const b = /^\/api\/backups\/([^/]+)$/.exec(path);
  if (b && request.method === 'PUT') return putBackup(request, env, b[1]!);
  if (b && request.method === 'GET') return getBackup(env, b[1]!);
  return fail(404, 'Unknown endpoint.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env);
      } catch (e) {
        return fail(500, `Server error: ${(e as Error).message}`);
      }
    }
    return env.ASSETS ? env.ASSETS.fetch(request) : fail(404, 'Not found');
  },
  /** Daily housekeeping: drop change history older than 90 days. */
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await env.DB.prepare("DELETE FROM history WHERE replaced_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days')").run();
  },
};
