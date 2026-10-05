// Headless phone-size run-through of the main flows. Writes screenshots to ./shots.
// Usage: node scripts/e2e.mjs  (expects `npx vite preview --port 4173 --outDir dist-single` running)
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const URL = process.env.URL ?? 'http://localhost:4173/';
const OUT = 'shots';
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/demo.json`, execSync('node scripts/demo-backup.mjs'));

const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: process.env.SCHEME ?? 'dark' }]);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { await sleep(250); await page.screenshot({ path: `${OUT}/${name}.png` }); };
const click = async (text, sel = 'button') => {
  const ok = await page.evaluate((text, sel) => {
    const el = [...document.querySelectorAll(sel)].find((b) => b.textContent?.trim().startsWith(text) && !b.disabled);
    if (!el) return false;
    el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, text, sel);
  if (!ok) throw new Error(`No ${sel} starting with "${text}"`);
  await sleep(150);
};
const text = () => page.evaluate(() => document.body.innerText);
const assert = (c, m) => { if (!c) throw new Error(`ASSERT: ${m}`); console.log('  ok -', m); };

try {
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await shot('01-onboarding');
  await click('Continue'); await click('1–3 years'); await click('Continue');
  await click('No, just track'); await shot('02-onboarding-cycle');
  await click('Start training');
  await sleep(300);
  assert((await text()).includes('Push'), 'home shows Push as next workout');
  await shot('03-home-empty');

  // --- Start a workout and log sets
  await click('Start workout');
  assert((await text()).includes('Barbell Bench Press'), 'workout opened with bench press');
  await shot('04-workout-start');
  const w1 = await page.$('input[aria-label="Set 1 weight"]');
  await w1.click(); await w1.type('60'); await page.keyboard.press('Enter');
  const r1 = await page.$('input[aria-label="Set 1 reps"]');
  await r1.click(); await r1.type('10'); await page.keyboard.press('Enter');
  await page.click('button[aria-label="Complete set 1"]');
  await sleep(300);
  assert(await page.$('.timer-bar'), 'rest timer started on tick');
  assert((await page.$eval('input[aria-label="Set 2 weight"]', (e) => e.value)) === '60', 'weight carried to set 2');
  await page.evaluate(() => [...document.querySelectorAll('.rir-row button')].find((b) => b.textContent === '2')?.click());
  await shot('05-workout-set-logged');
  await page.click('button[aria-label="Complete set 2"]');
  await sleep(200);

  // --- Kill & relaunch mid-workout
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(500);
  const t = await text();
  assert(t.includes('Barbell Bench Press') && t.includes('Finish'), 'relaunch resumes the active workout');
  assert(await page.$('button[aria-label^="Set 2 done"]'), 'set 2 still ticked after relaunch');
  assert(await page.$('.timer-bar'), 'rest timer survives relaunch');

  // --- Stepper and substitution
  await page.click('button[aria-label="Increase Set 3 weight"]');
  assert((await page.$eval('input[aria-label="Set 3 weight"]', (e) => e.value)) === '62.5', 'plus button jumps to next loadable weight (62.5)');
  await page.click('button[aria-label="Options for Incline Dumbbell Press"]');
  await click('Substitute exercise');
  await page.type('input[aria-label="Search exercises"]', 'machine chest');
  await click('Machine Chest Press', '.sheet button');
  assert((await text()).includes('replaces Incline Dumbbell Press'), 'substitution shown');
  await shot('06-workout-substituted');

  // --- Finish
  await click('Finish');
  await shot('07-finish-sheet');
  await click('Finish workout');
  await sleep(300);
  assert((await text()).includes('Workout saved'), 'finish shows summary');
  await shot('08-summary');

  // --- Import demo history via Settings
  await page.evaluate(() => window.history.back()); await sleep(200);
  await click('Settings', '.tab');
  await click('Backup and restore');
  const input = await page.$('input[type=file]');
  await input.uploadFile(`${OUT}/demo.json`);
  await sleep(800);
  assert((await text()).includes('Backup restored'), 'backup import works');
  await click('Train', '.tab'); await sleep(300);
  await shot('09-home-with-history');
  await click('Start workout');
  await sleep(300);
  await shot('10-workout-with-recs');
  const wt = await text();
  assert(/Add weight|Same weight/.test(wt), 'recommendations shown from history');
  await click('Why?', 'button span').catch(async () => { await page.click('.rec'); });
  await sleep(200);
  await shot('11-why-sheet');
  await page.keyboard.press('Escape');
  await page.click('button[aria-label^="Workout options"]'); await click('Discard workout'); await click('Discard workout', '.sheet button');
  await sleep(300);

  await click('Progress', '.tab'); await shot('12-progress');
  await page.evaluate(() => window.scrollTo(0, 900)); await shot('13-progress-2');
  await click('History', '.tab'); await shot('14-history');
  await click('Exercises', '.tab'); await click('Barbell Bench Press', '.list-item'); await shot('15-exercise');
  await click('How to'); await shot('16-exercise-howto');
  await click('Settings', '.tab'); await shot('17-settings');
  await click('Training cycle'); await page.click('input[aria-label="Cycle active"]'); await sleep(300); await shot('18-cycle');
  console.log('\nConsole errors:', errors.length ? errors : 'none');
} catch (e) {
  console.error('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}/zz-failure.png` });
  console.log('Console errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
