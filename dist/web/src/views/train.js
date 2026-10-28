// Train tab: this week's workouts, today's suggestion, open sessions from the previous plan, morning weigh-in.

import { fill, h, icon, toast } from '../ui.js';
import { PROGRAM, plateOf, weekBoard, workoutName,               } from '../coach.js';
import { allSessions, measurements, save,                     } from '../store.js';
import { addDays, daysBetween, shortDate, today, weekKey } from '../dates.js';
import { cardioSheet, cardioThisWeek } from './cardio.js';

export async function renderTrain(root             )                {
  const { week, items, suggestion } = await weekBoard();
  const end = addDays(week, 6);
  const daysLeft = daysBetween(today(), end);
  const doneCount = items.filter((i) => i.status === 'done').length;
  const sugg = items.find((i) => i.template.key === suggestion);
  const legacyOpen = (await allSessions()).filter((s) => s.status === 'open' && s.programId == null).sort((a, b) => b.date.localeCompare(a.date));
  const todayIso = today();
  const weighedToday = (await measurements()).some((m) => m.date === todayIso && m.bodyWeight != null);
  const cardio = await cardioThisWeek();

  const left = daysLeft === 0 ? 'Last day, ends tonight' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
  fill(root,
    h('header', { class: 'page-head train-head' },
      h('h1', null, `Week of ${shortDate(week)}`),
      h('p', { class: 'muted' }, `${doneCount} of ${items.length} done · ${left}`)),
    barbell(items),
    sugg
      ? h('a', {
          class: 'hero-card',
          'data-plate': plateOf(sugg.template.key),
          href: sugg.session ? `#w/${sugg.session.id}` : `#start/${sugg.template.key}`,
        },
          h('span', { class: 'hero-kicker' }, sugg.status === 'in-progress' ? 'Pick up where you left off' : 'Up next'),
          h('span', { class: 'hero-title' }, sugg.template.name),
          h('span', { class: 'hero-sub' }, `${sugg.template.focus} · ${sugg.planned} sets${sugg.done ? `, ${sugg.done} done` : ''}`),
          h('span', { class: 'hero-go', 'aria-hidden': 'true' }, sugg.status === 'in-progress' ? 'Continue' : 'Start'))
      : h('div', { class: 'card done-card' }, h('strong', null, 'All six workouts are done this week.'), h('p', { class: 'muted' }, 'Use the rest of the week for cardio, core or recovery.')),
    weighedToday ? null : weighInCard(todayIso),
    h('h2', { class: 'section-title' }, 'This week'),
    h('ul', { class: 'week-list' }, items.map((i) => weekRow(i, i.template.key === suggestion))),
    h('h2', { class: 'section-title' }, 'Cardio'),
    h('div', { class: 'card cardio-card', 'data-plate': 'cardio' },
      h('div', { class: 'wr-main' },
        h('strong', null, cardio.count ? `${cardio.count} session${cardio.count === 1 ? '' : 's'}, ${cardio.minutes} min this week` : 'No cardio logged this week'),
        h('span', { class: 'muted' }, 'Incline walk, stair climber, bike and more')),
      h('button', { type: 'button', class: 'btn primary small', onclick: () => void cardioSheet({ onSaved: () => void renderTrain(root) }) }, icon('plus'), 'Log cardio')),
    legacyOpen.length
      ? [
          h('h2', { class: 'section-title' }, 'Open from your previous plan'),
          h('ul', { class: 'week-list' },
            legacyOpen.map((s) =>
              h('li', null, h('a', { class: 'week-row', 'data-plate': 'steel', href: `#w/${s.id}` }, h('span', { class: 'wr-main' }, h('strong', { class: 'wr-name' }, workoutName(s.template)), h('span', { class: 'muted' }, `Started ${shortDate(s.date)}. Finish it here.`)), h('span', { class: 'chip warn' }, 'Open'))))),
        ]
      : null,
    h('p', { class: 'note center program-name' }, PROGRAM.name),
  );
}

/**
 * The week as a loaded barbell: A workouts on the left sleeve, B on the right, each plate in its
 * workout's color. A finished workout is a solid plate; one in progress fills from the bottom.
 */
function barbell(items            )              {
  const W = 360, H = 120, mid = H / 2;
  const plateW = 22, gap = 4, plateH = 96;
  const order = (suffix        ) => items.filter((i) => i.template.key.endsWith(suffix));
  const leftSide = order('-a'); // inner to outer: push, pull, legs
  const rightSide = order('-b');
  const innerL = W / 2 - 64, innerR = W / 2 + 64;
  const plate = (i          , x        )         => {
    const frac = i.status === 'done' ? 1 : Math.min(1, i.done / i.planned);
    const p = plateOf(i.template.key);
    const y = mid - plateH / 2;
    const fillH = plateH * frac;
    return `<g class="plate ${p}">
      <rect x="${x}" y="${y}" width="${plateW}" height="${plateH}" rx="5" class="plate-slot"/>
      ${frac > 0 ? `<rect x="${x}" y="${y + plateH - fillH}" width="${plateW}" height="${fillH}" rx="5" class="plate-fill"/>` : ''}
      <title>${i.template.name}: ${i.status === 'done' ? 'done' : i.done ? `${i.done} of ${i.planned} sets` : 'not started'}</title>
    </g>`;
  };
  const leftPlates = leftSide.map((i, k) => plate(i, innerL - 10 - (k + 1) * (plateW + gap) + gap)).join('');
  const rightPlates = rightSide.map((i, k) => plate(i, innerR + 10 + k * (plateW + gap))).join('');
  const loaded = items.filter((i) => i.status === 'done').length;
  return h('figure', {
    class: 'barbell',
    html: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="This week: ${loaded} of ${items.length} workouts done">
      <rect x="6" y="${mid - 4}" width="${W - 12}" height="8" rx="4" class="bar"/>
      <rect x="${innerL - 10}" y="${mid - 14}" width="10" height="28" rx="2" class="collar"/>
      <rect x="${innerR}" y="${mid - 14}" width="10" height="28" rx="2" class="collar"/>
      <rect x="${innerL}" y="${mid - 6}" width="${innerR - innerL}" height="12" rx="3" class="grip"/>
      ${leftPlates}${rightPlates}
    </svg>`,
  });
}

function weekRow(i          , suggested         )                {
  const pct = Math.round((Math.min(i.done, i.planned) / i.planned) * 100);
  const status = i.status === 'done'
    ? h('span', { class: 'wr-status done' }, icon('check'), 'Done')
    : i.status === 'in-progress'
      ? h('span', { class: 'wr-status count' }, `${i.done}/${i.planned}`)
      : suggested ? h('span', { class: 'wr-status next' }, 'Next') : null;
  return h('li', null,
    h('a', { class: `week-row${i.status === 'done' ? ' is-done' : ''}`, 'data-plate': plateOf(i.template.key), href: i.session ? `#w/${i.session.id}` : `#start/${i.template.key}` },
      h('span', { class: 'wr-main' },
        h('strong', { class: 'wr-name' }, i.template.name),
        h('span', { class: 'muted' }, `${i.template.focus} · ${i.planned} sets`),
        h('span', { class: 'bar', 'aria-hidden': 'true' }, h('span', { style: `width:${pct}%` }))),
      status));
}

function weighInCard(date        )              {
  const input = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'lb', 'aria-label': 'Bodyweight in pounds', class: 'num-input wide' });
  const form = h(
    'form',
    {
      class: 'card weigh',
      onsubmit: async (e       ) => {
        e.preventDefault();
        const v = Number(input.value.replace(',', '.'));
        if (!Number.isFinite(v) || v < 70 || v > 600) return toast('Enter your weight in pounds, for example 210.5.');
        await save                ('measurements', { id: `bw-${date}`, date, bodyWeight: v, waist: null, chest: null, shoulders: null, leftArm: null, rightArm: null, leftCalf: null, rightCalf: null, source: 'app' });
        toast(`Saved ${v} lb for today.`);
      },
    },
    h('label', { class: 'weigh-label' }, h('strong', null, 'Morning weigh-in'), h('span', { class: 'muted' }, 'Before eating, after the bathroom')),
    h('div', { class: 'weigh-row' }, input, h('button', { class: 'btn primary', type: 'submit' }, icon('check'), 'Save')),
  );
  return form;
}

export const weekOf = (d        )         => weekKey(d);
