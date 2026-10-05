// Portuguese walk-through: dumps each screen's text and screenshots to ./shots-pt
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const URL = process.env.URL ?? 'http://localhost:4173/';
fs.mkdirSync('shots-pt', { recursive: true });
const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'language', { get: () => 'pt-BR' }));
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (text, sel = 'button') => {
  const ok = await page.evaluate((text, sel) => { const el = [...document.querySelectorAll(sel)].find((b) => b.textContent?.trim().startsWith(text) && !b.disabled); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; }, text, sel);
  if (!ok) throw new Error(`No ${sel} "${text}"`); await sleep(200);
};
const dump = async (name) => { await sleep(300); await page.screenshot({ path: `shots-pt/${name}.png` }); const t = await page.evaluate(() => document.body.innerText); fs.appendFileSync('shots-pt/text.txt', `\n=== ${name}\n${t}\n`); };
fs.writeFileSync('shots-pt/text.txt', '');
try {
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await dump('01-onb');
  await click('Continuar'); await click('1–3 anos'); await click('Continuar'); await click('Sim, seguir'); await dump('02-onb3');
  await click('Começar a treinar'); await sleep(300); await dump('03-home');
  await click('Iniciar treino'); await dump('04-workout');
  const w1 = await page.$('input[aria-label="Carga da série 1"]'); await w1.click(); await w1.type('60'); await page.keyboard.press('Enter');
  const r1 = await page.$('input[aria-label="Repetições da série 1"]'); await r1.click(); await r1.type('10'); await page.keyboard.press('Enter');
  await page.click('button[aria-label="Concluir série 1"]'); await sleep(300); await dump('05-set');
  await page.evaluate(() => document.querySelector('.timer-bar button:last-child')?.click());
  await click('Por quê?').catch(() => {}); await dump('06-why');
  await page.keyboard.press('Escape');
  await page.goBack().catch(() => {}); await sleep(300);
  await click('Finalizar').catch(() => {}); await dump('07-finish');
  await click('Finalizar treino').catch(() => {}); await dump('08-saved');
  await click('Concluir').catch(() => {});
  for (const [tab, n] of [['Histórico', '09-hist'], ['Progresso', '10-prog'], ['Exercícios', '11-ex'], ['Ajustes', '12-set']]) { await click(tab); await dump(n); }
  await click('Ciclo de treino'); await dump('13-cycle'); await page.goBack(); await sleep(300);
  await click('Como as sugestões'); await dump('14-rules'); await page.goBack(); await sleep(300);
  await click('Anilhas'); await dump('15-equip'); await page.goBack(); await sleep(300);
  await click('Exercícios'); await click('Supino reto com barra', '.list-item'); await dump('16-exdetail');
  console.log('errors', errors);
} catch (e) { console.log('FAIL', e.message); await page.screenshot({ path: 'shots-pt/fail.png' }); } finally { await browser.close(); }
