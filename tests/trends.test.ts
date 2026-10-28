import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupOf, primaryMuscle, strengthTrends, windows, type TrendSet } from '../src/trends.ts';

const addDays = (d: string, n: number): string => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

test('muscle groups come from the gym catalog first, then from the exercise name', () => {
  assert.equal(groupOf('Seated Chest Press — Weight Stack'), 'Chest');
  assert.equal(groupOf('Machine Rear Delt Fly'), 'Delts');
  assert.equal(groupOf('Lying Hamstrings Curl'), 'Legs');
  assert.equal(groupOf('Machine Preacher Curl'), 'Arms');
  assert.equal(groupOf('Cable Upright Row'), 'Delts');
  assert.equal(groupOf('Hammerstrength Iso Row'), 'Back');
  assert.equal(groupOf('Cable Crossover Fly'), 'Chest');
  assert.equal(groupOf('Trap Bar Deadlift'), 'Legs');
  assert.equal(groupOf('Seated Machine Calf Press'), 'Legs');
  assert.equal(groupOf('Cable Rope Tricep Extension'), 'Arms');
  assert.equal(groupOf('Ab Crunch Machine'), null);
  assert.equal(primaryMuscle('Something Unknown'), null);
});

test('windows are contiguous, oldest first, and end today', () => {
  const w = windows('2026-10-28', 14, 3, addDays);
  assert.deepEqual(w, [
    { start: '2026-09-17', end: '2026-09-30' },
    { start: '2026-10-01', end: '2026-10-14' },
    { start: '2026-10-15', end: '2026-10-28' },
  ]);
});

test('the index follows the typical change across exercises and ignores machine differences', () => {
  const w = windows('2026-10-28', 14, 3, addDays);
  const s = (exerciseId: string, name: string, date: string, weight: number, reps: number): TrendSet => ({ exerciseId, name, date, weight, reps });
  const sets = [
    // Chest press: 150×10 → 155×10 → 160×10 (about +3.3% then +3.2%)
    s('cp', 'Seated Chest Press — Weight Stack', '2026-09-20', 150, 10),
    s('cp', 'Seated Chest Press — Weight Stack', '2026-10-05', 155, 10),
    s('cp', 'Seated Chest Press — Weight Stack', '2026-10-20', 160, 10),
    // A much heavier machine moving by the same proportion must not dominate.
    s('fly', 'Machine Fly', '2026-09-21', 300, 12),
    s('fly', 'Machine Fly', '2026-10-06', 310, 12),
    s('fly', 'Machine Fly', '2026-10-21', 320, 12),
    // Warm-up-like light set inside a window does not lower the best.
    s('cp', 'Seated Chest Press — Weight Stack', '2026-10-20', 90, 10),
    // Assisted and bodyweight sets are not scored.
    s('ap', 'Assisted Pull Up', '2026-10-20', 40, 10),
  ];
  const t = strengthTrends(sets, w).find((g) => g.group === 'Chest')!;
  assert.equal(t.points[0]!.index, 100);
  assert.ok(Math.abs(t.points[2]!.index - (160 / 150) * 100) < 0.7, `index ${t.points[2]!.index}`);
  assert.equal(t.points[1]!.basis, 2);
  assert.ok(Math.abs(t.changePct! - 6.7) < 0.7);
  const cp = t.exercises.find((e) => e.exerciseId === 'cp')!;
  assert.equal(cp.first, 200);
  assert.ok(Math.abs(cp.last - 213.3) < 0.1);
  assert.equal(strengthTrends(sets, w).find((g) => g.group === 'Back')!.changePct, null, 'assisted sets are skipped');
});

test('a gap carries the index forward and one wild jump is capped', () => {
  const w = windows('2026-10-28', 14, 4, addDays);
  const sets: TrendSet[] = [
    { exerciseId: 'lp', name: 'Lat Pulldown', date: w[0]!.end, weight: 150, reps: 10 },
    // nothing in window 1
    { exerciseId: 'lp', name: 'Lat Pulldown', date: w[2]!.end, weight: 300, reps: 10 }, // doubled: data error or new machine
    { exerciseId: 'lp', name: 'Lat Pulldown', date: w[3]!.end, weight: 300, reps: 10 },
  ];
  const t = strengthTrends(sets, w).find((g) => g.group === 'Back')!;
  assert.equal(t.points[1]!.index, 100);
  assert.equal(t.points[1]!.basis, 0);
  assert.ok(t.points[2]!.index <= 116.2 && t.points[2]!.index >= 116, `capped at +15% log step, got ${t.points[2]!.index}`);
  assert.equal(t.points[3]!.index, t.points[2]!.index);
});
