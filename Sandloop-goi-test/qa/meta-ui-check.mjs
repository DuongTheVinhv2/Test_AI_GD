// Mở Chrome (có cửa sổ, tắt tiếng, profile tạm) và chụp: menu chính, cửa hàng, quà ngày, tạm dừng có nút Home,
// các màn 11-15 (hầm, đóng băng, thanh chắn, chìa khóa) để xem bằng mắt. Chạy: node qa/meta-ui-check.mjs
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'sandloop-chrome-'));
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  headless: false,
  userDataDir: profile,
  defaultViewport: { width: 390, height: 844 },
  args: ['--mute-audio', '--no-first-run', '--enable-unsafe-swiftshader', '--window-size=420,960'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const url = pathToFileURL(path.resolve('dist/index.html')).href;
const shot = (n) => page.screenshot({ path: `qa/results/new-${n}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await page.goto(url);
  await page.waitForFunction(() => window.__app, { timeout: 60000 });
  await wait(1200);
  await shot('menu');
  // unlock all so the path shows done/locked nodes
  await page.evaluate(() => { const a = __app; a.save.data.unlocked = 5; a.save.data.current = 5; a.level = 5; a.save.data.levels[1] = { attempts: 1, wins: 1, fails: 0, bestTime: 1, bestTaps: 1, firstTry: true }; a.goMenu(); });
  await wait(800);
  await shot('menu-progress');
  await page.evaluate(() => __app.ui.cb.onShop());
  await wait(600);
  await shot('shop');
  await page.evaluate(() => { __app.ui.cb.onShopClose(); __app.ui.cb.onDaily(); });
  await wait(600);
  await shot('daily');
  await page.evaluate(() => { __app.ui.cb.onDailyClose(); __app.ui.cb.onSettings(); });
  await wait(600);
  await shot('settings');
  await page.evaluate(() => { __app.ui.cb.onSettings(); });
  // out of hearts
  await page.evaluate(() => { const a = __app; a.save.data.hearts.count = 0; a.save.data.hearts.since = Date.now() - 125000; a.refreshMeta(true); });
  await wait(500);
  await page.click('.menu .playBig');
  await wait(700);
  await shot('out-of-hearts');
  await page.evaluate(() => { __app.save.data.hearts.count = 5; __app.ui.cb.onShopClose(); __app.refreshMeta(true); });
  for (const lv of [11, 12, 13, 14, 15]) {
    await page.evaluate((lv) => { const a = __app; a.save.data.unlocked = 15; a.startLevel(lv, true); }, lv);
    await wait(1500);
    await shot(`level${lv}`);
  }
  // tunnel: tap an open bucket in front of a tunnel in level 11 and watch it spawn
  await page.evaluate(() => { const a = __app; a.startLevel(11, true); });
  await wait(800);
  const spawn = await page.evaluate(() => {
    const a = __app, g = a.play.game;
    const before = g.board.tunnels.map((t) => t.queue.length);
    const target = g.board.buckets.find((b) => !b.gone && b.r === 2 && b.c === 1);
    const info = { open: g.board.isOpen(target) };
    // free the column: tap the ones above first
    for (const [r, c] of [[0, 1], [1, 1]]) { const b = g.board.bucketAt(r, c); if (b && g.board.isOpen(b)) g.tap(b.id); }
    info.afterAbove = g.board.tunnels.map((t) => t.queue.length);
    const t2 = g.board.bucketAt(2, 1);
    if (t2 && g.board.isOpen(t2)) g.tap(t2.id);
    info.before = before;
    info.after = g.board.tunnels.map((t) => t.queue.length);
    info.slotNow = g.board.bucketAt(2, 1)?.color;
    return info;
  });
  console.log('tunnel', JSON.stringify(spawn));
  await wait(700);
  await shot('level11-after-spawn');
  // pause menu with Home
  await page.evaluate(() => { __app.startLevel(1, true); });
  await wait(600);
  await page.evaluate(() => { const a = __app; a.play.game.tap(a.play.game.openBuckets()[0].id); });
  await page.evaluate(() => __app.setPaused(true));
  await wait(600);
  await shot('pause');
  await page.evaluate(() => document.querySelectorAll('.pause .btn')[4].click());
  await wait(500);
  await shot('home-confirm');
  console.log('errors', JSON.stringify(errors));
} finally {
  await browser.close();
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
