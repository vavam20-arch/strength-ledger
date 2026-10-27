// Imports the Fitbod export and the earlier app's log into this device, with the user's review decisions applied.
// Safe to repeat: records keep stable IDs, so a second import adds nothing.

import { importFitbod } from '../../src/import/fitbod.ts';
import { importEarlierApp } from '../../src/import/earlier-app.ts';
import { USER_DECISIONS as UD } from '../../src/decisions.ts';
import type { ImportResult } from '../../src/import/types.ts';
import { saveMany, type AppSession } from './store.ts';
import { weekKey } from './dates.ts';

export interface ImportSummary {
  source: string;
  fileName: string;
  totals: Record<string, number>;
  added: number;
  issues: string[];
}

export async function importFile(file: File, onProgress?: (msg: string) => void): Promise<ImportSummary> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let r: ImportResult;
  if (/\.xlsx$/i.test(file.name)) {
    onProgress?.('Reading the Fitbod export…');
    r = await importFitbod(bytes, file.name, { mergeSplitSessions: UD.mergeFitbodSplitSessions, renames: UD.fitbodRenames });
  } else if (/\.json$/i.test(file.name)) {
    onProgress?.('Reading your earlier app log…');
    r = await importEarlierApp(bytes, file.name, { dedupePushups: UD.dedupePushups, openLatestSession: UD.openSessions === 'finish' });
  } else {
    throw new Error('Choose the Fitbod .xlsx export or the earlier app .json log.');
  }
  const sessions: AppSession[] = r.sessions.map((s) => ({
    id: s.id,
    _v: {},
    date: s.date,
    weekKey: weekKey(s.date),
    template: s.template,
    programId: null,
    source: r.source,
    status: s.extra['status'] === 'open' ? 'open' : 'finished',
    startedAt: s.startedAt,
    finishedAt: null,
    targets: {},
    order: null,
    swaps: {},
    added: [],
    knee: null,
    extra: s.extra,
  }));
  let added = 0;
  const step = (label: string) => (n: number) => onProgress?.(`${label}: ${n.toLocaleString()} saved`);
  added += await saveMany('sessions', sessions as unknown as Array<Record<string, unknown> & { id: string }>, step('Workouts'));
  added += await saveMany('sets', r.sets as unknown as Array<Record<string, unknown> & { id: string }>, step('Sets'));
  added += await saveMany('cardio', r.cardio as unknown as Array<Record<string, unknown> & { id: string }>, step('Cardio'));
  added += await saveMany('pushups', r.pushups as unknown as Array<Record<string, unknown> & { id: string }>, step('Push-ups'));
  added += await saveMany('measurements', r.measurements as unknown as Array<Record<string, unknown> & { id: string }>, step('Measurements'));
  return { source: r.source, fileName: r.fileName, totals: r.totals, added, issues: r.issues.map((i) => i.message) };
}
