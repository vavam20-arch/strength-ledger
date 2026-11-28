import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOW_TO, clipUrl, embedUrl, howToFor, watchUrl } from '../src/program/howto.ts';
import { MUSCLES, slugify } from '../src/import/catalog.ts';

test('every How to card is for an exercise in the library and is complete', () => {
  for (const [name, how] of Object.entries(HOW_TO)) {
    assert.ok(MUSCLES[name], `${name} is in the catalog`);
    assert.ok(how.video || how.clip, `${name} has a clip or a video`);
    for (const id of [how.video?.id, how.clip?.id]) if (id) assert.match(id, /^[A-Za-z0-9_-]{11}$/, `${name} has a YouTube id`);
    assert.ok(how.setup.length && how.cues.length && how.avoid.length, `${name} has cues`);
  }
});

test('found by name, by id, and through history aliases', () => {
  assert.equal(howToFor({ name: 'Barbell Back Squat' }), HOW_TO['Barbell Back Squat']);
  assert.equal(howToFor({ id: slugify('Cable Face Pull'), name: 'Face pull (renamed)' }), HOW_TO['Cable Face Pull']);
  assert.equal(howToFor({ id: 'fitbod-back-squat', name: 'Back Squat' }), HOW_TO['Barbell Back Squat']);
  assert.equal(howToFor({ id: 'dumbbell-bicep-curl', name: 'Dumbbell Bicep Curl' }), undefined);
});

test('the player is the privacy-enhanced one and plays inline', () => {
  const v = { id: 'abcdefghijk', title: 't', channel: 'c', start: 42 };
  assert.equal(embedUrl(v), 'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&playsinline=1&rel=0&modestbranding=1&start=42');
  assert.equal(watchUrl(v), 'https://www.youtube.com/watch?v=abcdefghijk&t=42s');
});

test('quick demos are Shorts that start muted and loop', () => {
  assert.equal(clipUrl({ id: 'abcdefghijk', channel: 'c' }), 'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&mute=1&loop=1&playlist=abcdefghijk&playsinline=1&rel=0&modestbranding=1');
  for (const [name, how] of Object.entries(HOW_TO)) if (how.clip) assert.match(how.clip.id, /^[A-Za-z0-9_-]{11}$/, name);
});

test('new library entries: cable upright row and trap bar deadlift', async () => {
  const { inferEquipment, inferLoadType } = await import('../src/import/catalog.ts');
  assert.deepEqual(MUSCLES['Cable Upright Row'], { 'Side delts': 1, Traps: 0.5 });
  assert.equal(MUSCLES['Trap Bar Deadlift']?.Quads, 1);
  assert.equal(inferEquipment('Trap Bar Deadlift', []).equipment.step, 5, 'free weight: 2.5 lb a side');
  assert.equal(inferLoadType('Trap Bar Deadlift', false), 'external');
  assert.ok(howToFor({ name: 'Trap Bar Deadlift' })?.clip);
});

test('every exercise in every program has a How-to card', async () => {
  const { PROGRAMS } = await import('../src/program/programs.ts');
  const byId = new Map(Object.keys(MUSCLES).map((n) => [slugify(n), n]));
  const missing = new Set<string>();
  for (const p of PROGRAMS) for (const w of p.workouts) for (const s of w.slots) {
    const name = byId.get(s.exerciseId) ?? s.exerciseId;
    if (!howToFor({ id: s.exerciseId, name })) missing.add(name);
  }
  assert.deepEqual([...missing], []);
});
