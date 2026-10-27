// Field-by-field merge shared by the app and the sync server.
// Every synced record carries `_v`: for each field, the clock stamp of its last change.
// Merging two copies keeps, for each field, the value with the later stamp, so edits to different fields of the
// same record on two devices both survive, and the later edit wins only on the field both changed.
// Deletes are a field too (`deleted: true`), so a deleted record cannot come back from an older copy.

export const TABLES = ['sessions', 'sets', 'cardio', 'pushups', 'measurements', 'settings'] as const;
export type Table = (typeof TABLES)[number];
export const isTable = (t: string): t is Table => (TABLES as readonly string[]).includes(t);

export interface SyncedRecord {
  id: string;
  _v: Record<string, string>;
  deleted?: boolean;
  [field: string]: unknown;
}

const META = new Set(['id', '_v']);

/** Stamp of one field. `_v['*']` is the stamp shared by every field without its own entry. */
export const fieldStamp = (rec: SyncedRecord, k: string): string => rec._v?.[k] ?? rec._v?.['*'] ?? '';

/**
 * Stamp the given fields with `hlc`. With no field list, the whole record gets one shared stamp
 * (`{'*': hlc}`), which keeps imported history small.
 */
export function stamp<T extends { id: string }>(rec: T, hlc: string, fields?: string[]): T & SyncedRecord {
  if (!fields) return { ...rec, _v: { '*': hlc } } as T & SyncedRecord;
  const _v = { ...((rec as unknown as SyncedRecord)._v ?? {}) };
  for (const k of fields) _v[k] = hlc;
  return { ...rec, _v } as T & SyncedRecord;
}

/** The latest stamp on a record. */
export function maxStamp(rec: SyncedRecord): string {
  let m = '';
  for (const v of Object.values(rec._v ?? {})) if (v > m) m = v;
  return m;
}

/** Field-level last-writer-wins merge. Commutative and idempotent. */
export function merge(a: SyncedRecord | null | undefined, b: SyncedRecord | null | undefined): SyncedRecord {
  if (!a) return b as SyncedRecord;
  if (!b) return a;
  if (a.id !== b.id) throw new Error(`Cannot merge different records (${a.id} vs ${b.id}).`);
  const out: SyncedRecord = { id: a.id, _v: {} };
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => !META.has(k)));
  for (const k of keys) {
    const ta = fieldStamp(a, k);
    const tb = fieldStamp(b, k);
    // Later stamp wins. On an exact tie (should not happen: stamps include the device), prefer the larger JSON so
    // the result is the same whichever side merges.
    const useB = tb > ta || (tb === ta && JSON.stringify(b[k]) > JSON.stringify(a[k]));
    const src = useB ? b : a;
    if (k in src) out[k] = src[k];
    const t = useB ? tb : ta;
    if (t) out._v[k] = t;
  }
  // Compact: when every field shares one stamp, store it once.
  const stamps = new Set(Object.values(out._v));
  if (stamps.size === 1 && Object.keys(out._v).length === keys.size) out._v = { '*': [...stamps][0]! };
  return out;
}

/** True when two copies hold the same values and stamps. */
export function sameRecord(a: SyncedRecord, b: SyncedRecord): boolean {
  return canonical(a) === canonical(b);
}

export function canonical(rec: SyncedRecord): string {
  const sortKeys = (o: unknown): unknown =>
    o && typeof o === 'object' && !Array.isArray(o)
      ? Object.fromEntries(Object.keys(o as object).sort().map((k) => [k, sortKeys((o as Record<string, unknown>)[k])]))
      : Array.isArray(o)
        ? o.map(sortKeys)
        : o;
  return JSON.stringify(sortKeys(rec));
}
