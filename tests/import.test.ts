// Import tests run against the user's real exports when they are present in data/private/ (never committed).
// Expected totals come from an independent pandas analysis of the same files (27 Oct 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { importFitbod, kgToLb } from '../src/import/fitbod.ts';
import { importEarlierApp, toUtcIso } from '../src/import/earlier-app.ts';
import { emptyStore, exposuresByExercise, mergeImport } from '../src/import/store.ts';
import { localDate } from '../src/import/types.ts';
import { USER_DECISIONS as UD } from '../src/decisions.ts';

const FITBOD = new URL('../data/private/FitBod workouts history.xlsx', import.meta.url);
const EARLIER = new URL('../data/private/fit-build-log-2026-10-27.json', import.meta.url);
const haveFiles = existsSync(FITBOD) && existsSync(EARLIER);

test('kg → lb restores the pounds that were entered', () => {
  assert.equal(kgToLb(24.94758), 55);
  assert.equal(kgToLb(97.522476), 215);
  assert.equal(kgToLb(15.875733), 35);
});

test('time zone: Fitbod evening workouts land on the local (Eastern) date, across daylight-saving changes', () => {
  assert.equal(localDate('2026-07-26T01:32:06Z'), '2026-07-25'); // EDT, UTC−4
  assert.equal(localDate('2026-01-15T03:30:00Z'), '2026-01-14'); // EST, UTC−5
  assert.equal(localDate('2026-01-15T05:30:00Z'), '2026-01-15');
  assert.equal(toUtcIso('2026-08-28 00:38:07'), '2026-08-28T00:38:07.000Z');
});

test('Fitbod import totals match the independent analysis', { skip: !haveFiles }, async () => {
  const r = await importFitbod(new Uint8Array(readFileSync(FITBOD)), 'FitBod workouts history.xlsx');
  assert.equal(r.fingerprint, 'e675a1840076b61702d998f74a597db2515f0c8d8a06bc98c4f8fc53b2daa07a');
  assert.deepEqual(r.totals, { dataRows: 29187, blankRows: 5, workouts: 1446, strengthSets: 27835, warmups: 1123, timedEntries: 1352, exercises: 231 });
  assert.equal(r.issues.filter((i) => i.kind === 'possible-split-session').length, 7);
  // Identical repeated sets are all kept (16,051 rows repeat another row in the same workout).
  const seen = new Map<string, number>();
  for (const s of r.sets) {
    const k = `${s.sessionId}|${s.exerciseId}|${s.weight}|${s.reps}|${s.kind}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const repeats = [...seen.values()].reduce((a, n) => a + n - 1, 0);
  assert.ok(repeats > 14000, `expected many legitimate repeated sets, got ${repeats}`);
  assert.equal(new Set(r.sets.map((s) => s.id)).size, r.sets.length, 'set IDs are unique');
  assert.equal(r.sessions.map((s) => s.date).sort().at(-1), '2026-07-25');
});

test('earlier-app import totals match the independent analysis', { skip: !haveFiles }, async () => {
  const r = await importEarlierApp(new Uint8Array(readFileSync(EARLIER)), 'fit-build-log-2026-10-27.json');
  assert.deepEqual(r.totals, { sessions: 49, sets: 992, swaps: 48, lateSessions: 34, cardio: 78, pushups: 15, measurements: 3 });
  assert.equal(r.issues.filter((i) => i.kind === 'possible-duplicate').length, 5);
  // Default: every set takes its session's date.
  const sessDate = new Map(r.sessions.map((s) => [s.id, s.date]));
  assert.ok(r.sets.every((s) => s.performedDate === sessDate.get(s.sessionId)));
  // The user can switch a session to entry dates.
  const sid = 'bd12b840-c406-4aa4-9741-ab22def5a514';
  const alt = await importEarlierApp(new Uint8Array(readFileSync(EARLIER)), 'x', { useEnteredDates: new Set([sid]) });
  assert.ok(alt.sets.filter((s) => s.sessionId === `earlier:${sid}`).every((s) => s.performedDate === localDate(s.enteredAt!)));
});

test('re-importing the same files adds nothing and the two sources share no dates', { skip: !haveFiles }, async () => {
  const store = emptyStore();
  const f = await importFitbod(new Uint8Array(readFileSync(FITBOD)), 'f');
  const e = await importEarlierApp(new Uint8Array(readFileSync(EARLIER)), 'e');
  const m1 = mergeImport(store, f);
  const m2 = mergeImport(store, e);
  assert.equal(m1.added['sets'], 27835);
  assert.equal(m2.added['sets'], 992);
  const again = [mergeImport(store, f), mergeImport(store, e)];
  for (const m of again) for (const v of Object.values(m.added)) assert.equal(v, 0);
  assert.equal(store.sets.size, 27835 + 992);
  const fitbodDates = new Set(f.sessions.map((s) => s.date));
  assert.ok(e.sessions.every((s) => !fitbodDates.has(s.date)), 'no overlapping dates');
  // Exposures: one per exercise per session, oldest first.
  const ex = exposuresByExercise(store);
  const lp = ex.get('leg-press')!;
  assert.ok(lp.length > 10);
  assert.ok(lp.every((x, i) => i === 0 || lp[i - 1]!.date <= x.date));
});

test("the user's decisions (27 Oct): merges, renames, units, open session", { skip: !haveFiles }, async () => {
  const f = await importFitbod(new Uint8Array(readFileSync(FITBOD)), 'f', { mergeSplitSessions: UD.mergeFitbodSplitSessions, renames: UD.fitbodRenames });
  assert.equal(f.sessions.length, 1446 - 7, 'seven split pairs merged');
  assert.equal(f.sets.length, 27835, 'no set lost in a merge');
  assert.equal(new Set(f.sets.map((s) => s.id)).size, f.sets.length);
  const known = new Set(f.sessions.map((s) => s.id));
  assert.ok(f.sets.every((s) => known.has(s.sessionId)), 'every set points at an existing session');
  assert.ok(f.sets.some((s) => s.exerciseId === 'hammer-curl'), 'Fitbod Hammer Curls joined Hammer Curl');
  assert.ok(f.sets.some((s) => s.exerciseId === 'fitbod-calf-press'), 'Fitbod machines stay separate');
  assert.ok(!f.sets.some((s) => s.exerciseId === 'calf-press'));

  const e = await importEarlierApp(new Uint8Array(readFileSync(EARLIER)), 'e', { dedupePushups: true, openLatestSession: true });
  assert.equal(e.pushups.length, 15 - 6, 'double-saved push-ups reduced to one per date');
  assert.ok(e.cardio.filter((c) => c.activityOriginal === 'Incline walk' || c.activityOriginal === 'Treadmill incline').every((c) => c.activity === 'Incline treadmill walk'));
  const stairs = e.cardio.filter((c) => c.activity === 'Stair climber' && c.distance != null);
  assert.ok(stairs.length > 0 && stairs.every((c) => c.distanceUnit === 'steps'));
  assert.ok(e.cardio.filter((c) => c.activity === 'Incline treadmill walk' && c.distance != null).every((c) => c.distanceUnit === 'mi'));
  const open = e.sessions.filter((s) => s.extra['status'] === 'open');
  assert.deepEqual(open.map((s) => [s.template, s.date]), [['upper-b', '2026-10-26']]);
});
