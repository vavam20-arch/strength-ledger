// Connects the progression rules to the data on this device: targets, the miss ladder and the week board.

import { EMPTY_STATE, evaluate, recommend, type ProgressState, type Target } from '../../src/engine.ts';
import type { Exercise, Exposure, Slot } from '../../src/model.ts';
import { buildExercise, slugify } from '../../src/import/catalog.ts';
import { USER_DECISIONS } from '../../src/decisions.ts';
import { BLOCK_1, EXERCISE_NAMES, LEGACY_WORKOUTS, PATTERN, type Program, type WorkoutTemplate } from '../../src/program/block1.ts';
import { getSession, latestBodyweight, sessionsInWeek, setsForExercise, setsForSession, type AppSession, type AppSet, type TargetInfo } from './store.ts';
import { addDays, today, weekKey } from './dates.ts';

export const PROGRAM: Program = BLOCK_1;

export const workoutByKey = (key: string): WorkoutTemplate | undefined => PROGRAM.workouts.find((w) => w.key === key);
export const workoutName = (key: string): string => workoutByKey(key)?.name ?? LEGACY_WORKOUTS[key] ?? key;

export function exerciseName(id: string, fallback?: string): string {
  if (EXERCISE_NAMES[id]) return EXERCISE_NAMES[id]!;
  if (fallback) return fallback;
  const base = id.replace(/^fitbod-/, '');
  return base.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- exercises ----------
const exerciseCache = new Map<string, Exercise>();

export async function exerciseFor(id: string, nameHint?: string): Promise<Exercise> {
  const hit = exerciseCache.get(id);
  if (hit) return hit;
  const sets = await setsForExercise(id);
  const name = exerciseName(id, nameHint ?? (sets.find((s) => s.original?.['exercise'])?.original?.['exercise'] as string | undefined));
  const current = sets.filter((s) => s.source !== 'fitbod' && s.kind !== 'warmup').map((s) => s.weight);
  const all = sets.filter((s) => s.kind !== 'warmup').map((s) => s.weight);
  const ex = { ...buildExercise(name, current.length ? current : all, all.some((w) => w > 0), USER_DECISIONS.confirmedSteps), id };
  exerciseCache.set(id, ex);
  return ex;
}

export const forgetExercise = (id: string): void => {
  exerciseCache.delete(id);
};

// ---------- history → exposures ----------
async function exposuresFor(exerciseId: string, excludeSession?: string): Promise<{ exposures: Exposure[]; sessions: Map<string, AppSession> }> {
  const sets = (await setsForExercise(exerciseId)).filter((s) => s.sessionId !== excludeSession);
  const groups = new Map<string, AppSet[]>();
  for (const s of sets) groups.set(s.sessionId, [...(groups.get(s.sessionId) ?? []), s]);
  const sessions = new Map<string, AppSession>();
  await Promise.all([...groups.keys()].map(async (id) => {
    const sess = await getSession(id);
    if (sess) sessions.set(id, sess);
  }));
  const exposures: Exposure[] = [...groups.entries()].map(([sessionId, list]) => ({
    sessionId,
    exerciseId,
    date: list.reduce((m, s) => (s.performedDate < m ? s.performedDate : m), list[0]!.performedDate),
    sets: list.sort((a, b) => a.order - b.order),
    planned: sessions.get(sessionId)?.source === 'app',
  }));
  exposures.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
  return { exposures, sessions };
}

/** Replays this app's own planned sessions to find the last target and how many times in a row it was missed. */
async function progressState(exerciseId: string, slot: Slot, exposures: Exposure[], sessions: Map<string, AppSession>): Promise<ProgressState> {
  let state: ProgressState = EMPTY_STATE;
  const ex = await exerciseFor(exerciseId);
  for (const e of exposures) {
    const sess = sessions.get(e.sessionId);
    const t = sess?.source === 'app' ? Object.values(sess.targets ?? {}).find((x) => x.exerciseId === exerciseId && x.weight != null) : undefined;
    if (!t) {
      state = EMPTY_STATE; // an unplanned session (imported history) resets the ladder
      continue;
    }
    const target: Target = { weight: t.weight!, reps: t.reps };
    const outcome = evaluate(target, ex, e, { ...slot, sets: t.reps.length }, await latestBodyweight(e.date));
    state = outcome.met ? { lastTarget: target, misses: 0 } : { lastTarget: target, misses: t.decision === 'step-back' ? 1 : state.misses + 1 };
  }
  return state;
}

/** The target for one slot on a given date, from everything logged before this session. */
export async function targetFor(slot: Slot, date: string, sessionId?: string): Promise<TargetInfo> {
  const ex = await exerciseFor(slot.exerciseId);
  const { exposures, sessions } = await exposuresFor(slot.exerciseId, sessionId);
  const history = exposures.filter((e) => e.date <= date);
  const state = await progressState(slot.exerciseId, slot, history, sessions);
  const bodyweight = await latestBodyweight(date);
  const rec = recommend({ slot, exercise: ex, history, state, asOf: date, bodyweight });
  return {
    exerciseId: slot.exerciseId,
    decision: rec.decision,
    weight: rec.target?.weight ?? null,
    reps: rec.target?.reps ?? Array.from({ length: slot.sets }, () => slot.repMin),
    estimate: rec.targetEstimate,
    benchmark: rec.benchmark,
    gain: rec.gainPct,
    reason: rec.reason,
    flags: rec.flags,
  };
}

// ---------- sessions ----------
/** The slots of a session, in its current order, with swaps applied. */
export function sessionSlots(sess: AppSession): Slot[] {
  const tmpl = workoutByKey(sess.template);
  const base: Slot[] = [...(tmpl?.slots ?? []), ...(sess.added ?? [])].map((s) => ({ ...s, exerciseId: sess.swaps?.[s.key] ?? s.exerciseId }));
  if (!sess.order?.length) return base;
  const byKey = new Map(base.map((s) => [s.key, s]));
  const ordered = sess.order.map((k) => byKey.get(k)).filter((s): s is Slot => !!s);
  return [...ordered, ...base.filter((s) => !sess.order!.includes(s.key))];
}

/** Slots for an imported session that has no template (e.g. the open Upper B): one per exercise logged. */
export function slotsFromSets(sets: AppSet[]): Slot[] {
  const seen = new Map<string, Slot>();
  for (const s of sets) {
    const key = s.slotKey ?? s.exerciseId;
    if (!seen.has(key)) seen.set(key, { key, exerciseId: s.exerciseId, role: 'secondary', sets: 0, repMin: 8, repMax: 12 });
  }
  return [...seen.values()];
}

// ---------- week board ----------
export interface WeekItem {
  template: WorkoutTemplate;
  session: AppSession | null;
  planned: number;
  done: number;
  status: 'not-started' | 'in-progress' | 'done';
}

export async function weekBoard(week: string = weekKey(today())): Promise<{ week: string; items: WeekItem[]; suggestion: string | null }> {
  const sessions = (await sessionsInWeek(week)).filter((s) => s.programId === PROGRAM.id);
  const items: WeekItem[] = [];
  for (const tmpl of PROGRAM.workouts) {
    const session = sessions.filter((s) => s.template === tmpl.key).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
    const planned = tmpl.slots.reduce((n, s) => n + s.sets, 0);
    let done = 0;
    if (session) {
      const sets = await setsForSession(session.id);
      for (const slot of sessionSlots(session)) {
        const n = sets.filter((x) => x.slotKey === slot.key && x.kind === 'work' && x.completed).length;
        done += Math.min(n, slot.sets);
      }
    }
    const status = !session || done === 0 ? (session?.status === 'finished' ? 'done' : 'not-started') : done >= planned || session.status === 'finished' ? 'done' : 'in-progress';
    items.push({ template: tmpl, session, planned, done, status });
  }
  // Suggest the next workout in order that is not done and does not repeat yesterday's movement pattern.
  const yesterday = addDays(today(), -1);
  const recent = (await sessionsInWeek(weekKey(yesterday))).filter((s) => s.date === yesterday);
  // Sessions from the previous plan count too: an upper day covers push and pull, a lower day covers legs.
  const covers: Record<string, string[] | undefined> = { upper: ['push', 'pull'], lower: ['legs'] };
  const avoid = new Set<string | undefined>(recent.flatMap((s) => {
    const p = PATTERN[s.template];
    return p ? covers[p] ?? [p] : [];
  }));
  const open = PROGRAM.suggestedOrder.map((k) => items.find((i) => i.template.key === k)!).filter((i) => i.status !== 'done');
  const inProgress = open.find((i) => i.status === 'in-progress' && i.session?.date === today());
  const pick = inProgress ?? open.find((i) => !avoid.has(PATTERN[i.template.key])) ?? open[0];
  return { week, items, suggestion: pick?.template.key ?? null };
}

export const programExerciseIds = (): string[] => [...new Set(PROGRAM.workouts.flatMap((w) => w.slots.map((s) => s.exerciseId)))];
export { slugify };
