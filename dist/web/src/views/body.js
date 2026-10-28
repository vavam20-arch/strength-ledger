// Body tab: morning weigh-ins with a 7-day average, progress toward the goal, optional tape measurements.

import { fill, h, icon, toast } from '../ui.js';
import { measurements, save,                     } from '../store.js';
import { addDays, daysBetween, shortDate, today } from '../dates.js';
import { syncSoon } from '../sync-client.js';
import { strengthSection } from './strength.js';

const GOAL_LB = 205;

export async function renderBody(root             )                {
  const all = await measurements();
  const weights = all.filter((m) => m.bodyWeight != null).map((m) => ({ date: m.date, lb: m.bodyWeight  }));
  const avg = (from        , to        )                => {
    const xs = weights.filter((w) => w.date >= from && w.date <= to).map((w) => w.lb);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const t = today();
  const now7 = avg(addDays(t, -6), t);
  const prev7 = avg(addDays(t, -34), addDays(t, -28));
  const ratePerWeek = now7 != null && prev7 != null ? (now7 - prev7) / 4 : null;
  const weeksToGoal = ratePerWeek != null && ratePerWeek < 0 && now7 != null ? (now7 - GOAL_LB) / -ratePerWeek : null;

  const input = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'lb', class: 'num-input wide', 'aria-label': 'Bodyweight in pounds' });
  const date = h('input', { type: 'date', value: t, max: t, 'aria-label': 'Date' });
  const form = h('form', { class: 'card weigh', onsubmit: async (e       ) => {
    e.preventDefault();
    const v = Number(input.value.replace(',', '.'));
    if (!Number.isFinite(v) || v < 70 || v > 600) return toast('Enter your weight in pounds, for example 210.5.');
    const d = date.value || t;
    await save                ('measurements', { id: `bw-${d}`, date: d, bodyWeight: v, waist: null, chest: null, shoulders: null, leftArm: null, rightArm: null, leftCalf: null, rightCalf: null, source: 'app' });
    syncSoon();
    toast(`Saved ${v} lb for ${shortDate(d)}.`);
    void renderBody(root);
  } },
    h('label', { class: 'weigh-label' }, h('strong', null, 'Weigh-in'), h('span', { class: 'muted' }, 'Mornings, before eating')),
    h('div', { class: 'weigh-row' }, input, date, h('button', { class: 'btn primary', type: 'submit' }, icon('check'), 'Save')));

  fill(
    root,
    h('header', { class: 'page-head' }, h('h1', null, 'Body')),
    form,
    h('div', { class: 'stat-row' },
      stat('7-day average', now7 != null ? `${now7.toFixed(1)} lb` : '—'),
      stat('Change per week', ratePerWeek != null ? `${ratePerWeek > 0 ? '+' : ''}${ratePerWeek.toFixed(1)} lb` : 'Needs 4 weeks'),
      stat(`To ${GOAL_LB} lb`, weeksToGoal != null ? `~${Math.ceil(weeksToGoal)} weeks` : now7 != null ? `${(now7 - GOAL_LB).toFixed(1)} lb to go` : '—')),
    sparkline(weights.filter((w) => daysBetween(w.date, t) <= 120)),
    h('p', { class: 'note' }, `Target pace: about 1 lb a week (0.5% of bodyweight). The 7-day average smooths out day-to-day water changes.`),
    await strengthSection(),
    tapeForm(all, root),
    h('h2', { class: 'section-title' }, 'Recent weigh-ins'),
    h('ul', { class: 'plain-list' }, weights.slice(-14).reverse().map((w) => h('li', null, h('span', null, shortDate(w.date)), h('span', { class: 'mono' }, `${w.lb} lb`)))),
  );
}

const stat = (label        , value        )              => h('div', { class: 'stat' }, h('span', { class: 'muted' }, label), h('strong', null, value));

function sparkline(points                                     )              {
  if (points.length < 2) return h('p', { class: 'muted' }, 'Your weight chart appears after two weigh-ins.');
  const W = 340, H = 120, P = 8;
  const t0 = points[0] .date;
  const span = Math.max(1, daysBetween(t0, points.at(-1) .date));
  const lo = Math.min(GOAL_LB, ...points.map((p) => p.lb)) - 1;
  const hi = Math.max(...points.map((p) => p.lb)) + 1;
  const X = (d        ) => P + (daysBetween(t0, d) / span) * (W - 2 * P);
  const Y = (v        ) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
  const avgPts = points.map((p) => {
    const win = points.filter((q) => daysBetween(q.date, p.date) >= 0 && daysBetween(q.date, p.date) < 7);
    return { date: p.date, lb: win.reduce((a, b) => a + b.lb, 0) / win.length };
  });
  const path = avgPts.map((p, i) => `${i ? 'L' : 'M'}${X(p.date).toFixed(1)} ${Y(p.lb).toFixed(1)}`).join(' ');
  const dots = points.map((p) => `<circle cx="${X(p.date).toFixed(1)}" cy="${Y(p.lb).toFixed(1)}" r="2.2" class="sp-dot"/>`).join('');
  return h('figure', { class: 'card spark' },
    h('div', { html: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bodyweight over the last four months, with 7-day average and the ${GOAL_LB} lb goal"><line x1="${P}" x2="${W - P}" y1="${Y(GOAL_LB)}" y2="${Y(GOAL_LB)}" class="sp-goal"/>${dots}<path d="${path}" class="sp-line"/></svg>` }),
    h('figcaption', { class: 'muted' }, `Dots: weigh-ins · Line: 7-day average · Dashed: ${GOAL_LB} lb goal`));
}

function tapeForm(all                  , root             )              {
  const last = [...all].reverse().find((m) => m.waist != null || m.chest != null);
  const fields                                        = [['waist', 'Waist'], ['chest', 'Chest'], ['shoulders', 'Shoulders'], ['leftArm', 'Left arm'], ['rightArm', 'Right arm'], ['leftCalf', 'Left calf'], ['rightCalf', 'Right calf']];
  const inputs = fields.map(([k, label]) => [k, h('input', { type: 'text', inputmode: 'decimal', placeholder: last?.[k] != null ? String(last[k]) : 'in', 'aria-label': `${label} in inches`, class: 'num-input' })]         );
  return h('details', { class: 'card tape' },
    h('summary', null, 'Tape measurements (optional)', last ? h('span', { class: 'muted' }, ` · last ${shortDate(last.date)}`) : null),
    h('form', { onsubmit: async (e       ) => {
      e.preventDefault();
      const d = today();
      const rec                          = { id: `tape-${d}`, date: d, bodyWeight: null, source: 'app' };
      let any = false;
      for (const [k, el] of inputs) {
        const v = Number((el                    ).value.replace(',', '.'));
        rec[k] = (el                    ).value && Number.isFinite(v) ? ((any = true), v) : null;
      }
      if (!any) return toast('Enter at least one measurement.');
      await save                ('measurements', rec                             );
      syncSoon();
      toast('Measurements saved.');
      void renderBody(root);
    } },
      h('div', { class: 'tape-grid' }, inputs.map(([k, el]) => h('label', null, h('span', null, fields.find((f) => f[0] === k) [1]), el))),
      h('p', { class: 'note' }, 'Inches. Measure at the same spot each time.'),
      h('button', { class: 'btn', type: 'submit' }, 'Save measurements')));
}
