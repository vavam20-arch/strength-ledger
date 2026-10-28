// Body tab: strength trend per muscle group (small multiples, one index line each), with the
// exercises behind each line. See src/trends.ts for how the index is built.

import { h } from '../ui.js';
import { exerciseName } from '../coach.js';
import { setsBetween } from '../store.js';
import { addDays, shortDate, today } from '../dates.js';
import { GROUPS, PRIORITY, strengthTrends, windows,                                            } from '../../../src/trends.js';

const RANGES = {
  '3 months': { days: 7, count: 13 },
  '6 months': { days: 14, count: 13 },
  '1 year': { days: 28, count: 13 },
}         ;
                                 
let range        = '6 months';

const ORDER          = [...PRIORITY, ...GROUPS.filter((g) => !PRIORITY.includes(g))];

export async function strengthSection()                       {
  const box = h('section', { class: 'strength', 'aria-labelledby': 'strength-title' });
  const draw = async () => {
    const { days, count } = RANGES[range];
    const wins = windows(today(), days, count, addDays);
    const raw = await setsBetween(wins[0] .start, wins.at(-1) .end);
    const sets             = raw
      .filter((s) => s.completed && s.kind !== 'warmup')
      .map((s) => ({ exerciseId: s.exerciseId, name: (s.original?.['exercise']                      ) ?? exerciseName(s.exerciseId), date: s.performedDate, weight: s.weight, reps: s.reps }));
    const trends = strengthTrends(sets, wins);
    const byGroup = new Map(trends.map((t) => [t.group, t]));
    box.replaceChildren(
      h('div', { class: 'strength-head' },
        h('h2', { class: 'section-title', id: 'strength-title' }, 'Strength by muscle'),
        h('div', { class: 'segs', role: 'group', 'aria-label': 'Time range' },
          (Object.keys(RANGES)           ).map((r) =>
            h('button', { type: 'button', class: `seg wide${r === range ? ' on' : ''}`, 'aria-pressed': String(r === range), onclick: () => {
              range = r;
              void draw();
            } }, r === '3 months' ? '3 mo' : r === '6 months' ? '6 mo' : '1 yr')))),
      h('p', { class: 'note' }, `How much stronger each area is than ${shortDate(wins[0] .start)}. 100 = where you started; 110 = 10% stronger. Built from your best set on each exercise (weight × (1 + reps ÷ 30)).`),
      h('div', { class: 'strength-grid' }, ORDER.map((g) => groupCard(byGroup.get(g) ))),
    );
  };
  await draw();
  return box;
}

function groupCard(t            )              {
  const priority = PRIORITY.includes(t.group);
  const change = t.changePct;
  const readout = h('p', { class: 'readout muted', 'aria-live': 'polite' }, lastReadout(t));
  return h('article', { class: 'card group-card', 'aria-label': `${t.group} strength` },
    h('div', { class: 'group-head' },
      h('h3', null, t.group, priority ? h('span', { class: 'chip accent' }, 'Priority') : null),
      h('strong', { class: 'big' }, change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`)),
    change == null ? h('p', { class: 'muted' }, 'Not enough sessions in this range yet.') : chart(t, readout),
    change == null ? null : readout,
    t.exercises.length
      ? h('details', { class: 'ex-list' },
          h('summary', null, `Exercises (${t.exercises.length})`),
          h('ul', { class: 'plain-list' },
            t.exercises.slice(0, 8).map((e) =>
              h('li', null,
                h('span', { class: 'ex-name' }, e.name, h('span', { class: 'muted' }, `${e.exerciseId.startsWith('fitbod-') ? ' · Fitbod gym' : ''} · last ${shortDate(e.lastDate)}`)),
                h('span', { class: 'mono' }, `${Math.round(e.first)} → ${Math.round(e.last)}`, h('span', { class: e.changePct >= 0 ? 'up' : 'down' }, ` ${e.changePct > 0 ? '+' : ''}${e.changePct}%`))))),
          h('p', { class: 'note' }, 'Estimated strength of your best set, first and latest in this range.'))
      : null,
  );
}

const lastReadout = (t            )         => {
  const p = t.points.at(-1) ;
  return `${shortDate(p.start)}–${shortDate(p.end)}: ${p.index.toFixed(1)}`;
};

/** Index line with a 100 baseline; tap or drag along it to read any point. */
function chart(t            , readout             )              {
  const W = 320, H = 96, PX = 6, PY = 10, GUTTER = 26; // right gutter holds the 100 label
  const vals = t.points.map((p) => p.index);
  const lo = Math.min(100, ...vals);
  const hi = Math.max(100, ...vals);
  const pad = Math.max(2, (hi - lo) * 0.12);
  const y0 = lo - pad, y1 = hi + pad;
  const X = (i        ) => PX + (i / (t.points.length - 1)) * (W - 2 * PX - GUTTER);
  const Y = (v        ) => PY + (1 - (v - y0) / (y1 - y0)) * (H - 2 * PY);
  const path = t.points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.index).toFixed(1)}`).join(' ');
  const last = t.points.length - 1;
  const wrap = h('div', {
    class: 'trend',
    html: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t.group} strength index from ${vals[0]} to ${vals[last]}">
      <line x1="${PX}" x2="${W - PX - GUTTER}" y1="${Y(100).toFixed(1)}" y2="${Y(100).toFixed(1)}" class="tr-base"/>
      <text x="${W - PX}" y="${(Y(100) + 3.5).toFixed(1)}" text-anchor="end" class="tr-label">100</text>
      <path d="${path}" class="tr-line"/>
      ${t.points.map((p, i) => (p.basis === 0 && i > 0 ? `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.index).toFixed(1)}" r="2.5" class="tr-gap"/>` : '')).join('')}
      <circle cx="${X(last).toFixed(1)}" cy="${Y(vals[last] ).toFixed(1)}" r="4" class="tr-end"/>
      <line class="tr-cursor" x1="0" x2="0" y1="${PY / 2}" y2="${H - PY / 2}" visibility="hidden"/>
      <circle class="tr-dot" r="4.5" visibility="hidden"/>
    </svg>`,
  });
  const svg = wrap.querySelector('svg') ;
  const cursor = svg.querySelector                ('.tr-cursor') ;
  const dot = svg.querySelector                  ('.tr-dot') ;
  const show = (clientX        ) => {
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(last, Math.round(((x - PX) / (W - 2 * PX - GUTTER)) * last)));
    const p = t.points[i] ;
    cursor.setAttribute('x1', X(i).toFixed(1));
    cursor.setAttribute('x2', X(i).toFixed(1));
    cursor.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', X(i).toFixed(1));
    dot.setAttribute('cy', Y(p.index).toFixed(1));
    dot.setAttribute('visibility', 'visible');
    readout.textContent = `${shortDate(p.start)}–${shortDate(p.end)}: ${p.index.toFixed(1)}${p.basis ? ` · from ${p.basis} exercise${p.basis === 1 ? '' : 's'}` : i === 0 ? ' · starting point' : ' · no comparable sessions'}`;
  };
  const hide = () => {
    cursor.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    readout.textContent = lastReadout(t);
  };
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', hide);
  return wrap;
}
