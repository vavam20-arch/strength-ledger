// IndexedDB storage. Every write is committed to the device before the UI reports it as saved.

import type { Table } from '../../src/sync/merge.ts';

export const DB_NAME = 'strength-ledger';
const VERSION = 1;

/** Synced tables, plus local-only stores: the upload queue and device settings. */
export type StoreName = Table | 'outbox' | 'local';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
      sessions.createIndex('byWeek', 'weekKey');
      sessions.createIndex('byDate', 'date');
      const sets = db.createObjectStore('sets', { keyPath: 'id' });
      sets.createIndex('bySession', 'sessionId');
      sets.createIndex('byExercise', 'exerciseId');
      sets.createIndex('byDate', 'performedDate');
      db.createObjectStore('cardio', { keyPath: 'id' }).createIndex('byDate', 'date');
      db.createObjectStore('pushups', { keyPath: 'id' }).createIndex('byDate', 'date');
      db.createObjectStore('measurements', { keyPath: 'id' }).createIndex('byDate', 'date');
      db.createObjectStore('settings', { keyPath: 'id' });
      db.createObjectStore('outbox', { keyPath: 'key' });
      db.createObjectStore('local', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Close other Strength Ledger windows and try again.'));
  });
  return dbPromise;
}

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });

const result = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return result(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return result(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function byIndex<T>(store: StoreName, index: string, query: IDBValidKey | IDBKeyRange): Promise<T[]> {
  const db = await openDb();
  return result(db.transaction(store).objectStore(store).index(index).getAll(query)) as Promise<T[]>;
}

export async function count(store: StoreName): Promise<number> {
  const db = await openDb();
  return result(db.transaction(store).objectStore(store).count());
}

/** Run a read-write transaction over several stores; resolves only after it has been committed. */
export async function write(stores: StoreName[], fn: (tx: IDBTransaction) => void): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(stores, 'readwrite', { durability: 'strict' } as IDBTransactionOptions);
  fn(tx);
  await done(tx);
}

/** Read inside a read-write transaction (for read-modify-write). */
export const reqResult = result;

export async function getLocal<T>(key: string, fallback: T): Promise<T> {
  const row = await get<{ key: string; value: T }>('local', key);
  return row ? row.value : fallback;
}

export async function setLocal(key: string, value: unknown): Promise<void> {
  await write(['local'], (tx) => tx.objectStore('local').put({ key, value }));
}
