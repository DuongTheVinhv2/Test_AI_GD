// Chrome có cửa sổ: cơ chế mới trong designer — đặt tay, gen theo cơ chế, xóa, gen nhiều lần ra kết quả khác nhau, Tự giải.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: false, defaultViewport: { width: 1500, height: 1100 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ok = (c, t) => console.log((c ? 'OK   ' : 'FAIL ') + t);
const tool = async (name) => { await page.click(`button[data-tool="${name}"]`); };
const cell = async (r, c) => { await page.click(`.cell[data-r="${r}"][data-c="${c}"]`); };
const count = (sel) => page.$$eval(sel, (e) => e.length);
await page.goto(pathToFileURL(path.resolve('dist-designer/designer.html')).href);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.lv');

// 1. màn có sẵn 15 (Castle): hầm, thanh chắn, băng, chìa/khóa phải hiện đúng
await page.evaluate(() => [...document.querySelectorAll('#list .lv')].at(-1).click());
await new Promise((r) => setTimeout(r, 600));
ok((await count('.cell.mouth')) === 1, 'màn Castle: có 1 miệng hầm');
ok((await count('.cell.rod')) === 2, 'màn Castle: thanh chắn phủ 2 ô');
ok((await count('.mk.frz')) === 1 && (await count('.mk.key')) === 1 && (await count('.mk.lck')) === 1, 'màn Castle: có xô băng, chìa, khóa');
await page.screenshot({ path: 'qa/results/designer-mech-castle.png' });

// 2. đặt tay trên màn mới
await page.click('#bAdd');
await new Promise((r) => setTimeout(r, 400));
await tool('erase'); await cell(3, 0);                                   // ô trống ở hàng dưới cùng
await tool('tunnel'); await page.click('button[data-dir="u"]'); await cell(3, 0);
ok((await count('.cell.mouth')) === 1, 'đặt tay: miệng hầm xuất hiện');
await tool('tunnelq'); await cell(3, 0); await cell(3, 0);
ok((await page.$eval('.cell.mouth b', (e) => e.textContent)) === '2', 'đặt tay: hàng đợi hầm có 2 xô');
await tool('frozen'); await cell(1, 1);
await tool('key'); await cell(0, 0);
await tool('lock'); await cell(2, 2);
await tool('rod'); await page.click('button[data-dir="r"]'); await cell(1, 3);
ok((await count('.cell.rod')) === 2, 'đặt tay: thanh chắn 2 ô');
ok((await count('.mk.frz')) === 1 && (await count('.mk.key')) === 1 && (await count('.mk.lck')) === 1, 'đặt tay: xô băng / chìa / khóa có huy hiệu');
await tool('erase'); await cell(1, 2);
ok((await count('.cell.rod')) === 0, 'xóa: bấm vào thanh chắn thì thanh bị xóa');
await cell(3, 0);
ok((await page.$eval('.cell.mouth b', (e) => e.textContent)) === '1', 'xóa: bấm miệng hầm bỏ xô cuối hàng đợi');
await cell(3, 0); await cell(3, 0);
ok((await count('.cell.mouth')) === 0, 'xóa: hết hàng đợi thì xóa luôn hầm');

// 3. gen theo cơ chế
await page.evaluate(() => { document.querySelector('#artSel').value = '12'; document.querySelector('#artSel').dispatchEvent(new Event('change', { bubbles: true })); });
await page.click('.seg.hard');
for (const k of ['tunnel', 'frozen', 'rod', 'key']) await page.click(`input[data-gm="${k}"]`);
ok((await count('.gm .stepper')) === 5, 'bảng cơ chế gen: 5 dòng, mỗi dòng có ô số lượng khi tích');
const sig = () => page.$eval('#grid', (e) => e.innerText + '|' + [...e.querySelectorAll('.bucket')].map((b) => b.style.background + b.innerText).join(','));
const runs = [];
for (let i = 0; i < 3; i++) {
  await page.click('#bGen');
  const t0 = Date.now();
  await page.waitForFunction(() => !document.querySelector('#bGen').textContent.includes('Dừng'), { timeout: 240000 });
  await new Promise((r) => setTimeout(r, 1200));
  const counts = { mouth: await count('.cell.mouth'), rod: await count('.cell.rod-head'), frz: await count('.mk.frz'), key: await count('.mk.key'), lck: await count('.mk.lck'), mys: await count('.bucket.edithid') };
  const note = (await page.$eval('#result', (e) => e.innerText)).split('\n')[0];
  runs.push(await sig());
  console.log(`gen #${i + 1} sau ${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(counts), note.slice(0, 90));
  if (i === 0) {
    ok(counts.mouth === 1 && counts.frz === 2 && counts.key === 1 && counts.lck === 1, 'gen: đủ số cơ chế đã chọn (hầm 1, băng 2, chìa/khóa 1 cặp)');
    await page.screenshot({ path: 'qa/results/designer-mech-gen.png' });
  }
}
ok(new Set(runs).size === 3, 'mỗi lần Gen ra một kết quả khác nhau (' + new Set(runs).size + '/3)');

// 4. xóa cơ chế vừa gen
await tool('erase');
const rods = await count('.cell.rod-head');
if (rods) { await page.click('.cell.rod-head'); ok((await count('.cell.rod-head')) === rods - 1, 'xóa được thanh chắn do gen ra'); }
const mouths = await count('.cell.mouth');
if (mouths) { for (let i = 0; i < 6 && (await count('.cell.mouth')) === mouths; i++) await page.click('.cell.mouth'); ok((await count('.cell.mouth')) === mouths - 1, 'xóa được hầm do gen ra'); }

// 5. Tự giải màn có cơ chế
await page.click('#bGen');
await page.waitForFunction(() => !document.querySelector('#bGen').textContent.includes('Dừng'), { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1200));
await page.click('#bAuto');
const t1 = Date.now();
let seen = '';
while (Date.now() - t1 < 240000) {
  seen = await page.$eval('#result', (e) => e.innerText);
  if (/Xong\. Bấm/.test(seen)) break;
  await new Promise((r) => setTimeout(r, 300));
}
console.log((seen.split('\n').filter((l) => /THẮNG|KẸT|Case|chạy từng bước/.test(l))).join(' | '));
ok(/THẮNG/.test(seen), 'Tự giải thắng ở màn có cơ chế');
console.log('errors:', JSON.stringify(errors));
await browser.close();
