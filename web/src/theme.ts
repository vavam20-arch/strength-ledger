// Appearance: Automatic (follow the device), Light or Dark. Saved with the synced settings so the
// phone and the Mac match, and mirrored in localStorage so the page opens in the right colors
// before the database is read (see the inline script in index.html).

import { get } from './db.ts';
import { save } from './store.ts';
import type { SyncedRecord } from '../../src/sync/merge.ts';

export type Appearance = 'auto' | 'light' | 'dark';
const LIGHT_BAR = '#edeff2';
const DARK_BAR = '#0c0f13';

export async function getAppearance(): Promise<Appearance> {
  const rec = await get<{ mode?: string; deleted?: boolean }>('settings', 'appearance');
  const m = rec && !rec.deleted ? rec.mode : undefined;
  return m === 'light' || m === 'dark' ? m : 'auto';
}

export function applyAppearance(mode: Appearance): void {
  const root = document.documentElement;
  if (mode === 'auto') delete root.dataset['theme'];
  else root.dataset['theme'] = mode;
  try {
    if (mode === 'auto') localStorage.removeItem('appearance');
    else localStorage.setItem('appearance', mode);
  } catch {
    /* private mode: the database still has it */
  }
  // The browser bar color follows the app, not only the device.
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.remove();
  const add = (content: string, media?: string) => {
    const m = document.createElement('meta');
    m.name = 'theme-color';
    m.content = content;
    if (media) m.media = media;
    document.head.append(m);
  };
  if (mode === 'auto') {
    add(LIGHT_BAR, '(prefers-color-scheme: light)');
    add(DARK_BAR, '(prefers-color-scheme: dark)');
  } else add(mode === 'dark' ? DARK_BAR : LIGHT_BAR);
}

// Bumped on every local choice, so a read that started before the choice was saved
// (for example, one triggered by a sync arriving at the same moment) can't undo it.
let localChoice = 0;

export async function setAppearance(mode: Appearance): Promise<void> {
  localChoice++;
  applyAppearance(mode);
  await save<SyncedRecord>('settings', { id: 'appearance', mode } as unknown as SyncedRecord);
}

/** Apply whatever is saved (at start, and when the other device changes it). */
export async function loadAppearance(): Promise<void> {
  const before = localChoice;
  const mode = await getAppearance();
  if (localChoice === before) applyAppearance(mode);
}
