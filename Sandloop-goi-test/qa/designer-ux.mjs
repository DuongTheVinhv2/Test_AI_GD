// Chrome có cửa sổ: kiểm 5 điểm người dùng góp ý (thả ảnh không tự gen/gán độ khó, lấp đầy ô, xuất về game, Tự giải kiểu người chơi).
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const file = path.resolve(process.argv[2] ?? 'D:/Tool/LevelDesign/final/Level_20.png');
const dl = path.resolve('qa/results/ux-download');
fs.rmSync(dl, { recursive: true, force: true });
fs.mkdirSync(dl, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: false, defaultViewport: { width: 1500, height: 1000 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ok = (cond, text) => console.log((cond ? 'OK   ' : 'FAIL ') + text);
await page.goto(pathToFileURL(path.resolve('dist-designer/designer.html')).href);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.lv');

// 1. defaults + thả ảnh
ok(!(await page.$eval('#chkAuto', (e) => e.checked)), 'tự gen khi thả ảnh: tắt mặc định');
ok(!(await page.$eval('#chkShape', (e) => e.checked)), 'khoét ô: tắt mặc định');
ok((await page.$eval('#stFill', (e) => e.innerText)).includes('100'), 'lấp đầy ô sàn mặc định 100%');
const cdp = await page.createCDPSession();
const data = { items: [], files: [file], dragOperationsMask: 1 };
await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 700, y: 400, data });
await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x: 710, y: 410, data });
await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: 710, y: 410, data });
await page.waitForFunction(() => document.querySelectorAll('#list .lv').length === 11, { timeout: 10000 });
await new Promise((r) => setTimeout(r, 1500));
ok(!(await page.$eval('#bGen', (e) => e.textContent.includes('Dừng'))), 'thả ảnh xong KHÔNG tự gen');
const chip = await page.$eval('#list .lv.on', (e) => e.innerText.replace(/\n/g, ' '));
ok(/Chưa chọn/.test(chip), 'màn mới chưa bị gán độ khó: ' + chip);
ok(await page.$eval('#bGen', (e) => e.disabled), 'nút Gen khóa tới khi chọn độ khó');
const cellsOf = () => page.$$eval('.cell', (cs) => ({ floor: cs.filter((c) => !c.classList.contains('void') && !c.classList.contains('wall')).length, buckets: cs.filter((c) => c.querySelector('.bucket')).length }));
const before = await cellsOf();
ok(before.buckets === 0, 'bàn mới trống, chưa có xô nào: ' + JSON.stringify(before));

// 2. chọn độ khó rồi gen: lấp đầy
await page.click('.seg.hard');
await page.click('#bGen');
const t0 = Date.now();
await page.waitForFunction(() => !document.querySelector('#bGen').textContent.includes('Dừng'), { timeout: 240000 });
console.log(`gen xong sau ${Math.round((Date.now() - t0) / 1000)}s`);
await new Promise((r) => setTimeout(r, 1500));
const after = await cellsOf();
ok(after.buckets === after.floor, `lấp đầy ô sàn: ${after.buckets}/${after.floor}`);
console.log((await page.$eval('#result', (e) => e.innerText)).split('\n').slice(0, 5).join(' | '));
await page.screenshot({ path: 'qa/results/designer-ux-gen.png' });

// 5. tự giải kiểu người chơi: băng chuyền thường có nhiều hơn 1 xô
await page.click('#bAuto');
let maxBelt = 0;
const seen = new Set();
const t1 = Date.now();
while (Date.now() - t1 < 200000) {
  const n = await page.$$eval('#belt .slot .bk', (e) => e.length);
  maxBelt = Math.max(maxBelt, n);
  const txt = await page.$eval('#result', (e) => e.innerText);
  for (const m of txt.matchAll(/→ (THẮNG|KẸT)/g)) seen.add(m[1] + '@' + txt.split('Case').length);
  if (/chạy từng bước/.test(txt)) seen.add('stepmode');
  if (/Xong\. Bấm/.test(txt)) break;
  await new Promise((r) => setTimeout(r, 120));
}
ok(maxBelt >= 3, `băng chuyền tối đa ${maxBelt} xô cùng lúc khi Tự giải`);
console.log('kết cục tự giải:', [...seen].join(', '));
console.log((await page.$eval('#result', (e) => e.innerText)).split('\n').filter((l) => /THẮNG|KẸT|Case/.test(l)).join(' | '));
await page.click('#bAuto').catch(() => {});

// 3. xuất về game (không ghi thẳng được trong test → tải 2 file)
const cdp2 = await page.createCDPSession();
await cdp2.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
await page.evaluate(() => { delete window.showDirectoryPicker; window.confirm = () => true; });
await page.click('#bExport');
await new Promise((r) => setTimeout(r, 2500));
console.log('ghi chú xuất:', await page.$eval('#exportNote', (e) => e.innerText));
console.log('file đã tải:', fs.readdirSync(dl).join(', '));
console.log('errors:', JSON.stringify(errors));
await browser.close();
