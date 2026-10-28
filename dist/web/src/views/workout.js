// Workout screen: targets, one-tap set logging, extra sets, done-as-planned, swap/reorder/add, knee check,
// catch-up date, finish/reopen. Every tap is saved on the device before the screen shows it as saved.

import { clear, fill, fmtNum, h, icon, sheet, stepper, toast } from '../ui.js';
import { exerciseFor, exerciseName, plateOf, PROGRAM, sessionSlots, slotsFromSets, targetFor, workoutByKey, workoutName } from '../coach.js';
import { getSession, pendingIds, save, setsForSession, update,                                               } from '../store.js';
import { longDate, relativeDay, today, weekKey } from '../dates.js';
import { MUSCLES, slugify } from '../../../src/import/catalog.js';
                                                            
import { syncSoon } from '../sync-client.js';

const logDates = new Map                ();
const extraRows = new Map                ();

const DECISION_LABEL                         = {
  'build-reps': 'Add reps',
  'add-weight': 'Add weight',
  calibrate: 'New working weight',
  'repeat-after-break': 'Repeat after a break',
  repeat: 'Repeat',
  hold: 'Hold',
  'step-back': 'Step back',
  'conflict-extend': 'Extend reps',
  'conflict-jump': 'Take the jump',
  'top-of-range': 'Top of range',
  baseline: 'Find your baseline',
};

/** Open (or create) this week's session for a workout and return its ID. Targets are fixed now. */
export async function startSession(templateKey        )                  {
  const tmpl = workoutByKey(templateKey);
  if (!tmpl) throw new Error(`Unknown workout ${templateKey}`);
  const date = today();
  const wk = weekKey(date);
  const { sessionsInWeek } = await import('../store.js');
  const existing = (await sessionsInWeek(wk)).find((s) => s.template === templateKey && s.programId === PROGRAM.id);
  if (existing) return existing.id;
  const targets                             = {};
  for (const slot of tmpl.slots) targets[slot.key] = await targetFor(slot, date);
  const sess = await save            ('sessions', {
    id: crypto.randomUUID(),
    date,
    weekKey: wk,
    template: templateKey,
    programId: PROGRAM.id,
    source: 'app',
    status: 'open',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    targets,
    order: null,
    swaps: {},
    added: [],
    knee: null,
    extra: {},
  });
  syncSoon();
  return sess.id;
}

export async function renderWorkout(root             , id        )                {
  const sess = await getSession(id);
  if (!sess || sess.deleted) {
    fill(root, h('p', { class: 'empty' }, 'This workout was not found. It may have been deleted on another device.'), h('a', { class: 'btn', href: '#train' }, 'Back to this week'));
    return;
  }
  const sets = await setsForSession(id);
  const pending = await pendingIds();
  const isProgram = sess.programId === PROGRAM.id;
  const slots = isProgram ? sessionSlots(sess) : slotsFromSets(sets);
  const logDate = logDates.get(id) ?? today();
  const tmpl = workoutByKey(sess.template);
  const legDay = /^legs/.test(sess.template);

  // Fill in targets for slots that have none yet (a swap or an added exercise from another device).
  if (isProgram) {
    const missing = slots.filter((s) => !sess.targets?.[s.key] || sess.targets[s.key] .exerciseId !== s.exerciseId);
    if (missing.length) {
      const targets = { ...sess.targets };
      for (const s of missing) targets[s.key] = await targetFor(s, sess.date, sess.id);
      await update            ('sessions', sess.id, { targets });
      return renderWorkout(root, id);
    }
  }

  const rerender = () => void renderWorkout(root, id);
  const dateInput = h('input', {
    type: 'date',
    value: logDate,
    max: today(),
    'aria-label': 'Date these sets were performed',
    onchange: (e       ) => {
      const v = (e.target                    ).value;
      if (v) {
        logDates.set(id, v);
        rerender();
      }
    },
  });

  const header = h(
    'header',
    { class: 'page-head workout-head', 'data-plate': plateOf(sess.template) },
    h('a', { class: 'back', href: '#train' }, icon('back'), 'Week'),
    h('h1', null, workoutName(sess.template)),
    h('p', { class: 'muted workout-focus' }, isProgram ? tmpl?.focus ?? '' : 'From your previous plan'),
    h('label', { class: 'log-date' }, h('span', null, 'Logging for'), h('strong', null, relativeDay(logDate)), dateInput),
    logDate !== today() ? h('p', { class: 'note' }, `Catch-up mode: new sets are dated ${longDate(logDate)}.`) : null,
    sess.status === 'finished' ? h('p', { class: 'chip good' }, 'Finished · you can still add or fix sets') : null,
  );

  const body         = [];
  if (legDay) body.push(kneeCheck(sess, rerender));
  for (const [i, slot] of slots.entries()) {
    body.push(await slotCard(sess, slot, i, slots, sets, pending, logDate, isProgram, rerender));
  }

  fill(root, 
    header,
    ...body,
    isProgram ? h('button', { class: 'btn wide', type: 'button', onclick: () => pickExercise('Add an exercise', null, async (exId) => addExercise(sess, exId).then(rerender)) }, icon('plus'), 'Add an exercise') : null,
    sess.status === 'open'
      ? h('button', { class: 'btn primary wide finish', type: 'button', onclick: async () => {
          await update            ('sessions', sess.id, { status: 'finished', finishedAt: new Date().toISOString() });
          syncSoon();
          toast('Workout finished. You can reopen it any time.');
          location.hash = '#train';
        } }, icon('check'), 'Finish workout')
      : h('button', { class: 'btn wide', type: 'button', onclick: async () => {
          await update            ('sessions', sess.id, { status: 'open', finishedAt: null });
          syncSoon();
          rerender();
        } }, 'Reopen workout'),
  );
}

function kneeCheck(sess            , rerender            )              {
  const chips = [0, 1, 2, 3].map((n) =>
    h('button', {
      type: 'button',
      class: `seg${sess.knee === n ? ' on' : ''}`,
      'aria-pressed': String(sess.knee === n),
      onclick: async () => {
        await update            ('sessions', sess.id, { knee: sess.knee === n ? null : n });
        syncSoon();
        rerender();
      },
    }, String(n)),
  );
  const advice = (sess.knee ?? 0) >= 2
    ? h('div', { class: 'advice' },
        h('strong', null, 'Knees sore today'),
        h('ul', null,
          h('li', null, 'Swap the leverage squat or leg extension for a hinge such as Romanian Deadlift (use the swap button on the exercise).'),
          h('li', null, 'Stay at the 10–15 rep end with a lighter weight.'),
          h('li', null, 'Or do this workout later in the week.')),
        h('p', { class: 'note' }, 'If knee pain keeps coming back or gets worse, see a doctor or physical therapist.'))
    : null;
  return h('section', { class: 'card knee' }, h('div', { class: 'knee-row' }, h('span', null, h('strong', null, 'Knee check'), h('span', { class: 'muted' }, ' optional · 0 = fine, 3 = sore')), h('div', { class: 'segs' }, chips)), advice);
}

async function slotCard(
  sess            ,
  slot      ,
  index        ,
  slots        ,
  allSets          ,
  pending             ,
  logDate        ,
  isProgram         ,
  rerender            ,
)                       {
  const ex = await exerciseFor(slot.exerciseId);
  const target = sess.targets?.[slot.key];
  const mine = allSets.filter((s) => (isProgram ? s.slotKey === slot.key : (s.slotKey ?? s.exerciseId) === slot.key));
  const work = mine.filter((s) => s.kind === 'work');
  const extras = mine.filter((s) => s.kind === 'extra');
  const step = ex.equipment.step || 5;
  const bw = ex.loadType === 'bodyweight';
  const lastWeight = [...mine].sort((a, b) => b.order - a.order)[0]?.weight ?? target?.weight ?? 0;
  const nextOrder = () => allSets.reduce((m, s) => Math.max(m, s.order), 0) + 1;
  const key = `${sess.id}|${slot.key}`;

  const makeSet = async (kind                  , weight        , reps        ) => {
    await save        ('sets', {
      id: crypto.randomUUID(),
      sessionId: sess.id,
      exerciseId: slot.exerciseId,
      slotKey: slot.key,
      kind,
      weight,
      reps,
      completed: true,
      performedDate: logDate,
      enteredAt: new Date().toISOString(),
      order: nextOrder(),
      rir: null,
      note: null,
      source: 'app',
    });
    syncSoon();
  };

  const rows                = [];
  const planned = isProgram ? slot.sets : 0;
  for (let i = 0; i < Math.max(planned, work.length); i++) {
    const rec = work[i];
    // After a logged set, later sets start from the weight actually used.
    const tw = work.length ? work.at(-1) .weight : target?.weight ?? lastWeight;
    const tr = target?.reps[i] ?? target?.reps.at(-1) ?? slot.repMax;
    rows.push(setRow({ ex, step, bw, label: String(i + 1), rec, weight: rec?.weight ?? tw, reps: rec?.reps ?? tr, pending, onLog: (w, r) => makeSet('work', w, r).then(rerender), rerender }));
  }
  extras.forEach((rec, j) => rows.push(setRow({ ex, step, bw, label: `+${j + 1}`, rec, weight: rec.weight, reps: rec.reps, pending, onLog: () => Promise.resolve(), rerender })));
  const draftExtras = extraRows.get(key) ?? 0;
  for (let j = 0; j < draftExtras; j++) {
    rows.push(setRow({ ex, step, bw, label: `+${extras.length + j + 1}`, rec: undefined, weight: lastWeight, reps: target?.reps.at(-1) ?? slot.repMax, pending, onLog: async (w, r) => {
      extraRows.set(key, Math.max(0, (extraRows.get(key) ?? 1) - 1));
      await makeSet('extra', w, r);
      rerender();
    }, rerender }));
  }

  const remaining = Math.max(0, planned - work.filter((s) => s.completed).length - (work.length - work.filter((s) => s.completed).length));
  const targetLine = target && (target.weight != null || bw) && target.reps.length
    ? bw ? `${repsText(target?.reps ?? [])} reps` : `${fmtLoad(ex, target?.weight ?? 0)} × ${repsText(target?.reps ?? [])}`
    : null;
  const doneAsPlanned = remaining > 0 && target && (target.weight != null || bw)
    ? h('button', { type: 'button', class: 'btn small', onclick: async () => {
        for (let i = work.length; i < planned; i++) await makeSet('work', target.weight ?? 0, target.reps[i] ?? target.reps.at(-1) ?? slot.repMax);
        toast(`Logged ${planned - work.length} sets as planned.`);
        rerender();
      } }, icon('check'), 'Done as planned')
    : null;

  const why = target?.reason ? h('details', { class: 'why' }, h('summary', null, 'Why this target?'), h('p', null, target.reason), target.estimate != null ? h('p', { class: 'note' }, `Estimated strength ${target.benchmark} → ${target.estimate} (${(target.gain ?? 0) >= 0 ? '+' : ''}${target.gain}%). Estimate = weight × (1 + reps ÷ 30).`) : null) : null;

  const actions = isProgram
    ? h('div', { class: 'slot-actions' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move up', disabled: index === 0, onclick: () => move(sess, slots, index, -1).then(rerender) }, icon('up')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move down', disabled: index === slots.length - 1, onclick: () => move(sess, slots, index, 1).then(rerender) }, icon('down')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Swap ${ex.name}`, onclick: () => pickExercise(`Swap ${ex.name}`, ex, async (newId) => swap(sess, slot, newId).then(rerender)) }, icon('swap')))
    : null;

  return h(
    'section',
    { class: 'card slot', 'aria-label': ex.name, 'data-plate': plateOf(sess.template) },
    h('div', { class: 'slot-head' },
      h('div', { class: 'slot-title' },
        h('h2', null, ex.name),
        h('p', { class: 'slot-plan' },
          isProgram ? `${slot.sets} sets of ${slot.repMin}–${slot.repMax}` : 'Logged before',
          target ? h('span', { class: `chip ${toneFor(target.decision)}` }, DECISION_LABEL[target.decision] ?? target.decision) : null)),
      actions),
    targetLine ? h('p', { class: 'target-row' }, h('span', { class: 'target-label' }, 'Target'), h('span', { class: 'target' }, targetLine)) : null,
    why,
    h('div', { class: 'set-head', 'aria-hidden': 'true' }, h('span', null, 'Set'), h('span', null, bw ? '' : ex.loadType === 'assisted' ? 'Assist (lb)' : 'Weight (lb)'), h('span', null, 'Reps'), h('span', null, '')),
    h('div', { class: 'sets' }, rows),
    h('div', { class: 'slot-foot' },
      doneAsPlanned,
      h('button', { type: 'button', class: 'btn small ghost', onclick: () => {
        extraRows.set(key, (extraRows.get(key) ?? 0) + 1);
        rerender();
      } }, icon('plus'), 'Extra set')),
  );
}

function setRow(o   
               
               
              
                
                          
                 
               
                       
                                                 
                       
 )              {
  let w = o.weight;
  let r = o.reps;
  const rec = o.rec;
  const done = !!rec?.completed;
  const persist = async (changes                 ) => {
    if (!rec) return;
    await update        ('sets', rec.id, changes);
    syncSoon();
    status.replaceChildren(statusIcon(true));
  };
  const status = h('span', { class: 'set-status' }, rec ? statusIcon(o.pending.has(rec.id)) : null);
  const weight = o.bw
    ? h('span', { class: 'bw' }, 'Bodyweight')
    : stepper({ value: w, step: o.step, label: `Set ${o.label} weight`, decimals: true, onChange: (v) => {
        w = v;
        void persist({ weight: v });
      } });
  const reps = stepper({ value: r, step: 1, min: 0, label: `Set ${o.label} reps`, onChange: (v) => {
    r = v;
    void persist({ reps: v });
  } });
  const check = h('button', {
    type: 'button',
    class: `check${done ? ' on' : ''}`,
    'aria-label': done ? `Set ${o.label} logged; tap to undo` : `Log set ${o.label}`,
    'aria-pressed': String(done),
    onclick: async () => {
      if (!rec) {
        check.disabled = true;
        await o.onLog(w, r);
        return;
      }
      await update        ('sets', rec.id, { completed: !rec.completed });
      syncSoon();
      o.rerender();
    },
  }, icon('check'));
  return h('div', { class: `set-row${done ? ' done' : ''}${rec ? '' : ' draft'}` }, h('span', { class: 'set-label' }, o.label, status), weight, reps, check);
}

function statusIcon(isPending         )              {
  return isPending
    ? h('span', { class: 'sync-dot pending', title: 'Saved on this device; waiting to sync', 'aria-label': 'Saved on this device, waiting to sync' })
    : h('span', { class: 'sync-dot', title: 'Saved and synced', 'aria-label': 'Saved and synced' });
}

const fmtLoad = (ex          , w        )         => (ex.loadType === 'assisted' ? `${fmtNum(w)} lb assist` : `${fmtNum(w)} lb`);
const repsText = (reps          )         => (reps.length && reps.every((x) => x === reps[0]) ? `${reps[0]}` : reps.join(', '));
const toneFor = (d        )         => (d === 'add-weight' || d === 'calibrate' || d === 'conflict-jump' ? 'good' : d === 'repeat' || d === 'hold' || d === 'repeat-after-break' || d === 'conflict-extend' ? 'warn' : d === 'step-back' ? 'bad' : 'accent');

async function move(sess            , slots        , i        , dir        )                {
  const order = slots.map((s) => s.key);
  const j = i + dir;
  if (j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j] , order[i] ];
  await update            ('sessions', sess.id, { order });
  syncSoon();
}

async function swap(sess            , slot      , exerciseId        )                {
  const swaps = { ...sess.swaps };
  const tmplSlot = workoutByKey(sess.template)?.slots.find((s) => s.key === slot.key);
  if (tmplSlot && tmplSlot.exerciseId === exerciseId) delete swaps[slot.key];
  else swaps[slot.key] = exerciseId;
  const targets = { ...sess.targets, [slot.key]: await targetFor({ ...slot, exerciseId }, sess.date, sess.id) };
  await update            ('sessions', sess.id, { swaps, targets });
  syncSoon();
  toast(`Swapped to ${exerciseName(exerciseId)}.`);
}

async function addExercise(sess            , exerciseId        )                {
  const slot       = { key: `${sess.template}/x${(sess.added?.length ?? 0) + 1}-${Date.now().toString(36)}`, exerciseId, role: 'isolation', sets: 3, repMin: 10, repMax: 15 };
  const targets = { ...sess.targets, [slot.key]: await targetFor(slot, sess.date, sess.id) };
  await update            ('sessions', sess.id, { added: [...(sess.added ?? []), slot], targets });
  syncSoon();
}

/** Exercise picker: same main muscle first, then everything at your gym. */
function pickExercise(title        , current                 , onPick                               )       {
  const primary = current ? Object.entries(current.muscles).find(([, v]) => v === 1)?.[0] : undefined;
  const all = Object.keys(MUSCLES).map((name) => ({ id: slugify(name), name, primary: Object.entries(MUSCLES[name] ).find(([, v]) => v === 1)?.[0] ?? '' }));
  const list = h('ul', { class: 'pick-list' });
  const search = h('input', { type: 'search', placeholder: 'Search exercises', 'aria-label': 'Search exercises', class: 'search' });
  const draw = () => {
    clear(list);
    const q = search.value.trim().toLowerCase();
    const items = all
      .filter((e) => e.id !== current?.id && (!q || e.name.toLowerCase().includes(q) || e.primary.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.primary === primary) - Number(a.primary === primary) || a.name.localeCompare(b.name));
    for (const e of items) {
      list.append(h('li', null, h('button', { type: 'button', class: 'pick', onclick: async () => {
        s.close();
        await onPick(e.id);
      } }, h('strong', null, e.name), h('span', { class: 'muted' }, e.primary === primary && primary ? `${e.primary} · same main muscle` : e.primary))));
    }
  };
  search.addEventListener('input', draw);
  draw();
  const s = sheet(title, h('div', null, search, list));
}
