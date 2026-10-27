// End-to-end tests in Chromium at iPhone 17 Pro size (and a Mac window for the second device),
// against the built app and the real Worker running on SQLite.
// Usage: node scripts/build-web.ts && node --test e2e/app.e2e.ts

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { startServer } from '../scripts/serve.ts';
import { importFitbod } from '../src/import/fitbod.ts';
import { importEarlierApp } from '../src/import/earlier-app.ts';
import { USER_DECISIONS as UD } from '../src/decisions.ts';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as typeof import('playwright');
type Browser = import('playwright').Browser;
type BrowserContext = import('playwright').BrowserContext;
type Page = import('playwright').Page;

const SETUP = 'E2E-SETUP-CODE';
const SHOTS = process.env['SHOTS'] ?? '';
const FITBOD = 'data/private/FitBod workouts history.xlsx';
const EARLIER = 'data/private/fit-build-log-2026-10-27.json';
const MON = '2026-11-02T10:00:00-05:00';

let server: Awaited<ReturnType<typeof startServer>>;
let browser: Browser;
let phoneCtx: BrowserContext;
let macCtx: BrowserContext;
let phone: Page;
let mac: Page;
const errors: string[] = [];

async function newDevice(kind: 'phone' | 'mac'): Promise<[BrowserContext, Page]> {
  const ctx = await browser.newContext(
    kind === 'phone'
      ? { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: 'America/New_York', locale: 'en-US' }
      : { viewport: { width: 1280, height: 820 }, timezoneId: 'America/New_York', locale: 'en-US' },
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${kind}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${kind} console: ${m.text()}`);
  });
  await page.clock.setFixedTime(new Date(MON));
  await page.goto(server.url + '/');
  await page.waitForSelector('h1');
  return [ctx, page];
}

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  try {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, scale: 'css', timeout: 15_000 });
  } catch (e) {
    console.log(`screenshot ${name} skipped: ${(e as Error).message.split('\n')[0]}`);
  }
};

/** Count records in a store of the app's IndexedDB (deleted ones excluded). */
const countIn = (page: Page, store: string) =>
  page.evaluate(
    (s) =>
      new Promise<number>((res, rej) => {
        const r = indexedDB.open('strength-ledger');
        r.onsuccess = () => {
          const q = r.result.transaction(s).objectStore(s).getAll();
          q.onsuccess = () => res((q.result as Array<{ deleted?: boolean }>).filter((x) => !x.deleted).length);
          q.onerror = () => rej(q.error);
        };
      }),
    store,
  );

const allIn = <T>(page: Page, store: string) =>
  page.evaluate(
    (s) =>
      new Promise<unknown[]>((res) => {
        const r = indexedDB.open('strength-ledger');
        r.onsuccess = () => {
          const q = r.result.transaction(s).objectStore(s).getAll();
          q.onsuccess = () => res(q.result as unknown[]);
        };
      }),
    store,
  ) as Promise<T[]>;

const syncNow = (page: Page) => page.evaluate(async () => (await import('/web/src/sync-client.js')).syncNow());
const pill = (page: Page) => page.locator('#sync-pill').textContent();
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

before(async () => {
  server = await startServer(8791, SETUP);
  browser = await chromium.launch();
  [phoneCtx, phone] = await newDevice('phone');
});

after(async () => {
  await browser?.close();
  await server?.close();
});

test('the week board loads with a suggested workout and fits the iPhone screen', async () => {
  assert.match((await phone.locator('h1').textContent()) ?? '', /Week of Nov 2/);
  await phone.locator('.hero-card').waitFor();
  assert.equal(await phone.locator('.week-row').count(), 6);
  assert.ok(await noSideScroll(phone), 'no sideways scrolling');
  await shot(phone, '01-train');
});

test('logging sets: one tap, done as planned, edited reps, extra set; saved through a reload', async () => {
  await phone.locator('.hero-card').click();
  await phone.waitForSelector('.slot');
  const first = phone.locator('.slot').first();
  const firstName = await first.locator('h2').textContent();
  await first.getByRole('button', { name: 'Log set 1' }).click();
  await first.getByRole('button', { name: 'Set 1 logged; tap to undo' }).waitFor();
  await first.getByRole('button', { name: 'Done as planned' }).click();
  await phone.waitForFunction(() => document.querySelectorAll('.slot')[0]?.querySelectorAll('.check.on').length === 3);
  await first.getByRole('button', { name: 'Extra set' }).click();
  await first.getByRole('button', { name: 'Log set +1' }).click();
  await phone.waitForFunction(() => document.querySelectorAll('.slot')[0]?.querySelectorAll('.check.on').length === 4);

  const second = phone.locator('.slot').nth(1);
  const reps = second.getByRole('textbox', { name: 'Set 1 reps' });
  await reps.fill('6');
  await reps.press('Enter');
  await second.getByRole('button', { name: 'Log set 1' }).click();
  await second.getByRole('button', { name: 'Set 1 logged; tap to undo' }).waitFor();
  assert.ok(await noSideScroll(phone), 'workout screen has no sideways scrolling');
  await shot(phone, '02-workout');

  await phone.reload();
  await phone.waitForSelector('.slot');
  assert.equal(await phone.locator('.slot').first().locator('h2').textContent(), firstName);
  assert.equal(await phone.locator('.slot').first().locator('.check.on').count(), 4);
  const sets = await allIn<{ kind: string; reps: number; slotKey: string }>(phone, 'sets');
  assert.equal(sets.length, 5);
  assert.equal(sets.filter((s) => s.kind === 'extra').length, 1);
  assert.ok(sets.some((s) => s.reps === 6), 'edited reps were saved');
  assert.match((await pill(phone)) ?? '', /Sync off/);
});

test('works with no signal: the app reopens from the offline cache and still saves sets', async () => {
  await phone.waitForFunction(() => navigator.serviceWorker?.controller != null || navigator.serviceWorker.ready.then(() => true));
  await phone.evaluate(() => navigator.serviceWorker.ready);
  await phone.reload(); // now controlled by the service worker
  await phone.waitForSelector('.slot');
  await phoneCtx.setOffline(true);
  await phone.reload();
  await phone.waitForSelector('.slot');
  const third = phone.locator('.slot').nth(2);
  await third.getByRole('button', { name: 'Log set 1' }).click();
  await third.getByRole('button', { name: 'Set 1 logged; tap to undo' }).waitFor();
  assert.equal(await countIn(phone, 'sets'), 6);
  await phoneCtx.setOffline(false);
});

test('catch-up logging dates new sets on the day they were done', async () => {
  const fourth = phone.locator('.slot').nth(3);
  await phone.getByLabel('Date these sets were performed').fill('2026-11-01');
  await phone.getByText('Catch-up mode').waitFor();
  await fourth.getByRole('button', { name: 'Log set 1' }).click();
  await fourth.getByRole('button', { name: 'Set 1 logged; tap to undo' }).waitFor();
  const sets = await allIn<{ performedDate: string; slotKey: string }>(phone, 'sets');
  assert.equal(sets.filter((s) => s.performedDate === '2026-11-01').length, 1);
  assert.equal(sets.filter((s) => s.performedDate === '2026-11-02').length, 6);
});

test('weigh-in saves from the week board', async () => {
  await phone.goto(server.url + '/#train');
  await phone.getByLabel('Bodyweight in pounds').fill('217.4');
  await phone.getByRole('button', { name: 'Save' }).click();
  await phone.waitForFunction(() => !document.querySelector('.weigh'));
  const m = await allIn<{ bodyWeight: number; date: string }>(phone, 'measurements');
  assert.deepEqual(m.map((x) => [x.date, x.bodyWeight]), [['2026-11-02', 217.4]]);
});

let syncKey = '';
test('sync: the iPhone turns sync on and uploads everything it saved offline', async () => {
  await phone.goto(server.url + '/#more');
  await phone.getByLabel('Setup code').fill(SETUP.toLowerCase());
  await phone.getByRole('button', { name: 'Turn on sync' }).click();
  syncKey = ((await phone.locator('code.key').first().textContent()) ?? '').trim();
  assert.match(syncKey, /^[A-Z0-9]{5}(-[A-Z0-9]{5}){5}$/);
  await syncNow(phone);
  await phone.waitForFunction(() => document.querySelector('#sync-pill')?.textContent === 'Synced');
  assert.equal(await countIn(phone, 'outbox'), 0);
  const rows = server.env.DB as unknown as { raw: { prepare: (s: string) => { all: () => Array<{ tbl: string; n: number }> } } };
  const byTable = Object.fromEntries(rows.raw.prepare('SELECT tbl, count(*) n FROM records GROUP BY tbl').all().map((r) => [r.tbl, r.n]));
  assert.equal(byTable['sets'], 7);
  assert.equal(byTable['sessions'], 1);
  assert.equal(byTable['measurements'], 1);
  await shot(phone, '03-more-synced');
});

test('sync: the Mac connects with the key and receives the workout', async () => {
  [macCtx, mac] = await newDevice('mac');
  await mac.goto(server.url + '/#more');
  await mac.getByLabel('Sync key').fill(syncKey.toLowerCase());
  await mac.getByRole('button', { name: 'Connect this device' }).click();
  await mac.waitForFunction(() => document.querySelector('#sync-pill')?.textContent === 'Synced');
  assert.equal(await countIn(mac, 'sets'), 7);
  assert.equal(await countIn(mac, 'sessions'), 1);
  await mac.goto(server.url + '/#history');
  await mac.waitForSelector('.calendar');
  await shot(mac, '04-mac-history');
});

test('sync conflict: edits to different fields on two offline devices both survive; the later edit wins a clash', async () => {
  const sets = await allIn<{ id: string; weight: number; reps: number; kind: string }>(phone, 'sets');
  const target = sets.find((s) => s.kind === 'work')!;
  const edit = (page: Page, changes: Record<string, unknown>) =>
    page.evaluate(async ([id, ch]) => {
      const store = await import('/web/src/store.js');
      await store.update('sets', id as string, ch as Record<string, unknown>);
    }, [target.id, changes] as const);
  await phoneCtx.setOffline(true);
  await macCtx.setOffline(true);
  await phone.clock.setFixedTime(new Date('2026-11-02T18:00:00-05:00'));
  await edit(phone, { reps: 11, note: 'from phone' });
  await mac.clock.setFixedTime(new Date('2026-11-02T18:05:00-05:00'));
  await edit(mac, { weight: target.weight + 5, reps: 9 });
  await phoneCtx.setOffline(false);
  await macCtx.setOffline(false);
  await syncNow(phone);
  await syncNow(mac);
  await syncNow(phone);
  for (const page of [phone, mac]) {
    const s = (await allIn<{ id: string; weight: number; reps: number; note: string }>(page, 'sets')).find((x) => x.id === target.id)!;
    assert.equal(s.weight, target.weight + 5);
    assert.equal(s.reps, 9, 'the later reps edit wins');
    assert.equal(s.note, 'from phone', 'the note from the other device is kept');
  }
});

test('import on the Mac: totals match the files, a second import adds nothing, and the iPhone receives it all', { timeout: 600_000 }, async (t) => {
  if (!existsSync(FITBOD) || !existsSync(EARLIER)) return t.skip('private exports not present');
  const fb = await importFitbod(new Uint8Array(readFileSync(FITBOD)), 'fitbod.xlsx', { mergeSplitSessions: UD.mergeFitbodSplitSessions, renames: UD.fitbodRenames });
  const ea = await importEarlierApp(new Uint8Array(readFileSync(EARLIER)), 'log.json', { dedupePushups: UD.dedupePushups, openLatestSession: UD.openSessions === 'finish' });
  const expected = {
    sessions: fb.sessions.length + ea.sessions.length + 1,
    sets: fb.sets.length + ea.sets.length + 7,
    cardio: fb.cardio.length + ea.cardio.length,
    pushups: fb.pushups.length + ea.pushups.length,
    measurements: fb.measurements.length + ea.measurements.length + 1,
  };
  await mac.goto(server.url + '/#more');
  const input = mac.getByLabel('Choose export files');
  await input.setInputFiles([FITBOD, EARLIER]);
  await mac.getByText(/fit-build-log-2026-10-27\.json: [\d,]+ new records/).waitFor({ timeout: 300_000 });
  for (const [store, n] of Object.entries(expected)) assert.equal(await countIn(mac, store), n, `${store} on the Mac`);

  await mac.goto(server.url + '/#more');
  await mac.getByLabel('Choose export files').setInputFiles([FITBOD, EARLIER]);
  await mac.getByText(/fit-build-log-2026-10-27\.json: 0 new records/).waitFor({ timeout: 300_000 });
  await mac.getByText(/FitBod workouts history\.xlsx: 0 new records/).waitFor();

  const started = Date.now();
  await syncNow(mac);
  assert.equal(await countIn(mac, 'outbox'), 0);
  const pushSeconds = (Date.now() - started) / 1000;
  await syncNow(phone);
  for (const [store, n] of Object.entries(expected)) assert.equal(await countIn(phone, store), n, `${store} on the iPhone`);
  t.diagnostic(`Mac upload of ${Object.values(expected).reduce((a, b) => a + b, 0).toLocaleString()} records: ${pushSeconds.toFixed(1)} s`);

  await phone.goto(server.url + '/#history');
  await phone.waitForSelector('.calendar');
  await shot(phone, '05-phone-history');
  await phone.goto(server.url + '/#body');
  await phone.waitForSelector('h1');
  assert.ok(await noSideScroll(phone));
  await shot(phone, '06-phone-body');
});

test('the earlier app’s open Upper B is listed so it can be finished', async (t) => {
  if (!existsSync(EARLIER)) return t.skip('private exports not present');
  await phone.goto(server.url + '/#train');
  await phone.getByText('Open from your previous plan').waitFor();
  await phone.locator('.week-row', { hasText: 'Open' }).first().click();
  await phone.waitForSelector('.slot');
  await shot(phone, '07-legacy-open');
  await phone.getByRole('button', { name: 'Finish workout' }).click();
  await phone.waitForFunction(() => location.hash === '#train');
  assert.equal(await phone.getByText('Open from your previous plan').count(), 0);
});

test('targets on a new workout use the imported history', async (t) => {
  if (!existsSync(FITBOD)) return t.skip('private exports not present');
  await phone.goto(server.url + '/#train');
  const row = phone.locator('.week-row').filter({ hasNotText: /Done|\d+\/\d+/ }).first();
  await row.click();
  await phone.waitForSelector('.slot');
  const withTargets = await phone.locator('.slot .target').count();
  assert.ok(withTargets >= 3, `expected targets, found ${withTargets}`);
  await phone.locator('.why summary').first().click();
  await shot(phone, '08-new-workout-targets');
});

test('a new week starts empty on Monday', async () => {
  await phone.clock.setFixedTime(new Date('2026-11-09T07:00:00-05:00'));
  await phone.goto(server.url + '/#train');
  await phone.reload();
  await phone.waitForSelector('h1');
  assert.match((await phone.locator('h1').textContent()) ?? '', /Week of Nov 9/);
  assert.match((await phone.locator('.page-head .muted').textContent()) ?? '', /^0 of 6 workouts done/);
});

test('no errors in the browser console', () => {
  assert.deepEqual(errors, []);
});
