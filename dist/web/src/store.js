// App data layer: every change is stamped, written to the device and queued for upload in one transaction.

import { byIndex, get, getAll, getLocal, reqResult, setLocal, write } from './db.js';
import { makeClock, observe, tick,            } from '../../src/sync/hlc.js';
import { maxStamp, merge, sameRecord, stamp,                               } from '../../src/sync/merge.js';
                                                                                                
                                                    

// ---------- record types ----------
                             
                     
                     
                        
                 
                          
                           
                      
                 
                  
 

                                                  
               
                  
                   
                           
                                           
                              
                           
                            
                                                                 
                                      
                                                                          
                         
                                        
                                
                                              
                
                                                   
                      
                                 
 

                                             
                                                        
                                                   
                                                   

// ---------- events ----------
export const bus = new EventTarget();
export const emit = (type        , detail          )       => {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
};

// ---------- clock ----------
let clock               = null;

export async function deviceId()                  {
  let id = await getLocal               ('deviceId', null);
  if (!id) {
    const kind = /iPhone|iPad/.test(navigator.userAgent) ? 'iphone' : /Mac/.test(navigator.userAgent) ? 'mac' : 'web';
    id = `${kind}-${crypto.getRandomValues(new Uint32Array(1))[0] .toString(36)}`;
    await setLocal('deviceId', id);
  }
  return id;
}

async function getClock()                 {
  if (!clock) {
    const saved = await getLocal                                            ('clock', null);
    clock = { ...makeClock(await deviceId()), ...(saved ?? {}) };
  }
  return clock;
}

export async function observeStamp(s        )                {
  observe(await getClock(), s);
}

// ---------- writes ----------
/**
 * Save a record locally and queue it for upload. With `fields`, only those fields get a new stamp
 * (an edit); without, the whole record is new.
 */
export async function save                        (table       , rec                                                 , fields           )             {
  const c = await getClock();
  const hlc = tick(c);
  const stamped = stamp(rec     , hlc, fields ?? (rec._v ? Object.keys(rec).filter((k) => k !== 'id' && k !== '_v') : undefined))                ;
  await write([table, 'outbox', 'local'], (tx) => {
    tx.objectStore(table).put(stamped);
    queue(tx, table, stamped.id);
    tx.objectStore('local').put({ key: 'clock', value: { lastMs: c.lastMs, counter: c.counter } });
  });
  emit('change', { table, id: stamped.id });
  return stamped;
}

/** Change some fields of an existing record. */
export async function update                        (table       , id        , changes            )             {
  const cur = await get   (table, id);
  if (!cur) throw new Error(`Record ${id} not found.`);
  const next = { ...cur, ...changes }     ;
  return save   (table, next, Object.keys(changes));
}

export const remove = (table       , id        )                        => update(table, id, { deleted: true }                         );

function queue(tx                , t       , id        )       {
  const store = tx.objectStore('outbox');
  const key = `${t}|${id}`;
  const req = store.get(key);
  req.onsuccess = () => store.put({ key, t, id, rev: ((req.result                                )?.rev ?? 0) + 1 });
}

/** Bulk save with one shared stamp (imports). Records already present are merged, never duplicated. */
export async function saveMany(table       , recs                                                 , onProgress                      )                  {
  const c = await getClock();
  let written = 0;
  for (let i = 0; i < recs.length; i += 2000) {
    const chunk = recs.slice(i, i + 2000);
    const hlc = tick(c);
    await write([table, 'outbox', 'local'], (tx) => {
      const store = tx.objectStore(table);
      for (const r of chunk) {
        const incoming = stamp(r, hlc)                ;
        const req = store.get(r.id);
        req.onsuccess = () => {
          if (req.result) return; // already imported: keep the existing record and its edits
          store.put(incoming);
          queue(tx, table, r.id);
          written++;
        };
      }
      tx.objectStore('local').put({ key: 'clock', value: { lastMs: c.lastMs, counter: c.counter } });
    });
    onProgress?.(Math.min(recs.length, i + chunk.length));
  }
  emit('change', { table });
  return written;
}

/** Merge records pulled from the server. Never queues them for upload. Returns how many changed locally. */
export async function applyRemote(items                                      )                  {
  let changed = 0;
  const tables = [...new Set(items.map((i) => i.t))];
  if (!tables.length) return 0;
  let latest = '';
  await write(tables, (tx) => {
    for (const { t, r } of items) {
      const store = tx.objectStore(t);
      const req = store.get(r.id);
      req.onsuccess = () => {
        const local = req.result                            ;
        const merged = merge(local, r);
        if (!local || !sameRecord(local, merged)) {
          store.put(merged);
          changed++;
        }
      };
      const s = maxStamp(r);
      if (s > latest) latest = s;
    }
  });
  if (latest) await observeStamp(latest);
  if (changed) emit('change', { remote: true });
  return changed;
}

// ---------- reads ----------
const live =                         (rows     )      => rows.filter((r) => !r.deleted);

export const getSession = (id        )                                  => get            ('sessions', id);
export const sessionsInWeek = async (weekKey        )                        => live(await byIndex            ('sessions', 'byWeek', weekKey));
export const allSessions = async ()                        => live(await getAll            ('sessions'));
export const setsForSession = async (sessionId        )                    => live(await byIndex        ('sets', 'bySession', sessionId)).sort((a, b) => a.order - b.order);
export const setsForExercise = async (exerciseId        )                    => live(await byIndex        ('sets', 'byExercise', exerciseId));
export const setsBetween = async (from        , to        )                    => live(await byIndex        ('sets', 'byDate', IDBKeyRange.bound(from, to)));
export const cardioBetween = async (from        , to        )                       => live(await byIndex           ('cardio', 'byDate', IDBKeyRange.bound(from, to)));
export const measurements = async ()                            => live(await getAll                ('measurements')).sort((a, b) => a.date.localeCompare(b.date));

export async function latestBodyweight(onOrBefore        )                         {
  const ms = await byIndex                ('measurements', 'byDate', IDBKeyRange.upperBound(onOrBefore));
  const withBw = live(ms).filter((m) => m.bodyWeight != null).sort((a, b) => a.date.localeCompare(b.date));
  return withBw.at(-1)?.bodyWeight ?? null;
}

export async function pendingIds()                       {
  const rows = await getAll                             ('outbox');
  return new Set(rows.map((r) => r.id));
}

export { reqResult };
