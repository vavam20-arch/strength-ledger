// More tab: the current program and block, what's coming up, and switching programs.

import { h, icon, sheet, toast } from '../ui.js';
import { exerciseName, getSchedule, planFor, plateOf, switchProgram } from '../coach.js';
import { DELOAD_ID, PROGRAMS, deloadOf, programById, weekShape,            } from '../../../src/program/programs.js';
                                                              
import { addDays, shortDate, today, weekKey } from '../dates.js';
import { syncSoon } from '../sync-client.js';

const nameOfBlock = (b       )         => (b.programId === DELOAD_ID ? 'Deload week' : programById(b.programId)?.name ?? b.programId);

export async function programSection(onChange            )                       {
  const plan = await planFor();
  const blocks = (await getSchedule()).filter((b) => b.start > plan.block.start).sort((a, b) => a.start.localeCompare(b.start));
  const end = addDays(plan.block.start, plan.block.weeks * 7 - 1);
  const p = plan.program;
  return h('section', { class: 'card program-card' },
    h('h2', null, 'Program'),
    h('div', { class: 'program-now', 'data-plate': p.workouts[0] ? plateOf(p.workouts[0].key) : 'steel' },
      h('strong', { class: 'program-name' }, p.id === DELOAD_ID ? 'Deload week' : p.name),
      h('span', { class: 'muted' }, plan.overrun
        ? `Block finished ${shortDate(end)}. Carrying on until you choose what's next.`
        : `Week ${plan.week} of ${plan.block.weeks} · until ${shortDate(end)}`),
      h('p', { class: 'note' }, p.description)),
    blocks.length
      ? h('div', { class: 'stack' },
          h('h3', null, 'Coming up'),
          h('ul', { class: 'plain-list upcoming' },
            blocks.map((b) => h('li', null, h('span', null, nameOfBlock(b)), h('span', { class: 'muted' }, `${shortDate(b.start)} · ${b.weeks} week${b.weeks === 1 ? '' : 's'}`)))))
      : null,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => void changeSheet(plan.block, onChange) }, 'Change program')),
    h('details', { class: 'program-detail' },
      h('summary', null, `See this week's workouts`),
      workoutsOf(p)),
  );
}

function workoutsOf(p         )              {
  return h('div', null,
    p.workouts.map((w) =>
      h('div', { class: 'prog', 'data-plate': w.plate },
        h('h3', null, w.name, w.optional ? h('span', { class: 'chip' }, 'Optional') : null, h('span', { class: 'muted' }, ` · ${w.focus}`)),
        h('ul', { class: 'plain-list' }, w.slots.map((s) => h('li', null, h('span', null, exerciseName(s.exerciseId)), h('span', { class: 'mono' }, `${s.sets} × ${s.repMin}–${s.repMax}`)))))));
}

async function changeSheet(current       , onChange            )                {
  const thisWeek = weekKey(today());
  const nextMonday = addDays(thisWeek, 7);
  const blockEnd = addDays(current.start, current.weeks * 7);
  const options                                          = [
    ...PROGRAMS.map((p) => ({ id: p.id, program: p })),
    { id: DELOAD_ID, program: deloadOf(programById(current.programId) ?? PROGRAMS[0] ) },
  ];
  let chosen = options.find((o) => o.id !== current.programId) .id;
  const starts                                                         = [
    { value: nextMonday, label: `Next Monday, ${shortDate(nextMonday)}` },
    { value: thisWeek, label: 'This week', note: 'Workouts you already started this week stay in History.' },
    ...(blockEnd > nextMonday ? [{ value: blockEnd, label: `When this block ends, ${shortDate(blockEnd)}` }] : []),
  ];
  let start = starts[0] .value;

  const list = h('div', { class: 'program-options', role: 'radiogroup', 'aria-label': 'Program' });
  const drawList = () =>
    list.replaceChildren(
      ...options.map((o) =>
        h('button', {
          type: 'button',
          role: 'radio',
          'aria-checked': String(o.id === chosen),
          class: `program-option${o.id === chosen ? ' on' : ''}`,
          'data-plate': o.program.workouts[0]?.plate ?? 'steel',
          onclick: () => {
            chosen = o.id;
            drawList();
            drawGo();
          },
        },
          h('strong', null, o.id === DELOAD_ID ? 'Deload week' : o.program.name, o.id === current.programId ? h('span', { class: 'chip' }, 'Current') : null),
          h('span', { class: 'muted shape' }, o.id === DELOAD_ID ? '1 lighter week, then the next block' : weekShape(o.program)),
          h('span', { class: 'desc' }, o.program.description))));
  const when = h('div', { class: 'start-options', role: 'radiogroup', 'aria-label': 'Start' });
  const drawWhen = () =>
    when.replaceChildren(
      ...starts.map((s) =>
        h('button', {
          type: 'button',
          role: 'radio',
          'aria-checked': String(s.value === start),
          class: `chip-btn${s.value === start ? ' on' : ''}`,
          onclick: () => {
            start = s.value;
            drawWhen();
          },
        }, s.label)),
      ...starts.filter((s) => s.value === start && s.note).map((s) => h('p', { class: 'note' }, s.note )),
    );
  const go = h('button', { type: 'submit', class: 'btn primary wide' });
  const drawGo = () => {
    const o = options.find((x) => x.id === chosen) ;
    go.replaceChildren(icon('check'), `Switch to ${o.id === DELOAD_ID ? 'a deload week' : o.program.name}`);
  };
  drawList();
  drawWhen();
  drawGo();
  const body = h('form', { class: 'stack', onsubmit: async (e       ) => {
    e.preventDefault();
    await switchProgram(chosen, start);
    syncSoon();
    const o = options.find((x) => x.id === chosen) ;
    toast(`${o.id === DELOAD_ID ? 'Deload week' : o.program.name} ${start === thisWeek ? 'starts this week' : `starts ${shortDate(start)}`}. Blocks are 4 weeks.`, 4000);
    s.close();
    onChange();
  } },
    h('p', { class: 'note' }, 'Your targets stay with each exercise, so nothing is lost when you switch. A different rep range is converted through estimated strength.'),
    list,
    h('h3', null, 'Start'),
    when,
    go);
  const s = sheet('Change program', body);
}
