// More tab: sync setup, import, backups and export, storage status, the program.

import { fill, h, icon, toast } from '../ui.ts';
import { currentKey, getStatus, setUpSync, syncNow, useSyncKey } from '../sync-client.ts';
import { importFile } from '../importer.ts';
import { exportFile, maybeDailyBackup } from '../backup.ts';
import { count, getLocal } from '../db.ts';
import { PROGRAM, exerciseName } from '../coach.ts';
import { shortDate } from '../dates.ts';
import { APP_VERSION } from '../version.ts';

/** Show the key in full right after setup, so the user can copy it to the other device. */
let revealKey = false;

export async function renderMore(root: HTMLElement): Promise<void> {
  const key = await currentKey();
  const st = getStatus();
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  const counts = await Promise.all((['sessions', 'sets', 'cardio', 'measurements'] as const).map(async (t) => [t, await count(t)] as const));
  const lastBackup = await getLocal<string | null>('lastBackup', null);
  const lastExport = await getLocal<string | null>('lastExport', null);

  fill(
    root,
    h('header', { class: 'page-head' }, h('h1', null, 'More')),
    syncSection(key, st, root),
    importSection(root),
    h('section', { class: 'card' },
      h('h2', null, 'Backups'),
      h('p', null, `Daily snapshot on the server: ${lastBackup ? `last ${shortDate(lastBackup)}` : 'not yet'} (kept 90 days).`),
      h('p', null, `Export file: ${lastExport ? `last ${shortDate(lastExport)}` : 'not yet'}. Save it to iCloud Drive once a week.`),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onclick: async () => {
          const r = await exportFile();
          toast(`Exported ${r.records.toLocaleString()} records to ${r.name}.`);
        } }, 'Export file'),
        key ? h('button', { type: 'button', class: 'btn ghost', onclick: async () => {
          const d = await maybeDailyBackup();
          toast(d ? `Backed up for ${shortDate(d)}.` : 'Today is already backed up, or sync is not finished yet.');
        } }, 'Back up now') : null)),
    h('section', { class: 'card' },
      h('h2', null, 'This device'),
      h('p', null, persisted ? 'Storage is marked persistent: iOS should not clear it.' : 'Storage is best-effort. Opening the app from the Home Screen and syncing keep your data safe.'),
      h('ul', { class: 'plain-list' }, counts.map(([t, n]) => h('li', null, h('span', null, t[0]!.toUpperCase() + t.slice(1)), h('span', { class: 'mono' }, n.toLocaleString()))))),
    h('details', { class: 'card' },
      h('summary', null, PROGRAM.name),
      PROGRAM.workouts.map((w) => h('div', { class: 'prog' }, h('h3', null, `${w.name} · ${w.focus}`), h('ul', { class: 'plain-list' }, w.slots.map((s) => h('li', null, h('span', null, exerciseName(s.exerciseId)), h('span', { class: 'mono' }, `${s.sets} × ${s.repMin}–${s.repMax}`))))))),
    h('p', { class: 'note center' }, `Strength Ledger ${APP_VERSION}`),
  );
}

function syncSection(key: string | null, st: ReturnType<typeof getStatus>, root: HTMLElement): HTMLElement {
  if (key) {
    const shown = h('code', { class: 'key' }, revealKey ? key : '•••••-•••••-•••••-•••••-•••••-•••••');
    return h('section', { class: 'card' },
      h('h2', null, 'Sync'),
      h('p', null, describe(st)),
      st.message ? h('p', { class: 'note warn' }, st.message) : null,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onclick: async () => {
          await syncNow();
          void renderMore(root);
        } }, 'Sync now'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => {
          shown.textContent = key;
        } }, 'Show key'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => copy(key) }, 'Copy key')),
      shown,
      h('p', { class: 'note' }, 'To add another device, copy this key here and paste it there (More › Sync › I have a sync key). Keep it private; it unlocks your data.'));
  }
  const code = h('input', { type: 'text', autocapitalize: 'characters', autocomplete: 'off', placeholder: 'Setup code', 'aria-label': 'Setup code', class: 'text-input' });
  const keyIn = h('input', { type: 'text', autocapitalize: 'characters', autocomplete: 'off', placeholder: 'XXXXX-XXXXX-…', 'aria-label': 'Sync key', class: 'text-input' });
  return h('section', { class: 'card' },
    h('h2', null, 'Sync'),
    h('p', null, 'Your workouts are saved on this device. Turn on sync to share them with your other device and keep a copy in your Cloudflare account.'),
    h('form', { class: 'stack', onsubmit: async (e: Event) => {
      e.preventDefault();
      try {
        await setUpSync((code as HTMLInputElement).value);
        revealKey = true;
        toast('Sync is on. Copy the key below to your other device.', 4000);
        (document.activeElement as HTMLElement | null)?.blur();
        await renderMore(root);
      } catch (err) {
        toast((err as Error).message, 4000);
      }
    } }, h('h3', null, 'First device'), code, h('button', { class: 'btn primary', type: 'submit' }, 'Turn on sync')),
    h('form', { class: 'stack', onsubmit: async (e: Event) => {
      e.preventDefault();
      try {
        await useSyncKey((keyIn as HTMLInputElement).value);
        toast('Sync is on. Pulling your history…');
        void renderMore(root);
      } catch (err) {
        toast((err as Error).message, 4000);
      }
    } }, h('h3', null, 'I have a sync key'), keyIn, h('button', { class: 'btn', type: 'submit' }, 'Connect this device')));
}

// Import results live outside the page so they survive the page refreshing while records save.
let importLog: string[] = [];
let importNow = '';
const drawImportLog = (): void => {
  const el = document.getElementById('import-log');
  if (el) fill(el, ...importLog.map((line) => h('li', null, line)), importNow ? h('li', { class: 'muted' }, importNow) : null);
};

function importSection(root: HTMLElement): HTMLElement {
  const file = h('input', { type: 'file', accept: '.xlsx,.json', multiple: true, 'aria-label': 'Choose export files', onchange: async (e: Event) => {
    const files = [...((e.target as HTMLInputElement).files ?? [])];
    importLog = [];
    for (const f of files) {
      try {
        const r = await importFile(f, (m) => {
          importNow = `${f.name}: ${m}`;
          drawImportLog();
        });
        importLog.push(`${f.name}: ${r.added.toLocaleString()} new records. ${Object.entries(r.totals).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(' · ')}`);
      } catch (err) {
        importLog.push(`${f.name}: ${(err as Error).message}`);
      }
      importNow = '';
      drawImportLog();
    }
    void syncNow();
    void renderMore(root);
  } });
  const log = h('ul', { id: 'import-log', class: 'note import-log', role: 'status' });
  queueMicrotask(drawImportLog);
  return h('section', { class: 'card' },
    h('h2', null, 'Import history'),
    h('p', null, 'Choose your Fitbod export (.xlsx) and your earlier app log (.json). Importing twice adds nothing. Do this once, on your Mac; your iPhone gets the history through sync.'),
    h('label', { class: 'btn file' }, icon('plus'), 'Choose files', file),
    log);
}

function describe(st: ReturnType<typeof getStatus>): string {
  const when = st.lastSync ? new Date(st.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  switch (st.state) {
    case 'synced':
      return `Up to date${when ? ` · ${when}` : ''}.`;
    case 'syncing':
      return st.pending ? `Syncing · ${st.pending.toLocaleString()} changes to send.` : 'Syncing…';
    case 'offline':
      return `Offline. ${st.pending ? `${st.pending} changes are saved here and will send when you are back online.` : 'Everything is saved on this device.'}`;
    case 'error':
      return `Sync problem. ${st.pending ? `${st.pending} changes are waiting, safely saved here.` : ''}`;
    default:
      return 'Not set up.';
  }
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied.');
  } catch {
    toast('Copy did not work here. Select the key and copy it manually.');
  }
}
