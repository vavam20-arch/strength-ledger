import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, EMPTY_STATE, recommend } from '../src/engine.ts';
import type { SetEntry } from '../src/model.ts';
import { ex, exposure, slot } from './helpers.ts';

// Small seeded PRNG so failures are reproducible.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const RANGES: Array<[number, number]> = [
  [6, 10],
  [8, 12],
  [10, 15],
  [12, 20],
];

test('property: progression targets always beat the benchmark, stay in the gain band and use real weights', () => {
  const rand = rng(20261027);
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  let checked = 0;
  for (let i = 0; i < 5000; i++) {
    const step = [2.5, 5, 10][int(0, 2)]!;
    const [repMin, repMax] = RANGES[int(0, RANGES.length - 1)]!;
    const nSets = int(2, 4);
    const base = step * int(4, 40);
    const mixed = rand() < 0.3;
    const sets: Array<[number, number, SetEntry['kind']?]> = [];
    for (let k = 0; k < nSets; k++) sets.push([mixed ? base + step * int(-2, 2) : base, int(Math.max(1, repMin - 4), repMax + 4)]);
    const e = ex('x', step);
    const s = slot('x', nSets, repMin, repMax);
    const rec = recommend({ slot: s, exercise: e, history: [exposure('x', '2026-10-30', sets)], state: EMPTY_STATE, asOf: '2026-11-02', bodyweight: null });
    assert.ok(rec.target, `no target for ${JSON.stringify(sets)}`);
    const t = rec.target!;
    // Weight is reachable from the logged weights in whole equipment steps.
    const offset = (t.weight - base) / step;
    assert.ok(Math.abs(offset - Math.round(offset)) < 1e-6, `weight ${t.weight} not on the ${step} lb grid`);
    assert.equal(t.reps.length, nSets);
    if (rec.decision === 'add-weight' || rec.decision === 'calibrate') {
      assert.ok(rec.targetEstimate! > rec.benchmark!, `${rec.decision} did not beat benchmark: ${JSON.stringify(sets)} → ${JSON.stringify(t)}`);
      if (!rec.flags.includes('big-step')) assert.ok(rec.gainPct! <= DEFAULT_SETTINGS.gainMax * 100 + 0.05, `gain ${rec.gainPct}% over band`);
      for (const r of t.reps) assert.ok(r >= repMin && r <= repMax, `reps ${r} outside ${repMin}–${repMax}`);
    }
    if (rec.decision === 'build-reps') {
      assert.ok(rec.targetEstimate! >= rec.benchmark! - 1e-6, `build-reps lowered the estimate: ${JSON.stringify({sets, repMin, repMax, step, rec})}`);
      for (const r of t.reps) assert.ok(r >= repMin && r <= repMax);
    }
    if (rec.decision.startsWith('conflict')) {
      for (const r of t.reps) assert.ok(r <= repMax + DEFAULT_SETTINGS.extendMax);
    }
    checked++;
  }
  assert.equal(checked, 5000);
});

test('property: adding warm-ups or extra sets never changes the recommendation', () => {
  const rand = rng(7);
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  for (let i = 0; i < 2000; i++) {
    const w = 5 * int(5, 40);
    const sets: Array<[number, number, SetEntry['kind']?]> = [
      [w, int(6, 13)],
      [w, int(6, 13)],
      [w, int(6, 13)],
    ];
    const noisy: Array<[number, number, SetEntry['kind']?]> = [[w / 2, 15, 'warmup'], ...sets, [w + 20, int(1, 20), 'extra']];
    const e = ex('y', 5);
    const s = slot('y', 3, 8, 12);
    const a = recommend({ slot: s, exercise: e, history: [exposure('y', '2026-10-30', sets)], state: EMPTY_STATE, asOf: '2026-11-02', bodyweight: null });
    const b = recommend({ slot: s, exercise: e, history: [exposure('y', '2026-10-30', noisy)], state: EMPTY_STATE, asOf: '2026-11-02', bodyweight: null });
    assert.deepEqual(b.target, a.target);
    assert.equal(b.decision, a.decision);
  }
});
