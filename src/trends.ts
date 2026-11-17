// Strength trends by muscle group.
//
// Each exercise's best set in a time window is scored with the same estimate the coach uses:
// weight × (1 + reps ÷ 30). A muscle group's index starts at 100 and moves each window by the
// typical (median) change of the exercises that were done in both that window and a recent earlier
// one. Chaining like this lets the index run across exercise changes (Fitbod machines, then the
// current gym) without mixing the absolute weights of different machines.

import { MUSCLES } from './import/catalog.ts';
import { estimate } from './engine.ts';

export type Group = 'Chest' | 'Back' | 'Delts' | 'Arms' | 'Legs';
export const GROUPS: Group[] = ['Chest', 'Back', 'Delts', 'Arms', 'Legs'];
/** The user's priorities (27 Oct 2026). */
export const PRIORITY: Group[] = ['Back', 'Delts', 'Chest'];

const GROUP_OF: Record<string, Group | null> = {
  Chest: 'Chest',
  Back: 'Back',
  Traps: 'Back',
  'Lower back': 'Back',
  'Front delts': 'Delts',
  'Side delts': 'Delts',
  'Rear delts': 'Delts',
  Biceps: 'Arms',
  Triceps: 'Arms',
  Quads: 'Legs',
  Hamstrings: 'Legs',
  Glutes: 'Legs',
  Adductors: 'Legs',
  Calves: 'Legs',
  Abs: null,
};

// Name patterns for exercises outside the current gym's catalog (mostly Fitbod history). Order matters.
const RULES: Array<[RegExp, string]> = [
  [/leg curl|hamstring|romanian|deadlift|good morning|nordic/, 'Hamstrings'],
  [/calf/, 'Calves'],
  [/adductor/, 'Adductors'],
  [/glute|kickback|hip thrust|abductor|bridge/, 'Glutes'],
  [/squat|leg press|leg extension|lunge|step.?up/, 'Quads'],
  [/crunch|sit.?up|\babs?\b|leg raise|knee raise|oblique|side bend|rollout|plank|wood.?chop/, 'Abs'],
  [/tricep|skull|pushdown|push.?down|\bdips?\b|kickback/, 'Triceps'],
  [/curl/, 'Biceps'],
  [/shrug/, 'Traps'],
  [/rear delt|reverse fly|face pull/, 'Rear delts'],
  [/lateral raise|upright row|side raise/, 'Side delts'],
  [/front raise|shoulder press|overhead press|military|arnold/, 'Front delts'],
  [/back extension|hyperextension/, 'Lower back'],
  [/bench|chest press|\bfly\b|flye|crossover|push.?up|\bpec\b/, 'Chest'],
  [/pulldown|pull.?up|chin.?up|\brow\b|pullover/, 'Back'],
];

/** Primary muscle for an exercise name, or null if unknown. */
export function primaryMuscle(name: string): string | null {
  const known = MUSCLES[name];
  if (known) return Object.entries(known).find(([, v]) => v === 1)?.[0] ?? null;
  const n = name.toLowerCase();
  for (const [re, muscle] of RULES) if (re.test(n)) return muscle;
  return null;
}

export const groupOf = (name: string): Group | null => {
  const m = primaryMuscle(name);
  return m ? GROUP_OF[m] ?? null : null;
};

export interface TrendSet {
  exerciseId: string;
  name: string;
  date: string; // YYYY-MM-DD
  weight: number;
  reps: number;
}

export interface TrendPoint {
  start: string;
  end: string;
  index: number;
  /** Exercises that moved the index in this window (0 = carried forward, no comparable sessions). */
  basis: number;
}

export interface ExerciseTrend {
  exerciseId: string;
  name: string;
  sets: number;
  first: number;
  firstDate: string;
  last: number;
  lastDate: string;
  firstSet: { weight: number; reps: number };
  lastSet: { weight: number; reps: number };
  changePct: number;
}

export interface GroupTrend {
  group: Group;
  points: TrendPoint[];
  changePct: number | null;
  sets: number;
  exercises: ExerciseTrend[];
}

/** Sets that can be scored: loaded (not assisted or bodyweight-only) and 1–20 reps. */
export const scorable = (s: TrendSet): boolean => s.weight > 0 && s.reps >= 1 && s.reps <= 20 && !/assist/i.test(s.name);

/** Window boundaries, oldest first, the last ending on `end`. */
export function windows(end: string, days: number, count: number, addDays: (d: string, n: number) => string): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  for (let i = count - 1; i >= 0; i--) {
    const e = addDays(end, -i * days);
    out.push({ start: addDays(e, -(days - 1)), end: e });
  }
  return out;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

interface BestTable {
  best: Map<string, Map<number, { est: number; weight: number; reps: number; date: string }>>;
  meta: Map<string, { name: string; sets: number }>;
}

/** Each exercise's best set (by estimate) in each window. */
function bestTable(sets: TrendSet[], wins: Array<{ start: string; end: string }>): BestTable {
  const inRange = sets.filter((s) => scorable(s) && s.date >= wins[0]!.start && s.date <= wins.at(-1)!.end);
  const winOf = (d: string): number => wins.findIndex((w) => d >= w.start && d <= w.end);
  const best: BestTable['best'] = new Map();
  const meta: BestTable['meta'] = new Map();
  for (const s of inRange) {
    const w = winOf(s.date);
    if (w < 0) continue;
    const e = estimate(s.weight, s.reps);
    const b = best.get(s.exerciseId) ?? new Map();
    if ((b.get(w)?.est ?? 0) < e) b.set(w, { est: e, weight: s.weight, reps: s.reps, date: s.date });
    best.set(s.exerciseId, b);
    const m = meta.get(s.exerciseId) ?? { name: s.name, sets: 0 };
    m.sets++;
    meta.set(s.exerciseId, m);
  }
  return { best, meta };
}

/** Chain the exercises' window-to-window changes into one index starting at 100. */
function indexFor(ids: string[], t: BestTable, wins: Array<{ start: string; end: string }>, opts: { lookback?: number; maxStep?: number }) {
  const lookback = opts.lookback ?? 3; // compare with the exercise's best from up to 3 windows back
  const maxStep = opts.maxStep ?? 0.15; // one exercise can move a window by at most ±15%
  const points: TrendPoint[] = [];
  let index = 100;
  for (let w = 0; w < wins.length; w++) {
    const steps: number[] = [];
    for (const id of ids) {
      const b = t.best.get(id)!;
      const now = b.get(w);
      if (now == null) continue;
      for (let k = w - 1; k >= Math.max(0, w - lookback); k--) {
        const prev = b.get(k);
        if (prev != null) {
          steps.push(Math.max(-maxStep, Math.min(maxStep, Math.log(now.est / prev.est))));
          break;
        }
      }
    }
    if (steps.length) index *= Math.exp(median(steps));
    points.push({ start: wins[w]!.start, end: wins[w]!.end, index: Math.round(index * 10) / 10, basis: steps.length });
  }
  const exercises: ExerciseTrend[] = ids
    .map((id) => {
      const b = t.best.get(id)!;
      const ws = [...b.keys()].sort((a, c) => a - c);
      const f = b.get(ws[0]!)!;
      const l = b.get(ws.at(-1)!)!;
      return {
        exerciseId: id,
        name: t.meta.get(id)!.name,
        sets: t.meta.get(id)!.sets,
        first: Math.round(f.est * 10) / 10,
        firstDate: f.date,
        firstSet: { weight: f.weight, reps: f.reps },
        last: Math.round(l.est * 10) / 10,
        lastDate: l.date,
        lastSet: { weight: l.weight, reps: l.reps },
        changePct: Math.round((l.est / f.est - 1) * 1000) / 10,
      };
    })
    .sort((a, c) => c.lastDate.localeCompare(a.lastDate) || c.sets - a.sets);
  const any = points.some((p) => p.basis > 0);
  return {
    points,
    changePct: any ? Math.round((points.at(-1)!.index / 100 - 1) * 1000) / 10 : null,
    sets: ids.reduce((n, id) => n + t.meta.get(id)!.sets, 0),
    exercises,
  };
}

export function strengthTrends(
  sets: TrendSet[],
  wins: Array<{ start: string; end: string }>,
  opts: { lookback?: number; maxStep?: number } = {},
): GroupTrend[] {
  const t = bestTable(sets, wins);
  return GROUPS.map((group) => ({ group, ...indexFor([...t.meta.keys()].filter((id) => groupOf(t.meta.get(id)!.name) === group), t, wins, opts) }));
}

// ---------- single muscles ----------

/** The muscles shown on their own, by group, with plain names. */
export const GROUP_MUSCLES: Record<Group, string[]> = {
  Chest: ['Chest'],
  Back: ['Back', 'Traps', 'Lower back'],
  Delts: ['Front delts', 'Side delts', 'Rear delts'],
  Arms: ['Biceps', 'Triceps'],
  Legs: ['Quads', 'Hamstrings', 'Glutes', 'Adductors', 'Calves'],
};
export const MUSCLE_LABEL: Record<string, string> = { Back: 'Lats & upper back' };
export const muscleLabel = (m: string): string => MUSCLE_LABEL[m] ?? m;

export interface MuscleTrend extends Omit<GroupTrend, 'group'> {
  muscle: string;
  group: Group;
}

/** Strength index per muscle, from the exercises whose main muscle it is. */
export function muscleTrends(sets: TrendSet[], wins: Array<{ start: string; end: string }>, opts: { lookback?: number; maxStep?: number } = {}): MuscleTrend[] {
  const t = bestTable(sets, wins);
  return GROUPS.flatMap((group) =>
    GROUP_MUSCLES[group].map((muscle) => ({
      muscle,
      group,
      ...indexFor([...t.meta.keys()].filter((id) => primaryMuscle(t.meta.get(id)!.name) === muscle), t, wins, opts),
    })),
  );
}

/** How much one set of an exercise counts for a muscle: 1 for its main muscle, 0.5 for a helper. */
export function muscleShare(name: string, muscle: string): number {
  const known = MUSCLES[name];
  if (known) return known[muscle] ?? 0;
  return primaryMuscle(name) === muscle ? 1 : 0;
}

export interface VolumeSet {
  name: string;
  date: string;
}
export interface VolumePoint {
  start: string;
  end: string;
  /** Hard sets per week in this window (helper muscles count half). */
  perWeek: number;
  /** The exercises that contributed, most sets first. */
  from: Array<{ name: string; sets: number }>;
}

/** Weekly sets for a muscle in each window: every completed work set, assisted and bodyweight ones included. */
export function weeklyVolume(sets: VolumeSet[], wins: Array<{ start: string; end: string }>, muscle: string, daysPerWin: number): VolumePoint[] {
  return wins.map((w) => {
    const by = new Map<string, number>();
    for (const s of sets) {
      if (s.date < w.start || s.date > w.end) continue;
      const k = muscleShare(s.name, muscle);
      if (k > 0) by.set(s.name, (by.get(s.name) ?? 0) + k);
    }
    const total = [...by.values()].reduce((a, b) => a + b, 0);
    return {
      start: w.start,
      end: w.end,
      perWeek: Math.round((total / (daysPerWin / 7)) * 10) / 10,
      from: [...by.entries()].map(([name, n]) => ({ name, sets: n })).sort((a, b) => b.sets - a.sets),
    };
  });
}
