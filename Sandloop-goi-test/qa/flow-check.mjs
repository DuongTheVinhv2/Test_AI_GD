// Kiểm tra luồng: tim (mất khi thua/rời màn, không mất khi thắng hay Undo), hết tim -> cửa hàng, mua tim bằng xu,
// chặng cuối x3, Home từ tạm dừng. Mở Chrome có cửa sổ, tắt tiếng. Chạy: node qa/flow-check.mjs
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
const url = pathToFileURL(path.resolve('dist/index.html')).href;
let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
try {
  await page.goto(url);
  await page.waitForFunction(() => window.__app, { timeout: 60000 });
  await wait(500);
  check('mở game vào main menu', await ev(() => __app.mode), 'menu');
  check('đủ 5 tim', await ev(() => __app.hearts.count()), 5);

  // --- Play -> level 1, tap, leave via pause/Home with progress: costs a heart
  await page.click('.menu .playBig');
  await wait(400);
  check('Play vào màn', await ev(() => [__app.mode, __app.play.game.level.id]), ['playing', 1]);
  await ev(() => { const g = __app.play.game; g.tap(g.openBuckets()[0].id); });
  await ev(() => __app.setPaused(true));
  await ev(() => document.querySelectorAll('.pause .btn')[4].click()); // Home -> confirm (progress)
  await wait(300);
  check('Home giữa màn hỏi xác nhận', await ev(() => document.querySelector('.confirm').classList.contains('on')), true);
  check('câu hỏi nói mất 1 tim', await ev(() => document.querySelector('.confirm p').textContent.includes('1 heart')), true);
  await ev(() => document.querySelector('.confirm .btn.blue').click());
  await wait(400);
  check('về menu', await ev(() => __app.mode), 'menu');
  check('rời màn đang chơi mất 1 tim', await ev(() => __app.hearts.count()), 4);
  check('bấm lại Home lần nữa không trừ thêm', await ev(() => { __app.goMenu(); return __app.hearts.count(); }), 4);

  // --- Win does not cost a heart; Undo after a loss does not cost a heart; leaving a loss does
  await ev(() => { __app.startLevel(1); const g = __app.play.game; for (const b of [...g.openBuckets()]) g.tap(b.id); });
  await ev(() => { const g = __app.play.game; for (let i = 0; i < 150 * 100 && g.status === 'playing'; i++) g.step(); });
  check('thắng màn 1', await ev(() => __app.play.game.status), 'won');
  await wait(2200);
  check('thắng không mất tim', await ev(() => __app.hearts.count()), 4);
  check('thắng: hiện màn thắng', await ev(() => __app.mode), 'won');

  await ev(() => { __app.startLevel(9, true); });
  await ev(() => { const g = __app.play.game; for (let j = 0; j < 5; j++) g.tap(g.openBuckets()[0].id); for (let i = 0; i < 150 * 40 && g.status === 'playing'; i++) g.step(); });
  await wait(1800);
  check('thua màn 9', await ev(() => __app.mode), 'lost');
  check('thua chưa trừ tim (còn Undo)', await ev(() => __app.hearts.count()), 4);
  check('màn thua có ghi chú -1 tim', await ev(() => document.querySelector('.fail .why').textContent.includes('-1')), true);
  await ev(() => document.querySelector('.fail .btn.pulse').click()); // Try again
  await wait(300);
  check('Try again trừ tim', await ev(() => __app.hearts.count()), 3);
  check('Try again vào màn mới', await ev(() => [__app.mode, __app.play.game.level.id]), ['playing', 9]);

  // --- out of hearts: Play opens the shop, nothing starts
  await ev(() => { __app.save.data.hearts.count = 0; __app.save.data.hearts.since = Date.now(); __app.goMenu(); });
  await page.click('.menu .playBig');
  await wait(500);
  check('hết tim: Play không vào màn', await ev(() => __app.mode), 'menu');
  check('hết tim: mở cửa hàng', await ev(() => [document.querySelector('.layer.shop').classList.contains('on'), document.querySelector('.shop .head').firstChild.textContent]), [true, 'Out of hearts']);
  await ev(() => { __app.save.data.coins = 100; __app.refreshMeta(true); });
  await ev(() => document.querySelectorAll('.shop .item .btn')[0].click());
  check('thiếu xu: không mua được', await ev(() => [__app.save.data.coins, __app.hearts.count()]), [100, 0]);
  await ev(() => { __app.save.data.coins = 500; __app.refreshMeta(true); });
  await ev(() => document.querySelectorAll('.shop .item .btn')[0].click());
  check('mua refill: trừ 200 xu, đầy tim', await ev(() => [__app.save.data.coins, __app.hearts.count()]), [300, 5]);
  await ev(() => document.querySelectorAll('.shop .item .btn')[1].click());
  check('mua vô hạn 250 xu', await ev(() => [__app.save.data.coins, __app.hearts.infinite()]), [50, true]);

  // --- daily gift
  await ev(() => { __app.save.data.daily = { next: 0, last: '' }; __app.refreshMeta(true); __app.ui.cb.onShopClose(); __app.ui.cb.onDaily(); });
  await ev(() => document.querySelector('.daily .btn').click());
  check('quà ngày 1: +50 xu', await ev(() => __app.save.data.coins), 100);
  check('quà ngày: chỉ nhận 1 lần/ngày', await ev(() => { document.querySelector('.daily .btn').click(); return [__app.save.data.coins, __app.save.data.daily.next]; }), [100, 1]);

  // --- final stretch: speed x3 whatever the button says, for the last 5 buckets
  await ev(() => { __app.ui.cb.onDailyClose(); __app.startLevel(10, true); });
  const speeds = await ev(() => {
    const a = __app, g = a.play.game;
    const out = {};
    out.start = [g.finalStretch, a.speedNow()];
    a.speed = 2;
    out.x2 = a.speedNow();
    g.delivered = g.board.buckets.length - 5;
    out.final = [g.finalStretch, a.speedNow()];
    a.speed = 1;
    out.finalX1 = a.speedNow();
    return out;
  });
  check('chặng cuối: đầu màn không x3', speeds.start, [false, 1]);
  check('chặng cuối: người chơi chọn x2 thì x2', speeds.x2, 2);
  check('chặng cuối: còn 5 xô -> x3 dù đang x2', speeds.final, [true, 3]);
  check('chặng cuối: đang x1 cũng lên x3', speeds.finalX1, 3);
  await wait(400);
  check('nút tốc độ hiện x3', await ev(() => document.querySelector('.belt-speed').textContent), 'x3');

  // --- boosters
  const screenOf = (sel) => page.evaluate((sel) => {
    const a = __app;
    const act = sel.belt ? a.play.actors.get(sel.id) : a.play.actors.get(sel.id);
    const p = act.root.getWorldPosition(act.root.position.clone()).project(a.stage.camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  }, sel);
  await ev(() => { __app.ui.cb.onDailyClose(); const d = __app.save.data; d.unlocked = 5; d.coins = 400; d.boosters = { handPick: 0, sandPull: 0, shuffle: 0 }; d.boosterGift = { handPick: false, sandPull: false, shuffle: false }; __app.startLevel(5, true); });
  await wait(500);
  check('màn 5: tặng 2 Hand Pick', await ev(() => __app.save.data.boosters.handPick), 2);
  check('thanh booster hiện khi chơi', await ev(() => !document.querySelector('.boostBar').classList.contains('hidden')), true);
  check('nút Hand Pick hiện số 2', await ev(() => document.querySelectorAll('.boost .bc')[0].textContent), '2');
  check('Sand Pull còn khóa ở màn 5', await ev(() => document.querySelectorAll('.boost')[1].classList.contains('locked')), true);
  await ev(() => document.querySelectorAll('.boost')[1].click());
  check('bấm booster khóa không làm gì', await ev(() => [__app.boostTarget, __app.save.data.boosters.sandPull]), [null, 0]);

  // Hand Pick on a boxed-in bucket
  const boxed = await ev(() => { const g = __app.play.game; const b = g.board.buckets.find((x) => !x.gone && !g.board.isOpen(x) && !x.mystery); return b ? b.id : -1; });
  check('màn 5 có xô đang kẹt để nhặt', boxed >= 0, true);
  await ev(() => document.querySelectorAll('.boost')[0].click());
  check('Hand Pick: vào chế độ chọn', await ev(() => [__app.boostTarget, __app.play.boostMode]), ['handPick', 'pick']);
  const t0 = await ev(() => __app.play.game.time);
  await wait(500);
  check('chọn mục tiêu: game đứng yên', await ev((t0) => Math.abs(__app.play.game.time - t0) < 0.001, t0), true);
  const pos = await screenOf({ id: boxed });
  await page.mouse.click(pos.x, pos.y);
  await wait(300);
  check('Hand Pick: xô kẹt lên băng chuyền', await ev((id) => __app.play.game.belt.some((b) => b.id === id), boxed), true);
  check('Hand Pick: còn 1, thoát chế độ chọn', await ev(() => [__app.save.data.boosters.handPick, __app.boostTarget]), [1, null]);
  check('dùng booster thì mất thưởng lượt đầu', await ev(() => __app.usedUndo), true);
  // cancel by pressing twice
  await ev(() => { document.querySelectorAll('.boost')[0].click(); });
  await ev(() => { document.querySelectorAll('.boost')[0].click(); });
  check('bấm lại nút để hủy, không mất booster', await ev(() => [__app.boostTarget, __app.save.data.boosters.handPick]), [null, 1]);

  // Sand Pull
  await ev(() => { __app.save.data.unlocked = 8; __app.startLevel(8, true); });
  await wait(300);
  check('màn 8: tặng 2 Sand Pull', await ev(() => __app.save.data.boosters.sandPull), 2);
  await ev(() => { document.querySelectorAll('.boost')[1].click(); });
  check('Sand Pull khi băng chuyền trống: không vào chế độ', await ev(() => __app.boostTarget), null);
  await ev(() => { const g = __app.play.game; g.tap(g.openBuckets()[0].id); for (let i = 0; i < 150 * 2.5 && !g.pullTargets().length; i++) g.step(); });
  await wait(200);
  await ev(() => document.querySelectorAll('.boost')[1].click());
  check('Sand Pull: vào chế độ chọn', await ev(() => __app.boostTarget), 'sandPull');
  const bid = await ev(() => __app.play.game.pullTargets()[0].id);
  const bpos = await screenOf({ id: bid, belt: true });
  const before = await ev((id) => __app.play.game.belt.find((b) => b.id === id).fill, bid);
  await page.mouse.click(bpos.x, bpos.y);
  await wait(300);
  const after = await ev((id) => { const b = __app.play.game.belt.find((x) => x.id === id); return b ? b.fill / b.cap : 1; }, bid);
  check('Sand Pull: xô được lấp thêm cát', after > before, true);
  check('Sand Pull: còn 1, thoát chế độ', await ev(() => [__app.save.data.boosters.sandPull, __app.boostTarget]), [1, null]);

  // Shuffle: none owned -> buy popup
  await ev(() => { __app.save.data.unlocked = 15; __app.save.data.coins = 400; __app.startLevel(11, true); });
  await wait(400);
  const colors0 = await ev(() => __app.play.game.board.buckets.map((b) => b.color).join(''));
  await ev(() => document.querySelectorAll('.boost')[2].click());
  await wait(300);
  check('chưa có Shuffle: hỏi mua', await ev(() => [document.querySelector('.layer.confirm').classList.contains('on'), document.querySelector('.confirm .head').textContent]), [true, 'Buy Shuffle?']);
  const tq = await ev(() => __app.play.game.time);
  await wait(400);
  check('đang hỏi mua: game đứng yên', await ev((t) => Math.abs(__app.play.game.time - t) < 0.001, tq), true);
  await ev(() => document.querySelector('.confirm .btn.blue').click());
  await wait(500);
  check('mua Shuffle: trừ 100 xu, dùng ngay (còn 0)', await ev(() => [__app.save.data.coins, __app.save.data.boosters.shuffle]), [300, 0]);
  const colors1 = await ev(() => __app.play.game.board.buckets.map((b) => b.color).join(''));
  check('Shuffle đổi màu các xô', colors0 !== colors1, true);
  check('Shuffle: màn vẫn chơi được', await ev(() => [__app.mode, __app.play.game.status]), ['playing', 'playing']);
  // cancel the question
  await ev(() => document.querySelectorAll('.boost')[2].click());
  await wait(200);
  await ev(() => document.querySelector('.confirm .btn:not(.blue)').click());
  check('hủy mua: không trừ xu, game chạy lại', await ev(() => [__app.save.data.coins, __app.boostAsking]), [300, false]);
  // not enough coins
  await ev(() => { __app.save.data.coins = 20; });
  await ev(() => document.querySelectorAll('.boost')[2].click());
  check('thiếu xu: không hỏi mua', await ev(() => document.querySelector('.layer.confirm').classList.contains('on')), false);
  // shop tab
  await ev(() => { __app.save.data.coins = 500; __app.goMenu(); __app.openShop('Shop', 'boosters'); });
  await wait(400);
  check('cửa hàng mở tab Boosters (3 hàng)', await ev(() => document.querySelectorAll('.layer.shop .item').length), 3);
  await ev(() => document.querySelectorAll('.layer.shop .item .btn')[0].click());
  check('mua Hand Pick trong cửa hàng', await ev(() => [__app.save.data.coins, __app.save.data.boosters.handPick]), [350, 2]);
  // daily gift day 5 gives a booster
  await ev(() => { __app.ui.cb.onShopClose(); const d = __app.save.data; d.daily = { next: 4, last: '' }; d.boosters.handPick = 0; __app.refreshMeta(true); __app.ui.cb.onDaily(); });
  await ev(() => document.querySelector('.daily .btn').click());
  check('quà ngày 5 tặng 1 Hand Pick', await ev(() => __app.save.data.boosters.handPick), 1);
  await ev(() => __app.ui.cb.onDailyClose());

  console.log('errors', JSON.stringify(errors));
} finally {
  await browser.close();
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
console.log(fails ? `\n${fails} lỗi` : '\ntất cả đạt');
process.exit(fails ? 1 : 0);
