// Block 1 (proposed, 27 Oct 2026): Push / Pull / Legs × 2 on a flexible Monday–Sunday week.
// Weighted toward back, delts and chest; knee-aware legs. 6 progressing weeks would be 5 + a deload.

                                              
import { slugify } from '../import/catalog.js';

                                  
              
               
                
                
 

                          
             
               
                         
                     
                     
                           
                              
 

                                                                                        

/** Exercise ID → display name, for every exercise used by a program. */
export const EXERCISE_NAMES                         = {};

const workout = (key        , name        , focus        , rows       )                  => ({
  key,
  name,
  focus,
  slots: rows.map(([exercise, role, sets, repMin, repMax], i) => {
    EXERCISE_NAMES[slugify(exercise)] = exercise;
    return { key: `${key}/${i + 1}`, exerciseId: slugify(exercise), role, sets, repMin, repMax };
  }),
});

/** Which movement pattern a workout trains, so the app avoids repeating it on back-to-back days. */
export const PATTERN                                                               = {
  'push-a': 'push',
  'push-b': 'push',
  'pull-a': 'pull',
  'pull-b': 'pull',
  'legs-a': 'legs',
  'legs-b': 'legs',
  'upper-a': 'upper',
  'upper-b': 'upper',
  'lower-a': 'lower',
  'lower-b': 'lower',
};

/** Names of workouts from earlier plans, for sessions imported from the earlier app. */
export const LEGACY_WORKOUTS                         = { 'upper-a': 'Upper A', 'upper-b': 'Upper B', 'lower-a': 'Lower A', 'lower-b': 'Lower B', fitbod: 'Fitbod workout' };

export const BLOCK_1          = {
  id: 'ppl2-block1',
  name: 'Push / Pull / Legs × 2 — Block 1',
  weekStartsOn: 'monday',
  blockWeeks: 6,
  deloadWeek: 6,
  suggestedOrder: ['push-a', 'pull-a', 'legs-a', 'push-b', 'pull-b', 'legs-b'],
  workouts: [
    workout('push-a', 'Push A', 'Chest', [
      ['Seated Chest Press — Weight Stack', 'anchor', 3, 6, 10],
      ['Incline Dumbbell Bench Press', 'secondary', 3, 8, 12],
      ['Machine Fly', 'isolation', 2, 10, 15],
      ['Dumbbell Lateral Raise', 'isolation', 4, 12, 20],
      ['Cable Rope Tricep Extension', 'isolation', 2, 10, 15],
    ]),
    workout('pull-a', 'Pull A', 'Back width', [
      ['Lat Pulldown', 'anchor', 3, 6, 10],
      ['Assisted Pull Up', 'secondary', 3, 6, 10],
      ['Cable Row', 'secondary', 2, 8, 12],
      ['Machine Rear Delt Fly', 'isolation', 3, 12, 20],
      ['Hammer Curl', 'isolation', 2, 10, 15],
    ]),
    workout('legs-a', 'Legs A', 'Quads, knee-aware', [
      ['Leg Press', 'anchor', 3, 8, 12],
      ['Lying Hamstrings Curl', 'secondary', 3, 10, 15],
      ['Leg Extension', 'isolation', 2, 12, 20],
      ['Calf Press', 'isolation', 3, 10, 15],
      ['Ab Rollout', 'bodyweight', 2, 8, 15],
    ]),
    workout('push-b', 'Push B', 'Shoulders', [
      ['Barbell Shoulder Press', 'anchor', 3, 6, 10],
      ['Matrix Plate-Loaded Bench Press — Lying', 'secondary', 3, 8, 12],
      ['Seated Lateral Raise Machine', 'isolation', 4, 12, 20],
      ['Standing Low-to-High Cable Chest Press', 'isolation', 2, 10, 15],
      ['Overhead Cable Tricep Extension', 'isolation', 2, 10, 15],
    ]),
    workout('pull-b', 'Pull B', 'Back thickness', [
      ['Cable Row', 'anchor', 3, 8, 12],
      ['Dumbbell Row', 'secondary', 3, 8, 12],
      ['Machine Rear Delt Fly', 'isolation', 2, 12, 20],
      ['Dumbbell Lateral Raise', 'isolation', 2, 12, 20],
      ['Barbell Shrug', 'isolation', 2, 10, 15],
      ['Preacher Curl Machine', 'isolation', 2, 10, 15],
    ]),
    workout('legs-b', 'Legs B', 'Hinge and glutes', [
      ['Romanian Deadlift', 'anchor', 3, 6, 10],
      ['GymEquip R2 Leverage Squat', 'secondary', 3, 8, 12],
      ['Plate-Loaded Kneeling Leg Curl', 'isolation', 2, 10, 15],
      ['Freemotion Selectorized Glute Kickback', 'isolation', 2, 12, 15],
      ['Life Fitness Plate-Loaded Seated Calf Raise', 'isolation', 3, 12, 20],
      ['Vertical Leg Raise', 'bodyweight', 2, 10, 15],
    ]),
  ],
};

/** Weekly hard sets per muscle (assisting muscles count half). */
export function weeklySets(program         , muscles                                                )                         {
  const out                         = {};
  for (const w of program.workouts)
    for (const s of w.slots) for (const [m, k] of Object.entries(muscles(s.exerciseId))) out[m] = (out[m] ?? 0) + s.sets * k;
  return out;
}
