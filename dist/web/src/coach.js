// Connects the progression rules to the data on this device: targets, the miss ladder and the week board.

import { EMPTY_STATE, evaluate, recommend,                                 } from '../../src/engine.js';
                                                                   
import { buildExercise, CATALOG_NAMES, HISTORY_ALIASES, slugify } from '../../src/import/catalog.js';
import { USER_DECISIONS } from '../../src/decisions.js';
import { EXERCISE_NAMES, LEGACY_WORKOUTS, PATTERN,                                  } from '../../src/program/block1.js';
import { allProgramExerciseIds, DELOAD_ID, DEFAULT_SCHEDULE, findTemplate, isDeloadKey, planForWeek, regionsOf, scheduleProgram,                                        } from '../../src/program/programs.js';
import { stepEasier } from '../../src/engine.js';
import { get } from './db.js';
                                                            
import { bus, getSession, latestBodyweight, save, sessionsInWeek, setsBetween, setsForExercise, setsForSession,                                               } from './store.js';
import { addDays, today, weekKey } from './dates.js';

// ---------- programs and the block schedule ----------
                          
                 
                  
 
/** The block schedule, synced between devices (the agreed plan until changed). */
export async function getSchedule()                   {
  const rec = await get                                        ('settings', 'schedule');
  return rec && !rec.deleted && rec.blocks?.length ? rec.blocks : DEFAULT_SCHEDULE;
}
export async function switchProgram(programId        , start        )                {
  const blocks = scheduleProgram(await getSchedule(), programId, start);
  await save              ('settings', { id: 'schedule', blocks }                           );
}
export async function planFor(week         = weekKey(today()))                    {
  return planForWeek(await getSchedule(), week);
}

export const workoutByKey = (key        )                              => findTemplate(key);
export const workoutName = (key        )         => workoutByKey(key)?.name ?? LEGACY_WORKOUTS[key] ?? key;

/** Weight-plate color family for a workout: press red, back blue, legs yellow; anything else steel. */
                      
export const plateOf = (template        )        => {
  const t = findTemplate(template);
  if (t) return t.plate;
  const p = PATTERN[template];
  return p === 'push' || p === 'pull' || p === 'legs' ? p : 'steel';
};

export function exerciseName(id        , fallback         )         {
  if (EXERCISE_NAMES[id]) return EXERCISE_NAMES[id] ;
  if (CATALOG_NAMES[id]) return CATALOG_NAMES[id] ;
  if (fallback) return fallback;
  const base = id.replace(/^fitbod-/, '');
  return base.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- exercises ----------
/** An exercise's sets, plus earlier histories that count as the same exercise (see HISTORY_ALIASES). */
async function setsWithAliases(id        )                    {
  const lists = await Promise.all([id, ...(HISTORY_ALIASES[id] ?? [])].map((x) => setsForExercise(x)));
  return lists.flat();
}

const exerciseCache = new Map                  ();

export async function exerciseFor(id        , nameHint         )                    {
  const hit = exerciseCache.get(id);
  if (hit) return hit;
  const sets = await setsWithAliases(id);
  const name = exerciseName(id, nameHint ?? (sets.find((s) => s.original?.['exercise'])?.original?.['exercise']                      ));
  const current = sets.filter((s) => s.source !== 'fitbod' && s.kind !== 'warmup').map((s) => s.weight);
  const all = sets.filter((s) => s.kind !== 'warmup').map((s) => s.weight);
  const ex = { ...buildExercise(name, current.length ? current : all, all.some((w) => w > 0), USER_DECISIONS.confirmedSteps), id };
  exerciseCache.set(id, ex);
  return ex;
}

export const forgetExercise = (id        )       => {
  exerciseCache.delete(id);
};
// Equipment and load type are inferred from logged weights, so recompute after any change
// (an import, a sync from the other device, or a new set).
bus.addEventListener('change', () => exerciseCache.clear());

// ---------- history → exposures ----------
async function exposuresFor(exerciseId        , excludeSession         )                                                                        {
  const sets = (await setsWithAliases(exerciseId)).filter((s) => s.sessionId !== excludeSession);
  const groups = new Map                  ();
  for (const s of sets) groups.set(s.sessionId, [...(groups.get(s.sessionId) ?? []), s]);
  const sessions = new Map                    ();
  await Promise.all([...groups.keys()].map(async (id) => {
    const sess = await getSession(id);
    if (sess) sessions.set(id, sess);
  }));
  // Deload weeks are deliberately light: they never count as history for the next target.
  for (const [id, sess] of sessions) if (sess.programId === DELOAD_ID) groups.delete(id);
  const exposures             = [...groups.entries()].map(([sessionId, list]) => ({
    sessionId,
    exerciseId,
    date: list.reduce((m, s) => (s.performedDate < m ? s.performedDate : m), list[0] .performedDate),
    sets: list.sort((a, b) => a.order - b.order),
    planned: sessions.get(sessionId)?.source === 'app',
  }));
  exposures.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
  return { exposures, sessions };
}

/** Replays this app's own planned sessions to find the last target and how many times in a row it was missed. */
async function progressState(exerciseId        , slot      , exposures            , sessions                         )                         {
  let state                = EMPTY_STATE;
  const ex = await exerciseFor(exerciseId);
  for (const e of exposures) {
    const sess = sessions.get(e.sessionId);
    const t = sess?.source === 'app' ? Object.values(sess.targets ?? {}).find((x) => x.exerciseId === exerciseId && x.weight != null) : undefined;
    if (!t) {
      state = EMPTY_STATE; // an unplanned session (imported history) resets the ladder
      continue;
    }
    const target         = { weight: t.weight , reps: t.reps };
    const outcome = evaluate(target, ex, e, { ...slot, sets: t.reps.length }, await latestBodyweight(e.date));
    state = outcome.met ? { lastTarget: target, misses: 0 } : { lastTarget: target, misses: t.decision === 'step-back' ? 1 : state.misses + 1 };
  }
  return state;
}

/** The target for one slot on a given date, from everything logged before this session. */
export async function targetFor(slot      , date        , sessionId         )                      {
  const ex = await exerciseFor(slot.exerciseId);
  const { exposures, sessions } = await exposuresFor(slot.exerciseId, sessionId);
  const history = exposures.filter((e) => e.date <= date);
  const state = await progressState(slot.exerciseId, slot, history, sessions);
  const bodyweight = await latestBodyweight(date);
  const rec = recommend({ slot, exercise: ex, history, state, asOf: date, bodyweight });
  if (isDeloadKey(slot.key) && rec.target) return deloadTarget(slot, ex, rec, bodyweight);
  return {
    exerciseId: slot.exerciseId,
    decision: rec.decision,
    weight: rec.target?.weight ?? null,
    reps: rec.target?.reps ?? Array.from({ length: slot.sets }, () => slot.repMin),
    estimate: rec.targetEstimate,
    benchmark: rec.benchmark,
    gain: rec.gainPct,
    reason: rec.reason,
    flags: rec.flags,
  };
}

/** Deload: the usual target about 10% lighter (a little more assistance on assisted moves), fewer sets. */
function deloadTarget(slot      , ex          , rec                              , bodyweight               )             {
  const t = rec.target ;
  let weight = t.weight;
  let reps = t.reps.slice(0, slot.sets);
  if (ex.loadType === 'bodyweight') reps = reps.map((r) => Math.max(1, r - 2));
  else if (ex.loadType === 'assisted') weight = stepEasier(ex, weight) ?? weight;
  else {
    const goal = t.weight * 0.9;
    while (weight > goal) {
      const next = stepEasier(ex, weight);
      if (next == null || next >= weight || next < 0) break;
      weight = next;
    }
  }
  void bodyweight;
  return {
    exerciseId: slot.exerciseId,
    decision: 'deload',
    weight,
    reps,
    estimate: null,
    benchmark: rec.benchmark,
    gain: null,
    reason: `Deload week: ${slot.sets} set${slot.sets === 1 ? '' : 's'} instead of the usual, about 10% lighter than this week's target (${t.weight} lb). Stop well short of failure. Next week's targets ignore this week, so nothing is lost.`,
    flags: rec.flags,
  };
}

// ---------- sessions ----------
/** The slots of a session, in its current order, with swaps applied. */
export function sessionSlots(sess            )         {
  const tmpl = workoutByKey(sess.template);
  const base         = [...(tmpl?.slots ?? []), ...(sess.added ?? [])].map((s) => ({ ...s, exerciseId: sess.swaps?.[s.key] ?? s.exerciseId }));
  if (!sess.order?.length) return base;
  const byKey = new Map(base.map((s) => [s.key, s]));
  const ordered = sess.order.map((k) => byKey.get(k)).filter((s)            => !!s);
  return [...ordered, ...base.filter((s) => !sess.order .includes(s.key))];
}

/** Slots for an imported session that has no template (e.g. the open Upper B): one per exercise logged. */
export function slotsFromSets(sets          )         {
  const seen = new Map              ();
  for (const s of sets) {
    const key = s.slotKey ?? s.exerciseId;
    if (!seen.has(key)) seen.set(key, { key, exerciseId: s.exerciseId, role: 'secondary', sets: 0, repMin: 8, repMax: 12 });
  }
  return [...seen.values()];
}

// ---------- week board ----------
                           
                            
                             
                  
               
                                                 
 

export async function weekBoard(week         = weekKey(today()))                                                                                          {
  const plan = await planFor(week);
  const program = plan.program;
  const sessions = (await sessionsInWeek(week)).filter((s) => s.programId === program.id);
  const items             = [];
  for (const tmpl of program.workouts) {
    const session = sessions.filter((s) => s.template === tmpl.key).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
    const planned = tmpl.slots.reduce((n, s) => n + s.sets, 0);
    let done = 0;
    if (session) {
      const sets = await setsForSession(session.id);
      // Only the planned exercises count toward the week (swaps included); added exercises are a bonus.
      const plannedKeys = new Set(tmpl.slots.map((x) => x.key));
      for (const slot of sessionSlots(session).filter((x) => plannedKeys.has(x.key))) {
        const n = sets.filter((x) => x.slotKey === slot.key && x.kind === 'work' && x.completed).length;
        done += Math.min(n, slot.sets);
      }
    }
    const status = !session || done === 0 ? (session?.status === 'finished' ? 'done' : 'not-started') : done >= planned || session.status === 'finished' ? 'done' : 'in-progress';
    items.push({ template: tmpl, session, planned, done, status });
  }
  // Suggest the next workout in order that is not done and does not repeat yesterday's main regions.
  const yesterday = addDays(today(), -1);
  // What was actually trained yesterday: workouts with sets logged on that day (opening one to look doesn't count).
  const ySets = (await setsBetween(yesterday, yesterday)).filter((s) => s.completed && s.kind !== 'warmup');
  const recent = (await Promise.all([...new Set(ySets.map((s) => s.sessionId))].map((id) => getSession(id)))).filter((s)                  => !!s);
  const avoid = new Set        (recent.flatMap((s) => [...regionsForSession(s.template)]));
  const open = program.suggestedOrder.map((k) => items.find((i) => i.template.key === k) ).filter((i) => i && i.status !== 'done');
  const required = open.filter((i) => !i.template.optional);
  const inProgress = open.find((i) => i.status === 'in-progress' && i.session?.date === today());
  const fresh = (i          ) => ![...regionsForSession(i.template.key)].some((r) => avoid.has(r));
  // Required workouts first; optional pump days are suggested once the required ones are done.
  const pick = inProgress ?? required.find(fresh) ?? required[0] ?? open.find(fresh) ?? open[0];
  return { week, items, suggestion: pick?.template.key ?? null, plan };
}

/** Main regions a workout trains; workouts from the previous plan: upper = push + pull, lower = legs. */
function regionsForSession(template        )              {
  const t = findTemplate(template);
  if (t) return regionsOf(t, (id) => exerciseName(id));
  const p = PATTERN[template];
  return new Set        (p === 'upper' ? ['push', 'pull'] : p === 'lower' ? ['legs'] : p ? [p] : []);
}

/** Planned sets for the week vs sets logged toward them, and the pace needed to finish by Sunday. */
                               
               
                  
              
               
                                      
                 
 
export function weekProgress(items            , week        )               {
  // Optional days are a bonus: they don't count toward the week's completion.
  const req = items.filter((i) => !i.template.optional);
  const planned = req.reduce((n, i) => n + i.planned, 0);
  const done = req.reduce((n, i) => n + Math.min(i.done, i.planned), 0);
  const left = Math.max(0, planned - done);
  const daysLeft = Math.max(1, Math.min(7, Math.round((new Date(`${addDays(week, 6)}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86_400_000) + 1));
  return { done, planned, pct: planned ? Math.round((done / planned) * 100) : 0, left, daysLeft, perDay: Math.ceil(left / daysLeft) };
}

export const programExerciseIds = allProgramExerciseIds;
export { slugify };
