// How-to cards for the rest of the exercises in the programs: short cues plus a quick demo.
// Kept apart from howto.ts so the list stays readable; merged there into HOW_TO.

import type { HowTo } from './howto.ts';

const DB = 'Andrew Kwong (DeltaBolic)';
const KEV = 'KevTheTrainer';

const lateralRaise: HowTo = {
  setup: [
    'Stand tall with a light dumbbell (or a low cable handle) in each hand, slightly in front of your thighs.',
    'Soft bend in the elbows that stays the same the whole set.',
  ],
  cues: [
    'Lead with your elbows and raise out to the sides, a little in front of your body.',
    'Stop at about shoulder height, pinkies level with or just above the thumbs.',
    'Lower slowly, 2–3 seconds, and don’t rest at the bottom.',
  ],
  avoid: ['Swinging or shrugging the weight up with your traps.', 'Going so heavy that the elbows bend more to move it.'],
  clip: { id: 'Kl3LEzQ5Zqs', channel: DB },
};

export const MORE_HOW_TO: Record<string, HowTo> = {
  'Seated Chest Press — Weight Stack': {
    setup: [
      'Set the seat so the handles line up with the middle of your chest.',
      'Back and head against the pad, shoulder blades pulled back and down.',
    ],
    cues: [
      'Press the handles forward without letting your shoulders roll off the pad.',
      'Stop just short of locking the elbows.',
      'Bring the handles back slowly until you feel a stretch across the chest.',
    ],
    avoid: ['Seat too low, which turns it into a shoulder press.', 'Letting the stack slam between reps.'],
    clip: { id: 'Qu7-ceCvq7w', channel: DB },
  },
  'Matrix Plate-Loaded Bench Press — Lying': {
    setup: [
      'Lie with your eyes under the handles and feet flat on the floor.',
      'Squeeze your shoulder blades together and keep them pinned to the bench.',
    ],
    cues: [
      'Unrack, then lower the handles under control until they reach chest level.',
      'Press up and slightly in, the way the arms converge.',
      'Each arm moves on its own: keep both sides even.',
    ],
    avoid: ['Bouncing out of the bottom.', 'Lifting your hips off the bench to finish a rep.'],
    video: { id: 'haNgRz9riE0', title: 'Matrix Supine Chest Press (Plate Loaded): How To Use', channel: 'Valley East Snap Fitness' },
    clip: { id: 'O_s0hPREVkI', channel: 'Matrix Fitness India' },
  },
  'Incline Dumbbell Bench Press': {
    setup: [
      'Bench at a low incline, about 30°.',
      'Kick the dumbbells up off your knees as you lie back; shoulder blades back and down.',
    ],
    cues: [
      'Lower the dumbbells to the sides of your upper chest, elbows about 45° from your body.',
      'Press up and slightly in until they almost touch.',
      'Control the way down; feel the stretch in your upper chest.',
    ],
    avoid: ['Bench too steep, which shifts the work to your front delts.', 'Flaring the elbows straight out to the sides.'],
    clip: { id: '8fXfwG4ftaQ', channel: DB },
  },
  'Machine Fly': {
    setup: [
      'Seat height so the handles are at mid-chest when your arms are out.',
      'Set the start so you feel a stretch but your shoulders stay comfortable.',
    ],
    cues: [
      'Keep a slight bend in the elbows and bring the handles together in an arc.',
      'Squeeze your chest for a second when the handles meet.',
      'Open back up slowly to the stretch.',
    ],
    avoid: ['Pressing with your arms instead of hugging.', 'Shoulders rolling forward off the pad.'],
    clip: { id: 'XZg28DIf1oc', channel: DB },
  },
  'Standing Low-to-High Cable Chest Press': {
    setup: [
      'Cables set low, one handle in each hand; stand in the middle with a staggered stance.',
      'Lean slightly forward and keep your chest up.',
    ],
    cues: [
      'Press up and forward so your hands meet around eye level.',
      'Squeeze your upper chest at the top.',
      'Return slowly until your hands are beside your chest.',
    ],
    avoid: ['Arching your lower back to push.', 'Shrugging the shoulders up as the hands rise.'],
    clip: { id: 'NXpRKhXg2P8', channel: DB },
  },
  'Barbell Shoulder Press': {
    setup: [
      'Bar at upper-chest height in the rack; hands just outside your shoulders.',
      'Elbows slightly in front of the bar, glutes and abs tight.',
    ],
    cues: [
      'Press straight up, moving your head back a little so the bar clears your chin.',
      'Once it passes your forehead, bring your head through so the bar finishes over your mid-foot.',
      'Lower to the top of your chest under control.',
    ],
    avoid: ['Leaning back into a standing incline press.', 'Pressing the bar out in front instead of straight up.'],
    video: { id: 'AhGW3XFG3M8', title: 'Gym Shorts (How To): The Press', channel: 'Barbell Logic' },
    clip: { id: '4LBVP2Oe7fg', channel: DB },
  },
  'Seated Shoulder Press Machine': {
    setup: [
      'Seat height so the handles start at about shoulder level.',
      'Back flat on the pad, forearms vertical under the handles.',
    ],
    cues: [
      'Press up until the arms are nearly straight.',
      'Lower slowly to shoulder level, not lower than is comfortable.',
    ],
    avoid: ['Arching your back off the pad.', 'Locking the elbows hard at the top.'],
    clip: { id: '6v4nrRVySj0', channel: DB },
  },
  'Dumbbell Lateral Raise': lateralRaise,
  'Cable or Dumbbell Lateral Raise': lateralRaise,
  'Seated Lateral Raise Machine': {
    setup: [
      'Seat height so your shoulders line up with the machine’s pivot points.',
      'Pads on the outside of your arms just above the elbows; chest against the pad.',
    ],
    cues: [
      'Raise your elbows out to the sides until they reach shoulder height.',
      'Pause for a moment, then lower slowly.',
    ],
    avoid: ['Shrugging up to move the weight.', 'Letting the weight drop between reps.'],
    clip: { id: 'wRe2-fwSE_Y', channel: 'Colossus Fitness' },
  },
  'Machine Rear Delt Fly': {
    setup: [
      'Face the pad; seat height so the handles are at shoulder level.',
      'Set the handles so your arms start straight out in front.',
    ],
    cues: [
      'Palms down; sweep your arms out and back in a wide arc.',
      'Stop when your arms are in line with your body.',
      'Return slowly without letting the plates touch.',
    ],
    avoid: ['Squeezing your shoulder blades together (that turns it into a back exercise).', 'Bending the elbows to row it.'],
    clip: { id: 'H5UxZFl0lgk', channel: DB },
  },
  'Cable Rope Tricep Extension': {
    setup: ['Rope on a high pulley; stand close with a slight forward lean.', 'Elbows pinned at your sides.'],
    cues: [
      'Push the rope down until your arms are straight.',
      'Spread the rope ends apart at the bottom and squeeze.',
      'Let your forearms come back up to about parallel, elbows still.',
    ],
    avoid: ['Elbows drifting forward and back.', 'Leaning over the rope to push with body weight.'],
    clip: { id: 'aHfbuBf1TJk', channel: KEV },
  },
  'Overhead Cable Tricep Extension': {
    setup: ['Rope or bar on a high pulley; face away from the stack in a staggered stance.', 'Lean forward with elbows by your head.'],
    cues: [
      'Straighten your arms forward and up until they lock out.',
      'Let your hands come back behind your head for a deep stretch.',
      'Keep your upper arms still; only the elbows move.',
    ],
    avoid: ['Elbows flaring wide.', 'Rocking your body to move the weight.'],
    clip: { id: 'NTk0Igxqcsk', channel: DB },
  },
  'Triceps Extension Machine': {
    setup: ['Seat height so your elbows line up with the pivot point.', 'Upper arms flat on the pad.'],
    cues: [
      'Push the handles down until your arms are straight.',
      'Squeeze, then let your hands come back up slowly.',
    ],
    avoid: ['Lifting your elbows off the pad.', 'Shoulders shrugging up.'],
    clip: { id: '1AFJTda1btg', channel: DB },
  },
  'Lat Pulldown': {
    setup: ['Thigh pad snug on your legs.', 'Grip a little wider than your shoulders.'],
    cues: [
      'Lean back slightly and pull the bar to your upper chest.',
      'Think of driving your elbows down toward your hips.',
      'Let the bar rise until your arms are fully straight and your lats stretch.',
    ],
    avoid: ['Pulling behind your neck.', 'Swinging back to get the weight moving.'],
    clip: { id: 'bNmvKpJSWKM', channel: DB },
  },
  'Assisted Pull Up': {
    setup: [
      'More weight on the stack means more help: start with enough to get your reps.',
      'Kneel (or stand) on the pad and grip a little wider than your shoulders.',
    ],
    cues: [
      'Start from a dead hang, then pull your chest toward the bar.',
      'Get your chin over the bar, then lower all the way down.',
    ],
    avoid: ['Half reps that never reach a full hang.', 'Kicking or swinging up.'],
    clip: { id: 'JcGwiiGyYFA', channel: KEV },
  },
  'Cable Row': {
    setup: ['Feet on the platform, knees slightly bent.', 'Sit tall with your chest up.'],
    cues: [
      'Pull the handle to your lower ribs, elbows close to your sides.',
      'Squeeze your shoulder blades together at the end.',
      'Let your arms reach forward for a full stretch without rounding your lower back.',
    ],
    avoid: ['Rocking your torso back and forth to move the weight.', 'Shrugging the handle toward your neck.'],
    clip: { id: 'YqD0tKXHTvM', channel: DB },
  },
  'Dumbbell Row': {
    setup: ['One hand and the same-side knee on a bench; back flat.', 'Dumbbell hanging straight below your shoulder.'],
    cues: [
      'Pull the dumbbell up toward your hip, elbow close to your side.',
      'Pause at the top, then lower until your arm is fully straight.',
    ],
    avoid: ['Twisting your torso to lift the weight.', 'Pulling to your chest (that hits the arm more than the back).'],
    clip: { id: 'WkFX6_GxAs8', channel: DB },
  },
  'Barbell Shrug': {
    setup: ['Take the bar from a rack at mid-thigh height; hands just outside your thighs.', 'Stand tall, arms straight.'],
    cues: [
      'Lift your shoulders straight up toward your ears.',
      'Hold the top for a second, then lower slowly.',
    ],
    avoid: ['Rolling the shoulders in circles.', 'Bending the elbows to pull.'],
    clip: { id: 'qOltbbuFT7Y', channel: 'Fit_hub03' },
  },
  'Low Back Extension Machine': {
    setup: [
      'Sit with the pad across your upper back and feet secure.',
      'Start light: this machine is for control, not max weight.',
    ],
    cues: [
      'Push back slowly by straightening at the hips until you’re upright.',
      'Return forward under control; keep the movement smooth.',
    ],
    avoid: ['Jerking back fast.', 'Leaning back past upright.'],
    video: { id: 'l1BmzpEiPQI', title: 'How To Do A Seated Machine Back Extension (Matrix)', channel: 'Live Lean TV' },
    clip: { id: 'kgdWtlWxNow', channel: 'MindPhysique' },
  },
  'Hammer Curl': {
    setup: ['Dumbbells at your sides, palms facing each other.', 'Elbows close to your sides.'],
    cues: [
      'Curl up, thumbs leading, without letting the elbows move forward.',
      'Squeeze at the top, then lower slowly all the way.',
    ],
    avoid: ['Swinging your body.', 'Cutting the bottom of the rep short.'],
    clip: { id: '3YYRmJ3RBj0', channel: 'Patrick Frost' },
  },
  'Preacher Curl Machine': {
    setup: ['Seat height so your armpits sit at the top of the pad.', 'Upper arms flat on the pad.'],
    cues: [
      'Curl the handles up, keeping your wrists straight.',
      'Lower slowly until your arms are almost straight: that stretch builds the biceps.',
    ],
    avoid: ['Lifting your elbows off the pad.', 'Dropping fast at the bottom, which strains the elbow.'],
    clip: { id: 'S4dDLfp3e8w', channel: DB },
  },
  'Biceps Curl Machine': {
    setup: ['Seat height so your elbows line up with the pivot point.', 'Upper arms flat on the pad.'],
    cues: [
      'Curl up smoothly and squeeze at the top.',
      'Lower slowly until the arms are nearly straight.',
    ],
    avoid: ['Leaning back to finish a rep.', 'Letting the weight drop.'],
    clip: { id: '-6T-kK-4BbI', channel: 'UMD RSOP' },
  },
  'Leg Press': {
    setup: [
      'Back flat on the pad; feet shoulder width in the middle of the platform.',
      'Release the safeties once you’ve pressed the weight up.',
    ],
    cues: [
      'Lower until your knees are well bent, as deep as your lower back stays on the pad.',
      'Push through your whole foot back up.',
      'Stop just short of locking your knees.',
    ],
    avoid: ['Your hips peeling off the seat at the bottom.', 'Locking your knees out hard at the top.'],
    clip: { id: 'EotSw18oR9w', channel: DB },
  },
  'GymEquip R2 Leverage Squat': {
    setup: [
      'Stand on the platform with the pads on your shoulders, feet shoulder width.',
      'Feet a bit forward of your hips works the quads with less strain on the knees.',
    ],
    cues: [
      'Release the safety, then squat down until your thighs are about parallel.',
      'Drive back up through your whole foot.',
      'Keep your back against the pads the whole time.',
    ],
    avoid: ['Heels lifting.', 'Forgetting to set the safety before stepping out.'],
    video: { id: 'qw6FeQFg4G8', title: 'How to use the leverage squat for Squats and Calf raise', channel: 'Masters Fitness' },
    clip: { id: '0etu6Vnzr_Y', channel: 'Watson Gym Equipment' },
  },
  'Leg Extension': {
    setup: [
      'Back rest so your knees line up with the machine’s pivot point.',
      'Pad just above your ankles.',
    ],
    cues: [
      'Straighten your legs and squeeze your quads for a second at the top.',
      'Lower slowly, 2–3 seconds.',
    ],
    avoid: ['Kicking the weight up.', 'If your knees are sore, shorten the range rather than pushing through.'],
    clip: { id: 'iQ92TuvBqRo', channel: DB },
  },
  'Lying Hamstrings Curl': {
    setup: [
      'Lie face down with your knees just off the end of the pad.',
      'Ankle pad just above your heels.',
    ],
    cues: [
      'Curl your heels toward your glutes, hips pressed into the pad.',
      'Pause at the top, then lower slowly to a full stretch.',
    ],
    avoid: ['Hips lifting off the pad.', 'Swinging the weight up.'],
    clip: { id: 'EnZZIaPCb8k', channel: DB },
  },
  'Plate-Loaded Kneeling Leg Curl': {
    setup: [
      'Kneel on the pad with your knee lined up with the pivot point.',
      'Ankle pad just above the heel; forearms on the arm pads.',
    ],
    cues: [
      'Curl your heel up toward your glute.',
      'Lower slowly to a full stretch before the next rep.',
    ],
    avoid: ['Twisting the hips to help.', 'Short reps that skip the stretch.'],
    video: { id: 'gaU4MUGEUBQ', title: 'How to use the Magnum Plate-loaded Kneeling Leg Curl', channel: 'Matrix Fitness' },
  },
  'Freemotion Selectorized Glute Kickback': {
    setup: [
      'Chest on the pad and forearms on the arm rests; working foot on the platform.',
      'Back flat, hips square to the machine.',
    ],
    cues: [
      'Push the platform back by driving your heel, as if pushing the wall away.',
      'Squeeze your glute at the end, then return slowly.',
    ],
    avoid: ['Arching your lower back to get more range.', 'Rotating the hip open.'],
    clip: { id: 'Zt6kfolzSsI', channel: 'Rhiannon Cooper' },
  },
  'Hip Adductor Machine': {
    setup: [
      'Sit back with pads on the inside of your knees.',
      'Set the start width to a stretch you can control.',
    ],
    cues: [
      'Squeeze your legs together and hold for a second.',
      'Let them open slowly back to the start.',
    ],
    avoid: ['Letting the weight snap your legs open.', 'Starting wider than you can control.'],
    video: { id: 'rd3e8v8RDCk', title: 'How to Use the Life Fitness Hip Adduction Machine', channel: 'Fitness 19' },
    clip: { id: 'iPLvw74e7Tk', channel: KEV },
  },
  'Calf Press': {
    setup: [
      'On the leg press, put just the balls of your feet on the bottom edge of the platform.',
      'Press the weight up with your legs almost straight; keep the safeties on.',
    ],
    cues: [
      'Let your heels drop for a deep stretch, then push all the way onto your toes.',
      'Pause at both the top and the bottom.',
    ],
    avoid: ['Bouncing quick, short reps.', 'Bending your knees to help.'],
    clip: { id: '49WplWRXN2o', channel: 'Fitness Is Life' },
  },
  'Life Fitness Plate-Loaded Seated Calf Raise': {
    setup: ['Balls of your feet on the platform, pad snug on your lower thighs.', 'Release the safety lever.'],
    cues: [
      'Drop your heels for a full stretch and pause.',
      'Push up as high as you can onto your toes and squeeze.',
    ],
    avoid: ['Bouncing at the bottom.', 'Half reps.'],
    video: { id: 'Pw0O0fIIG-g', title: 'Signature Series Plate-Loaded Calf Raise Instructions', channel: 'Life Fitness' },
    clip: { id: 'MuHwV6A6q5w', channel: 'KU Ambler Rec' },
  },
  'Ab Rollout': {
    setup: ['Kneel on a mat with the wheel (or bar) under your shoulders.', 'Brace your abs and squeeze your glutes.'],
    cues: [
      'Roll forward slowly as far as you can without your lower back sagging.',
      'Pull back with your abs, not your hips.',
    ],
    avoid: ['Lower back arching at the far point.', 'Going further than you can control: shorten the range first.'],
    video: { id: 'nCh8VfWY5_g', title: 'How to do Ab Wheel Rollouts the Right Way (3 Tips!)', channel: 'Redefining Strength' },
    clip: { id: 'RqmQPPNPMa0', channel: 'SAY FITNESS' },
  },
  'Vertical Leg Raise': {
    setup: ['Back against the pad, forearms on the arm rests.', 'Let your legs hang straight down.'],
    cues: [
      'Raise your knees (or straight legs) up by curling your pelvis toward your chest.',
      'Lower slowly without swinging.',
    ],
    avoid: ['Using momentum to swing the legs up.', 'Shrugging into the arm pads.'],
    clip: { id: '0AQ4j5vu2Cw', channel: KEV },
  },
};
