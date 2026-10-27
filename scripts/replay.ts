// Phase 2 replay: import both histories, compute Block 1 week-1 targets, and replay recent history
// through the engine to see how achievable its targets would have been.
// Usage: node scripts/replay.ts [asOf=2026-11-02]   → writes out/replay.json

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { EMPTY_STATE, estimate, evaluate, formatTarget, nextState, recommend, requiredSets, round1, setStrength, type ProgressState } from '../src/engine.ts';
import type { Exercise, Exposure, Slot } from '../src/model.ts';
import { buildExercise, LINK_SUGGESTIONS, MUSCLES, fitbodExerciseId, slugify } from '../src/import/catalog.ts';
import { importFitbod } from '../src/import/fitbod.ts';
import { importEarlierApp } from '../src/import/earlier-app.ts';
import { bodyweightOn, emptyStore, exposuresByExercise, mergeImport } from '../src/import/store.ts';
import { BLOCK_1, weeklySets } from '../src/program/block1.ts';
import { USER_DECISIONS as UD } from '../src/decisions.ts';

const asOf = process.argv[2] ?? '2026-11-02';
const root = new URL('../', import.meta.url);
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(new URL(p, root)));

const fitbod = await importFitbod(read('data/private/FitBod workouts history.xlsx'), 'FitBod workouts history.xlsx', { mergeSplitSessions: UD.mergeFitbodSplitSessions, renames: UD.fitbodRenames });
const earlier = await importEarlierApp(read('data/private/fit-build-log-2026-10-27.json'), 'fit-build-log-2026-10-27.json', { dedupePushups: UD.dedupePushups, openLatestSession: UD.openSessions === 'finish' });
const store = emptyStore();
const merge = [mergeImport(store, fitbod), mergeImport(store, earlier)];
const exposures = exposuresByExercise(store);

// ---- exercise catalog built from the data ----
const names = new Map<string, string>();
const loads = new Map<string, number[]>();
const currentGymLoads = new Map<string, number[]>();
for (const s of store.sets.values()) {
  const name = String(s.original?.['exercise'] ?? s.exerciseId);
  if (!names.has(s.exerciseId) || s.source === 'earlier-app') names.set(s.exerciseId, name);
  if (s.kind === 'work') {
    loads.set(s.exerciseId, [...(loads.get(s.exerciseId) ?? []), s.weight]);
    if (s.source === 'earlier-app') currentGymLoads.set(s.exerciseId, [...(currentGymLoads.get(s.exerciseId) ?? []), s.weight]);
  }
}
const catalog = new Map<string, Exercise & { stepHow: string }>();
for (const [id, name] of names) {
  const all = loads.get(id) ?? [];
  // Steps are inferred from the current gym's loads when we have them.
  catalog.set(id, { ...buildExercise(name, currentGymLoads.get(id) ?? all, all.some((w) => w > 0), UD.confirmedSteps), id });
}

// ---- week-1 targets for Block 1 ----
const bw = bodyweightOn(store, asOf);
const before = (id: string, date: string): Exposure[] => (exposures.get(id) ?? []).filter((e) => e.date < date);
const week1 = BLOCK_1.workouts.map((w) => ({
  key: w.key,
  name: w.name,
  focus: w.focus,
  slots: w.slots.map((slot) => {
    const ex = catalog.get(slot.exerciseId);
    if (!ex) return { slot, exercise: slot.exerciseId, missing: true };
    const hist = before(slot.exerciseId, asOf);
    const last = hist.at(-1);
    const rec = recommend({ slot, exercise: ex, history: hist, state: EMPTY_STATE, asOf, bodyweight: bw });
    return {
      slot,
      exercise: ex.name,
      loadType: ex.loadType,
      step: ex.equipment.step,
      stepHow: ex.stepHow,
      last: last ? { date: last.date, source: last.sets[0]?.source, sets: requiredSets(last, 99).map((x) => [x.weight, x.reps]) } : null,
      decision: rec.decision,
      target: rec.target,
      targetText: rec.target ? formatTarget(ex, rec.target) : null,
      targetEstimate: rec.targetEstimate,
      benchmark: rec.benchmark,
      gainPct: rec.gainPct,
      reason: rec.reason,
      flags: rec.flags,
      alternatives: rec.alternatives.map((a) => ({ label: a.label, text: formatTarget(ex, a.target), note: a.note })),
    };
  }),
}));

// ---- replay: each Block 1 exercise through its history ----
const since = '2025-10-27';
const primarySlot = new Map<string, Slot>();
for (const w of BLOCK_1.workouts) for (const s of w.slots) if (!primarySlot.has(s.exerciseId) || s.role === 'anchor') primarySlot.set(s.exerciseId, s);

interface ReplayRow {
  date: string;
  source: string;
  actual: Array<[number, number]>;
  actualEstimate: number | null;
  bestSetEstimate: number | null;
  decision: string | null;
  targetText: string | null;
  targetEstimate: number | null;
  met: boolean | null;
  byEstimate: boolean;
  /** For misses: weakest required set's estimate vs the target's, in %. */
  shortfallPct: number | null;
  actualMinReps: number;
  targetMinReps: number | null;
  reason: string | null;
}
const replay: Record<string, { name: string; loadType: string; slot: Slot; rows: ReplayRow[]; summary: Record<string, number> }> = {};
for (const [id, slot] of primarySlot) {
  const ex = catalog.get(id);
  const all = exposures.get(id) ?? [];
  if (!ex || !all.length) continue;
  let state: ProgressState = EMPTY_STATE;
  const rows: ReplayRow[] = [];
  for (let k = 0; k < all.length; k++) {
    const exp = all[k]!;
    const work = requiredSets(exp, 99);
    if (!work.length) continue;
    // History did not follow Block 1's set counts; judge each session on the sets it actually had (up to the plan).
    const s: Slot = { ...slot, sets: Math.min(slot.sets, work.length) };
    const bwHere = bodyweightOn(store, exp.date) ?? bw;
    const prior = all.slice(0, k);
    const rec = prior.length ? recommend({ slot: s, exercise: ex, history: prior, state, asOf: exp.date, bodyweight: bwHere }) : null;
    const outcome = rec?.target ? evaluate(rec.target, ex, exp, s, bwHere) : null;
    if (rec) state = nextState(state, rec, outcome);
    if (exp.date < since) continue;
    const req = requiredSets(exp, s.sets, setStrength(ex, bwHere));
    const eff = (w: number): number | null => (ex.loadType === 'external' ? w : ex.loadType === 'assisted' && bwHere != null ? bwHere - w : null);
    const ests = req.map((x) => (eff(x.weight) == null ? null : estimate(eff(x.weight)!, x.reps)));
    const allEsts = work.map((x) => (eff(x.weight) == null ? null : estimate(eff(x.weight)!, x.reps)));
    rows.push({
      date: exp.date,
      source: exp.sets[0]!.source,
      actual: work.map((x) => [x.weight, x.reps]),
      actualEstimate: ests.every((e) => e != null) && ests.length ? round1(Math.min(...(ests as number[]))) : null,
      bestSetEstimate: allEsts.every((e) => e != null) && allEsts.length ? round1(Math.max(...(allEsts as number[]))) : null,
      decision: rec?.decision ?? null,
      targetText: rec?.target ? formatTarget(ex, rec.target) : null,
      targetEstimate: rec?.targetEstimate ?? null,
      met: outcome ? outcome.met : null,
      byEstimate: outcome?.byEstimate ?? false,
      shortfallPct: null,
      actualMinReps: Math.min(...req.map((x) => x.reps)),
      targetMinReps: rec?.target ? Math.min(...rec.target.reps) : null,
      reason: rec?.reason ?? null,
    });
  }
  for (const r of rows)
    if (r.met === false && r.actualEstimate != null && r.targetEstimate != null) r.shortfallPct = Math.round((r.actualEstimate / r.targetEstimate - 1) * 1000) / 10;
  const judged = rows.filter((r) => r.met != null);
  replay[id] = {
    name: ex.name,
    loadType: ex.loadType,
    slot,
    rows,
    summary: {
      sessions: rows.length,
      judged: judged.length,
      met: judged.filter((r) => r.met && !r.byEstimate).length,
      metByEstimate: judged.filter((r) => r.met && r.byEstimate).length,
      missed: judged.filter((r) => !r.met).length,
      nearMiss: judged.filter((r) => r.met === false && r.shortfallPct != null && r.shortfallPct >= -3).length,
      weightIncreases: rows.filter((r) => r.decision === 'add-weight' || r.decision === 'conflict-jump').length,
    },
  };
}

// ---- link decisions for the user ----
const earlierNames = new Set(earlier.sets.map((s) => String(s.original?.['exercise'])));
const fitbodNames = new Set(fitbod.sets.map((s) => String(s.original?.['exercise'])));
const fitbodWeighted = new Set(fitbod.sets.filter((s) => s.weight > 0).map((s) => String(s.original?.['exercise'])));
const range = (id: string, src: string): string => {
  const w = [...store.sets.values()].filter((s) => s.exerciseId === id && s.source === src && s.kind === 'work' && s.weight > 0).map((s) => s.weight);
  return w.length ? `${Math.min(...w)}–${Math.max(...w)} lb` : 'bodyweight';
};
const links: Array<{ earlierApp: string; fitbod: string; status: string; earlierRange: string; fitbodRange: string; fitbodSets: number }> = [];
for (const n of earlierNames) {
  if (!fitbodNames.has(n)) continue;
  const fid = fitbodExerciseId(n, fitbodWeighted.has(n));
  links.push({
    earlierApp: n,
    fitbod: n,
    status: fid === slugify(n) ? 'joined: free weight or bodyweight' : 'kept separate: your current gym machine takes priority',
    earlierRange: range(slugify(n), 'earlier-app'),
    fitbodRange: range(fid, 'fitbod'),
    fitbodSets: [...store.sets.values()].filter((s) => s.exerciseId === fid && s.source === 'fitbod').length,
  });
}
for (const sug of LINK_SUGGESTIONS) {
  const renamed = UD.fitbodRenames[sug.fitbod];
  const fid = renamed ? slugify(renamed) : fitbodExerciseId(sug.fitbod, fitbodWeighted.has(sug.fitbod));
  links.push({
    earlierApp: sug.earlierApp,
    fitbod: sug.fitbod,
    status: renamed ? 'joined: same dumbbell movement' : 'kept separate: your current gym machine takes priority',
    earlierRange: range(slugify(sug.earlierApp), 'earlier-app'),
    fitbodRange: range(fid, 'fitbod'),
    fitbodSets: [...store.sets.values()].filter((s) => s.exerciseId === fid && s.source === 'fitbod').length,
  });
}

const muscles = (id: string): Record<string, number> => MUSCLES[catalog.get(id)?.name ?? ''] ?? {};
const out = {
  generatedAt: new Date().toISOString(),
  asOf,
  bodyweight: bw,
  imports: [fitbod, earlier].map((r) => ({ source: r.source, fileName: r.fileName, fingerprint: r.fingerprint, totals: r.totals, issues: r.issues.map((i) => ({ kind: i.kind, message: i.message, count: i.ids.length })) })),
  merge,
  program: { name: BLOCK_1.name, suggestedOrder: BLOCK_1.suggestedOrder, weeklySets: weeklySets(BLOCK_1, muscles) },
  week1,
  replay,
  links,
  decisions: UD,
  bodyweights: [...store.measurements.values()].filter((m) => m.bodyWeight != null).map((m) => ({ date: m.date, lb: m.bodyWeight })).sort((a, b) => a.date.localeCompare(b.date)),
};
mkdirSync(new URL('out/', root), { recursive: true });
writeFileSync(new URL('out/replay.json', root), JSON.stringify(out, null, 1));

// ---- console summary ----
console.log(`asOf ${asOf}, bodyweight ${bw} lb`);
for (const w of week1) {
  console.log(`\n${w.name} — ${w.focus}`);
  for (const s of w.slots) {
    if ('missing' in s) {
      console.log(`  ${s.exercise}: NO HISTORY`);
      continue;
    }
    const last = s.last ? `${s.last.date} ${s.last.sets.map(([a, b]) => `${a}×${b}`).join(', ')}` : 'none';
    console.log(`  ${s.exercise} [${s.slot.sets}×${s.slot.repMin}–${s.slot.repMax}, step ${s.step}${s.stepHow === 'inferred' ? '*' : ''}] last ${last} → ${s.decision}: ${s.targetText ?? '—'}${s.gainPct != null ? ` (${s.gainPct}%)` : ''}${s.flags.length ? ` {${s.flags.join(',')}}` : ''}`);
  }
}
console.log('\nReplay summary (since', since + ')');
for (const [id, r] of Object.entries(replay)) console.log(`  ${r.name.padEnd(46)} ${JSON.stringify(r.summary)}`);
const tot = Object.values(replay).reduce((a, r) => { for (const [k, v] of Object.entries(r.summary)) a[k] = (a[k] ?? 0) + v; return a; }, {} as Record<string, number>);
console.log('\nTOTAL', tot);
console.log('\nweekly sets', out.program.weeklySets);
