// Adversarial checks: junk input, empty workouts, custom exercises, template deletion, light theme.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:4173/';
const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (text, sel = 'button') => {
  const ok = await page.evaluate((text, sel) => {
    const el = [...document.querySelectorAll(sel)].find((b) => b.textContent?.trim().startsWith(text) && !b.disabled);
    if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, text, sel);
  if (!ok) throw new Error(`No ${sel} starting with "${text}"`);
  await sleep(150);
};
const val = (sel) => page.$eval(sel, (e) => e.value);
const assert = (c, m) => { if (!c) throw new Error(`ASSERT: ${m}`); console.log('  ok -', m); };
const typeInto = async (sel, s) => { const el = await page.$(sel); await el.click(); await el.type(s); await page.keyboard.press('Enter'); await sleep(100); };

try {
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate(() => indexedDB.deleteDatabase('ironlog')); await page.reload({ waitUntil: 'networkidle0' });
  await click('Continue'); await click('Under a year'); await click('Continue'); await click('Yes, run'); await click('Start training'); await sleep(300);
  assert((await page.evaluate(() => document.body.innerText)).includes('Hypertrophy I, week 1 of 4'), 'cycle status on home');

  // Empty workout + finish with nothing logged
  await click('Other'); await click('Empty workout', '.sheet button'); await sleep(200);
  await click('Finish'); assert((await page.evaluate(() => document.body.innerText)).includes('Nothing logged yet'), 'finishing empty workout asks to discard');
  await click('Discard workout', '.sheet button'); await sleep(300);
  assert(!(await page.evaluate(() => document.body.innerText)).includes('Resume workout'), 'empty workout discarded');

  // Junk input
  await click('Start workout'); await sleep(200);
  await typeInto('input[aria-label="Set 1 weight"]', 'abc');
  assert((await val('input[aria-label="Set 1 weight"]')) === '', 'letters ignored');
  await typeInto('input[aria-label="Set 1 weight"]', '-20');
  assert((await val('input[aria-label="Set 1 weight"]')) === '', 'negative weight ignored');
  await typeInto('input[aria-label="Set 1 weight"]', '99999');
  assert((await val('input[aria-label="Set 1 weight"]')) === '', 'absurd weight ignored');
  await typeInto('input[aria-label="Set 1 weight"]', '72,5');
  assert((await val('input[aria-label="Set 1 weight"]')) === '72.5', 'comma decimal accepted');
  await page.click('input[aria-label="Set 1 reps"]'); await page.click('h3'); await sleep(100);
  assert((await val('input[aria-label="Set 1 reps"]')) !== '', 'focus then leave keeps previous value');
  for (let i = 0; i < 10; i++) await page.click('button[aria-label="Decrease Set 1 reps"]');
  assert((await val('input[aria-label="Set 1 reps"]')) === '0', 'reps never below 0');
  // Rapid double tap
  await page.click('button[aria-label="Complete set 1"]'); await page.click('button[aria-label^="Set 1 done"]'); await sleep(150);
  assert(await page.$('button[aria-label="Complete set 1"]'), 'double tap toggles back cleanly');
  await click('Finish'); await click('Discard workout', '.sheet button'); await sleep(300);

  // Custom exercise, then use it in a template, then delete the template
  await click('Exercises', '.tab'); await click('New'); await typeInto('input[placeholder^="e.g. Smith"]', 'Landmine Press');
  await click('Save'); await sleep(200);
  await page.type('input[aria-label="Search exercises"]', 'landmine');
  assert((await page.evaluate(() => document.body.innerText)).includes('Landmine Press'), 'custom exercise saved and searchable');
  await click('Train', '.tab'); await click('New', '.tpl-pill');
  await typeInto('input[placeholder="e.g. Upper A"]', 'Test Day');
  await click('Add exercise'); await page.type('.sheet input[aria-label="Search exercises"]', 'landmine'); await click('Landmine Press', '.sheet button');
  await click('Save'); await sleep(200);
  assert((await page.evaluate(() => document.body.innerText)).includes('Test Day'), 'template created');
  await page.screenshot({ path: 'shots/b1-home-light.png' });
  await click('Test Day', '.tpl-pill'); await sleep(200);
  await typeInto('input[aria-label="Set 1 weight"]', '20'); await page.click('button[aria-label="Complete set 1"]'); await sleep(200);
  await page.screenshot({ path: 'shots/b2-workout-light.png' });
  await click('Finish'); await click('Finish workout'); await sleep(300);
  await page.evaluate(() => window.history.back()); await sleep(200);
  await click('Edit'); await click('Test Day', '.list-item'); await click('Delete template'); await click('Delete template', '.sheet button'); await sleep(200);
  await click('History', '.tab');
  assert((await page.evaluate(() => document.body.innerText)).includes('Test Day'), 'history survives template deletion');

  // Edit historical workout
  await page.evaluate(() => [...document.querySelectorAll('.list-item')].find((b) => b.textContent.includes('Test Day')).click()); await sleep(200); await click('Edit');
  await typeInto('input[aria-label="Set 1 reps"]', '12'); await click('Done'); await sleep(200);
  assert((await page.evaluate(() => document.body.innerText)).includes('20 kg × 12'), 'historical edit saved');
  await page.screenshot({ path: 'shots/b3-detail-light.png' });
  console.log('\nConsole errors:', errors.length ? errors : 'none');
} catch (e) {
  console.error('FAILED:', e.message); await page.screenshot({ path: 'shots/zz-break.png' }); console.log(errors); process.exitCode = 1;
} finally { await browser.close(); }
