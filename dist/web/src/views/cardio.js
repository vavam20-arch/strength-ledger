// Cardio: a quick log sheet (activity, minutes, miles or steps, date), editing from History,
// and this week's total for the Train tab.

import { h, icon, sheet, stepper, toast } from '../ui.js';
import { cardioBetween, remove, save, update,                } from '../store.js';
import { addDays, longDate, today, weekKey } from '../dates.js';
import { syncSoon } from '../sync-client.js';
import { getLocal, setLocal } from '../db.js';

export const ACTIVITIES                                                = [
  { name: 'Incline treadmill walk', unit: 'mi' },
  { name: 'Stair climber', unit: 'steps' },
  { name: 'Bike', unit: 'mi' },
  { name: 'Elliptical', unit: 'mi' },
  { name: 'Rowing', unit: 'mi' },
  { name: 'Run', unit: 'mi' },
];
const unitFor = (activity        )                 => ACTIVITIES.find((a) => a.name === activity)?.unit ?? (/stair|step/i.test(activity) ? 'steps' : 'mi');
const INTENSITIES = ['Easy', 'Moderate', 'Hard'];

export const formatCardio = (c           )         =>
  `${c.durationMin} min${c.distance != null ? ` · ${c.distanceUnit === 'steps' ? `${c.distance.toLocaleString()} steps` : c.distanceUnit === 'm' ? `${c.distance} m` : `${c.distance} mi`}` : ''}${c.incline != null ? ` · ${c.incline}% incline` : ''}`;

export async function cardioThisWeek()                                              {
  const wk = weekKey(today());
  const list = await cardioBetween(wk, addDays(wk, 6));
  return { count: list.length, minutes: list.reduce((n, c) => n + (c.durationMin || 0), 0) };
}

/** Open the cardio sheet: a new entry, or an existing one to fix or delete. */
export async function cardioSheet(opts                                                                = {})                {
  const ex = opts.existing;
  const lastActivity = await getLocal        ('lastCardio', ACTIVITIES[0] .name);
  let activity = ex?.activity ?? lastActivity;
  let minutes = ex?.durationMin ?? (await getLocal        (`cardioMin:${activity}`, 30));
  let intensity                = ex?.intensity ?? null;

  const known = ACTIVITIES.some((a) => a.name === activity);
  const other = h('input', { type: 'text', class: 'text-input', placeholder: 'Activity name', 'aria-label': 'Other activity name', value: known ? '' : activity, hidden: known });
  const unitLabel = h('span', { class: 'unit' });
  const distance = h('input', { type: 'text', inputmode: 'decimal', class: 'num-input wide', 'aria-label': 'Distance', placeholder: 'optional', value: ex?.distance != null ? String(ex.distance) : '' });
  const incline = h('input', { type: 'text', inputmode: 'decimal', class: 'num-input wide', 'aria-label': 'Incline percent', placeholder: '%', value: ex?.incline != null ? String(ex.incline) : '' });
  const hr = h('input', { type: 'text', inputmode: 'numeric', class: 'num-input wide', 'aria-label': 'Average heart rate', placeholder: 'bpm', value: ex?.avgHeartRate != null ? String(ex.avgHeartRate) : '' });
  const date = h('input', { type: 'date', value: ex?.date ?? opts.date ?? today(), max: today(), 'aria-label': 'Date' });
  const minutesStep = stepper({ value: minutes, step: 5, min: 0, label: 'Minutes', unit: 'min', onChange: (v) => (minutes = v) });
  const inclineRow = h('label', { class: 'field' }, h('span', null, 'Incline'), incline);

  const drawUnit = () => {
    const u = unitFor(activity);
    unitLabel.textContent = u === 'steps' ? 'steps' : 'miles';
    distance.setAttribute('inputmode', u === 'steps' ? 'numeric' : 'decimal');
    inclineRow.hidden = !/treadmill|walk|run/i.test(activity);
  };
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Activity' });
  const drawChips = () => {
    chips.replaceChildren(
      ...[...ACTIVITIES.map((a) => a.name), 'Other'].map((name) => {
        const on = name === 'Other' ? !ACTIVITIES.some((a) => a.name === activity) : name === activity;
        return h('button', { type: 'button', class: `chip-btn${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: () => {
          activity = name === 'Other' ? other.value.trim() || 'Other' : name;
          other.hidden = name !== 'Other';
          if (name === 'Other') other.focus();
          drawChips();
          drawUnit();
        } }, name);
      }),
    );
  };
  other.addEventListener('input', () => (activity = other.value.trim() || 'Other'));
  const intensityRow = h('div', { class: 'segs wide', role: 'group', 'aria-label': 'Intensity' });
  const drawIntensity = () =>
    intensityRow.replaceChildren(
      ...INTENSITIES.map((x) =>
        h('button', { type: 'button', class: `seg wide${intensity === x ? ' on' : ''}`, 'aria-pressed': String(intensity === x), onclick: () => {
          intensity = intensity === x ? null : x;
          drawIntensity();
        } }, x),
      ),
    );
  drawChips();
  drawUnit();
  drawIntensity();

  const num = (el                  )                => {
    const raw = el.value.trim();
    // Steps may be typed as 1,250; miles may use a decimal comma.
    const v = Number(el === distance && unitFor(activity) === 'steps' ? raw.replace(/[,\s]/g, '') : raw.replace(',', '.'));
    return raw && Number.isFinite(v) && v >= 0 ? v : null;
  };

  const body = h('form', { class: 'stack cardio-form', onsubmit: async (e       ) => {
    e.preventDefault();
    if (!minutes || minutes <= 0) return toast('Enter how many minutes.');
    const d = date.value || today();
    const dist = num(distance);
    const fields = {
      date: d,
      activity,
      durationMin: minutes,
      distance: dist,
      distanceUnit: dist == null ? null : unitFor(activity),
      intensity,
      incline: inclineRow.hidden ? null : num(incline),
      avgHeartRate: num(hr),
    };
    if (ex) await update           ('cardio', ex.id, fields);
    else await save           ('cardio', { id: crypto.randomUUID(), activityOriginal: activity, source: 'app', ...fields });
    await setLocal('lastCardio', activity);
    await setLocal(`cardioMin:${activity}`, minutes);
    syncSoon();
    toast(`${ex ? 'Updated' : 'Logged'} ${activity}: ${minutes} min${d !== today() ? ` on ${longDate(d)}` : ''}.`);
    s.close();
    opts.onSaved?.();
  } },
    chips,
    other,
    h('div', { class: 'field-grid' },
      h('div', { class: 'field' }, h('span', null, 'Time'), minutesStep),
      h('label', { class: 'field' }, h('span', null, 'Distance'), h('div', { class: 'with-unit' }, distance, unitLabel))),
    h('label', { class: 'field' }, h('span', null, 'Date'), date),
    h('details', { class: 'more-fields', open: !!(ex?.incline != null || ex?.intensity || ex?.avgHeartRate != null) },
      h('summary', null, 'Incline, effort, heart rate (optional)'),
      h('div', { class: 'stack' },
        inclineRow,
        h('div', { class: 'field' }, h('span', null, 'Effort'), intensityRow),
        h('label', { class: 'field' }, h('span', null, 'Average heart rate'), hr))),
    h('button', { type: 'submit', class: 'btn primary wide' }, icon('check'), ex ? 'Save changes' : 'Log cardio'),
    ex
      ? h('button', { type: 'button', class: 'btn ghost wide danger-text', onclick: async () => {
          await remove('cardio', ex.id);
          syncSoon();
          toast('Cardio entry deleted.');
          s.close();
          opts.onSaved?.();
        } }, icon('trash'), 'Delete this entry')
      : null,
  );
  const s = sheet(ex ? 'Edit cardio' : 'Log cardio', body);
}
