// Design review screenshots: every screen at iPhone 17 Pro size, light and dark, with real history.
// Usage: node scripts/build-web.ts && node scripts/design-shots.ts <out-dir> [light|dark|both]
// Needs the private exports in data/private/ (never committed).

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { startServer } from './serve.ts';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as typeof import('playwright');
const out = process.argv[2] ?? 'out/design/now';
const modes = (process.argv[3] ?? 'both') === 'both' ? ['light', 'dark'] : [process.argv[3]!];
mkdirSync(out, { recursive: true });

const srv = await startServer(8798, 'DESIGN-SHOTS');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/New_York', locale: 'en-US' });
const p = await ctx.newPage();
const errors: string[] = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.clock.setFixedTime(new Date('2026-11-19T18:30:00-05:00'));
await p.goto(srv.url + '/#more');
await p.waitForSelector('h1');
await p.getByLabel('Choose export files').setInputFiles(['data/private/FitBod workouts history.xlsx', 'data/private/fit-build-log-2026-10-27.json']);
await p.getByText(/fit-build-log-2026-10-27\.json: [\d,]+ new records/).waitFor({ timeout: 180_000 });

// A believable mid-week state: weigh-ins, Push A done, Pull A part-way, one cardio session.
await p.evaluate(async () => {
  const store = await import('/web/src/store.js');
  const days = ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'];
  const w = [218.6, 218.0, 217.8, 217.2, 217.5, 216.8, 216.4];
  for (const [i, date] of days.entries())
    await store.save('measurements', { id: `bw-${date}`, date, bodyWeight: w[i], waist: null, chest: null, shoulders: null, leftArm: null, rightArm: null, leftCalf: null, rightCalf: null, source: 'app' });
  await store.save('cardio', { id: 'c1', date: '2026-11-17', activity: 'Stair climber', activityOriginal: 'Stair climber', durationMin: 20, distance: 1250, distanceUnit: 'steps', intensity: 'Moderate', incline: null, avgHeartRate: 138, source: 'app' });
});
await p.goto(srv.url + '/#start/push-a');
await p.waitForSelector('.slot');
for (const b of await p.getByRole('button', { name: 'Done as planned' }).all()) await b.click();
await p.getByRole('button', { name: 'Finish workout' }).click().catch(() => undefined);
await p.goto(srv.url + '/#start/pull-a');
await p.waitForSelector('.slot');
await p.locator('.slot').first().getByRole('button', { name: 'Done as planned' }).click();
await p.locator('.slot').nth(1).getByRole('button', { name: 'Log set 1' }).click();
const pullUrl = p.url();

const shot = async (name: string, mode: string, scrollY = 0) => {
  await p.evaluate((y) => window.scrollTo(0, y), scrollY);
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/${name}-${mode}.png`, scale: 'css' });
};
const sheetShot = async (name: string, mode: string, scroll = 0) => {
  await p.waitForSelector('.sheet.open');
  await p.waitForTimeout(350);
  if (scroll) await p.locator('.sheet').evaluate((el, y) => el.scrollTo(0, y), scroll);
  await p.screenshot({ path: `${out}/${name}-${mode}.png`, scale: 'css' });
};
const closeSheet = async () => {
  await p.locator('.sheet.open').getByRole('button', { name: 'Done' }).click();
  await p.waitForTimeout(300);
};

for (const mode of modes) {
  await p.emulateMedia({ colorScheme: mode as 'light' | 'dark' });
  await p.goto(srv.url + '/#train');
  await p.waitForSelector('.barbell');
  await shot('01-train', mode);
  await shot('01-train-b', mode, 700);
  await shot('01-train-c', mode, 1400);

  await p.goto(pullUrl);
  await p.waitForSelector('.slot');
  await shot('02-workout', mode);
  await shot('02-workout-b', mode, 650);
  await p.getByRole('button', { name: /^Swap / }).first().click();
  await sheetShot('02-workout-swap', mode);
  await closeSheet();
  await p.locator('.why summary').first().click();
  await shot('02-workout-why', mode, 120);
  await p.getByRole('button', { name: 'Finish workout' }).scrollIntoViewIfNeeded();
  await shot('02-workout-end', mode, 100000);

  await p.goto(srv.url + '/#history');
  await p.waitForSelector('.calendar');
  await p.locator('.day', { hasText: /^17/ }).first().click().catch(() => undefined);
  await shot('03-history', mode);
  await shot('03-history-b', mode, 600);

  await p.goto(srv.url + '/#body');
  await p.locator('.group-card').first().waitFor();
  await shot('04-body', mode);
  await shot('04-body-b', mode, 750);
  await shot('04-body-c', mode, 1500);
  await p.locator('.group-card', { hasText: 'Arms' }).getByRole('button', { name: /^Biceps:/ }).click();
  await sheetShot('04-body-biceps', mode);
  await sheetShot('04-body-biceps-b', mode, 700);
  await closeSheet();

  await p.goto(srv.url + '/#more');
  await p.getByRole('button', { name: 'Change program' }).waitFor();
  await shot('05-more', mode);
  await shot('05-more-b', mode, 800);
  await p.getByRole('button', { name: 'Change program' }).click();
  await sheetShot('05-more-change', mode);
  await closeSheet();

  await p.goto(srv.url + '/#train');
  await p.getByRole('button', { name: 'Log cardio' }).click();
  await sheetShot('06-cardio', mode);
  await closeSheet();
}
console.log(errors.length ? `Page errors:\n${errors.join('\n')}` : 'No page errors.');
await browser.close();
await srv.close();
