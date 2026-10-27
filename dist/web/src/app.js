// Strength Ledger app entry: navigation, sync indicator, offline updates.

import { openDb } from './db.js';
import { bus } from './store.js';
import { getStatus, startSync,                 } from './sync-client.js';
import { maybeDailyBackup } from './backup.js';
import { renderTrain } from './views/train.js';
import { renderWorkout, startSession } from './views/workout.js';
import { renderHistory } from './views/history.js';
import { renderBody } from './views/body.js';
import { renderMore } from './views/more.js';
import { fill, h, icon, toast } from './ui.js';

const main = document.getElementById('main') ;
const tabs = document.getElementById('tabs') ;
const pill = document.getElementById('sync-pill') ;

                                                                                      

function route()        {
  const hash = location.hash.replace(/^#/, '');
  const [name, id] = hash.split('/');
  if (name === 'w' && id) return { name: 'workout', id };
  if (name === 'history' || name === 'body' || name === 'more') return { name };
  return { name: 'train' };
}

let rendering = false;
let queued = false;
async function render()                {
  if (rendering) {
    queued = true;
    return;
  }
  rendering = true;
  try {
    const hash = location.hash.replace(/^#/, '');
    if (hash.startsWith('start/')) {
      const id = await startSession(hash.slice(6));
      location.replace(`#w/${id}`);
      return;
    }
    const r = route();
    for (const a of tabs.querySelectorAll('a')) a.setAttribute('aria-current', String(a.dataset['tab'] === (r.name === 'workout' ? 'train' : r.name)));
    if (r.name === 'workout') await renderWorkout(main, r.id );
    else if (r.name === 'history') await renderHistory(main);
    else if (r.name === 'body') await renderBody(main);
    else if (r.name === 'more') await renderMore(main);
    else await renderTrain(main);
  } catch (e) {
    fill(main, h('div', { class: 'card' }, h('h2', null, 'Something went wrong'), h('p', null, (e         ).message), h('p', { class: 'note' }, 'Your saved data is not affected. Try again, or reload the app.')));
    console.error(e);
  } finally {
    rendering = false;
    if (queued) {
      queued = false;
      void render();
    }
  }
}

function showSync(s            )       {
  const label =
    s.state === 'synced' ? 'Synced' : s.state === 'syncing' ? (s.pending ? `Syncing ${s.pending}` : 'Syncing') : s.state === 'offline' ? (s.pending ? `Offline · ${s.pending} saved here` : 'Offline · saved here') : s.state === 'error' ? 'Sync problem' : 'Sync off';
  pill.className = `pill ${s.state}`;
  pill.textContent = label;
  pill.setAttribute('aria-label', `Sync status: ${label}`);
}

let refreshTimer                                       = null;
function scheduleRefresh()       {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void render(), 250);
}

async function boot()                {
  await openDb();
  // Ask the browser not to clear this app's storage (granted to Home Screen apps by WebKit heuristics).
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
  window.addEventListener('hashchange', () => void render());
  bus.addEventListener('change', (e) => {
    const detail = (e               ).detail                                    ;
    // The workout screen updates itself for its own edits; refresh it only for changes from another device.
    if (route().name !== 'workout' || detail?.remote) scheduleRefresh();
  });
  let backedUp = false;
  bus.addEventListener('sync', (e) => {
    const s = (e               ).detail              ;
    showSync(s);
    // Keep the More page's sync status current, unless the user is typing there.
    if (route().name === 'more' && !(document.activeElement instanceof HTMLInputElement)) scheduleRefresh();
    if (s.state === 'synced' && !backedUp) {
      backedUp = true;
      void maybeDailyBackup().catch(() => undefined);
    }
  });
  showSync(getStatus());
  pill.addEventListener('click', () => {
    location.hash = '#more';
  });
  await render();
  await startSync();
  registerServiceWorker();
}

function registerServiceWorker()       {
  if (!('serviceWorker' in navigator)) return;
  // A new version activates by itself (the service worker skips waiting). The first install
  // just takes control quietly; a later update offers a reload so the new code is used.
  const hadController = navigator.serviceWorker.controller != null;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => toast('Offline mode is unavailable in this browser.'));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || document.querySelector('.update-bar')) return;
    document.body.append(h('div', { class: 'update-bar', role: 'status' }, 'A new version is ready.', h('button', { type: 'button', class: 'btn small', onclick: () => location.reload() }, 'Update')));
  });
}

void boot();
export { icon };
