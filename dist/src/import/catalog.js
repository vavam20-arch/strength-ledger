// Exercise catalog: canonical IDs, load types, muscles and equipment steps.
// Exercises are identified by their exact name. Names that differ between Fitbod and the earlier app
// are only linked when the user confirms a suggestion (see LINK_SUGGESTIONS).

                                                                 

export const slugify = (name        )         =>
  name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[—–]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Muscles for the exercises at the user's current gym (1 = primary, 0.5 = assisting). */
export const MUSCLES                                         = {
  'Seated Chest Press — Weight Stack': { Chest: 1, Triceps: 0.5, 'Front delts': 0.5 },
  'Incline Dumbbell Bench Press': { Chest: 1, Triceps: 0.5, 'Front delts': 0.5 },
  'Flat Dumbbell Bench Press': { Chest: 1, Triceps: 0.5, 'Front delts': 0.5 },
  'Matrix Plate-Loaded Bench Press — Lying': { Chest: 1, Triceps: 0.5, 'Front delts': 0.5 },
  'Standing Low-to-High Cable Chest Press': { Chest: 1, 'Front delts': 0.5 },
  'Machine Fly': { Chest: 1 },
  'Barbell Shoulder Press': { 'Front delts': 1, 'Side delts': 0.5, Triceps: 0.5 },
  'Seated Shoulder Press Machine': { 'Front delts': 1, 'Side delts': 0.5, Triceps: 0.5 },
  'Dumbbell Lateral Raise': { 'Side delts': 1 },
  'Seated Lateral Raise Machine': { 'Side delts': 1 },
  'Cable or Dumbbell Lateral Raise': { 'Side delts': 1 },
  'Machine Rear Delt Fly': { 'Rear delts': 1 },
  'Lat Pulldown': { Back: 1, Biceps: 0.5 },
  'Assisted Pull Up': { Back: 1, Biceps: 0.5 },
  'Cable Row': { Back: 1, Biceps: 0.5, 'Rear delts': 0.5 },
  'Dumbbell Row': { Back: 1, Biceps: 0.5, 'Rear delts': 0.5 },
  'Barbell Shrug': { Traps: 1 },
  'Hammer Curl': { Biceps: 1 },
  'Dumbbell Bicep Curl': { Biceps: 1 },
  'Cable Curl': { Biceps: 1 },
  'Preacher Curl Machine': { Biceps: 1 },
  'Cable Rope Tricep Extension': { Triceps: 1 },
  'Overhead Cable Tricep Extension': { Triceps: 1 },
  'Cable Tricep Pressdown': { Triceps: 1 },
  'Leg Press': { Quads: 1, Glutes: 0.5 },
  'GymEquip R2 Leverage Squat': { Quads: 1, Glutes: 0.5 },
  'Hack Squat Machine': { Quads: 1, Glutes: 0.5 },
  'Leg Extension': { Quads: 1 },
  'Dumbbell Lunge': { Quads: 1, Glutes: 0.5 },
  'Romanian Deadlift': { Hamstrings: 1, Glutes: 0.5 },
  'Lying Hamstrings Curl': { Hamstrings: 1 },
  'Plate-Loaded Kneeling Leg Curl': { Hamstrings: 1 },
  'Freemotion Selectorized Glute Kickback': { Glutes: 1 },
  'Calf Press': { Calves: 1 },
  'Life Fitness Plate-Loaded Seated Calf Raise': { Calves: 1 },
  'Ab Rollout': { Abs: 1 },
  'Vertical Leg Raise': { Abs: 1 },
};

/**
 * Proposed links between earlier-app names and Fitbod names for the same movement.
 * Not applied until the user confirms each one; equipment may differ between gyms.
 */
export const LINK_SUGGESTIONS                                                                                = [
  { earlierApp: 'Hammer Curl', fitbod: 'Hammer Curls', confidence: 'likely' },
  { earlierApp: 'Flat Dumbbell Bench Press', fitbod: 'Dumbbell Bench Press', confidence: 'likely' },
  { earlierApp: 'Incline Dumbbell Bench Press', fitbod: 'Dumbbell Incline Bench Press', confidence: 'likely' },
  { earlierApp: 'Cable Tricep Pressdown', fitbod: 'Cable Tricep Pushdown', confidence: 'likely' },
  { earlierApp: 'Cable Curl', fitbod: 'Cable Bicep Curl', confidence: 'likely' },
  { earlierApp: 'Preacher Curl Machine', fitbod: 'Machine Preacher Curl', confidence: 'check' },
  { earlierApp: 'Seated Lateral Raise Machine', fitbod: 'Machine Lateral Raise', confidence: 'check' },
  { earlierApp: 'Seated Shoulder Press Machine', fitbod: 'Machine Shoulder Press', confidence: 'check' },
  { earlierApp: 'Hack Squat Machine', fitbod: 'Hack Squat', confidence: 'check' },
  { earlierApp: 'Freemotion Selectorized Glute Kickback', fitbod: 'Glute Kickback Machine', confidence: 'check' },
  { earlierApp: 'Life Fitness Plate-Loaded Seated Calf Raise', fitbod: 'Seated Machine Calf Press', confidence: 'check' },
  { earlierApp: 'Seated Chest Press — Weight Stack', fitbod: 'Machine Bench Press', confidence: 'check' },
  { earlierApp: 'GymEquip R2 Leverage Squat', fitbod: 'Machine Squat', confidence: 'check' },
];

const STANDARD_STEPS = [2.5, 5, 7.5, 10, 15, 20, 25];

/**
 * Equipment step for an exercise. Dumbbells and barbells default to 5 lb (2.5 lb per side on a barbell).
 * Machines and cables use the smallest gap between weights you have actually used, snapped to a standard step,
 * because stacks differ between gyms. Every inferred step is listed for the user to confirm.
 */
export function inferEquipment(name        , loadsUsed          )                                                        {
  const n = name.toLowerCase();
  if (/dumbbell|\bdb\b/.test(n) || /barbell/.test(n)) return { equipment: { step: 5 }, how: 'default' };
  const distinct = [...new Set(loadsUsed.filter((w) => w > 0))].sort((a, b) => a - b);
  let gap = Infinity;
  for (let i = 1; i < distinct.length; i++) gap = Math.min(gap, distinct[i]  - distinct[i - 1] );
  if (!Number.isFinite(gap)) return { equipment: { step: /plate-loaded|plate loaded/.test(n) ? 10 : 5 }, how: 'default' };
  // A bigger gap usually means a skipped weight, not a bigger step: never infer more than 10 lb.
  const step = Math.min(10, STANDARD_STEPS.reduce((best, s) => (Math.abs(s - gap) < Math.abs(best - gap) ? s : best), 10));
  return { equipment: { step }, how: 'inferred' };
}

/** Free weights and bodyweight movements are the same anywhere; machines and cables differ between gyms. */
export const isPortable = (name        , anyWeight         )          =>
  !anyWeight || (/dumbbell|barbell|\bdb\b|romanian deadlift|push up|pull up|chin up|\bdip\b/i.test(name) && !/assisted|machine|smith|cable/i.test(name));

/**
 * Fitbod exercise IDs. Portable exercises share the plain name ID with the earlier app, so their histories join.
 * Machine and cable exercises get a 'fitbod-' prefix and stay separate until the user links them,
 * because the same name can mean a different machine (e.g. Calf Press: 200–385 lb in Fitbod vs 90–100 lb now).
 */
export const fitbodExerciseId = (name        , anyWeight         )         => (isPortable(name, anyWeight) ? slugify(name) : `fitbod-${slugify(name)}`);

export function inferLoadType(name        , anyWeight         )           {
  if (/assisted/i.test(name)) return 'assisted';
  return anyWeight ? 'external' : 'bodyweight';
}

/** Known per-machine limits the user has told us about. */
export const EQUIPMENT_LIMITS                                     = {
  // "My equipment goes only to 215 lbs" (Fitbod note, July 2025).
  'Machine Hip Abductor': { max: 215 },
};

export function buildExercise(
  name        ,
  loadsUsed          ,
  anyWeight         ,
  confirmedSteps                         = {},
)                                                               {
  const inferred = inferEquipment(name, loadsUsed);
  const confirmed = confirmedSteps[name];
  const equipment = confirmed != null ? { step: confirmed } : inferred.equipment;
  const how = confirmed != null ? 'confirmed' : inferred.how;
  return {
    id: slugify(name),
    name,
    loadType: inferLoadType(name, anyWeight),
    equipment: { ...equipment, ...(EQUIPMENT_LIMITS[name] ?? {}) },
    muscles: MUSCLES[name] ?? {},
    stepHow: how,
  };
}
