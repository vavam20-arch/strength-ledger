import type { Exercise, Exposure, SetEntry, Slot } from '../src/model.ts';

export const ex = (id: string, step: number, loadType: Exercise['loadType'] = 'external', extra: Partial<Exercise['equipment']> = {}): Exercise => ({
  id,
  name: id,
  loadType,
  equipment: { step, ...extra },
  muscles: {},
});

export const slot = (exerciseId: string, sets: number, repMin: number, repMax: number, role: Slot['role'] = 'anchor'): Slot => ({
  key: `s-${exerciseId}`,
  exerciseId,
  role,
  sets,
  repMin,
  repMax,
});

let n = 0;
/** sets: [weight, reps, kind?][] */
export const exposure = (exerciseId: string, date: string, sets: Array<[number, number, SetEntry['kind']?]>, planned = true): Exposure => {
  const sessionId = `sess-${date}-${n++}`;
  return {
    sessionId,
    date,
    exerciseId,
    planned,
    sets: sets.map(([weight, reps, kind], i) => ({
      id: `${sessionId}-${i}`,
      sessionId,
      exerciseId,
      slotKey: null,
      kind: kind ?? 'work',
      weight,
      reps,
      completed: true,
      performedDate: date,
      enteredAt: null,
      order: i,
      rir: null,
      note: null,
      source: 'test',
    })),
  };
};
