// History tab: month calendar; pick a day to see its workouts and sets; tap an exercise to correct its sets.

import { fill, fmtNum, h, icon, sheet, stepper, toast } from '../ui.ts';
import { exerciseFor, workoutName } from '../coach.ts';
import { cardioBetween, getSession, remove, setsBetween, update, type AppCardio, type AppSet } from '../store.ts';
import { addDays, longDate, monthTitle, parseIso, today, toIso } from '../dates.ts';
import { syncSoon } from '../sync-client.ts';

let month = today().slice(0, 7);
let selected = today();

export async function renderHistory(root: HTMLElement): Promise<void> {
  const first = `${month}-01`;
  const d = parseIso(first);
  const last = toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
  const sets = (await setsBetween(first, last)).filter((s) => s.completed && s.kind !== 'warmup');
  const cardio = await cardioBetween(first, last);
  const byDay = new Map<string, { sets: number; cardio: number }>();
  for (const s of sets) byDay.set(s.performedDate, { sets: (byDay.get(s.performedDate)?.sets ?? 0) + 1, cardio: byDay.get(s.performedDate)?.cardio ?? 0 });
  for (const c of cardio) byDay.set(c.date, { sets: byDay.get(c.date)?.sets ?? 0, cardio: (byDay.get(c.date)?.cardio ?? 0) + 1 });

  const lead = (d.getDay() + 6) % 7;
  const cells: HTMLElement[] = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => h('span', { class: 'dow', 'aria-hidden': 'true', key: i }, x));
  for (let i = 0; i < lead; i++) cells.push(h('span', { class: 'day blank', 'aria-hidden': 'true' }));
  for (let day = first; day <= last; day = addDays(day, 1)) {
    const info = byDay.get(day);
    const isSel = day === selected;
    cells.push(
      h('button', {
        type: 'button',
        class: `day${isSel ? ' sel' : ''}${day === today() ? ' today' : ''}`,
        'aria-pressed': String(isSel),
        'aria-label': `${longDate(day)}${info ? `: ${info.sets} sets${info.cardio ? `, ${info.cardio} cardio` : ''}` : ''}`,
        onclick: () => {
          selected = day;
          void renderHistory(root);
        },
      },
      String(Number(day.slice(8))),
      h('span', { class: 'dots' }, info?.sets ? h('i', { class: 'dot lift' }) : null, info?.cardio ? h('i', { class: 'dot cardio' }) : null)),
    );
  }
  const shift = (n: number) => {
    const m = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
    month = toIso(m).slice(0, 7);
    selected = month === today().slice(0, 7) ? today() : `${month}-01`;
    void renderHistory(root);
  };

  fill(
    root,
    h('header', { class: 'page-head' }, h('h1', null, 'History')),
    h('div', { class: 'cal-head' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous month', onclick: () => shift(-1) }, icon('back')),
      h('h2', null, monthTitle(first)),
      h('button', { type: 'button', class: 'icon-btn flip', 'aria-label': 'Next month', disabled: month >= today().slice(0, 7), onclick: () => shift(1) }, icon('back'))),
    h('div', { class: 'calendar', role: 'group', 'aria-label': monthTitle(first) }, cells),
    await dayDetail(selected, sets.filter((s) => s.performedDate === selected), cardio.filter((c) => c.date === selected), () => void renderHistory(root)),
  );
}

async function dayDetail(day: string, sets: AppSet[], cardio: AppCardio[], refresh: () => void): Promise<HTMLElement> {
  const box = h('section', { class: 'day-detail' }, h('h2', { class: 'section-title' }, longDate(day)));
  if (!sets.length && !cardio.length) {
    box.append(h('p', { class: 'muted' }, 'Nothing logged on this day.'));
    return box;
  }
  const bySession = new Map<string, AppSet[]>();
  for (const s of sets) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s]);
  for (const [sid, list] of bySession) {
    const sess = await getSession(sid);
    const card = h('div', { class: 'card' }, h('h3', null, sess ? workoutName(sess.template) : 'Workout', sess?.source && sess.source !== 'app' ? h('span', { class: 'muted' }, sess.source === 'fitbod' ? ' · Fitbod' : ' · earlier app') : null));
    const byEx = new Map<string, AppSet[]>();
    for (const s of list.sort((a, b) => a.order - b.order)) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
    for (const [exId, xs] of byEx) {
      const ex = await exerciseFor(exId);
      const text = xs.map((s) => (ex.loadType === 'bodyweight' ? `${s.reps}` : `${fmtNum(s.weight)}×${s.reps}`)).join(', ');
      card.append(h('button', { type: 'button', class: 'hist-row', onclick: () => editSets(ex.name, xs, refresh) }, h('span', null, ex.name), h('span', { class: 'mono' }, ex.loadType === 'assisted' ? `assist ${text}` : text)));
    }
    if (sess) card.append(h('a', { class: 'link', href: `#w/${sess.id}` }, 'Open this workout'));
    box.append(card);
  }
  if (cardio.length) {
    box.append(h('div', { class: 'card' }, h('h3', null, 'Cardio'), cardio.map((c) => h('p', { class: 'hist-row static' }, h('span', null, c.activity), h('span', { class: 'mono' }, `${c.durationMin} min${c.distance != null ? ` · ${c.distance} ${c.distanceUnit === 'steps' ? 'steps' : c.distanceUnit === 'mi' ? 'mi' : 'm'}` : ''}`)))));
  }
  return box;
}

function editSets(name: string, sets: AppSet[], refresh: () => void): void {
  const body = h('div', { class: 'edit-list' });
  for (const s of sets) {
    const date = h('input', { type: 'date', value: s.performedDate, max: today(), 'aria-label': 'Date performed', onchange: async (e: Event) => {
      const v = (e.target as HTMLInputElement).value;
      if (v) {
        await update<AppSet>('sets', s.id, { performedDate: v });
        syncSoon();
        toast(`Moved to ${longDate(v)}.`);
      }
    } });
    body.append(
      h('div', { class: 'edit-row' },
        stepper({ value: s.weight, step: 5, label: 'Weight', decimals: true, onChange: (v) => void update<AppSet>('sets', s.id, { weight: v }).then(() => syncSoon()) }),
        stepper({ value: s.reps, step: 1, label: 'Reps', onChange: (v) => void update<AppSet>('sets', s.id, { reps: v }).then(() => syncSoon()) }),
        date,
        h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': 'Delete set', onclick: async (e: Event) => {
          await remove('sets', s.id);
          syncSoon();
          (e.currentTarget as HTMLElement).closest('.edit-row')?.remove();
          toast('Set deleted.');
        } }, icon('trash'))),
    );
  }
  body.append(h('p', { class: 'note' }, 'Changes save as you make them and only affect these sets.'));
  sheet(name, body, { onClose: refresh });
}
