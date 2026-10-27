// The user's answers to the phase 2 review questions (27 Oct 2026). Importers and the catalog read these.

export const USER_DECISIONS = {
  decidedOn: '2026-10-27',
  /** Q1: 40–45 minute sessions are fine. */
  sessionLengthMin: 45,
  /**
   * Q2: the machines logged in the earlier app are the exact machines at the user's gym and take priority.
   * Fitbod machine and cable histories are kept as an archive under their own IDs and are never joined.
   * Free-weight and bodyweight histories still join; these dumbbell renames are the same movement.
   */
  machinePolicy: 'current-gym-machines-only'         ,
  fitbodRenames: {
    'Hammer Curls': 'Hammer Curl',
    'Dumbbell Bench Press': 'Flat Dumbbell Bench Press',
    'Dumbbell Incline Bench Press': 'Incline Dumbbell Bench Press',
  }                          ,
  /** Q3: the inferred weight steps are correct. */
  confirmedSteps: {
    'Seated Chest Press — Weight Stack': 5,
    'Machine Fly': 5,
    'Cable Rope Tricep Extension': 5,
    'Lat Pulldown': 5,
    'Cable Row': 5,
    'Machine Rear Delt Fly': 5,
    'Hammer Curl': 5,
    'Leg Press': 10,
    'Lying Hamstrings Curl': 5,
    'Leg Extension': 5,
    'Calf Press': 5,
    'Seated Lateral Raise Machine': 5,
    'Overhead Cable Tricep Extension': 5,
    'Preacher Curl Machine': 10,
    'Romanian Deadlift': 10,
    'GymEquip R2 Leverage Squat': 10,
    'Freemotion Selectorized Glute Kickback': 10,
  }                          ,
  /** Q4: not answered; the proposed default (merge each pair saved minutes apart) is applied and can be reversed. */
  mergeFitbodSplitSessions: true,
  /** Q5: keep one push-up entry per double save. */
  dedupePushups: true,
  /** Q6: "Treadmill incline" and "Incline walk" are the same activity. */
  sameActivities: [['Treadmill incline', 'Incline walk']]              ,
  /** Q7: measurements in inches, cardio distance in miles, stair climber logged in steps. */
  units: { measurements: 'in', cardioDistance: 'mi', stairClimber: 'steps' }         ,
  /** Q8: finish the open Upper B (26 Oct) in the new app. */
  openSessions: 'finish'         ,
};
