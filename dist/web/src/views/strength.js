// Body tab: strength trend per muscle group (small multiples, one index line each). Each group card
// breaks down into its muscles; tapping a muscle opens its own page with its strength trend, weekly
// sets and the exercises behind it. See src/trends.ts for how the numbers are built.

import { h, sheet } from '../ui.js';
import { exerciseName } from '../coach.js';
import { getSession, setsBetween } from '../store.js';
import { addDays, shortDate, today } from '../dates.js';
import {
  GROUP_MUSCLES, GROUPS, PRIORITY, muscleLabel, muscleShare, muscleTrends, strengthTrends, weeklyVolume, windows,
                                                                                                 
} from '../../../src/trends.js';

const RANGES = {
  '3 months': { days: 7, count: 13 },
  '6 months': { days: 14, count: 13 },
  '1 year': { days: 28, count: 13 },
}         ;
                                 
let range        = '6 months';

const ORDER          = [...PRIORITY, ...GROUPS.filter((g) => !PRIORITY.includes(g))];
const pct = (x               )         => (x == null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`);

                
                                              
               
                          
                                    
 

export async function strengthSection()                       {
  const box = h('section', { class: 'strength', 'aria-labelledby': 'strength-title' });
  const draw = async () => {
    const { days, count } = RANGES[range];
    const wins = windows(today(), days, count, addDays);
    const raw = await setsBetween(wins[0] .start, wins.at(-1) .end);
    // Deload weeks are light on purpose; leave them out so they don't look like lost strength.
    const ids = [...new Set(raw.map((s) => s.sessionId))];
    const deload = new Set((await Promise.all(ids.map(async (id) => ((await getSession(id))?.programId === 'deload' ? id : null)))).filter((x)              => !!x));
    const done = raw.filter((s) => s.completed && s.kind !== 'warmup' && !deload.has(s.sessionId));
    const nameOf = (s                       ) => (s.original?.['exercise']                      ) ?? exerciseName(s.exerciseId);
    const sets             = done.map((s) => ({ exerciseId: s.exerciseId, name: nameOf(s), date: s.performedDate, weight: s.weight, reps: s.reps }));
    const data       = {
      wins,
      days,
      volumeSets: done.map((s) => ({ name: nameOf(s), date: s.performedDate })),
      muscles: new Map(muscleTrends(sets, wins).map((m) => [m.muscle, m])),
    };
    const byGroup = new Map(strengthTrends(sets, wins).map((t) => [t.group, t]));
    box.replaceChildren(
      h('div', { class: 'strength-head' },
        h('h2', { class: 'section-title', id: 'strength-title' }, 'Strength by muscle'),
        h('div', { class: 'segs', role: 'group', 'aria-label': 'Time range' },
          (Object.keys(RANGES)           ).map((r) =>
            h('button', { type: 'button', class: `seg wide${r === range ? ' on' : ''}`, 'aria-pressed': String(r === range), onclick: () => {
              range = r;
              void draw();
            } }, r === '3 months' ? '3 mo' : r === '6 months' ? '6 mo' : '1 yr')))),
      h('p', { class: 'note' }, `How much stronger each area is than ${shortDate(wins[0] .start)}. 100 = where you started; 110 = 10% stronger. Built from your best set on each exercise (weight × (1 + reps ÷ 30)). Tap a muscle to see it on its own; sets/wk is the average over the last 4 weeks.`),
      h('div', { class: 'strength-grid' }, ORDER.map((g) => {
        const t = byGroup.get(g) ;
        return groupCard(g, t.points, t.changePct, data);
      })),
    );
  };
  await draw();
  return box;
}

function groupCard(group       , points              , change               , data      )              {
  const priority = PRIORITY.includes(group);
  const readout = h('p', { class: 'readout muted', 'aria-live': 'polite' }, lastReadout(points));
  return h('article', { class: 'card group-card', 'aria-label': `${group} strength` },
    h('div', { class: 'group-head' },
      h('h3', null, group, priority ? h('span', { class: 'chip accent' }, 'Priority') : null),
      h('strong', { class: 'big' }, pct(change))),
    change == null ? h('p', { class: 'muted' }, 'Not enough sessions in this range yet.') : chart(points, `${group} strength`, readout),
    change == null ? null : readout,
    h('ul', { class: 'muscle-rows' },
      GROUP_MUSCLES[group].map((m) => {
        const t = data.muscles.get(m) ;
        // Recent work: average over the last 4 weeks, whatever the chart's range.
        const vol = weeklyVolume(data.volumeSets, [{ start: addDays(today(), -27), end: today() }], m, 28)[0] ;
        return h('li', null,
          h('button', { type: 'button', class: 'muscle-row', 'aria-label': `${muscleLabel(m)}: ${pct(t.changePct)}. Open details`, onclick: () => muscleSheet(t, data) },
            h('span', { class: 'mr-name' }, muscleLabel(m)),
            h('span', { class: 'mr-vol muted', title: 'Average over the last 4 weeks' }, `${fmt(vol.perWeek)} sets/wk`),
            h('span', { class: `mr-change ${t.changePct == null ? 'muted' : t.changePct >= 0 ? 'up' : 'down'}` }, pct(t.changePct)),
            h('span', { class: 'mr-go', 'aria-hidden': 'true' }, '›')));
      })),
  );
}

const fmt = (x        )         => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const lastReadout = (points              )         => {
  const p = points.at(-1) ;
  return `${shortDate(p.start)}–${shortDate(p.end)}: ${p.index.toFixed(1)}`;
};

// ---------- one muscle ----------

function muscleSheet(t             , data      )       {
  const label = muscleLabel(t.muscle);
  const vol = weeklyVolume(data.volumeSets, data.wins, t.muscle, data.days);
  const readout = h('p', { class: 'readout muted', 'aria-live': 'polite' }, lastReadout(t.points));
  const volReadout = h('p', { class: 'readout muted', 'aria-live': 'polite' }, volLine(vol.at(-1) ));
  const avg = vol.reduce((n, v) => n + v.perWeek, 0) / vol.length;
  const helpers = [...new Set(vol.flatMap((v) => v.from).filter((f) => muscleShare(f.name, t.muscle) < 1).map((f) => f.name))];
  const body = h('div', { class: 'stack muscle-detail' },
    h('div', { class: 'group-head' },
      h('span', { class: 'muted' }, `Strength since ${shortDate(data.wins[0] .start)}`),
      h('strong', { class: 'big' }, pct(t.changePct))),
    t.changePct == null
      ? h('p', { class: 'muted' }, `No loaded sets for ${label.toLowerCase()} in this range yet.`)
      : [chart(t.points, `${label} strength`, readout), readout],
    h('h3', null, 'Weekly sets'),
    h('p', { class: 'note' }, `Sets per week that work this muscle. Exercises where it only helps (for example rows for biceps) count as half. The shaded band is 10–20 sets a week, the usual range for growth. Average here: ${fmt(Math.round(avg * 10) / 10)}.`),
    volumeChart(vol, label, volReadout),
    volReadout,
    h('h3', null, 'Exercises'),
    t.exercises.length
      ? h('table', { class: 'ex-table' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Exercise'), h('th', { scope: 'col' }, 'Latest best'), h('th', { scope: 'col' }, 'Change'))),
          h('tbody', null,
            t.exercises.map((e) =>
              h('tr', null,
                h('th', { scope: 'row' }, e.name, h('span', { class: 'muted ex-meta' }, `${e.exerciseId.startsWith('fitbod-') ? 'Fitbod gym · ' : ''}${e.sets} sets · last ${shortDate(e.lastDate)}`)),
                h('td', null, h('span', { class: 'mono' }, `${fmt(e.lastSet.weight)} × ${e.lastSet.reps}`), h('span', { class: 'muted ex-meta' }, `est. ${Math.round(e.last)}`)),
                h('td', { class: e.changePct >= 0 ? 'up' : 'down' }, pct(e.changePct))))))
      : h('p', { class: 'muted' }, 'No exercises for this muscle in this range yet.'),
    t.exercises.length ? h('p', { class: 'note' }, 'Latest best = your strongest set in the most recent stretch; change compares its estimated strength with your first best set in this range.') : null,
    helpers.length ? h('p', { class: 'note' }, `Also works ${label.toLowerCase()} (counted in weekly sets): ${helpers.slice(0, 6).join(', ')}.`) : null,
  );
  sheet(label, body);
}

const volLine = (v             )         =>
  `${shortDate(v.start)}–${shortDate(v.end)}: ${fmt(v.perWeek)} sets/wk${v.from.length ? ` · ${v.from.slice(0, 3).map((f) => `${f.name} ${fmt(f.sets)}`).join(', ')}` : ''}`;

/** Weekly sets as bars, with the 10–20 growth band shaded; tap a bar to read it. */
function volumeChart(vol               , label        , readout             )              {
  const W = 320, H = 110, PX = 6, PB = 16, PT = 8, GUTTER = 22;
  const top = Math.max(22, ...vol.map((v) => v.perWeek)) * 1.08;
  const plotW = W - 2 * PX - GUTTER;
  const slot = plotW / vol.length;
  const bw = Math.max(4, Math.min(16, slot - 6));
  const Y = (v        ) => PT + (1 - v / top) * (H - PT - PB);
  const bars = vol.map((v, i) => {
    const x = PX + i * slot + (slot - bw) / 2;
    const y = Y(v.perWeek);
    const hgt = Math.max(0, H - PB - y);
    return hgt > 0 ? `<path class="vb" data-i="${i}" d="M${x.toFixed(1)} ${(H - PB).toFixed(1)} V${(y + Math.min(4, hgt)).toFixed(1)} q0 -4 4 -4 h${(bw - 8).toFixed(1)} q4 0 4 4 V${(H - PB).toFixed(1)} Z"/>` : '';
  }).join('');
  const wrap = h('div', {
    class: 'trend vol',
    html: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}: weekly sets, ${vol.map((v) => fmt(v.perWeek)).join(', ')}">
      <rect x="${PX}" y="${Y(20).toFixed(1)}" width="${plotW}" height="${(Y(10) - Y(20)).toFixed(1)}" class="vol-band"/>
      <text x="${W - PX}" y="${(Y(20) + 3.5).toFixed(1)}" text-anchor="end" class="tr-label">20</text>
      <text x="${W - PX}" y="${(Y(10) + 3.5).toFixed(1)}" text-anchor="end" class="tr-label">10</text>
      <line x1="${PX}" x2="${PX + plotW}" y1="${H - PB}" y2="${H - PB}" class="vol-axis"/>
      ${bars}
      <text x="${PX}" y="${H - 3}" class="tr-label">${shortDate(vol[0] .start)}</text>
      <text x="${PX + plotW}" y="${H - 3}" text-anchor="end" class="tr-label">${shortDate(vol.at(-1) .end)}</text>
    </svg>`,
  });
  const svg = wrap.querySelector('svg') ;
  const pick = (clientX        ) => {
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(vol.length - 1, Math.floor((x - PX) / slot)));
    svg.querySelectorAll('.vb').forEach((b) => b.classList.toggle('on', b.getAttribute('data-i') === String(i)));
    readout.textContent = volLine(vol[i] );
  };
  svg.addEventListener('pointerdown', (e) => pick(e.clientX));
  svg.addEventListener('pointermove', (e) => pick(e.clientX));
  return wrap;
}

/** Index line with a 100 baseline; tap or drag along it to read any point. */
function chart(points              , label        , readout             )              {
  const W = 320, H = 96, PX = 6, PY = 10, GUTTER = 26; // right gutter holds the 100 label
  const vals = points.map((p) => p.index);
  const lo = Math.min(100, ...vals);
  const hi = Math.max(100, ...vals);
  const pad = Math.max(2, (hi - lo) * 0.12);
  const y0 = lo - pad, y1 = hi + pad;
  const X = (i        ) => PX + (i / (points.length - 1)) * (W - 2 * PX - GUTTER);
  const Y = (v        ) => PY + (1 - (v - y0) / (y1 - y0)) * (H - 2 * PY);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.index).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  const wrap = h('div', {
    class: 'trend',
    html: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label} index from ${vals[0]} to ${vals[last]}">
      <line x1="${PX}" x2="${W - PX - GUTTER}" y1="${Y(100).toFixed(1)}" y2="${Y(100).toFixed(1)}" class="tr-base"/>
      <text x="${W - PX}" y="${(Y(100) + 3.5).toFixed(1)}" text-anchor="end" class="tr-label">100</text>
      <path d="${path}" class="tr-line"/>
      ${points.map((p, i) => (p.basis === 0 && i > 0 ? `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.index).toFixed(1)}" r="2.5" class="tr-gap"/>` : '')).join('')}
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
    const p = points[i] ;
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
    readout.textContent = lastReadout(points);
  };
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', hide);
  return wrap;
}
