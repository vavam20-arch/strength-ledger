// Train tab: this week's workouts, today's suggestion, open sessions from the previous plan, morning weigh-in.

import { fill, h, icon, toast } from '../ui.js';
import { plateOf, weekBoard, weekProgress, workoutName,               } from '../coach.js';
import { DELOAD_ID, programById,                           } from '../../../src/program/programs.js';
import { allSessions, measurements, save,                     } from '../store.js';
import { addDays, daysBetween, shortDate, today, weekKey } from '../dates.js';
import { cardioSheet, cardioThisWeek } from './cardio.js';

export async function renderTrain(root             )                {
  const { week, items: all, suggestion, plan } = await weekBoard();
  const items = all.filter((i) => !i.template.optional);
  const optional = all.filter((i) => i.template.optional);
  const end = addDays(week, 6);
  const daysLeft = daysBetween(today(), end);
  const doneCount = items.filter((i) => i.status === 'done').length;
  const sugg = all.find((i) => i.template.key === suggestion);
  const sizes = items.map((i) => i.planned);
  const legacyOpen = (await allSessions()).filter((s) => s.status === 'open' && s.programId == null).sort((a, b) => b.date.localeCompare(a.date));
  const todayIso = today();
  const weighedToday = (await measurements()).some((m) => m.date === todayIso && m.bodyWeight != null);
  const cardio = await cardioThisWeek();

  const wp = weekProgress(items, week);
  const left = daysLeft === 0 ? 'last day, ends tonight' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
  const pace = wp.left === 0
    ? 'Every planned set is done. Nice week.'
    : wp.daysLeft === 1
      ? `${wp.left} sets left to finish tonight.`
      : `${wp.left} sets left: about ${wp.perDay} a day through Sunday (one workout is ${Math.min(...sizes) === Math.max(...sizes) ? Math.min(...sizes) : `${Math.min(...sizes)}–${Math.max(...sizes)}`}).`;
  fill(root,
    h('header', { class: 'page-head train-head' },
      h('a', { class: 'program-line', href: '#more' }, programLine(plan)),
      h('div', { class: 'week-title' },
        h('h1', null, `Week of ${shortDate(week)}`),
        h('p', { class: 'week-pct', 'aria-label': `${wp.pct}% of this week's sets done` }, `${wp.pct}`, h('span', null, '%'))),
      barbell(items),
      h('div', { class: 'week-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(wp.planned), 'aria-valuenow': String(wp.done), 'aria-label': 'Sets done this week' },
        h('span', { style: `width:${wp.pct}%` })),
      h('p', { class: 'week-line' },
        h('span', { class: 'ws' }, h('strong', null, `${wp.done}`), ` of ${wp.planned} sets`),
        h('span', { class: 'ws' }, h('strong', null, `${doneCount}`), ` of ${items.length} workouts`),
        h('span', { class: 'ws' }, daysLeft === 0 ? h('strong', null, 'Last') : h('strong', null, `${daysLeft}`), daysLeft === 0 ? ' day, ends tonight' : ` day${daysLeft === 1 ? '' : 's'} left`)),
      h('p', { class: `week-pace${wp.left && wp.perDay > Math.max(...sizes) ? ' hard' : ''}` }, pace)),
    blockNotice(plan),
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
      : h('div', { class: 'card done-card' }, h('strong', null, `All ${items.length} workouts are done this week.`), h('p', { class: 'muted' }, 'Use the rest of the week for cardio, core or recovery.')),
    weighedToday ? null : weighInCard(todayIso),
    h('h2', { class: 'section-title' }, 'This week'),
    h('ul', { class: 'week-list' }, items.map((i) => weekRow(i, i.template.key === suggestion))),
    optional.length
      ? [
          h('h2', { class: 'section-title' }, 'Optional this week'),
          h('p', { class: 'note' }, 'Extra pump days for when you have the energy. They don’t count toward the week.'),
          h('ul', { class: 'week-list' }, optional.map((i) => weekRow(i, i.template.key === suggestion))),
        ]
      : null,
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
  );
}

const blockName = (b       )         => (b.programId === DELOAD_ID ? 'Deload week' : programById(b.programId)?.name ?? b.programId);

function programLine(plan          )         {
  if (plan.program.id === DELOAD_ID) return 'Deload week · lighter on purpose';
  return plan.overrun ? `${plan.program.name} · block finished` : `${plan.program.name} · week ${plan.week} of ${plan.block.weeks}`;
}

/** In a block's last week, say what comes next; once it has run out, ask what's next. */
function blockNotice(plan          )                     {
  if (plan.overrun) {
    return h('a', { class: 'card block-note', href: '#more' },
      h('strong', null, `Your ${plan.program.name} block is done.`),
      h('span', { class: 'muted' }, 'You can keep going with it, or choose the next program in More.'));
  }
  if (plan.week === plan.block.weeks && plan.next) {
    return h('a', { class: 'card block-note', href: '#more' },
      h('strong', null, `Last week of this block. Next up: ${blockName(plan.next)}.`),
      h('span', { class: 'muted' }, `Starts Monday ${shortDate(plan.next.start)}. Change it in More.`));
  }
  return null;
}

/**
 * The week as a loaded barbell: the first half of the workouts on the left sleeve, the rest on the right, each plate in its
 * workout's color. A finished workout is a solid plate; one in progress fills from the bottom.
 */
function barbell(items            )              {
  // Bumper plates seen edge-on, loaded symmetrically: the first half of the week's workouts on the
  // left sleeve, the rest on the right, innermost first. Empty plates are faint; logged sets fill
  // a plate from the bottom; a finished workout is a solid plate.
  const W = 360, H = 112, mid = H / 2;
  const plateW = 24, gap = 3, plateH = 100;
  const half = Math.ceil(items.length / 2);
  const leftSide = items.slice(0, half);
  const rightSide = items.slice(half);
  const collarW = 12, collarL = 98, collarR = 250;
  const plate = (i          , x        )         => {
    const frac = i.status === 'done' ? 1 : Math.min(1, i.done / i.planned);
    const p = plateOf(i.template.key);
    const y = mid - plateH / 2;
    const fillH = plateH * frac;
    return `<g class="plate ${p}${i.status === 'done' ? ' full' : ''}">
      <rect x="${x}" y="${y}" width="${plateW}" height="${plateH}" rx="6" class="plate-slot"/>
      ${frac > 0 ? `<clipPath id="pc-${i.template.key}"><rect x="${x}" y="${y}" width="${plateW}" height="${plateH}" rx="6"/></clipPath><rect x="${x}" y="${y + plateH - fillH}" width="${plateW}" height="${fillH}" class="plate-fill" clip-path="url(#pc-${i.template.key})"/>` : ''}
      <rect x="${x + plateW / 2 - 1}" y="${y + 10}" width="2" height="${plateH - 20}" rx="1" class="plate-rib"/>
      <title>${i.template.name}: ${i.status === 'done' ? 'done' : i.done ? `${i.done} of ${i.planned} sets` : 'not started'}</title>
    </g>`;
  };
  const leftPlates = leftSide.map((i, k) => plate(i, collarL - gap - plateW - k * (plateW + gap))).join('');
  const rightPlates = rightSide.map((i, k) => plate(i, collarR + collarW + gap + k * (plateW + gap))).join('');
  const loaded = items.filter((i) => i.status === 'done').length;
  return h('figure', {
    class: 'barbell',
    html: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="This week: ${loaded} of ${items.length} workouts done">
      <defs><pattern id="knurl" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" class="knurl"/></pattern></defs>
      <rect x="4" y="${mid - 8}" width="${collarL}" height="16" rx="4" class="sleeve"/>
      <rect x="${collarR + collarW - 4}" y="${mid - 8}" width="${W - 4 - (collarR + collarW - 4)}" height="16" rx="4" class="sleeve"/>
      <rect x="${collarL}" y="${mid - 5}" width="${collarR - collarL + collarW}" height="10" rx="3" class="shaft"/>
      <rect x="${collarL + 22}" y="${mid - 5}" width="${(collarR - collarL - 44 - 20) / 2}" height="10" fill="url(#knurl)"/>
      <rect x="${(collarL + collarR + collarW) / 2 + 10}" y="${mid - 5}" width="${(collarR - collarL - 44 - 20) / 2}" height="10" fill="url(#knurl)"/>
      <rect x="${collarL}" y="${mid - 17}" width="${collarW}" height="34" rx="3" class="collar"/>
      <rect x="${collarR}" y="${mid - 17}" width="${collarW}" height="34" rx="3" class="collar"/>
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
    h('a', { class: `week-row${i.status === 'done' ? ' is-done' : i.status === 'in-progress' ? ' is-progress' : ''}`, 'data-plate': plateOf(i.template.key), href: i.session ? `#w/${i.session.id}` : `#start/${i.template.key}` },
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
