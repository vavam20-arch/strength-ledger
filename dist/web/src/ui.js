// Small DOM helpers: element builder, icons, toast, bottom sheet, stepper.

                                                                         
                                                        

export function h                                       (tag   , attrs        , ...children         )                           {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v                 );
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') (el                                      )[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el         , children         )       {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

const svg = (path        , extra = '')         =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${path}</svg>`;

export const ICONS = {
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  up: svg('<path d="M6 15l6-6 6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  swap: svg('<path d="M7 7h11l-3-3M17 17H6l3 3"/>'),
  cloud: svg('<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18z"/>'),
  train: svg('<path d="M3 10v4M21 10v4M6 7v10M18 7v10M6 12h12"/>'),
  history: svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  body: svg('<path d="M4 20l2.5-9h11L20 20"/><circle cx="12" cy="6" r="2.5"/>'),
  more: svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
};

export const icon = (name                    , cls = 'ico')                  => h('span', { class: cls, html: ICONS[name] });

export function toast(message        , ms = 2600)       {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/** Bottom sheet; resolves when closed. */
export function sheet(title        , body      , opts                           = {})                        {
  const scrim = h('div', { class: 'scrim' });
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', null, title), h('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, 'Done')),
    h('div', { class: 'sheet-body' }, body),
  );
  const close = () => {
    panel.classList.remove('open');
    scrim.classList.remove('open');
    setTimeout(() => {
      panel.remove();
      scrim.remove();
    }, 250);
    opts.onClose?.();
  };
  scrim.addEventListener('click', close);
  document.body.append(scrim, panel);
  requestAnimationFrame(() => {
    scrim.classList.add('open');
    panel.classList.add('open');
  });
  return { close };
}

/** A number field with − and + buttons sized for thumbs. */
export function stepper(opts                                                                                                                                )                 {
  const input = h('input', {
    type: 'text',
    inputmode: opts.decimals ? 'decimal' : 'numeric',
    value: fmtNum(opts.value),
    'aria-label': opts.label,
    class: 'num-input',
  });
  const set = (v        ) => {
    const clean = Math.max(opts.min ?? 0, Math.round(v * 100) / 100);
    input.value = fmtNum(clean);
    opts.onChange(clean);
  };
  input.addEventListener('focus', () => input.select());
  input.addEventListener('change', () => {
    const v = Number(input.value.replace(',', '.'));
    if (Number.isFinite(v)) set(v);
    else input.value = fmtNum(opts.value);
  });
  return h(
    'div',
    { class: 'stepper' },
    h('button', { type: 'button', class: 'step', 'aria-label': `Decrease ${opts.label}`, onclick: () => set(Number(input.value) - opts.step) }, icon('minus')),
    h('label', { class: 'step-field' }, input, opts.unit ? h('span', { class: 'unit' }, opts.unit) : null),
    h('button', { type: 'button', class: 'step', 'aria-label': `Increase ${opts.label}`, onclick: () => set(Number(input.value) + opts.step) }, icon('plus')),
  );
}

export const fmtNum = (v        )         => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));

/** Replace an element's children (nulls and falses are skipped). */
export function fill(el         , ...children         )       {
  clear(el);
  append(el, children);
}

export function clear(el         )       {
  while (el.firstChild) el.firstChild.remove();
}
