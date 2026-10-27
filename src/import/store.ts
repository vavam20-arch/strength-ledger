// In-memory record store with idempotent merge. The app will back this with IndexedDB + sync;
// the merge rule (records keyed by stable IDs, never by content) is the same.

import type { CardioEntry, Exposure, Measurement, PushupEntry, Session, SetEntry } from '../model.ts';
import type { ImportResult } from './types.ts';

export interface Store {
  sessions: Map<string, Session>;
  sets: Map<string, SetEntry>;
  cardio: Map<string, CardioEntry>;
  pushups: Map<string, PushupEntry>;
  measurements: Map<string, Measurement>;
  imports: Map<string, { fileName: string; source: string }>;
}

export const emptyStore = (): Store => ({
  sessions: new Map(),
  sets: new Map(),
  cardio: new Map(),
  pushups: new Map(),
  measurements: new Map(),
  imports: new Map(),
});

export interface MergeReport {
  added: Record<string, number>;
  alreadyPresent: Record<string, number>;
}

/** Adds records whose IDs are new; never overwrites or duplicates existing records. */
export function mergeImport(store: Store, r: ImportResult): MergeReport {
  const added: Record<string, number> = {};
  const already: Record<string, number> = {};
  const put = <T extends { id: string }>(name: string, map: Map<string, T>, items: T[]): void => {
    added[name] = 0;
    already[name] = 0;
    for (const it of items) {
      if (map.has(it.id)) already[name]!++;
      else {
        map.set(it.id, it);
        added[name]!++;
      }
    }
  };
  put('sessions', store.sessions, r.sessions);
  put('sets', store.sets, r.sets);
  put('cardio', store.cardio, r.cardio);
  put('pushups', store.pushups, r.pushups);
  put('measurements', store.measurements, r.measurements);
  store.imports.set(r.fingerprint, { fileName: r.fileName, source: r.source });
  return { added, alreadyPresent: already };
}

/** Exposures (one exercise in one session), oldest first, grouped by exercise ID. */
export function exposuresByExercise(store: Store): Map<string, Exposure[]> {
  const groups = new Map<string, Exposure>();
  for (const s of store.sets.values()) {
    const k = `${s.sessionId}|${s.exerciseId}`;
    let g = groups.get(k);
    if (!g) {
      g = { sessionId: s.sessionId, date: s.performedDate, exerciseId: s.exerciseId, sets: [], planned: s.source === 'app' };
      groups.set(k, g);
    }
    g.sets.push(s);
    if (s.performedDate < g.date) g.date = s.performedDate;
  }
  const out = new Map<string, Exposure[]>();
  for (const g of groups.values()) {
    g.sets.sort((a, b) => a.order - b.order);
    out.set(g.exerciseId, [...(out.get(g.exerciseId) ?? []), g]);
  }
  for (const list of out.values()) list.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
  return out;
}

/** Most recent bodyweight on or before a date. */
export function bodyweightOn(store: Store, date: string): number | null {
  let best: Measurement | null = null;
  for (const m of store.measurements.values()) {
    if (m.bodyWeight == null || m.date > date) continue;
    if (!best || m.date > best.date) best = m;
  }
  return best?.bodyWeight ?? null;
}
