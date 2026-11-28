// "How to" cards for the exercises where form matters most. The cues are short reminders to read
// between sets and work offline; the video is a demo on YouTube, loaded only when tapped.

import { HISTORY_ALIASES, slugify } from '../import/catalog.ts';
import { MORE_HOW_TO } from './howto-more.ts';

export interface Video {
  id: string;
  title: string;
  channel: string;
  start?: number;
}

export interface HowTo {
  setup: string[];
  cues: string[];
  avoid: string[];
  /** The full tutorial, when there's one worth watching. A card has a clip, a video or both. */
  video?: Video;
  /** A short vertical demo (a YouTube Short) that loops silently: the quick look between sets. */
  clip?: { id: string; channel: string };
}

export const HOW_TO: Record<string, HowTo> = {
  'Barbell Back Squat': {
    setup: [
      'Bar at mid-chest height in the rack; safeties just below your bottom position.',
      'Bar on your upper traps, hands just outside your shoulders, elbows pulled down.',
      'Two steps back, feet about shoulder width, toes turned out a little.',
    ],
    cues: [
      'Big breath into your belly and brace before every rep.',
      'Sit down between your heels; knees travel out over your toes.',
      'Go as deep as you can while your lower back stays flat.',
      'Drive up through the whole foot, chest and hips rising together.',
    ],
    avoid: [
      'Knees caving in on the way up.',
      'Hips shooting up first, turning it into a good morning.',
      'Grinding through sore knees: stop the set and use the squat machine instead.',
    ],
    video: { id: 'bEv6CCg2BC8', title: 'How To Get A Huge Squat With Perfect Technique', channel: 'Jeff Nippard' },
    clip: { id: 'ZaSetOZFo-k', channel: 'The Physical Therapy and Wellness Channel' },
  },
  'Dumbbell Romanian Deadlift': {
    setup: [
      'Stand tall, feet hip width, a dumbbell in each hand in front of your thighs.',
      'Soft bend in the knees; keep that same bend all the way down.',
    ],
    cues: [
      'Push your hips straight back, as if closing a door with your butt.',
      'Dumbbells slide down close to your legs.',
      'Stop when your hamstrings are fully stretched, usually around mid-shin.',
      'Squeeze your glutes to stand back up; don’t lean back at the top.',
    ],
    avoid: [
      'Rounding your lower back to reach lower.',
      'Bending your knees more as you go down (that makes it a deadlift).',
    ],
    video: { id: '_oyxCn2iSjU', title: 'How To Do Romanian Deadlifts (RDLs)', channel: 'Jeff Nippard' },
    clip: { id: 'wiekN4aIJ0g', channel: 'KevTheTrainer' },
  },
  'Romanian Deadlift': {
    setup: [
      'Take the bar from a rack at mid-thigh (or deadlift it up), hands just outside your thighs.',
      'Feet hip width, soft bend in the knees; keep that same bend all the way down.',
    ],
    cues: [
      'Push your hips straight back, as if closing a door with your butt.',
      'The bar slides down your thighs, staying close the whole way.',
      'Stop when your hamstrings are fully stretched, usually just below the knees to mid-shin.',
      'Squeeze your glutes to stand back up; don’t lean back at the top.',
    ],
    avoid: [
      'Rounding your lower back to reach lower.',
      'Bending your knees more as you go down (that makes it a deadlift).',
      'Letting the bar drift away from your legs.',
    ],
    video: { id: '_oyxCn2iSjU', title: 'How To Do Romanian Deadlifts (RDLs)', channel: 'Jeff Nippard' },
    clip: { id: 'OVd1pq1cAvE', channel: 'KevTheTrainer' },
  },
  'Trap Bar Deadlift': {
    setup: [
      'Step into the middle of the bar so the handles line up with the middle of your feet.',
      'Feet hip width. Use the high handles to start: shorter pull, easier on the knees and back.',
      'Log the total weight with the bar included (its weight is usually stamped on it).',
    ],
    cues: [
      'Sit down and grab the handles in the middle; chest up, back flat.',
      'Take the slack out: pull until the bar is tight against the plates before it leaves the floor.',
      'Push the floor away with your legs, hips and shoulders rising together.',
      'Stand tall and squeeze your glutes; lower it the same way, under control.',
    ],
    avoid: [
      'Rounding your lower back as the bar leaves the floor.',
      'Turning it into a squat with your hips too low, or a stiff-leg pull with them too high.',
      'Bouncing the plates off the floor between reps.',
    ],
    video: { id: 'Vu4oXIRzx7w', title: 'Trap Bar Deadlift: Gym Shorts (How To)', channel: 'Barbell Logic' },
    clip: { id: 'kpyCkyVIxjI', channel: 'Phil Daru' },
  },
  'Barbell Hip Thrust': {
    setup: [
      'Upper back against the bench edge, just below your shoulder blades.',
      'Padded bar over your hip crease; feet flat, shins vertical at the top.',
    ],
    cues: [
      'Chin tucked, eyes forward, ribs down for the whole set.',
      'Drive through your heels and lift until your hips are level with your knees and shoulders.',
      'Squeeze your glutes hard for a second at the top.',
      'Lower under control until the plates nearly touch.',
    ],
    avoid: [
      'Arching your lower back at the top instead of finishing with the glutes.',
      'Feet too close (quads take over) or too far (hamstrings cramp).',
    ],
    video: { id: 'qFxTNOiQIAU', title: 'How To Do Hip Thrusts, with Bret Contreras', channel: 'Marie Wold' },
    clip: { id: '-GEVlyzVbcg', channel: 'Mixed Fitness Arts' },
  },
  'Dumbbell Goblet Squat': {
    setup: [
      'Hold one dumbbell upright against your chest, elbows under it.',
      'Feet a little wider than shoulders, toes turned out slightly.',
    ],
    cues: [
      'Brace, then sit straight down between your knees.',
      'Elbows brush the inside of your knees at the bottom.',
      'Stay tall: the weight in front lets you keep your chest up.',
      'Stand up by pushing the floor away.',
    ],
    avoid: [
      'Heels lifting: widen the stance or put small plates under them.',
      'Letting the dumbbell drift away from your chest.',
    ],
    video: { id: 'nfX7IFK9UNI', title: 'How to do a Goblet Squat', channel: 'NASM' },
    clip: { id: '7-80HiXX1K8', channel: 'Le Sweat' },
  },
  'Cable Face Pull': {
    setup: [
      'Cable at about eye level with a rope (two ropes if you have them, for more room).',
      'Grip with thumbs pointing back toward you; step back until the stack lifts.',
    ],
    cues: [
      'Pull the rope toward your forehead and spread the ends apart.',
      'Finish in a double-biceps pose: hands beside your ears, elbows out.',
      'Pause, then return slowly with your shoulders staying down.',
    ],
    avoid: [
      'Pulling to your chin or chest (that becomes a row).',
      'Going heavy and leaning back to move it.',
    ],
    video: { id: 'ljgqer1ZpXg', title: 'Stop Messing Up Face Pulls (Proper Form)', channel: 'ATHLEAN-X' },
    clip: { id: 'AxXHmcTBFyE', channel: 'GU Campus Recreation' },
  },
  'Plate-Loaded Incline Chest-Supported Row': {
    setup: [
      'Set the seat so the top of the pad sits at your upper chest.',
      'Arms fully reached out at the start, feet planted.',
    ],
    cues: [
      'Start each rep by pulling your shoulder blades back, then bend the elbows.',
      'Drive your elbows toward your hips for lats, or out wide for upper back.',
      'Keep your chest on the pad the whole time.',
      'Let your shoulders reach forward at the bottom for a full stretch.',
    ],
    avoid: [
      'Lifting your chest off the pad to heave the weight.',
      'Short, jerky reps without the stretch.',
    ],
    video: { id: 'Y8yIJvSEB3U', title: 'Chest Supported Machine Row: How To', channel: 'Hammer Fitness' },
    clip: { id: 'eS5kmxxsTr0', channel: 'Rapid Fitness' },
  },
  'Plate-Loaded Chest-Supported T-Bar Row': {
    setup: [
      'Adjust the foot plate so your chest sits on the top of the pad.',
      'Choose the grip: wide for upper back, close/neutral for lats.',
    ],
    cues: [
      'Lift the bar off the hooks and let your arms hang long.',
      'Row toward your lower chest, squeezing your shoulder blades together.',
      'Lower slowly until your arms are straight again.',
    ],
    avoid: [
      'Shrugging the weight up with your neck.',
      'Peeling your chest off the pad on the last reps.',
    ],
    video: { id: 'uVwmw_FVIXI', title: 'T-Bar Row With Proper Technique (Chest Supported)', channel: 'J2FIT' },
    clip: { id: 'Mlr-Lx-10HQ', channel: 'Average To Jacked' },
  },
  '45° Back Extension': {
    setup: [
      'Set the pad just below your hip bones so you can fold freely at the hips.',
      'Feet locked in; hold a plate or dumbbell against your chest for added weight.',
    ],
    cues: [
      'For glutes: round your upper back slightly and turn your toes out a little.',
      'Lower until you feel a stretch in your hamstrings and glutes.',
      'Squeeze your glutes to come up until your body is a straight line.',
    ],
    avoid: [
      'Swinging up past straight and arching your lower back.',
      'Pad too high, which blocks the hips from bending.',
    ],
    video: { id: 'O4eaQJ0k5fU', title: 'Glute-Focused Back Extensions: How To', channel: 'Hammer Fitness' },
    clip: { id: 'hOrVNdnv84E', channel: 'Brock Ashby' },
  },
  'Matrix Plate-Loaded Squat/Lunge': {
    setup: [
      'Stand on the platform under the pads (or holding the handles), feet under your hips.',
      'For lunges, step one foot forward and keep the back heel up.',
    ],
    cues: [
      'Release the safety at the top, then sit down and slightly back.',
      'Keep the whole foot pressing into the platform.',
      'Stop a little above where your knees start to complain.',
      'Push up smoothly; don’t lock the knees hard at the top.',
    ],
    avoid: [
      'Bouncing out of the bottom.',
      'Forgetting the safety lever before you step out.',
    ],
    video: { id: 'uftwGQ027U0', title: 'Plate-Loaded Squat Lunge', channel: 'Flacks Fitness' },
  },
};

Object.assign(HOW_TO, MORE_HOW_TO);

const BY_ID = new Map<string, HowTo>();
for (const [name, how] of Object.entries(HOW_TO)) {
  BY_ID.set(slugify(name), how);
  for (const alias of HISTORY_ALIASES[slugify(name)] ?? []) BY_ID.set(alias, how);
}

/** The card for an exercise, by catalog name or by exercise id (history aliases included). */
export function howToFor(ex: { id?: string; name: string }): HowTo | undefined {
  return HOW_TO[ex.name] ?? (ex.id ? BY_ID.get(ex.id) : undefined) ?? BY_ID.get(slugify(ex.name));
}

/** The privacy-enhanced YouTube player, started on tap. */
export function embedUrl(v: Video): string {
  const q = new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', modestbranding: '1' });
  if (v.start) q.set('start', String(v.start));
  return `https://www.youtube-nocookie.com/embed/${v.id}?${q}`;
}

/** A short demo: starts muted (so it plays straight away on an iPhone) and loops like a GIF. */
export function clipUrl(c: NonNullable<HowTo['clip']>): string {
  const q = new URLSearchParams({ autoplay: '1', mute: '1', loop: '1', playlist: c.id, playsinline: '1', rel: '0', modestbranding: '1' });
  return `https://www.youtube-nocookie.com/embed/${c.id}?${q}`;
}

export function watchUrl(v: Pick<Video, 'id' | 'start'>): string {
  return `https://www.youtube.com/watch?v=${v.id}${v.start ? `&t=${v.start}s` : ''}`;
}
