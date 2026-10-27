// Fitbod "WorkoutExport" importer.
// Facts about the format (verified on the user's export, 27 Oct 2026):
// - one UTC timestamp per workout ("2026-07-26 01:32:06 +0000"), no per-set times;
// - weights stored in kg but entered in lb (every non-zero weight is an exact half-pound) → converted back to lb;
// - identical rows inside one workout are real repeated sets, so IDs use the row's position, never its content;
// - assisted exercises store the assistance in the weight column;
// - cardio and timed holds use Duration(s) with Reps = 0.

import type { CardioEntry, Session, SetEntry } from '../model.ts';
import { readXlsx, sha256Hex } from './xlsx.ts';
import { fitbodExerciseId, slugify } from './catalog.ts';
import { localDate, type ImportIssue, type ImportResult } from './types.ts';

const LB_PER_KG = 1 / 0.45359237;

export const kgToLb = (kg: number): number => Math.round(kg * LB_PER_KG * 2) / 2;

function parseFitbodTime(s: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface FitbodOptions {
  /** Merge workouts that start within 10 minutes of the previous one (one session saved twice). */
  mergeSplitSessions?: boolean;
  /** Fitbod exercise name → current exercise name, for the same movement under a different name. */
  renames?: Record<string, string>;
}

export async function importFitbod(bytes: Uint8Array, fileName: string, opts: FitbodOptions = {}): Promise<ImportResult> {
  const fingerprint = await sha256Hex(bytes);
  const sheets = await readXlsx(bytes);
  const rows = sheets.get('WorkoutExport') ?? [...sheets.values()].find((r) => r.length > 1);
  if (!rows || rows.length < 2) throw new Error('No WorkoutExport sheet with data found.');
  const header = rows[0]!.map((h) => h.trim());
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Missing column "${name}" in the Fitbod export.`);
    return i;
  };
  const C = {
    date: col('Date'),
    exercise: col('Exercise'),
    reps: col('Reps'),
    kg: col('Weight(kg)'),
    dur: col('Duration(s)'),
    dist: col('Distance(m)'),
    incline: col('Incline'),
    resistance: col('Resistance'),
    warm: col('isWarmup'),
    note: col('Note'),
    mult: col('multiplier'),
  };
  const num = (r: string[], i: number): number => {
    const v = Number(r[i] ?? '');
    return Number.isFinite(v) ? v : 0;
  };

  const sessions = new Map<string, Session>();
  const order = new Map<string, number>();
  const sets: SetEntry[] = [];
  const cardio: CardioEntry[] = [];
  const issues: ImportIssue[] = [];
  let blank = 0;
  let warmups = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const dateText = (r[C.date] ?? '').trim();
    const name = (r[C.exercise] ?? '').trim();
    if (!dateText && !name) {
      blank++;
      continue;
    }
    const iso = parseFitbodTime(dateText);
    if (!iso || !name) throw new Error(`Row ${i + 1}: unreadable date or exercise ("${dateText}", "${name}").`);
    const sessionId = `fitbod:${iso}`;
    const date = localDate(iso);
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, { id: sessionId, date, template: 'fitbod', source: 'fitbod', startedAt: iso, extra: {} });
    }
    const pos = order.get(sessionId) ?? 0;
    order.set(sessionId, pos + 1);
    const id = `${sessionId}:${pos}`;
    const reps = num(r, C.reps);
    const dur = num(r, C.dur);
    if (reps <= 0 && dur > 0) {
      const dist = num(r, C.dist);
      cardio.push({
        id,
        date,
        activity: name,
        activityOriginal: name,
        durationMin: Math.round((dur / 60) * 10) / 10,
        distance: dist > 0 ? Math.round(dist) : null,
        distanceUnit: dist > 0 ? 'm' : null,
        intensity: null,
        incline: num(r, C.incline) || null,
        avgHeartRate: null,
        source: 'fitbod',
      });
      continue;
    }
    const kg = num(r, C.kg);
    const warm = num(r, C.warm) === 1;
    if (warm) warmups++;
    const note = (r[C.note] ?? '').trim();
    sets.push({
      id,
      sessionId,
      exerciseId: slugify(name),
      slotKey: null,
      kind: warm ? 'warmup' : 'work',
      weight: kgToLb(kg),
      reps,
      completed: true,
      performedDate: date,
      enteredAt: null,
      order: pos,
      rir: null,
      note: note || null,
      source: 'fitbod',
      original: { exercise: name, weightKg: kg, multiplier: num(r, C.mult), resistance: num(r, C.resistance) || null },
    });
  }
  if (blank) issues.push({ kind: 'blank-row', message: `${blank} blank rows skipped.`, ids: [] });

  // Second pass: assign exercise IDs once we know which exercises ever carried a weight.
  const weighted = new Set<string>();
  for (const s of sets) if (s.weight > 0) weighted.add(String(s.original?.['exercise']));
  for (const s of sets) {
    const name = String(s.original?.['exercise']);
    const renamed = opts.renames?.[name];
    s.exerciseId = renamed ? slugify(renamed) : fitbodExerciseId(name, weighted.has(name));
  }

  // Workouts that start within 10 minutes of the previous one are probably one session split in two.
  const starts = [...sessions.values()].sort((a, b) => (a.startedAt! < b.startedAt! ? -1 : 1));
  const mergedInto = new Map<string, string>();
  for (let i = 1; i < starts.length; i++) {
    const gapMin = (Date.parse(starts[i]!.startedAt!) - Date.parse(starts[i - 1]!.startedAt!)) / 60_000;
    if (gapMin >= 10) continue;
    const prev = starts[i - 1]!.id;
    const target = mergedInto.get(prev) ?? prev;
    if (opts.mergeSplitSessions) {
      mergedInto.set(starts[i]!.id, target);
      issues.push({ kind: 'possible-split-session', message: `Merged two workouts on ${starts[i]!.date} saved ${gapMin.toFixed(1)} minutes apart into one session.`, ids: [target, starts[i]!.id] });
    } else {
      issues.push({
        kind: 'possible-split-session',
        message: `Workouts on ${starts[i]!.date} start ${gapMin.toFixed(1)} minutes apart; probably one session saved twice. Merge or keep?`,
        ids: [prev, starts[i]!.id],
      });
    }
  }
  if (mergedInto.size) {
    // Set IDs keep their original session in the ID, so a merge can be undone; only sessionId and order change.
    const offset = new Map<string, number>();
    for (const s of sets) {
      const to = mergedInto.get(s.sessionId);
      if (!to) continue;
      const base = offset.get(s.sessionId) ?? (order.get(to) ?? 0) + 1000 * (offset.size + 1);
      offset.set(s.sessionId, base);
      s.order += base;
      s.sessionId = to;
    }
    for (const id of mergedInto.keys()) sessions.delete(id);
  }

  return {
    source: 'fitbod',
    fileName,
    fingerprint,
    sessions: [...sessions.values()],
    sets,
    cardio,
    pushups: [],
    measurements: [],
    issues,
    totals: {
      dataRows: sets.length + cardio.length,
      blankRows: blank,
      workouts: sessions.size,
      strengthSets: sets.length,
      warmups,
      timedEntries: cardio.length,
      exercises: new Set([...sets.map((s) => s.exerciseId), ...cardio.map((c) => slugify(c.activity))]).size,
    },
  };
}
