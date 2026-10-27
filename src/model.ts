// Strength Ledger record model. Shared by the engine, the importers and (later) the app.
// All weights are in pounds. Dates are local calendar dates (YYYY-MM-DD) in the user's time zone.

/** How an exercise's load is expressed. */
export type LoadType =
  | 'external' // weight lifted (per dumbbell for dumbbell exercises)
  | 'bodyweight' // reps only, no added load
  | 'weighted' // bodyweight + added load
  | 'assisted'; // bodyweight − assistance (the logged weight is the assistance)

/** The role an exercise plays in a workout; it sets the default rep range. */
export type Role = 'anchor' | 'secondary' | 'isolation' | 'bodyweight';

/** Available loads for one piece of equipment. `loads` (explicit list) wins over step/min/max. */
export interface Equipment {
  step: number;
  min?: number;
  max?: number;
  loads?: number[];
}

export interface Exercise {
  id: string;
  name: string;
  loadType: LoadType;
  equipment: Equipment;
  /** Muscles worked: 1 = primary, 0.5 = assisting. */
  muscles: Record<string, number>;
}

export type SetKind = 'work' | 'warmup' | 'extra';

export interface SetEntry {
  id: string;
  sessionId: string;
  exerciseId: string;
  /** Program slot the set belongs to (null for imported Fitbod sets). */
  slotKey: string | null;
  kind: SetKind;
  /** Load in lb; for assisted exercises this is the assistance. */
  weight: number;
  reps: number;
  completed: boolean;
  /** Local date the set was performed. */
  performedDate: string;
  /** When the set was typed in (ISO, UTC), if known. */
  enteredAt: string | null;
  /** Order within the session. */
  order: number;
  rir: number | null;
  note: string | null;
  source: string;
  /** Exercise originally planned for this slot, when a different one was performed (a swap). */
  plannedExerciseName?: string;
  /** Source-specific values kept for traceability (e.g. Fitbod's original kg value and multiplier). */
  original?: Record<string, string | number | null>;
}

export interface Session {
  id: string;
  date: string;
  /** Workout template key (e.g. 'push-a', 'upper-b'); 'fitbod' for imported Fitbod workouts. */
  template: string;
  source: string;
  startedAt: string | null;
  extra: Record<string, unknown>;
}

export interface CardioEntry {
  id: string;
  date: string;
  activity: string;
  activityOriginal: string;
  durationMin: number;
  distance: number | null;
  distanceUnit: 'm' | 'mi' | 'steps' | null;
  intensity: string | null;
  incline: number | null;
  avgHeartRate: number | null;
  source: string;
}

export interface PushupEntry {
  id: string;
  date: string;
  sets: number[];
  enteredAt: string | null;
  source: string;
}

export interface Measurement {
  id: string;
  date: string;
  bodyWeight: number | null;
  /** Inches (assumed for imported data). */
  waist: number | null;
  chest: number | null;
  shoulders: number | null;
  leftArm: number | null;
  rightArm: number | null;
  leftCalf: number | null;
  rightCalf: number | null;
  source: string;
}

/** One program slot: an exercise with its sets and rep range. */
export interface Slot {
  key: string;
  exerciseId: string;
  role: Role;
  sets: number;
  repMin: number;
  repMax: number;
}

/** All of one exercise's sets in one session. */
export interface Exposure {
  sessionId: string;
  date: string;
  exerciseId: string;
  sets: SetEntry[];
  /**
   * True when the sets were logged against a plan in this app (required sets come first, extras are marked).
   * Imported history has no plan, so its required sets are taken to be the strongest work sets
   * (a lighter ramp-up set should not become the benchmark).
   */
  planned: boolean;
}
