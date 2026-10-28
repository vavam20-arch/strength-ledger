// Strength trends by muscle group.
//
// Each exercise's best set in a time window is scored with the same estimate the coach uses:
// weight × (1 + reps ÷ 30). A muscle group's index starts at 100 and moves each window by the
// typical (median) change of the exercises that were done in both that window and a recent earlier
// one. Chaining like this lets the index run across exercise changes (Fitbod machines, then the
// current gym) without mixing the absolute weights of different machines.

import { MUSCLES } from './import/catalog.js';
import { estimate } from './engine.js';

                                                                 
export const GROUPS          = ['Chest', 'Back', 'Delts', 'Arms', 'Legs'];
/** The user's priorities (27 Oct 2026). */
export const PRIORITY          = ['Back', 'Delts', 'Chest'];

const GROUP_OF                               = {
  Chest: 'Chest',
  Back: 'Back',
  Traps: 'Back',
  'Lower back': 'Back',
  'Front delts': 'Delts',
  'Side delts': 'Delts',
  'Rear delts': 'Delts',
  Biceps: 'Arms',
  Triceps: 'Arms',
  Quads: 'Legs',
  Hamstrings: 'Legs',
  Glutes: 'Legs',
  Adductors: 'Legs',
  Calves: 'Legs',
  Abs: null,
};

// Name patterns for exercises outside the current gym's catalog (mostly Fitbod history). Order matters.
const RULES                          = [
  [/leg curl|hamstring|romanian|deadlift|good morning|nordic/, 'Hamstrings'],
  [/calf/, 'Calves'],
  [/adductor/, 'Adductors'],
  [/glute|kickback|hip thrust|abductor|bridge/, 'Glutes'],
  [/squat|leg press|leg extension|lunge|step.?up/, 'Quads'],
  [/crunch|sit.?up|\babs?\b|leg raise|knee raise|oblique|side bend|rollout|plank|wood.?chop/, 'Abs'],
  [/tricep|skull|pushdown|push.?down|\bdips?\b|kickback/, 'Triceps'],
  [/curl/, 'Biceps'],
  [/shrug/, 'Traps'],
  [/rear delt|reverse fly|face pull/, 'Rear delts'],
  [/lateral raise|upright row|side raise/, 'Side delts'],
  [/front raise|shoulder press|overhead press|military|arnold/, 'Front delts'],
  [/back extension|hyperextension/, 'Lower back'],
  [/bench|chest press|\bfly\b|flye|crossover|push.?up|\bpec\b/, 'Chest'],
  [/pulldown|pull.?up|chin.?up|\brow\b|pullover/, 'Back'],
];

/** Primary muscle for an exercise name, or null if unknown. */
export function primaryMuscle(name        )                {
  const known = MUSCLES[name];
  if (known) return Object.entries(known).find(([, v]) => v === 1)?.[0] ?? null;
  const n = name.toLowerCase();
  for (const [re, muscle] of RULES) if (re.test(n)) return muscle;
  return null;
}

export const groupOf = (name        )               => {
  const m = primaryMuscle(name);
  return m ? GROUP_OF[m] ?? null : null;
};

                           
                     
               
                             
                 
               
 

                             
                
              
                
                                                                                                     
                
 

                                
                     
               
               
                
                    
               
                   
                    
 

                             
               
                       
                           
               
                             
 

/** Sets that can be scored: loaded (not assisted or bodyweight-only) and 1–20 reps. */
export const scorable = (s          )          => s.weight > 0 && s.reps >= 1 && s.reps <= 20 && !/assist/i.test(s.name);

/** Window boundaries, oldest first, the last ending on `end`. */
export function windows(end        , days        , count        , addDays                                  )                                        {
  const out                                        = [];
  for (let i = count - 1; i >= 0; i--) {
    const e = addDays(end, -i * days);
    out.push({ start: addDays(e, -(days - 1)), end: e });
  }
  return out;
}

const median = (xs          )         => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]  : (s[m - 1]  + s[m] ) / 2;
};

export function strengthTrends(
  sets            ,
  wins                                       ,
  opts                                          = {},
)               {
  const lookback = opts.lookback ?? 3; // compare with the exercise's best from up to 3 windows back
  const maxStep = opts.maxStep ?? 0.15; // one exercise can move a window by at most ±15%
  const inRange = sets.filter((s) => scorable(s) && s.date >= wins[0] .start && s.date <= wins.at(-1) .end);
  const winOf = (d        )         => wins.findIndex((w) => d >= w.start && d <= w.end);

  // best[exerciseId][window] = best estimate
  const best = new Map                             ();
  const meta = new Map                                                                                         ();
  for (const s of inRange) {
    const w = winOf(s.date);
    if (w < 0) continue;
    const e = estimate(s.weight, s.reps);
    const b = best.get(s.exerciseId) ?? new Map                ();
    if ((b.get(w) ?? 0) < e) {
      b.set(w, e);
      const m = meta.get(s.exerciseId);
      m?.byWin.set(w, s.date);
    }
    best.set(s.exerciseId, b);
    const m = meta.get(s.exerciseId) ?? { name: s.name, group: groupOf(s.name), sets: 0, byWin: new Map([[w, s.date]]) };
    m.sets++;
    if (!m.byWin.has(w)) m.byWin.set(w, s.date);
    meta.set(s.exerciseId, m);
  }

  return GROUPS.map((group) => {
    const ids = [...meta.entries()].filter(([, m]) => m.group === group).map(([id]) => id);
    const points               = [];
    let index = 100;
    for (let w = 0; w < wins.length; w++) {
      const steps           = [];
      for (const id of ids) {
        const b = best.get(id) ;
        const now = b.get(w);
        if (now == null) continue;
        for (let k = w - 1; k >= Math.max(0, w - lookback); k--) {
          const prev = b.get(k);
          if (prev != null) {
            steps.push(Math.max(-maxStep, Math.min(maxStep, Math.log(now / prev))));
            break;
          }
        }
      }
      if (steps.length) index *= Math.exp(median(steps));
      points.push({ start: wins[w] .start, end: wins[w] .end, index: Math.round(index * 10) / 10, basis: steps.length });
    }
    const exercises                  = ids
      .map((id) => {
        const b = best.get(id) ;
        const ws = [...b.keys()].sort((a, c) => a - c);
        const m = meta.get(id) ;
        const first = b.get(ws[0] ) ;
        const last = b.get(ws.at(-1) ) ;
        return {
          exerciseId: id,
          name: m.name,
          sets: m.sets,
          first: Math.round(first * 10) / 10,
          firstDate: m.byWin.get(ws[0] ) ,
          last: Math.round(last * 10) / 10,
          lastDate: m.byWin.get(ws.at(-1) ) ,
          changePct: Math.round((last / first - 1) * 1000) / 10,
        };
      })
      .sort((a, c) => c.lastDate.localeCompare(a.lastDate) || c.sets - a.sets);
    const any = points.some((p) => p.basis > 0);
    return {
      group,
      points,
      changePct: any ? Math.round((points.at(-1) .index / 100 - 1) * 1000) / 10 : null,
      sets: ids.reduce((n, id) => n + meta.get(id) .sets, 0),
      exercises,
    };
  });
}
