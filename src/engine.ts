// Strength Ledger progression engine.
// Pure functions: no I/O, no clock. Every recommendation carries a plain-language reason.
//
// Core idea (the user's rule, kept): estimated strength = load × (1 + reps ÷ 30) (Epley).
// Guardrails added in the plan:
//   1. Benchmark = the estimate of the WEAKEST required set (extra sets and warm-ups never count).
//   2. Build reps first; add weight only when every required set reaches the top of the range.
//   3. New weight → the fewest reps that beat the benchmark by at least gainMin (ties don't count).
//   4. Gain band: if even the bottom of the range overshoots gainMax, explain the conflict and offer options.
//   5. Miss ladder: repeat → hold → step back.  6. Long gap → repeat before progressing.

import type { Exercise, Exposure, SetEntry, Slot } from './model.ts';

export const estimate = (load: number, reps: number): number => load * (1 + reps / 30);
export const round1 = (x: number): number => Math.round(x * 10) / 10;

export interface Settings {
  /** Minimum gain over the benchmark for a progression target (0.005 = +0.5%). */
  gainMin: number;
  /** Largest gain the app will ask for in one step before calling it a conflict. */
  gainMax: number;
  /** Days without an exercise after which the app repeats instead of progressing. */
  longGapDays: number;
  /** Reps allowed past the top of the range while resolving a too-big weight jump. */
  extendMax: number;
  /** How many equipment steps either side of the current weight calibration may consider. */
  calibrationSpan: number;
}

export const DEFAULT_SETTINGS: Settings = {
  gainMin: 0.005,
  gainMax: 0.05,
  longGapDays: 14,
  extendMax: 3,
  calibrationSpan: 4,
};

export type Decision =
  | 'baseline' // no usable history
  | 'build-reps' // same weight, more reps
  | 'add-weight' // top of range reached on every required set
  | 'calibrate' // last session outside the range or at mixed weights: choose one working weight
  | 'repeat' // missed the last target once
  | 'hold' // missed twice: consolidate what was achieved
  | 'step-back' // missed three times: one weight step down
  | 'repeat-after-break' // long gap
  | 'conflict-extend' // weight jump too big: extend reps first
  | 'conflict-jump' // weight jump too big and reps already extended: take the jump, expect repeats
  | 'top-of-range'; // bodyweight exercise at the top of its range

/** A target for every required set. `weight` is the logged weight (assistance for assisted; 0 for bodyweight). */
export interface Target {
  weight: number;
  reps: number[];
}

export interface Alternative {
  label: string;
  target: Target;
  estimate: number | null;
  note: string;
}

export interface Recommendation {
  exerciseId: string;
  slotKey: string;
  decision: Decision;
  target: Target | null;
  /** Estimate of the weakest target set (null for reps-only exercises). */
  targetEstimate: number | null;
  /** Estimate of the weakest required set last time (reps for reps-only exercises). */
  benchmark: number | null;
  gainPct: number | null;
  reason: string;
  alternatives: Alternative[];
  flags: string[];
}

export interface ProgressState {
  lastTarget: Target | null;
  /** Consecutive missed targets. */
  misses: number;
}

export const EMPTY_STATE: ProgressState = { lastTarget: null, misses: 0 };

export interface RecommendInput {
  slot: Slot;
  exercise: Exercise;
  /** This exercise's exposures, oldest first, all before `asOf`. */
  history: Exposure[];
  state: ProgressState;
  /** Date the recommendation is for (YYYY-MM-DD). */
  asOf: string;
  /** Latest bodyweight (lb); needed for assisted and weighted exercises. */
  bodyweight: number | null;
  settings?: Partial<Settings>;
}

// ---------- helpers ----------

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}

/**
 * The required sets of an exposure. Warm-ups and sets marked extra never count.
 * Planned sessions: the first `n` completed work sets, in order.
 * Imported sessions (no plan): the `n` strongest work sets by `strength`, kept in their original order.
 */
export function requiredSets(exp: Exposure, n: number, strength?: (s: SetEntry) => number): SetEntry[] {
  const work = exp.sets.filter((s) => s.kind === 'work' && s.completed && s.reps > 0).sort((a, b) => a.order - b.order);
  if (exp.planned || !strength || work.length <= n) return work.slice(0, n);
  const keep = new Set([...work].sort((a, b) => strength(b) - strength(a) || a.order - b.order).slice(0, n));
  return work.filter((s) => keep.has(s));
}

/** Strength of one set for ranking: its estimate, or reps when the load is unknown. */
export const setStrength = (ex: Exercise, bodyweight: number | null) => (s: SetEntry): number => {
  const eff = effectiveLoad(ex, s.weight, bodyweight);
  return eff == null ? s.reps : estimate(eff, s.reps);
};

/** Load used for the estimate. */
export function effectiveLoad(ex: Exercise, weight: number, bodyweight: number | null): number | null {
  switch (ex.loadType) {
    case 'external':
      return weight;
    case 'weighted':
      return bodyweight == null ? null : bodyweight + weight;
    case 'assisted':
      return bodyweight == null ? null : bodyweight - weight;
    case 'bodyweight':
      return null;
  }
}

/** True when weight `a` is at least as hard as weight `b`. */
const harderOrEqual = (ex: Exercise, a: number, b: number): boolean =>
  ex.loadType === 'assisted' ? a <= b + 1e-9 : a >= b - 1e-9;

/** Weights the equipment offers near `centre`, from easiest to hardest. */
export function loadsNear(ex: Exercise, centre: number, span: number): number[] {
  const eq = ex.equipment;
  let list: number[];
  if (eq.loads && eq.loads.length) {
    list = [...eq.loads];
  } else {
    list = [];
    for (let k = -span; k <= span; k++) list.push(round1(centre + k * eq.step));
  }
  const min = eq.min ?? (ex.loadType === 'external' ? eq.step : 0);
  const max = eq.max ?? Number.POSITIVE_INFINITY;
  list = list.filter((w) => w >= min - 1e-9 && w <= max + 1e-9);
  list.sort((a, b) => a - b);
  return ex.loadType === 'assisted' ? list.reverse() : list; // easiest first
}

/** The next harder weight, or null at the equipment's limit. */
export function stepHarder(ex: Exercise, w: number): number | null {
  const near = loadsNear(ex, w, 2);
  const i = near.findIndex((x) => Math.abs(x - w) < 1e-9);
  if (i >= 0) return near[i + 1] ?? null;
  return near.find((x) => harderOrEqual(ex, x, w) && Math.abs(x - w) > 1e-9) ?? null;
}

/** The next easier weight, or null at the equipment's limit. */
export function stepEasier(ex: Exercise, w: number): number | null {
  const near = loadsNear(ex, w, 2);
  const i = near.findIndex((x) => Math.abs(x - w) < 1e-9);
  if (i > 0) return near[i - 1] ?? null;
  if (i === 0) return null;
  const easier = near.filter((x) => !harderOrEqual(ex, x, w));
  return easier.at(-1) ?? null;
}

const fill = (n: number, r: number): number[] => Array.from({ length: n }, () => r);

/** Fewest reps at effective load `eff` whose estimate beats `target` (strictly) or matches it (inclusive). */
function fewestReps(eff: number, target: number, inclusive: boolean): number {
  const x = 30 * (target / eff - 1);
  const r = inclusive ? Math.ceil(x - 1e-9) : Math.floor(x + 1e-9) + 1;
  return Math.max(1, r);
}

const pct = (x: number): string => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;

export function formatLoad(ex: Exercise, w: number): string {
  if (ex.loadType === 'assisted') return `${w} lb assistance`;
  if (ex.loadType === 'bodyweight') return 'bodyweight';
  if (ex.loadType === 'weighted') return `bodyweight + ${w} lb`;
  return `${w} lb`;
}

export function formatTarget(ex: Exercise, t: Target): string {
  const allSame = t.reps.every((r) => r === t.reps[0]);
  const reps = allSame ? `${t.reps[0]}` : t.reps.join(', ');
  const load = formatLoad(ex, t.weight);
  return ex.loadType === 'bodyweight' ? `${reps} reps (${t.reps.length} sets)` : `${load} × ${reps}${allSame ? `, all ${t.reps.length} sets` : ''}`;
}

const describeSets = (ex: Exercise, sets: SetEntry[]): string => {
  const w = sets.map((s) => s.weight);
  if (w.every((x) => x === w[0]) && sets[0]) return `${formatLoad(ex, sets[0].weight)} × ${sets.map((s) => s.reps).join(', ')}`;
  return sets.map((s) => `${s.weight} × ${s.reps}`).join(', ');
};

// ---------- the engine ----------

export function recommend(inp: RecommendInput): Recommendation {
  const s: Settings = { ...DEFAULT_SETTINGS, ...inp.settings };
  const { slot, exercise: ex } = inp;
  const flags: string[] = [];
  const base = { exerciseId: ex.id, slotKey: slot.key, alternatives: [] as Alternative[], flags };
  const last = inp.history.at(-1);
  const req = last ? requiredSets(last, slot.sets, setStrength(ex, inp.bodyweight)) : [];

  if (!last || req.length === 0) {
    return {
      ...base,
      decision: 'baseline',
      target: null,
      targetEstimate: null,
      benchmark: null,
      gainPct: null,
      reason: `No usable history yet. Choose a weight you can lift for about ${slot.repMax - 2} reps with good form; this session sets your baseline.`,
    };
  }

  const bw = inp.bodyweight;
  const needsBw = ex.loadType === 'assisted' || ex.loadType === 'weighted';
  if (ex.loadType === 'bodyweight' || (needsBw && bw == null)) {
    if (needsBw) flags.push('needs-bodyweight');
    return repsOnly(inp, s, last, req, base);
  }

  const E = (w: number, r: number): number => estimate(effectiveLoad(ex, w, bw) as number, r);
  const bench = Math.min(...req.map((x) => E(x.weight, x.reps)));
  const weights = [...new Set(req.map((x) => x.weight))];
  const uniform = weights.length === 1;
  const w0 = req[0]!.weight;
  const reps = req.map((x) => x.reps);
  const minR = Math.min(...reps);
  const maxR = Math.max(...reps);
  const gap = daysBetween(last.date, inp.asOf);
  const lastDesc = `${describeSets(ex, req)} on ${last.date}`;
  if (req.length < slot.sets) flags.push('fewer-sets-than-planned');
  if (needsBw) flags.push(`uses-bodyweight-${bw}`);

  const make = (decision: Decision, target: Target, reason: string, alternatives: Alternative[] = []): Recommendation => {
    const tEst = Math.min(...target.reps.map((r) => E(target.weight, r)));
    return {
      ...base,
      alternatives,
      decision,
      target,
      targetEstimate: round1(tEst),
      benchmark: round1(bench),
      gainPct: Math.round((tEst / bench - 1) * 1000) / 10,
      reason,
    };
  };

  /**
   * Choose one working weight whose fewest qualifying reps land nearest the middle of the range.
   * If no weight fits inside the gain band (large equipment jumps on light loads), fall back to the
   * smallest gain that still beats the benchmark inside the rep range, flagged 'big-step'.
   */
  const calibrate = (minGain: number, inclusive: boolean): { target: Target; bigStep: boolean } | null => {
    const mid = (slot.repMin + slot.repMax) / 2;
    const goal = bench * (1 + minGain);
    const candidates: Array<{ w: number; r: number; gain: number; eff: number }> = [];
    const seen = new Set<number>();
    for (const c of weights) {
      for (const w of loadsNear(ex, c, s.calibrationSpan)) {
        if (seen.has(w)) continue;
        seen.add(w);
        const eff = effectiveLoad(ex, w, bw) as number;
        if (eff <= 0) continue;
        // Fewest reps that qualify, but never below the bottom of the range.
        const r = Math.max(slot.repMin, fewestReps(eff, goal, inclusive));
        if (r > slot.repMax) continue;
        candidates.push({ w, r, gain: estimate(eff, r) / bench - 1, eff });
      }
    }
    const inBand = candidates.filter((c) => c.gain <= s.gainMax);
    if (inBand.length) {
      inBand.sort((a, b) => Math.abs(a.r - mid) - Math.abs(b.r - mid) || b.eff - a.eff);
      const b = inBand[0]!;
      return { target: { weight: b.w, reps: fill(slot.sets, b.r) }, bigStep: false };
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.gain - b.gain || b.eff - a.eff);
    const b = candidates[0]!;
    return { target: { weight: b.w, reps: fill(slot.sets, b.r) }, bigStep: true };
  };

  // 1. Long gap: repeat before progressing.
  if (gap > s.longGapDays) {
    let target: Target | null = null;
    if (uniform && minR >= slot.repMin && minR <= slot.repMax) target = { weight: w0, reps: fill(slot.sets, minR) };
    else target = calibrate(0, true)?.target ?? null;
    if (target) {
      return make(
        'repeat-after-break',
        target,
        `${gap} days since you last did this (${lastDesc}). Repeat a matching effort before progressing: ${formatTarget(ex, target)}.`,
      );
    }
  }

  // 2. Miss ladder.
  const lt = inp.state.lastTarget;
  if (lt && inp.state.misses > 0) {
    if (inp.state.misses === 1) {
      return make('repeat', lt, `Last target (${formatTarget(ex, lt)}) was not reached: you did ${lastDesc}. Repeat it; a miss is normal.`);
    }
    if (inp.state.misses === 2) {
      const held: Target = uniform
        ? { weight: w0, reps: Array.from({ length: slot.sets }, (_, i) => Math.min(slot.repMax, reps[i] ?? minR)) }
        : (calibrate(0, true)?.target ?? lt);
      return make('hold', held, `Missed twice in a row. Hold and consolidate what you achieved (${lastDesc}): ${formatTarget(ex, held)}.`);
    }
    const down = stepEasier(ex, lt.weight);
    if (down != null) {
      const r = Math.min(slot.repMax, Math.max(slot.repMin, fewestReps(effectiveLoad(ex, down, bw) as number, bench, true)));
      const t: Target = { weight: down, reps: fill(slot.sets, r) };
      return make('step-back', t, `Missed three times. Step back one weight step and rebuild: ${formatTarget(ex, t)}.`);
    }
    flags.push('at-equipment-minimum');
  }

  const extending = !!lt && Math.max(...lt.reps) > slot.repMax;

  // 3. Outside the range, or mixed weights: calibrate one working weight.
  if (!extending && (!uniform || minR > slot.repMax || minR < slot.repMin)) {
    const c = calibrate(s.gainMin, false);
    if (c) {
      const why = !uniform
        ? 'You used more than one weight'
        : minR > slot.repMax
          ? `You are past the top of the ${slot.repMin}–${slot.repMax} range`
          : `You are below the ${slot.repMin}–${slot.repMax} range`;
      const t = c.target;
      const g = E(t.weight, t.reps[0]!) / bench - 1;
      if (c.bigStep) flags.push('big-step');
      const big = c.bigStep ? ` Your equipment's weight steps are large for this load, so this is a bigger jump than usual (${pct(g)}); expect to repeat it.` : '';
      return make(
        'calibrate',
        t,
        `${why} (${lastDesc}, weakest set ${round1(bench)} est.). One working weight that ${c.bigStep ? 'beats' : 'just beats'} it: ${formatTarget(ex, t)} = ${round1(E(t.weight, t.reps[0]!))} est. (${pct(g)}).${big}`,
      );
    }
    flags.push('no-calibration-in-band');
  }

  // 4. Top of the range on every required set (or extending): add weight.
  const atTop = uniform && minR >= slot.repMax;
  if (atTop || extending) {
    const up = stepHarder(ex, w0);
    const cap = slot.repMax + s.extendMax;
    const extendTarget: Target = { weight: w0, reps: fill(slot.sets, Math.min(cap, minR + 1)) };
    if (up == null) {
      flags.push('at-equipment-maximum');
      if (minR < cap) {
        return make('conflict-extend', extendTarget, `${formatLoad(ex, w0)} is the heaviest setting available. Extend reps instead: ${formatTarget(ex, extendTarget)}.`);
      }
      return make('hold', { weight: w0, reps: fill(slot.sets, minR) }, `${formatLoad(ex, w0)} is the heaviest setting and you are at ${minR} reps. Hold here, or switch to a harder variation.`);
    }
    const effUp = effectiveLoad(ex, up, bw) as number;
    const r = fewestReps(effUp, bench * (1 + s.gainMin), false);
    const rr = Math.max(r, slot.repMin);
    const jump: Target = { weight: up, reps: fill(slot.sets, Math.min(rr, slot.repMax)) };
    const jumpEst = estimate(effUp, jump.reps[0]!);
    const gain = jumpEst / bench - 1;
    if (r <= slot.repMax && gain <= s.gainMax) {
      const tie = rr - 1 >= slot.repMin ? ` ${formatLoad(ex, up)} × ${rr - 1} would be only ${round1(estimate(effUp, rr - 1))} est.` : '';
      return make(
        'add-weight',
        jump,
        `Every required set reached ${minR}+ at ${formatLoad(ex, w0)} (weakest ${round1(bench)} est.). Add weight: ${formatTarget(ex, jump)} = ${round1(jumpEst)} est. (${pct(gain)}).${tie}`,
      );
    }
    // Conflict: the smallest available jump overshoots the gain band even at the bottom of the range.
    const alternatives: Alternative[] = [
      { label: 'Smaller increment', target: jump, estimate: null, note: 'Use micro-plates or a half-step if your equipment has one, then set it in Equipment.' },
      { label: 'Extend reps at the current weight', target: extendTarget, estimate: round1(E(w0, extendTarget.reps[0]!)), note: `Up to ${cap} reps before jumping.` },
      { label: 'Take the jump now', target: jump, estimate: round1(jumpEst), note: 'Expect to repeat it a few times.' },
    ];
    const conflictWhy = `The next weight (${formatLoad(ex, up)}) at ${jump.reps[0]} reps would be ${round1(jumpEst)} est., ${pct(gain)} over your ${round1(bench)} benchmark, more than the ${Math.round(s.gainMax * 100)}% step the app allows.`;
    if (minR < cap) {
      return make('conflict-extend', extendTarget, `${conflictWhy} Extend reps first: ${formatTarget(ex, extendTarget)}.`, alternatives);
    }
    return make('conflict-jump', jump, `${conflictWhy} You have extended reps to ${minR}; take the jump and expect to repeat it: ${formatTarget(ex, jump)}.`, alternatives);
  }

  // 5. Within the range: build reps at the same weight.
  const t: Target = { weight: w0, reps: buildReps(reps, slot) };
  return make('build-reps', t, `${lastDesc} is inside the ${slot.repMin}–${slot.repMax} range. Build reps first: ${formatTarget(ex, t)}.${maxR > minR ? ' Sets that fell short get one more rep.' : ''}`);
}

/** Even sets: +1 rep each. Uneven sets: +1 on the sets that fell short, never past your best set. */
export function buildReps(reps: number[], slot: Slot): number[] {
  const best = Math.max(...reps);
  const allSame = reps.every((r) => r === best);
  const padded = Array.from({ length: slot.sets }, (_, i) => reps[i] ?? Math.min(...reps));
  return padded.map((r) => Math.min(slot.repMax, Math.max(slot.repMin, allSame ? r + 1 : Math.min(best, r + 1))));
}

function repsOnly(
  inp: RecommendInput,
  s: Settings,
  last: Exposure,
  req: SetEntry[],
  base: { exerciseId: string; slotKey: string; alternatives: Alternative[]; flags: string[] },
): Recommendation {
  const { slot, exercise: ex } = inp;
  const reps = req.map((x) => x.reps);
  const minR = Math.min(...reps);
  const w0 = req[0]!.weight;
  const gap = daysBetween(last.date, inp.asOf);
  const out = (decision: Decision, target: Target, reason: string, alternatives: Alternative[] = []): Recommendation => ({
    ...base,
    alternatives,
    decision,
    target,
    targetEstimate: null,
    benchmark: minR,
    gainPct: null,
    reason,
  });
  if (gap > s.longGapDays) {
    const r = Math.min(slot.repMax, Math.max(slot.repMin, minR));
    return out('repeat-after-break', { weight: w0, reps: fill(slot.sets, r) }, `${gap} days since you last did this. Repeat ${r} reps on each set before progressing.`);
  }
  const lt = inp.state.lastTarget;
  if (lt && inp.state.misses === 1) return out('repeat', lt, `Last target was not reached (best ${Math.max(...reps)} reps). Repeat it.`);
  if (lt && inp.state.misses >= 2) {
    const held = { weight: w0, reps: Array.from({ length: slot.sets }, (_, i) => Math.min(slot.repMax, reps[i] ?? minR)) };
    return out('hold', held, `Missed twice. Hold at what you achieved: ${held.reps.join(', ')} reps.`);
  }
  if (minR >= slot.repMax) {
    return out(
      'top-of-range',
      { weight: w0, reps: fill(slot.sets, slot.repMax) },
      `Every set reached ${slot.repMax} reps, the top of the range. Keep ${slot.repMax} reps and choose how to progress.`,
      [
        { label: 'Add a set', target: { weight: w0, reps: fill(slot.sets + 1, slot.repMax) }, estimate: null, note: 'Up to 2 extra sets.' },
        { label: 'Harder variation or added weight', target: { weight: w0, reps: fill(slot.sets, slot.repMin) }, estimate: null, note: 'For example, a weighted version.' },
      ],
    );
  }
  const t = { weight: w0, reps: buildReps(reps, slot) };
  return out('build-reps', t, `Build reps: ${t.reps.join(', ')} reps.`);
}

// ---------- outcomes ----------

export interface Outcome {
  met: boolean;
  /** True when the target was met by estimate at a different weight rather than at the target weight. */
  byEstimate: boolean;
}

/** Did the session meet the target? A different weight counts if its weakest required set's estimate is at least the target's. */
export function evaluate(target: Target, ex: Exercise, exp: Exposure, slot: Slot, bodyweight: number | null): Outcome {
  const req = requiredSets(exp, slot.sets, setStrength(ex, bodyweight));
  if (req.length < target.reps.length) return { met: false, byEstimate: false };
  const direct = req.every((x, i) => harderOrEqual(ex, x.weight, target.weight) && x.reps >= (target.reps[i] ?? 0));
  if (direct) return { met: true, byEstimate: false };
  if (ex.loadType === 'bodyweight') return { met: false, byEstimate: false };
  const effT = effectiveLoad(ex, target.weight, bodyweight);
  if (effT == null) return { met: false, byEstimate: false };
  const tEst = Math.min(...target.reps.map((r) => estimate(effT, r)));
  const aEst = Math.min(...req.map((x) => estimate(effectiveLoad(ex, x.weight, bodyweight) as number, x.reps)));
  return aEst >= tEst - 1e-9 ? { met: true, byEstimate: true } : { met: false, byEstimate: false };
}

export function nextState(prev: ProgressState, rec: Recommendation, outcome: Outcome | null): ProgressState {
  if (!rec.target || !outcome) return { lastTarget: null, misses: 0 };
  if (outcome.met) return { lastTarget: rec.target, misses: 0 };
  return { lastTarget: rec.target, misses: rec.decision === 'step-back' ? 1 : prev.misses + 1 };
}
