// Importer for the user's earlier workout app export (fit-build-log JSON, July–October 2026).
// - Sets keep their original IDs, so re-importing can never duplicate them.
// - Performed date = the session's date by default (the user often logs after the gym, sometimes days later).
//   `useEnteredDates` lets the user switch individual sessions to the date each set was typed in instead.
// - Assisted exercises: `load` is the assistance.
// - The plan itself (targets, rep ranges) is not in the export; only what was performed.

import type { CardioEntry, Measurement, PushupEntry, Session, SetEntry } from '../model.ts';
import { slugify } from './catalog.ts';
import { sha256Hex } from './xlsx.ts';
import { localDate, type ImportIssue, type ImportResult } from './types.ts';

interface RawSet {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  performedExerciseId: string;
  performedExerciseName: string;
  setNumber: number;
  load: number;
  reps: number;
  rir: number | null;
  completed: boolean;
  createdAt: string;
}
interface RawSession {
  id: string;
  date: string;
  workoutKey: string;
  durationMin: number | null;
  sleepHours: number | null;
  readiness: number | null;
  bodyWeight: number | null;
  notes: string;
  createdAt: string;
  sets: RawSet[];
}
interface RawExport {
  exportedAt: string;
  sessions: RawSession[];
  measurements: Array<Record<string, unknown>>;
  cardio: Array<Record<string, unknown>>;
  pushups: Array<Record<string, unknown>>;
}

/** Timestamps without a zone ("2026-08-28 00:38:07") were written in UTC by the earlier app. */
export const toUtcIso = (s: string): string => {
  const t = s.includes('T') ? s : s.replace(' ', 'T');
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? t : `${t}Z`).toISOString();
};

/** One name per cardio activity; the original spelling is kept on each entry. */
export const ACTIVITY_NAMES: Record<string, string> = {
  StairMaster: 'Stair climber',
  'Stair Master': 'Stair climber',
  'Stair-master': 'Stair climber',
  'Stair climber': 'Stair climber',
  'Treadmill incline': 'Incline treadmill walk',
  // Same activity (confirmed by the user, 27 Oct 2026).
  'Incline walk': 'Incline treadmill walk',
  Row: 'Rowing',
};

export interface EarlierAppOptions {
  /** Session IDs (original) whose sets should take the date they were entered instead of the session date. */
  useEnteredDates?: Set<string>;
  /** Keep one entry when the same push-up entry was saved several times within a minute. */
  dedupePushups?: boolean;
  /** Mark the latest session as open so it can be finished in the new app. */
  openLatestSession?: boolean;
}

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function importEarlierApp(bytes: Uint8Array, fileName: string, opts: EarlierAppOptions = {}): Promise<ImportResult> {
  const fingerprint = await sha256Hex(bytes);
  const raw = JSON.parse(new TextDecoder().decode(bytes)) as RawExport;
  if (!Array.isArray(raw.sessions)) throw new Error('Not an earlier-app export: missing "sessions".');
  const issues: ImportIssue[] = [];
  const sessions: Session[] = [];
  const sets: SetEntry[] = [];
  let swaps = 0;
  const lateSessions: string[] = [];

  for (const s of raw.sessions) {
    const sid = `earlier:${s.id}`;
    sessions.push({
      id: sid,
      date: s.date,
      template: s.workoutKey,
      source: 'earlier-app',
      startedAt: null,
      extra: { durationMin: s.durationMin, sleepHours: s.sleepHours, readiness: s.readiness, bodyWeight: s.bodyWeight, notes: s.notes, createdAt: s.createdAt },
    });
    const ordered = [...s.sets].sort((a, b) => toUtcIso(a.createdAt).localeCompare(toUtcIso(b.createdAt)) || a.setNumber - b.setNumber);
    let late = false;
    ordered.forEach((x, i) => {
      const enteredAt = toUtcIso(x.createdAt);
      const enteredDate = localDate(enteredAt);
      if (enteredDate !== s.date) late = true;
      const swapped = x.exerciseId !== x.performedExerciseId;
      if (swapped) swaps++;
      sets.push({
        id: `earlier:${x.id}`,
        sessionId: sid,
        exerciseId: slugify(x.performedExerciseName),
        slotKey: `${s.workoutKey}/${x.exerciseId}`,
        kind: 'work',
        weight: x.load,
        reps: x.reps,
        completed: x.completed,
        performedDate: opts.useEnteredDates?.has(s.id) ? enteredDate : s.date,
        enteredAt,
        order: i,
        rir: x.rir,
        note: null,
        source: 'earlier-app',
        ...(swapped ? { plannedExerciseName: x.exerciseName } : {}),
        original: { exercise: x.performedExerciseName, exerciseId: x.exerciseId, setNumber: x.setNumber },
      });
    });
    if (late) lateSessions.push(sid);
  }
  if (lateSessions.length)
    issues.push({
      kind: 'late-entry',
      message: `${lateSessions.length} sessions have sets entered on later days. They keep the session date; you can switch any session to entry dates.`,
      ids: lateSessions,
    });
  if (swaps) issues.push({ kind: 'swap', message: `${swaps} sets record a swap (planned exercise ≠ performed exercise). History goes to the performed exercise.`, ids: [] });

  const latest = [...sessions].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (latest) {
    if (opts.openLatestSession) latest.extra['status'] = 'open';
    const count = sets.filter((x) => x.sessionId === latest.id).length;
    issues.push({ kind: 'unfinished-session', message: `${latest.template} on ${latest.date} has ${count} sets logged; it is imported as an open session you can finish.`, ids: [latest.id] });
  }

  const cardio: CardioEntry[] = (raw.cardio ?? []).map((c) => {
    const original = String(c['mode'] ?? '');
    return {
      id: `earlier:${String(c['id'])}`,
      date: String(c['date']),
      activity: ACTIVITY_NAMES[original] ?? original,
      activityOriginal: original,
      durationMin: n(c['durationMin']) ?? 0,
      distance: n(c['distance']),
      // Stair climber distances are steps (e.g. 960); treadmill distances are miles.
      distanceUnit: n(c['distance']) == null ? null : (ACTIVITY_NAMES[original] ?? original) === 'Stair climber' ? 'steps' : 'mi',
      intensity: (c['intensity'] as string) ?? null,
      incline: null,
      avgHeartRate: n(c['avgHeartRate']),
      source: 'earlier-app',
    };
  });
  const renamed = new Set(cardio.filter((c) => c.activity !== c.activityOriginal).map((c) => `${c.activityOriginal} → ${c.activity}`));
  if (renamed.size) issues.push({ kind: 'activity-renamed', message: `Cardio names unified: ${[...renamed].join('; ')}.`, ids: [] });
  if (cardio.some((c) => c.distance != null)) issues.push({ kind: 'assumed-unit', message: 'Cardio distances are miles; stair climber distances are steps.', ids: [] });

  let pushups: PushupEntry[] = (raw.pushups ?? []).map((p) => ({
    id: `earlier:${String(p['id'])}`,
    date: String(p['date']),
    sets: [n(p['set1Reps']), n(p['set2Reps'])].filter((x): x is number => x != null),
    enteredAt: p['createdAt'] ? toUtcIso(String(p['createdAt'])) : null,
    source: 'earlier-app',
  }));
  // Same date, same reps, saved within a minute of each other → probably a double save.
  const byKey = new Map<string, PushupEntry[]>();
  for (const p of pushups) {
    const k = `${p.date}|${p.sets.join(',')}`;
    byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const times = group.map((p) => Date.parse(p.enteredAt ?? '')).sort((a, b) => a - b);
    const close = times.every((t, i) => i === 0 || t - times[i - 1]! <= 60_000);
    if (!close) continue;
    if (opts.dedupePushups) {
      const keep = [...group].sort((a, b) => (a.enteredAt ?? '').localeCompare(b.enteredAt ?? ''))[0]!;
      const drop = new Set(group.filter((p) => p !== keep).map((p) => p.id));
      pushups = pushups.filter((p) => !drop.has(p.id));
      issues.push({ kind: 'possible-duplicate', message: `Kept one of ${group.length} identical push-up entries on ${group[0]!.date} (saved within a minute).`, ids: [...drop] });
    } else {
      issues.push({ kind: 'possible-duplicate', message: `${group.length} identical push-up entries on ${group[0]!.date} saved within a minute. Merge or keep?`, ids: group.map((p) => p.id) });
    }
  }

  const measurements: Measurement[] = (raw.measurements ?? []).map((m) => ({
    id: `earlier:${String(m['id'])}`,
    date: String(m['date']),
    bodyWeight: n(m['bodyWeight']),
    waist: n(m['waist']),
    chest: n(m['chest']),
    shoulders: n(m['shoulders']),
    leftArm: n(m['leftArm']),
    rightArm: n(m['rightArm']),
    leftCalf: n(m['leftCalf']),
    rightCalf: n(m['rightCalf']),
    source: 'earlier-app',
  }));
  if (measurements.some((m) => m.waist != null || m.chest != null)) issues.push({ kind: 'assumed-unit', message: 'Body measurements assumed to be inches.', ids: [] });
  for (const s of raw.sessions) {
    if (s.bodyWeight != null) measurements.push({ id: `earlier:session-bw:${s.id}`, date: s.date, bodyWeight: s.bodyWeight, waist: null, chest: null, shoulders: null, leftArm: null, rightArm: null, leftCalf: null, rightCalf: null, source: 'earlier-app' });
  }

  return {
    source: 'earlier-app',
    fileName,
    fingerprint,
    sessions,
    sets,
    cardio,
    pushups,
    measurements,
    issues,
    totals: {
      sessions: sessions.length,
      sets: sets.length,
      swaps,
      lateSessions: lateSessions.length,
      cardio: cardio.length,
      pushups: pushups.length,
      measurements: raw.measurements?.length ?? 0,
    },
  };
}
