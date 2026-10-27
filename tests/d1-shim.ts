// A stand-in for Cloudflare D1 and KV, backed by Node's built-in SQLite, for tests and local runs.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { D1Database, D1PreparedStatement, KVNamespace } from '../worker/src/index.ts';

export function makeD1(): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../worker/migrations/0001_init.sql', import.meta.url), 'utf8'));
  const stmt = (sql: string, params: unknown[] = []): D1PreparedStatement => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    all: async <T,>() => ({ results: db.prepare(sql).all(...(params as never[])) as T[] }),
    first: async <T,>() => (db.prepare(sql).get(...(params as never[])) as T) ?? null,
    run: async () => db.prepare(sql).run(...(params as never[])),
  });
  return {
    raw: db,
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: D1PreparedStatement[]) => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

export function makeKV(): KVNamespace & { data: Map<string, { value: ArrayBuffer; metadata?: Record<string, unknown> }> } {
  const data = new Map<string, { value: ArrayBuffer; metadata?: Record<string, unknown> }>();
  return {
    data,
    put: async (key, value, options) => {
      const buf = typeof value === 'string' ? new TextEncoder().encode(value).buffer : value instanceof ArrayBuffer ? value : await new Response(value).arrayBuffer();
      data.set(key, { value: buf as ArrayBuffer, ...(options?.metadata ? { metadata: options.metadata } : {}) });
    },
    get: async (key) => data.get(key)?.value ?? null,
    list: async (options) => ({ keys: [...data.keys()].filter((k) => k.startsWith(options?.prefix ?? '')).map((name) => ({ name, metadata: data.get(name)?.metadata })), list_complete: true }),
  };
}
