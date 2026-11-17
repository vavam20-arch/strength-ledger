// The program library, the deload week, and the block schedule (4-week blocks, switchable).
//
// Programs share exercises, and targets belong to the exercise on its equipment, never to a program:
// moving from 8–12 reps in one program to 5–8 in another converts through estimated strength.

import { MUSCLES } from '../import/catalog.ts';
import { BLOCK_1, workout, type Program, type WorkoutTemplate } from './block1.ts';

// ---------- programs ----------

/** Upper / Lower, strength-focused: two heavy days (5–8 reps), two volume days, two optional pump days. */
export const UPPER_LOWER: Program = {
  id: 'ul-strength',
  name: 'Upper / Lower Strength',
  description: 'Getting stronger: 4 workouts with the big lifts at 5–8 reps, plus 2 optional pump days for delts, arms and back.',
  weekStartsOn: 'monday',
  blockWeeks: 4,
  deloadWeek: 0,
  suggestedOrder: ['ul-upper-h', 'ul-lower-h', 'ul-pump-arms', 'ul-upper-v', 'ul-lower-v', 'ul-pump-back'],
  workouts: [
    workout('ul-upper-h', 'Upper Heavy', 'Presses and rows, 5–8 reps', [
      ['Matrix Plate-Loaded Bench Press — Lying', 'anchor', 3, 5, 8],
      ['Plate-Loaded Incline Chest-Supported Row', 'anchor', 3, 5, 8],
      ['Barbell Shoulder Press', 'secondary', 3, 5, 8],
      ['Lat Pulldown', 'secondary', 3, 6, 10],
      ['Seated Lateral Raise Machine', 'isolation', 3, 12, 20],
    ], { plate: 'push' }),
    workout('ul-lower-h', 'Lower Heavy', 'Squat and hinge, 5–8 reps', [
      ['Barbell Back Squat', 'anchor', 3, 5, 8],
      ['Romanian Deadlift', 'anchor', 3, 6, 10],
      ['Lying Hamstrings Curl', 'isolation', 2, 8, 12],
      ['Calf Press', 'isolation', 3, 8, 12],
      ['Ab Rollout', 'bodyweight', 2, 8, 15],
    ], { plate: 'legs' }),
    workout('ul-upper-v', 'Upper Volume', 'Back first, then chest and delts', [
      ['Plate-Loaded Chest-Supported T-Bar Row', 'anchor', 3, 8, 12],
      ['Incline Dumbbell Bench Press', 'secondary', 3, 8, 12],
      ['Assisted Pull Up', 'secondary', 3, 6, 10],
      ['Machine Fly', 'isolation', 2, 10, 15],
      ['Dumbbell Lateral Raise', 'isolation', 3, 12, 20],
      ['Machine Rear Delt Fly', 'isolation', 2, 12, 20],
    ], { plate: 'pull' }),
    workout('ul-lower-v', 'Lower Volume', 'Quads and glutes, knee-friendly', [
      ['Matrix Plate-Loaded Squat/Lunge', 'anchor', 3, 8, 12],
      ['45° Back Extension', 'secondary', 3, 10, 15],
      ['Hip Adductor Machine', 'isolation', 2, 10, 15],
      ['Leg Extension', 'isolation', 2, 12, 20],
      ['Life Fitness Plate-Loaded Seated Calf Raise', 'isolation', 3, 12, 20],
      ['Vertical Leg Raise', 'bodyweight', 2, 10, 15],
    ], { plate: 'legs' }),
    workout('ul-pump-arms', 'Delts & Arms', 'Optional pump day', [
      ['Cable or Dumbbell Lateral Raise', 'isolation', 3, 12, 20],
      ['Machine Rear Delt Fly', 'isolation', 3, 12, 20],
      ['Biceps Curl Machine', 'isolation', 3, 10, 15],
      ['Triceps Extension Machine', 'isolation', 3, 10, 15],
      ['Hammer Curl', 'isolation', 2, 10, 15],
    ], { plate: 'push', optional: true }),
    workout('ul-pump-back', 'Back Pump', 'Optional pump day', [
      ['Lat Pulldown', 'secondary', 3, 10, 15],
      ['Cable Row', 'secondary', 3, 10, 15],
      ['Dumbbell Row', 'isolation', 2, 10, 15],
      ['Low Back Extension Machine', 'isolation', 2, 10, 15],
      ['Barbell Shrug', 'isolation', 2, 10, 15],
    ], { plate: 'pull', optional: true }),
  ],
};

/** Arnold split ×2: chest + back, shoulders + arms, legs. The most work for chest, back and delts. */
export const ARNOLD: Program = {
  id: 'arnold-2x',
  name: 'Arnold Split × 2',
  description: 'Size where you want it most: chest with back, shoulders with arms, then legs, twice a week. Chest and back pair well as supersets.',
  weekStartsOn: 'monday',
  blockWeeks: 4,
  deloadWeek: 0,
  suggestedOrder: ['arn-cb-a', 'arn-legs-a', 'arn-sa-a', 'arn-cb-b', 'arn-legs-b', 'arn-sa-b'],
  workouts: [
    workout('arn-cb-a', 'Chest & Back A', 'Press first', [
      ['Seated Chest Press — Weight Stack', 'anchor', 3, 6, 10],
      ['Lat Pulldown', 'anchor', 3, 6, 10],
      ['Incline Dumbbell Bench Press', 'secondary', 3, 8, 12],
      ['Plate-Loaded Incline Chest-Supported Row', 'secondary', 3, 8, 12],
      ['Machine Fly', 'isolation', 2, 10, 15],
    ], { plate: 'push' }),
    workout('arn-sa-a', 'Shoulders & Arms A', 'Overhead press and side delts', [
      ['Barbell Shoulder Press', 'anchor', 3, 6, 10],
      ['Seated Lateral Raise Machine', 'isolation', 4, 12, 20],
      ['Machine Rear Delt Fly', 'isolation', 3, 12, 20],
      ['Biceps Curl Machine', 'isolation', 2, 10, 15],
      ['Triceps Extension Machine', 'isolation', 2, 10, 15],
    ], { plate: 'push' }),
    workout('arn-legs-a', 'Legs A', 'Quads, knee-aware', [
      ['Leg Press', 'anchor', 3, 8, 12],
      ['Lying Hamstrings Curl', 'secondary', 3, 10, 15],
      ['Hip Adductor Machine', 'isolation', 2, 12, 15],
      ['Leg Extension', 'isolation', 2, 12, 20],
      ['Calf Press', 'isolation', 3, 10, 15],
    ], { plate: 'legs' }),
    workout('arn-cb-b', 'Chest & Back B', 'Row first', [
      ['Plate-Loaded Chest-Supported T-Bar Row', 'anchor', 3, 6, 10],
      ['Matrix Plate-Loaded Bench Press — Lying', 'anchor', 3, 6, 10],
      ['Assisted Pull Up', 'secondary', 3, 6, 10],
      ['Standing Low-to-High Cable Chest Press', 'isolation', 2, 10, 15],
      ['Dumbbell Row', 'secondary', 2, 8, 12],
    ], { plate: 'pull' }),
    workout('arn-sa-b', 'Shoulders & Arms B', 'Delts all round', [
      ['Seated Shoulder Press Machine', 'anchor', 3, 8, 12],
      ['Dumbbell Lateral Raise', 'isolation', 4, 12, 20],
      ['Cable Face Pull', 'isolation', 2, 12, 20],
      ['Preacher Curl Machine', 'isolation', 2, 10, 15],
      ['Overhead Cable Tricep Extension', 'isolation', 2, 10, 15],
    ], { plate: 'pull' }),
    workout('arn-legs-b', 'Legs B', 'Hinge and glutes', [
      ['Romanian Deadlift', 'anchor', 3, 6, 10],
      ['Matrix Plate-Loaded Squat/Lunge', 'secondary', 3, 8, 12],
      ['45° Back Extension', 'isolation', 2, 10, 15],
      ['Freemotion Selectorized Glute Kickback', 'isolation', 2, 12, 15],
      ['Life Fitness Plate-Loaded Seated Calf Raise', 'isolation', 3, 12, 20],
      ['Vertical Leg Raise', 'bodyweight', 2, 10, 15],
    ], { plate: 'legs' }),
  ],
};

/** Full body ×3: for busy, travel or easy months. */
export const FULL_BODY: Program = {
  id: 'full-body-3',
  name: 'Full Body × 3',
  description: 'For busy or travel months: 3 workouts, each covering the whole body. Pair with cardio on the other days.',
  weekStartsOn: 'monday',
  blockWeeks: 4,
  deloadWeek: 0,
  suggestedOrder: ['fb-a', 'fb-b', 'fb-c'],
  workouts: [
    workout('fb-a', 'Full Body A', 'Chest press lead', [
      ['Seated Chest Press — Weight Stack', 'anchor', 3, 8, 12],
      ['Leg Press', 'anchor', 3, 8, 12],
      ['Lat Pulldown', 'secondary', 3, 8, 12],
      ['Dumbbell Lateral Raise', 'isolation', 3, 12, 20],
      ['Lying Hamstrings Curl', 'isolation', 2, 10, 15],
    ], { plate: 'push' }),
    workout('fb-b', 'Full Body B', 'Row lead', [
      ['Plate-Loaded Chest-Supported T-Bar Row', 'anchor', 3, 8, 12],
      ['Romanian Deadlift', 'anchor', 3, 6, 10],
      ['Incline Dumbbell Bench Press', 'secondary', 3, 8, 12],
      ['Machine Rear Delt Fly', 'isolation', 2, 12, 20],
      ['Triceps Extension Machine', 'isolation', 2, 10, 15],
    ], { plate: 'pull' }),
    workout('fb-c', 'Full Body C', 'Squat lead', [
      ['Dumbbell Goblet Squat', 'anchor', 3, 8, 12],
      ['Barbell Shoulder Press', 'secondary', 3, 6, 10],
      ['Plate-Loaded Incline Chest-Supported Row', 'secondary', 3, 8, 12],
      ['Seated Lateral Raise Machine', 'isolation', 3, 12, 20],
      ['Biceps Curl Machine', 'isolation', 2, 10, 15],
    ], { plate: 'legs' }),
  ],
};

export const PROGRAMS: Program[] = [BLOCK_1, UPPER_LOWER, ARNOLD, FULL_BODY];
export const DELOAD_ID = 'deload';
const DL = 'dl-';

/**
 * A deload week built from a program: the same exercises, about 60% of the sets (never fewer than 1),
 * optional days left out. Targets are made about 10% lighter (see the app's coach).
 */
export function deloadOf(base: Program): Program {
  return {
    id: DELOAD_ID,
    name: `Deload week`,
    description: `A lighter week of ${base.name}: the same exercises, fewer sets and about 10% lighter, so joints and recovery catch up before the next block.`,
    weekStartsOn: 'monday',
    blockWeeks: 1,
    deloadWeek: 0,
    suggestedOrder: base.suggestedOrder.filter((k) => !base.workouts.find((w) => w.key === k)?.optional).map((k) => DL + k),
    workouts: base.workouts
      .filter((w) => !w.optional)
      .map((w) => ({
        ...w,
        key: DL + w.key,
        name: w.name,
        focus: `Deload · ${w.focus}`,
        slots: w.slots.map((s) => ({ ...s, key: DL + s.key, sets: Math.max(1, Math.round(s.sets * 0.6)) })),
      })),
  };
}

export const isDeloadKey = (key: string): boolean => key.startsWith(DL);
export const baseKey = (key: string): string => (isDeloadKey(key) ? key.slice(DL.length) : key);

/** Find a workout by key in any program, including deload versions. */
export function findTemplate(key: string): WorkoutTemplate | undefined {
  const base = baseKey(key);
  for (const p of PROGRAMS) {
    const w = p.workouts.find((x) => x.key === base);
    if (w) return isDeloadKey(key) ? deloadOf(p).workouts.find((x) => x.key === key) : w;
  }
  return undefined;
}

export const programById = (id: string): Program | undefined => PROGRAMS.find((p) => p.id === id);

/** Every exercise used by any program. */
export const allProgramExerciseIds = (): string[] => [...new Set(PROGRAMS.flatMap((p) => p.workouts.flatMap((w) => w.slots.map((s) => s.exerciseId))))];

// ---------- regions: what a workout trains, so back-to-back days differ ----------

export type Region = 'push' | 'pull' | 'legs';
const REGION_OF: Record<string, Region> = {
  Chest: 'push', 'Front delts': 'push', 'Side delts': 'push', Triceps: 'push',
  Back: 'pull', Traps: 'pull', 'Rear delts': 'pull', Biceps: 'pull', 'Lower back': 'pull',
  Quads: 'legs', Hamstrings: 'legs', Glutes: 'legs', Calves: 'legs', Adductors: 'legs',
};

/** The regions a workout's first three exercises (its main work) load. */
export function regionsOf(t: WorkoutTemplate, nameOf: (id: string) => string): Set<Region> {
  const out = new Set<Region>();
  for (const s of t.slots.slice(0, 3)) {
    const m = MUSCLES[nameOf(s.exerciseId)];
    const primary = m ? Object.entries(m).find(([, v]) => v === 1)?.[0] : undefined;
    const r = primary ? REGION_OF[primary] : undefined;
    if (r) out.add(r);
  }
  return out;
}

// ---------- the block schedule ----------

export interface Block {
  /** Monday the block starts. */
  start: string;
  programId: string;
  weeks: number;
}

/** Agreed 16 Nov 2026: finish PPL, deload over Thanksgiving week, Upper/Lower strength, then Arnold. */
export const DEFAULT_SCHEDULE: Block[] = [
  { start: '2026-10-26', programId: BLOCK_1.id, weeks: 4 },
  { start: '2026-11-23', programId: DELOAD_ID, weeks: 1 },
  { start: '2026-11-30', programId: UPPER_LOWER.id, weeks: 4 },
  { start: '2026-12-28', programId: ARNOLD.id, weeks: 4 },
];

export interface WeekPlan {
  program: Program;
  block: Block;
  /** 1-based week within the block; past the end when the schedule has run out. */
  week: number;
  /** True once the block's planned weeks are over and nothing new is scheduled. */
  overrun: boolean;
  /** The block after this one, if scheduled. */
  next: Block | null;
}

const weeksBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / (7 * 86_400_000));

const sorted = (blocks: Block[]): Block[] => [...blocks].sort((a, b) => a.start.localeCompare(b.start));

/** Which program a week follows. A deload uses the program of the block before it. */
export function planForWeek(blocks: Block[], week: string): WeekPlan {
  const list = sorted(blocks.length ? blocks : DEFAULT_SCHEDULE);
  let i = list.findLastIndex((b) => b.start <= week);
  if (i < 0) i = 0;
  const block = list[i]!;
  const programFor = (k: number): Program => {
    const b = list[k]!;
    if (b.programId !== DELOAD_ID) return programById(b.programId) ?? BLOCK_1;
    for (let j = k - 1; j >= 0; j--) if (list[j]!.programId !== DELOAD_ID) return deloadOf(programById(list[j]!.programId) ?? BLOCK_1);
    return deloadOf(BLOCK_1);
  };
  const n = Math.max(0, weeksBetween(block.start, week)) + 1;
  return { program: programFor(i), block, week: n, overrun: n > block.weeks, next: list[i + 1] ?? null };
}

/**
 * Put a program on the schedule starting on `start` (a Monday). Blocks that would begin on or after
 * it are replaced; a block already running is cut short so the new one starts on time.
 */
export function scheduleProgram(blocks: Block[], programId: string, start: string): Block[] {
  const list = sorted(blocks.length ? blocks : DEFAULT_SCHEDULE).filter((b) => b.start < start);
  const kept = list.map((b) => {
    const room = weeksBetween(b.start, start);
    return room < b.weeks ? { ...b, weeks: room } : b;
  });
  return [...kept.filter((b) => b.weeks > 0), { start, programId, weeks: programId === DELOAD_ID ? 1 : 4 }];
}

/** Plain-language summary of a program's week. */
export function weekShape(p: Program): string {
  const req = p.workouts.filter((w) => !w.optional).length;
  const opt = p.workouts.length - req;
  const sets = Math.round(p.workouts.filter((w) => !w.optional).reduce((n, w) => n + w.slots.reduce((m, s) => m + s.sets, 0), 0) / Math.max(1, req));
  return `${req} workouts${opt ? ` + ${opt} optional` : ''} · about ${sets} sets each`;
}
