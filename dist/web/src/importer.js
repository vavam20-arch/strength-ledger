// Imports the Fitbod export and the earlier app's log into this device, with the user's review decisions applied.
// Safe to repeat: records keep stable IDs, so a second import adds nothing.

import { importFitbod } from '../../src/import/fitbod.js';
import { importEarlierApp } from '../../src/import/earlier-app.js';
import { USER_DECISIONS as UD } from '../../src/decisions.js';
                                                              
import { saveMany,                 } from './store.js';
import { weekKey } from './dates.js';

                                
                 
                   
                                 
                
                   
 

export async function importFile(file      , onProgress                        )                         {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let r              ;
  if (/\.xlsx$/i.test(file.name)) {
    onProgress?.('Reading the Fitbod export…');
    r = await importFitbod(bytes, file.name, { mergeSplitSessions: UD.mergeFitbodSplitSessions, renames: UD.fitbodRenames });
  } else if (/\.json$/i.test(file.name)) {
    onProgress?.('Reading your earlier app log…');
    r = await importEarlierApp(bytes, file.name, { dedupePushups: UD.dedupePushups, openLatestSession: UD.openSessions === 'finish' });
  } else {
    throw new Error('Choose the Fitbod .xlsx export or the earlier app .json log.');
  }
  const sessions               = r.sessions.map((s) => ({
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
  const step = (label        ) => (n        ) => onProgress?.(`${label}: ${n.toLocaleString()} saved`);
  added += await saveMany('sessions', sessions                                                              , step('Workouts'));
  added += await saveMany('sets', r.sets                                                              , step('Sets'));
  added += await saveMany('cardio', r.cardio                                                              , step('Cardio'));
  added += await saveMany('pushups', r.pushups                                                              , step('Push-ups'));
  added += await saveMany('measurements', r.measurements                                                              , step('Measurements'));
  return { source: r.source, fileName: r.fileName, totals: r.totals, added, issues: r.issues.map((i) => i.message) };
}
