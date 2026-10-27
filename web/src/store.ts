// App data layer: every change is stamped, written to the device and queued for upload in one transaction.

import { byIndex, get, getAll, getLocal, reqResult, setLocal, write } from './db.ts';
import { makeClock, observe, tick, type Clock } from '../../src/sync/hlc.ts';
import { maxStamp, merge, sameRecord, stamp, type SyncedRecord, type Table } from '../../src/sync/merge.ts';
import type { CardioEntry, Measurement, PushupEntry, SetEntry, Slot } from '../../src/model.ts';
import type { Decision } from '../../src/engine.ts';

// ---------- record types ----------
export interface TargetInfo {
  exerciseId: string;
  decision: Decision;
  weight: number | null;
  reps: number[];
  estimate: number | null;
  benchmark: number | null;
  gain: number | null;
  reason: string;
  flags: string[];
}

export interface AppSession extends SyncedRecord {
  date: string;
  weekKey: string;
  template: string;
  programId: string | null;
  source: 'app' | 'fitbod' | 'earlier-app';
  status: 'open' | 'finished';
  startedAt: string | null;
  finishedAt: string | null;
  /** Targets fixed when the session was opened, per slot key. */
  targets: Record<string, TargetInfo>;
  /** Custom exercise order (slot keys), or null for the program order. */
  order: string[] | null;
  /** Slot key → exercise swapped in. */
  swaps: Record<string, string>;
  /** Exercises added to this session only. */
  added: Slot[];
  /** Optional knee rating 0–3 for leg workouts. */
  knee: number | null;
  extra: Record<string, unknown>;
}

export type AppSet = SetEntry & SyncedRecord;
export type AppMeasurement = Measurement & SyncedRecord;
export type AppCardio = CardioEntry & SyncedRecord;
export type AppPushup = PushupEntry & SyncedRecord;

// ---------- events ----------
export const bus = new EventTarget();
export const emit = (type: string, detail?: unknown): void => {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
};

// ---------- clock ----------
let clock: Clock | null = null;

export async function deviceId(): Promise<string> {
  let id = await getLocal<string | null>('deviceId', null);
  if (!id) {
    const kind = /iPhone|iPad/.test(navigator.userAgent) ? 'iphone' : /Mac/.test(navigator.userAgent) ? 'mac' : 'web';
    id = `${kind}-${crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36)}`;
    await setLocal('deviceId', id);
  }
  return id;
}

async function getClock(): Promise<Clock> {
  if (!clock) {
    const saved = await getLocal<{ lastMs: number; counter: number } | null>('clock', null);
    clock = { ...makeClock(await deviceId()), ...(saved ?? {}) };
  }
  return clock;
}

export async function observeStamp(s: string): Promise<void> {
  observe(await getClock(), s);
}

// ---------- writes ----------
/**
 * Save a record locally and queue it for upload. With `fields`, only those fields get a new stamp
 * (an edit); without, the whole record is new.
 */
export async function save<T extends SyncedRecord>(table: Table, rec: Omit<T, '_v'> & { _v?: Record<string, string> }, fields?: string[]): Promise<T> {
  const c = await getClock();
  const hlc = tick(c);
  const stamped = stamp(rec as T, hlc, fields ?? (rec._v ? Object.keys(rec).filter((k) => k !== 'id' && k !== '_v') : undefined)) as unknown as T;
  await write([table, 'outbox', 'local'], (tx) => {
    tx.objectStore(table).put(stamped);
    queue(tx, table, stamped.id);
    tx.objectStore('local').put({ key: 'clock', value: { lastMs: c.lastMs, counter: c.counter } });
  });
  emit('change', { table, id: stamped.id });
  return stamped;
}

/** Change some fields of an existing record. */
export async function update<T extends SyncedRecord>(table: Table, id: string, changes: Partial<T>): Promise<T> {
  const cur = await get<T>(table, id);
  if (!cur) throw new Error(`Record ${id} not found.`);
  const next = { ...cur, ...changes } as T;
  return save<T>(table, next, Object.keys(changes));
}

export const remove = (table: Table, id: string): Promise<SyncedRecord> => update(table, id, { deleted: true } as Partial<SyncedRecord>);

function queue(tx: IDBTransaction, t: Table, id: string): void {
  const store = tx.objectStore('outbox');
  const key = `${t}|${id}`;
  const req = store.get(key);
  req.onsuccess = () => store.put({ key, t, id, rev: ((req.result as { rev?: number } | undefined)?.rev ?? 0) + 1 });
}

/** Bulk save with one shared stamp (imports). Records already present are merged, never duplicated. */
export async function saveMany(table: Table, recs: Array<Record<string, unknown> & { id: string }>, onProgress?: (n: number) => void): Promise<number> {
  const c = await getClock();
  let written = 0;
  for (let i = 0; i < recs.length; i += 2000) {
    const chunk = recs.slice(i, i + 2000);
    const hlc = tick(c);
    await write([table, 'outbox', 'local'], (tx) => {
      const store = tx.objectStore(table);
      for (const r of chunk) {
        const incoming = stamp(r, hlc) as SyncedRecord;
        const req = store.get(r.id);
        req.onsuccess = () => {
          if (req.result) return; // already imported: keep the existing record and its edits
          store.put(incoming);
          queue(tx, table, r.id);
          written++;
        };
      }
      tx.objectStore('local').put({ key: 'clock', value: { lastMs: c.lastMs, counter: c.counter } });
    });
    onProgress?.(Math.min(recs.length, i + chunk.length));
  }
  emit('change', { table });
  return written;
}

/** Merge records pulled from the server. Never queues them for upload. Returns how many changed locally. */
export async function applyRemote(items: Array<{ t: Table; r: SyncedRecord }>): Promise<number> {
  let changed = 0;
  const tables = [...new Set(items.map((i) => i.t))];
  if (!tables.length) return 0;
  let latest = '';
  await write(tables, (tx) => {
    for (const { t, r } of items) {
      const store = tx.objectStore(t);
      const req = store.get(r.id);
      req.onsuccess = () => {
        const local = req.result as SyncedRecord | undefined;
        const merged = merge(local, r);
        if (!local || !sameRecord(local, merged)) {
          store.put(merged);
          changed++;
        }
      };
      const s = maxStamp(r);
      if (s > latest) latest = s;
    }
  });
  if (latest) await observeStamp(latest);
  if (changed) emit('change', { remote: true });
  return changed;
}

// ---------- reads ----------
const live = <T extends SyncedRecord>(rows: T[]): T[] => rows.filter((r) => !r.deleted);

export const getSession = (id: string): Promise<AppSession | undefined> => get<AppSession>('sessions', id);
export const sessionsInWeek = async (weekKey: string): Promise<AppSession[]> => live(await byIndex<AppSession>('sessions', 'byWeek', weekKey));
export const allSessions = async (): Promise<AppSession[]> => live(await getAll<AppSession>('sessions'));
export const setsForSession = async (sessionId: string): Promise<AppSet[]> => live(await byIndex<AppSet>('sets', 'bySession', sessionId)).sort((a, b) => a.order - b.order);
export const setsForExercise = async (exerciseId: string): Promise<AppSet[]> => live(await byIndex<AppSet>('sets', 'byExercise', exerciseId));
export const setsBetween = async (from: string, to: string): Promise<AppSet[]> => live(await byIndex<AppSet>('sets', 'byDate', IDBKeyRange.bound(from, to)));
export const cardioBetween = async (from: string, to: string): Promise<AppCardio[]> => live(await byIndex<AppCardio>('cardio', 'byDate', IDBKeyRange.bound(from, to)));
export const measurements = async (): Promise<AppMeasurement[]> => live(await getAll<AppMeasurement>('measurements')).sort((a, b) => a.date.localeCompare(b.date));

export async function latestBodyweight(onOrBefore: string): Promise<number | null> {
  const ms = await byIndex<AppMeasurement>('measurements', 'byDate', IDBKeyRange.upperBound(onOrBefore));
  const withBw = live(ms).filter((m) => m.bodyWeight != null).sort((a, b) => a.date.localeCompare(b.date));
  return withBw.at(-1)?.bodyWeight ?? null;
}

export async function pendingIds(): Promise<Set<string>> {
  const rows = await getAll<{ key: string; id: string }>('outbox');
  return new Set(rows.map((r) => r.id));
}

export { reqResult };
