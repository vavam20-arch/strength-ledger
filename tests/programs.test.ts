import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUSCLES, inferLoadType } from '../src/import/catalog.ts';
import { BLOCK_1, EXERCISE_NAMES, weeklySets } from '../src/program/block1.ts';
import {
  ARNOLD, DEFAULT_SCHEDULE, DELOAD_ID, FULL_BODY, PROGRAMS, UPPER_LOWER,
  deloadOf, findTemplate, planForWeek, regionsOf, scheduleProgram, weekShape,
} from '../src/program/programs.ts';

const nameOf = (id: string): string => EXERCISE_NAMES[id]!;

test('every exercise in every program is in the library, and workout keys are unique', () => {
  const keys = new Set<string>();
  for (const p of PROGRAMS) {
    for (const w of p.workouts) {
      assert.ok(!keys.has(w.key), `duplicate key ${w.key}`);
      keys.add(w.key);
      for (const s of w.slots) assert.ok(MUSCLES[nameOf(s.exerciseId)], `${p.name} / ${w.name}: ${nameOf(s.exerciseId)} not in library`);
    }
    assert.deepEqual([...p.suggestedOrder].sort(), p.workouts.map((w) => w.key).sort(), `${p.name} suggested order`);
  }
});

test('new machines have a weight field before their first logged set', () => {
  assert.equal(inferLoadType('Triceps Extension Machine', false), 'external');
  assert.equal(inferLoadType('Plate-Loaded Chest-Supported T-Bar Row', false), 'external');
  assert.equal(inferLoadType('45° Back Extension', false), 'weighted');
  assert.equal(inferLoadType('Ab Rollout', false), 'bodyweight');
  assert.equal(inferLoadType('Assisted Pull Up', true), 'assisted');
});

test('each program puts the most weekly sets on back, delts and chest (the priorities)', () => {
  const muscles = (id: string) => MUSCLES[nameOf(id)] ?? {};
  for (const p of [BLOCK_1, UPPER_LOWER, ARNOLD]) {
    const required = { ...p, workouts: p.workouts.filter((w) => !w.optional) };
    const w = weeklySets(required, muscles);
    const delts = (w['Front delts'] ?? 0) + (w['Side delts'] ?? 0) + (w['Rear delts'] ?? 0);
    const back = w['Back'] ?? 0;
    const chest = w['Chest'] ?? 0;
    assert.ok(back >= 8 && delts >= 8 && chest >= 8, `${p.name}: back ${back}, delts ${delts}, chest ${chest}`);
    assert.ok(back >= (w['Quads'] ?? 0), `${p.name}: back at least as much as quads`);
  }
  assert.equal(weekShape(UPPER_LOWER), '4 workouts + 2 optional · about 15 sets each');
  assert.match(weekShape(FULL_BODY), /^3 workouts · about 1[34] sets each$/);
});

test('deload: same exercises, about 60% of the sets, no optional days, its own keys', () => {
  const d = deloadOf(UPPER_LOWER);
  assert.equal(d.id, DELOAD_ID);
  assert.equal(d.workouts.length, 4);
  const heavy = d.workouts.find((w) => w.key === 'dl-ul-upper-h')!;
  assert.deepEqual(heavy.slots.map((s) => s.sets), [2, 2, 2, 2, 2]);
  assert.equal(heavy.slots[0]!.exerciseId, UPPER_LOWER.workouts[0]!.slots[0]!.exerciseId);
  assert.equal(heavy.slots[0]!.key, 'dl-ul-upper-h/1');
  assert.equal(findTemplate('dl-push-a')!.slots[3]!.sets, 2, 'lateral raise 4 sets → 2');
  assert.equal(findTemplate('arn-cb-b')!.name, 'Chest & Back B');
  assert.equal(findTemplate('nope'), undefined);
});

test('schedule: PPL → deload (of PPL) → Upper/Lower → Arnold, then Arnold carries on', () => {
  const at = (w: string) => planForWeek(DEFAULT_SCHEDULE, w);
  assert.equal(at('2026-11-16').program.id, BLOCK_1.id);
  assert.equal(at('2026-11-16').week, 4);
  assert.equal(at('2026-11-16').next!.programId, DELOAD_ID);
  const dl = at('2026-11-23');
  assert.equal(dl.program.id, DELOAD_ID);
  assert.ok(dl.program.workouts.every((w) => w.key.startsWith('dl-') && findTemplate(w.key.slice(3))!.key.length > 0));
  assert.equal(dl.program.workouts[0]!.key, 'dl-push-a', 'deload follows the program before it');
  assert.equal(at('2026-11-30').program.id, UPPER_LOWER.id);
  assert.equal(at('2026-12-21').week, 4);
  assert.equal(at('2026-12-28').program.id, ARNOLD.id);
  const after = at('2026-02-01'.replace('2026', '2027'));
  assert.equal(after.program.id, ARNOLD.id);
  assert.equal(after.overrun, true);
  assert.equal(at('2026-10-19').program.id, BLOCK_1.id, 'weeks before the first block use it too');
});

test('switching: a new program replaces later blocks and cuts the running one short', () => {
  const s = scheduleProgram(DEFAULT_SCHEDULE, FULL_BODY.id, '2026-12-14');
  assert.deepEqual(s.map((b) => [b.start, b.programId, b.weeks]), [
    ['2026-10-26', BLOCK_1.id, 4],
    ['2026-11-23', DELOAD_ID, 1],
    ['2026-11-30', UPPER_LOWER.id, 2],
    ['2026-12-14', FULL_BODY.id, 4],
  ]);
  assert.equal(planForWeek(s, '2026-12-07').program.id, UPPER_LOWER.id);
  assert.equal(planForWeek(s, '2026-12-14').program.id, FULL_BODY.id);
  assert.equal(planForWeek(s, '2026-12-14').week, 1);
  const now = scheduleProgram(DEFAULT_SCHEDULE, ARNOLD.id, '2026-11-16');
  assert.deepEqual(now.map((b) => [b.start, b.weeks]), [['2026-10-26', 3], ['2026-11-16', 4]]);
});

test('regions keep back-to-back days different', () => {
  const r = (k: string) => [...regionsOf(findTemplate(k)!, nameOf)].sort().join('+');
  assert.equal(r('push-a'), 'push');
  assert.equal(r('pull-a'), 'pull');
  assert.equal(r('legs-a'), 'legs');
  assert.equal(r('ul-upper-h'), 'pull+push');
  assert.equal(r('ul-lower-h'), 'legs');
  assert.equal(r('arn-cb-a'), 'pull+push');
  assert.equal(r('fb-a'), 'legs+pull+push');
});
