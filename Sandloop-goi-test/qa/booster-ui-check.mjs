// Chụp thanh booster trong màn (bàn 4, 6 hàng), chế độ chọn mục tiêu và tab Boosters của cửa hàng.
// Chạy: node qa/booster-ui-check.mjs  (Chrome có cửa sổ, tắt tiếng)
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'sandloop-chrome-'));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: false, userDataDir: profile, defaultViewport: { width: 390, height: 844 }, args: ['--mute-audio', '--no-first-run', '--enable-unsafe-swiftshader', '--window-size=420,960'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
await page.waitForFunction(() => window.__app, { timeout: 60000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => page.screenshot({ path: `qa/results/boost-${n}.png` });
await wait(1500);
await page.evaluate(() => { const d = __app.save.data; d.unlocked = 15; d.coins = 320; d.boosters = { handPick: 2, sandPull: 0, shuffle: 0 }; d.boosterGift = { handPick: true, sandPull: true, shuffle: true }; });
for (const lv of [10, 4]) {
  await page.evaluate((lv) => { __app.startLevel(lv, true); __app.ui.hideToast(); }, lv);
  await wait(2500);
  await shot(`level${lv}`);
}
await page.evaluate(() => { __app.startLevel(10, true); });
await wait(1500);
await page.evaluate(() => document.querySelectorAll('.boost')[0].click());
await wait(1500);
await shot('picking');
await page.evaluate(() => { __app.cancelBoost(); __app.goMenu(); __app.openShop('Shop', 'boosters'); });
await wait(1200);
await shot('shop');
await browser.close();
await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
