// Train tab: this week's workouts, today's suggestion, open sessions from the previous plan, morning weigh-in.

import { fill, h, icon, toast } from '../ui.ts';
import { PROGRAM, weekBoard, workoutName, type WeekItem } from '../coach.ts';
import { allSessions, measurements, save, type AppMeasurement } from '../store.ts';
import { addDays, daysBetween, shortDate, today, weekKey } from '../dates.ts';
import { cardioSheet, cardioThisWeek } from './cardio.ts';

export async function renderTrain(root: HTMLElement): Promise<void> {
  const { week, items, suggestion } = await weekBoard();
  const end = addDays(week, 6);
  const daysLeft = daysBetween(today(), end);
  const doneCount = items.filter((i) => i.status === 'done').length;
  const sugg = items.find((i) => i.template.key === suggestion);
  const legacyOpen = (await allSessions()).filter((s) => s.status === 'open' && s.programId == null).sort((a, b) => b.date.localeCompare(a.date));
  const todayIso = today();
  const weighedToday = (await measurements()).some((m) => m.date === todayIso && m.bodyWeight != null);
  const cardio = await cardioThisWeek();

  fill(root, 
    h(
      'header',
      { class: 'page-head' },
      h('p', { class: 'eyebrow' }, PROGRAM.name),
      h('h1', null, `Week of ${shortDate(week)}`),
      h('p', { class: 'muted' }, `${doneCount} of ${items.length} workouts done · ${daysLeft === 0 ? 'last day, ends tonight' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left until Sunday`}`),
    ),
    sugg
      ? h(
          'a',
          { class: 'hero-card', href: sugg.session ? `#w/${sugg.session.id}` : `#start/${sugg.template.key}` },
          h('span', { class: 'eyebrow' }, sugg.status === 'in-progress' ? 'Continue' : 'Suggested today'),
          h('span', { class: 'hero-title' }, sugg.template.name),
          h('span', { class: 'hero-sub' }, `${sugg.template.focus} · ${sugg.planned} sets${sugg.done ? ` · ${sugg.done} done` : ''}`),
        )
      : h('div', { class: 'card done-card' }, h('strong', null, 'All six workouts are done this week.'), h('p', { class: 'muted' }, 'Use the rest of the week for cardio, core or recovery.')),
    weighedToday ? null : weighInCard(todayIso),
    h('h2', { class: 'section-title' }, 'This week'),
    h('ul', { class: 'week-list' }, items.map((i) => weekRow(i, i.template.key === suggestion))),
    h('h2', { class: 'section-title' }, 'Cardio'),
    h('div', { class: 'card cardio-card' },
      h('div', { class: 'wr-main' },
        h('strong', null, cardio.count ? `${cardio.count} session${cardio.count === 1 ? '' : 's'} · ${cardio.minutes} min this week` : 'No cardio logged this week'),
        h('span', { class: 'muted' }, 'Incline walk, stair climber, bike…')),
      h('button', { type: 'button', class: 'btn primary small', onclick: () => void cardioSheet({ onSaved: () => void renderTrain(root) }) }, icon('plus'), 'Log cardio')),
    legacyOpen.length
      ? [
          h('h2', { class: 'section-title' }, 'Open from your previous plan'),
          h(
            'ul',
            { class: 'week-list' },
            legacyOpen.map((s) =>
              h('li', null, h('a', { class: 'week-row', href: `#w/${s.id}` }, h('span', { class: 'wr-main' }, h('strong', null, workoutName(s.template)), h('span', { class: 'muted' }, `Started ${shortDate(s.date)} · finish it here`)), h('span', { class: 'chip warn' }, 'Open'))),
            ),
          ),
        ]
      : null,
  );
}

function weekRow(i: WeekItem, suggested: boolean): HTMLLIElement {
  const pct = Math.round((Math.min(i.done, i.planned) / i.planned) * 100);
  const chip = i.status === 'done' ? h('span', { class: 'chip good' }, 'Done') : i.status === 'in-progress' ? h('span', { class: 'chip accent' }, `${i.done}/${i.planned}`) : suggested ? h('span', { class: 'chip' }, 'Next') : null;
  return h(
    'li',
    null,
    h(
      'a',
      { class: 'week-row', href: i.session ? `#w/${i.session.id}` : `#start/${i.template.key}` },
      h('span', { class: 'wr-main' }, h('strong', null, i.template.name), h('span', { class: 'muted' }, `${i.template.focus} · ${i.planned} sets`), h('span', { class: 'bar', 'aria-hidden': 'true' }, h('span', { style: `width:${pct}%` }))),
      chip,
    ),
  );
}

function weighInCard(date: string): HTMLElement {
  const input = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'lb', 'aria-label': 'Bodyweight in pounds', class: 'num-input wide' });
  const form = h(
    'form',
    {
      class: 'card weigh',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        const v = Number(input.value.replace(',', '.'));
        if (!Number.isFinite(v) || v < 70 || v > 600) return toast('Enter your weight in pounds, for example 210.5.');
        await save<AppMeasurement>('measurements', { id: `bw-${date}`, date, bodyWeight: v, waist: null, chest: null, shoulders: null, leftArm: null, rightArm: null, leftCalf: null, rightCalf: null, source: 'app' });
        toast(`Saved ${v} lb for today.`);
      },
    },
    h('label', { class: 'weigh-label' }, h('strong', null, 'Morning weigh-in'), h('span', { class: 'muted' }, 'Before eating, after the bathroom')),
    h('div', { class: 'weigh-row' }, input, h('button', { class: 'btn primary', type: 'submit' }, icon('check'), 'Save')),
  );
  return form;
}

export const weekOf = (d: string): string => weekKey(d);
