// Opens dist-analytics/analytics.html from disk (file://) in a visible Chrome window, walks every tab, saves screenshots, prints errors.
//   node qa/analytics-smoke.mjs [--bots]   (--bots also runs a short bot run in the page)
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const url = pathToFileURL(path.resolve('dist-analytics/analytics.html')).href;
const out = (n) => path.resolve('qa/results', `analytics-${n}.png`);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  headless: false, args: ['--mute-audio'], defaultViewport: { width: 1500, height: 1000 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForSelector('.kpi');
const shot = async (name, full = true) => page.screenshot({ path: out(name), fullPage: full });
console.log('overview kpis:', await page.$$eval('.kpi', (e) => e.map((x) => x.innerText.replace(/\n/g, ' ')).join(' || ')));
console.log('issues:', await page.$$eval('.issue .t', (e) => e.length));
await shot('overview');

await page.click('[data-tab="charts"]');
await page.waitForSelector('.chart');
await page.click('table.heat td[data-level="5"]');
await shot('charts');

await page.click('[data-tab="journey"]');
await page.waitForSelector('svg.diagram');
await page.click('#play');
await new Promise((r) => setTimeout(r, 4500));
await shot('journey');
console.log('clock:', await page.$eval('#clock', (e) => e.textContent));

await page.click('[data-tab="bots"]');
await page.waitForSelector('.persona');
await shot('bots');

// switch to the GD csv dataset
await page.select('#src', 'gd');
await page.click('[data-tab="overview"]');
await shot('overview-gd');
console.log('gd issues:', await page.$$eval('.issue .t', (e) => e.map((x) => x.innerText).slice(0, 40).join('\n')));

if (process.argv.includes('--bots')) {
  await page.click('[data-tab="bots"]');
  await page.$eval('#seeds', (e) => { e.value = '8'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('#run-bots');
  await page.waitForFunction(() => document.querySelector('.kpi') !== null && document.querySelector('#src').value === 'run', { timeout: 900000, polling: 2000 });
  await shot('after-run');
  console.log('run issues:', await page.$$eval('.issue .t', (e) => e.length));
}
console.log('errors:', JSON.stringify(errors));
await new Promise((r) => setTimeout(r, 1500));
await browser.close();
