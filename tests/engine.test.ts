import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STATE, estimate, evaluate, nextState, recommend, round1, stepEasier, stepHarder } from '../src/engine.ts';
import { ex, exposure, slot } from './helpers.ts';

const asOf = '2026-11-02';

test("user's worked examples: 65×10 ≈ 86.7, 70×6 = 84.0, 70×8 ≈ 88.7", () => {
  assert.equal(round1(estimate(65, 10)), 86.7);
  assert.equal(round1(estimate(70, 6)), 84.0);
  assert.equal(round1(estimate(70, 8)), 88.7);
});

test('add weight: 65 × 10 on every set (range 6–10) → 70 × 8, never 70 × 6', () => {
  const e = ex('db-press', 5);
  const r = recommend({ slot: slot('db-press', 3, 6, 10), exercise: e, history: [exposure('db-press', '2026-10-30', [[65, 10], [65, 10], [65, 10]])], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.equal(r.decision, 'add-weight');
  assert.deepEqual(r.target, { weight: 70, reps: [8, 8, 8] });
  assert.equal(r.targetEstimate, 88.7);
  assert.ok(r.targetEstimate! > r.benchmark!);
});

test('ties are not progress: 65 × 12 (91.0) → 70 × 10 (93.3), not 70 × 9 (91.0)', () => {
  const e = ex('db-press', 5);
  const r = recommend({ slot: slot('db-press', 3, 8, 12), exercise: e, history: [exposure('db-press', '2026-10-30', [[65, 12], [65, 12], [65, 12]])], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.equal(r.decision, 'add-weight');
  assert.deepEqual(r.target, { weight: 70, reps: [10, 10, 10] });
  assert.equal(r.targetEstimate, 93.3);
  assert.match(r.reason, /would be only 91 est/);
});

test('build reps: uneven sets get +1 on the short sets, never past the best set', () => {
  const e = ex('leg-press', 10);
  const r = recommend({ slot: slot('leg-press', 3, 8, 12), exercise: e, history: [exposure('leg-press', '2026-10-20', [[360, 10], [360, 9], [360, 9]])], state: EMPTY_STATE, asOf: '2026-10-27', bodyweight: null });
  assert.equal(r.decision, 'build-reps');
  assert.deepEqual(r.target, { weight: 360, reps: [10, 10, 10] });
});

test('build reps: even sets get +1 each', () => {
  const e = ex('lateral', 5);
  const r = recommend({ slot: slot('lateral', 3, 12, 20, 'isolation'), exercise: e, history: [exposure('lateral', '2026-10-30', [[25, 12], [25, 12], [25, 12]])], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.deepEqual(r.target, { weight: 25, reps: [13, 13, 13] });
});

test('calibrate when past the top of a new range: lat pulldown 165 × 12, 12 → 185 × 8', () => {
  const e = ex('pulldown', 10);
  const r = recommend({ slot: slot('pulldown', 3, 6, 10), exercise: e, history: [exposure('pulldown', '2026-10-30', [[165, 12], [165, 12]])], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.equal(r.decision, 'calibrate');
  assert.deepEqual(r.target, { weight: 185, reps: [8, 8, 8] });
  assert.ok(r.flags.includes('fewer-sets-than-planned'));
});

test('calibrate mixed weights to one working weight: 55×12, 60×10, 65×8 → 60 × 9 (beats weakest set 77.0)', () => {
  const e = ex('incline', 5);
  const r = recommend({ slot: slot('incline', 3, 6, 10), exercise: e, history: [exposure('incline', '2026-10-30', [[55, 12], [60, 10], [65, 8]])], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.equal(r.decision, 'calibrate');
  assert.equal(r.benchmark, 77);
  assert.deepEqual(r.target, { weight: 60, reps: [9, 9, 9] });
});

test('conflict: a too-big jump (lateral raise 20 × 12 → 25 lb) extends reps first, then takes the jump', () => {
  const e = ex('lat-raise', 5);
  const s = slot('lat-raise', 3, 8, 12, 'isolation');
  const r1 = recommend({ slot: s, exercise: e, history: [exposure('lat-raise', '2026-10-30', [[20, 12], [20, 12], [20, 12]])], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.equal(r1.decision, 'conflict-extend');
  assert.deepEqual(r1.target, { weight: 20, reps: [13, 13, 13] });
  assert.equal(r1.alternatives.length, 3);
  // Extended to 15 (the cap): the jump is still large, so take it and expect repeats.
  const state = { lastTarget: { weight: 20, reps: [15, 15, 15] }, misses: 0 };
  const r2 = recommend({ slot: s, exercise: e, history: [exposure('lat-raise', '2026-11-01', [[20, 15], [20, 15], [20, 15]])], state, asOf, bodyweight: null });
  assert.equal(r2.decision, 'conflict-jump');
  assert.deepEqual(r2.target, { weight: 25, reps: [8, 8, 8] });
});

test('extra sets and warm-ups never trigger an increase', () => {
  const e = ex('row', 10);
  const s = slot('row', 3, 8, 12);
  const plain = recommend({ slot: s, exercise: e, history: [exposure('row', '2026-10-30', [[190, 10], [190, 9], [190, 9]])], state: EMPTY_STATE, asOf, bodyweight: null });
  const withExtras = recommend({
    slot: s,
    exercise: e,
    history: [exposure('row', '2026-10-30', [[100, 15, 'warmup'], [190, 10], [190, 9], [190, 9], [210, 12, 'extra'], [190, 14]])],
    state: EMPTY_STATE,
    asOf,
    bodyweight: null,
  });
  assert.deepEqual(withExtras.target, plain.target);
  assert.equal(withExtras.decision, 'build-reps');
});

test('miss ladder: repeat → hold → step back', () => {
  const e = ex('press', 10);
  const s = slot('press', 3, 6, 10);
  const target = { weight: 190, reps: [8, 8, 8] };
  const missed = exposure('press', '2026-10-30', [[190, 7], [190, 6], [190, 6]]);
  const r1 = recommend({ slot: s, exercise: e, history: [missed], state: { lastTarget: target, misses: 1 }, asOf, bodyweight: null });
  assert.equal(r1.decision, 'repeat');
  assert.deepEqual(r1.target, target);
  const r2 = recommend({ slot: s, exercise: e, history: [missed], state: { lastTarget: target, misses: 2 }, asOf, bodyweight: null });
  assert.equal(r2.decision, 'hold');
  assert.deepEqual(r2.target, { weight: 190, reps: [7, 6, 6] });
  const r3 = recommend({ slot: s, exercise: e, history: [missed], state: { lastTarget: target, misses: 3 }, asOf, bodyweight: null });
  assert.equal(r3.decision, 'step-back');
  assert.equal(r3.target!.weight, 180);
});

test('evaluate + nextState count misses and reset on success', () => {
  const e = ex('press', 10);
  const s = slot('press', 3, 6, 10);
  const target = { weight: 190, reps: [8, 8, 8] };
  const rec = { exerciseId: 'press', slotKey: s.key, decision: 'add-weight' as const, target, targetEstimate: 240.7, benchmark: 238, gainPct: 1.1, reason: '', alternatives: [], flags: [] };
  const miss = evaluate(target, e, exposure('press', '2026-11-03', [[190, 8], [190, 7], [190, 6]]), s, null);
  assert.equal(miss.met, false);
  const st = nextState(EMPTY_STATE, rec, miss);
  assert.equal(st.misses, 1);
  const hit = evaluate(target, e, exposure('press', '2026-11-06', [[190, 9], [190, 8], [190, 8]]), s, null);
  assert.equal(hit.met, true);
  assert.equal(nextState(st, rec, hit).misses, 0);
  // A heavier weight with fewer reps can still meet the target by estimate.
  const alt = evaluate(target, e, exposure('press', '2026-11-06', [[200, 7], [200, 7], [200, 7]]), s, null);
  assert.deepEqual(alt, { met: true, byEstimate: true });
});

test('long gap: repeat a matching effort (leverage squat 90 × 11, 11, 10 four weeks ago → 90 × 10)', () => {
  const e = ex('lev-squat', 10);
  const r = recommend({ slot: slot('lev-squat', 3, 8, 12, 'secondary'), exercise: e, history: [exposure('lev-squat', '2026-09-29', [[90, 11], [90, 11], [90, 10]])], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.equal(r.decision, 'repeat-after-break');
  assert.deepEqual(r.target, { weight: 90, reps: [10, 10, 10] });
});

test('assisted: progress by less assistance, using bodyweight for the estimate', () => {
  const e = ex('assisted-pullup', 10, 'assisted');
  const s = slot('assisted-pullup', 3, 6, 10, 'secondary');
  const build = recommend({ slot: s, exercise: e, history: [exposure('assisted-pullup', '2026-10-30', [[40, 10], [40, 8], [40, 9]])], state: EMPTY_STATE, asOf, bodyweight: 218 });
  assert.equal(build.decision, 'build-reps');
  assert.deepEqual(build.target, { weight: 40, reps: [10, 9, 10] });
  const top = recommend({ slot: s, exercise: e, history: [exposure('assisted-pullup', '2026-10-30', [[40, 10], [40, 10], [40, 10]])], state: EMPTY_STATE, asOf, bodyweight: 218 });
  assert.equal(top.decision, 'add-weight');
  assert.equal(top.target!.weight, 30, 'assistance goes down');
  assert.ok(top.targetEstimate! > top.benchmark!);
  const noBw = recommend({ slot: s, exercise: e, history: [exposure('assisted-pullup', '2026-10-30', [[40, 10], [40, 8], [40, 9]])], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.ok(noBw.flags.includes('needs-bodyweight'));
});

test('bodyweight exercises progress by reps and stop at the top of the range', () => {
  const e = ex('ab-rollout', 0, 'bodyweight');
  const s = slot('ab-rollout', 2, 8, 15, 'bodyweight');
  const r = recommend({ slot: s, exercise: e, history: [exposure('ab-rollout', '2026-10-30', [[0, 13], [0, 14]])], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.deepEqual(r.target!.reps, [14, 14]);
  const top = recommend({ slot: s, exercise: e, history: [exposure('ab-rollout', '2026-10-30', [[0, 15], [0, 15]])], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.equal(top.decision, 'top-of-range');
});

test('equipment limits: maximum weight and explicit load lists', () => {
  const abductor = ex('abductor', 10, 'external', { max: 215 });
  assert.equal(stepHarder(abductor, 215), null);
  const r = recommend({ slot: slot('abductor', 3, 10, 15, 'isolation'), exercise: abductor, history: [exposure('abductor', '2026-10-30', [[215, 15], [215, 15], [215, 15]])], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.equal(r.decision, 'conflict-extend');
  assert.ok(r.flags.includes('at-equipment-maximum'));
  const db = ex('db', 5, 'external', { loads: [20, 25, 30, 35, 40, 45, 50, 52.5, 55] });
  assert.equal(stepHarder(db, 50), 52.5);
  assert.equal(stepEasier(db, 20), null);
});

test('no history → baseline, with no invented numbers', () => {
  const r = recommend({ slot: slot('db-row', 3, 8, 12), exercise: ex('db-row', 5), history: [], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.equal(r.decision, 'baseline');
  assert.equal(r.target, null);
});

test('imported history: a lighter ramp-up set does not become the benchmark (preacher 30×11, 40×10, 40×10 → 40 × 11)', () => {
  const e = ex('preacher', 5);
  const s = slot('preacher', 2, 10, 15, 'isolation');
  const imported = recommend({ slot: s, exercise: e, history: [exposure('preacher', '2026-10-30', [[30, 11], [40, 10], [40, 10]], false)], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.equal(imported.decision, 'build-reps');
  assert.deepEqual(imported.target, { weight: 40, reps: [11, 11] });
  // In a planned session the first sets are the required ones, as logged.
  const planned = recommend({ slot: s, exercise: e, history: [exposure('preacher', '2026-10-30', [[30, 11], [40, 10], [40, 10]], true)], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.equal(planned.decision, 'calibrate');
});

test('gain percentages are rounded to one decimal', () => {
  const r = recommend({ slot: slot('cp', 3, 6, 10), exercise: ex('cp', 5), history: [exposure('cp', '2026-10-26', [[170, 12], [170, 12], [170, 12]])], state: EMPTY_STATE, asOf, bodyweight: null });
  assert.equal(r.gainPct, 1.1);
});
