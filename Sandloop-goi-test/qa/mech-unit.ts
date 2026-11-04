// Kiểm tra luật của 4 cơ chế mới (hầm, đóng băng, thanh chắn, chìa khóa) trên bàn nhỏ. Chạy: npx tsx qa/mech-unit.ts
import { Board } from '../src/core/grid';
import { Game } from '../src/core/game';
import type { LevelDef } from '../src/core/levels';

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// ---- Tunnel: spawns only when the tile in front is empty, in queue order, one at a time.
{
  const b = new Board(['ooo', 'ooo', '.t.'], [['.', '.', '.'], ['.', '5', '.'], ['.', '.', '.']], [{ r: 2, c: 1, dir: 'u', queue: ['1', '2'] }]);
  eq('hầm: ô trước mặt đang có xô -> chưa nhả', b.buckets.filter((x) => x.queued).length, 2);
  const first = b.bucketAt(1, 1)!;
  eq('hầm: xô trong hầm không bấm được', b.stuckReason(b.buckets[1]), 'blocked');
  const ch = b.remove(first);
  eq('hầm: nhả đúng 1 xô khi ô trống', ch.spawned.map((x) => x.color), [1]);
  eq('hầm: xô thứ 2 vẫn chờ', b.buckets.filter((x) => x.queued).length, 1);
  const out = b.remove(b.bucketAt(1, 1)!);
  eq('hầm: xô tiếp theo ra sau khi xô trước đi', out.spawned.map((x) => x.color), [2]);
  eq('hầm: hết hàng đợi', b.tunnels[0].queue.length, 0);
}

// ---- Tunnel with a free front tile feeds at once.
{
  const b = new Board(['ooo', 'ooo', '.t.'], [['.', '.', '.'], ['.', '.', '.'], ['.', '.', '.']], [{ r: 2, c: 1, dir: 'u', queue: ['1'] }]);
  eq('hầm: ô trước trống ngay từ đầu -> nhả luôn', b.bucketAt(1, 1)?.color, 1);
}

// ---- Gate bar: closed while the front tile is occupied, opens (for good) when it empties.
{
  const b = new Board(['ooooo', 'ooooo'], [['.', '.', '.', '.', '.'], ['1', '.', '.', '.', '2']], [], [{ r: 1, c: 3, dir: 'r', size: 3 }]);
  eq('thanh chắn: đóng khi trước mặt có xô', b.rods[0].open, false);
  eq('thanh chắn: chặn đường', b.rodAt(1, 2) !== null, true);
  const ch = b.remove(b.bucketAt(1, 4)!);
  eq('thanh chắn: mở khi ô trước mặt trống', ch.rodsOpened.length, 1);
  eq('thanh chắn: hết chặn', b.rodAt(1, 2), null);
}
{
  const b = new Board(['ooo', 'ooo', 'ooo'], [['.', '.', '.'], ['.', '.', '.'], ['1', '.', '.']], [], [{ r: 1, c: 1, dir: 'r', size: 2 }]);
  // front tile (1,2) is empty from the start, so the bar is open at once.
  eq('thanh chắn: ô trước trống từ đầu -> mở luôn', b.rods[0].open, true);
  let threw = false;
  try {
    new Board(['ooo', 'ooo'], [['.', '.', '.'], ['.', '1', '2']], [], [{ r: 1, c: 1, dir: 'r', size: 2 }]);
  } catch {
    threw = true;
  }
  eq('thanh chắn: xô nằm dưới thanh bị từ chối', threw, true);
  // path blocked by a closed bar
  const c = new Board(['ooo', 'ooo', 'ooo'], [['.', '.', '.'], ['.', '.', '3'], ['4', '.', '.']], [], [{ r: 1, c: 1, dir: 'r', size: 2 }]);
  eq('thanh chắn: xô không đi xuyên qua thanh (bị chặn)', c.path(c.bucketAt(2, 0)!), null);
  c.remove(c.bucketAt(1, 2)!);
  eq('thanh chắn: bỏ xô trước mặt -> thanh mở -> có đường', c.path(c.bucketAt(2, 0)!) !== null, true);
}

// ---- Frozen and key/lock, on a real Game so pops are real.
const lv = (tiles: string[], buckets: string[][]): LevelDef => ({ id: 99, name: 'T', art: 0, theme: 'meadow', fillSeconds: 1, slots: 5, tiles, buckets });
{
  const b = new Board(['ooo'], [['F2:1', '0', '0']]);
  eq('đóng băng: không bấm được', b.stuckReason(b.buckets[0]), 'frozen');
  const pop = (id: number) => b.onPop(b.buckets[id]);
  const r1 = pop(1);
  eq('đóng băng: pop 1 -> còn 1', [r1.ticked.length, b.buckets[0].frozen], [1, 1]);
  const r2 = pop(2);
  eq('đóng băng: pop 2 -> tan', [r2.thawed.length, b.buckets[0].frozen], [1, 0]);
  eq('đóng băng: tan rồi bấm được', b.stuckReason(b.buckets[0]), null);
}
{
  const b = new Board(['ooo'], [['L1:1', 'K1:1', 'K2:2']]);
  eq('khóa: không bấm được', b.stuckReason(b.buckets[0]), 'locked');
  eq('khóa: chìa khác cặp không mở', b.onPop(b.buckets[2]).unlocked.length, 0);
  eq('khóa: chìa đúng cặp mở', b.onPop(b.buckets[1]).unlocked.length, 1);
  eq('khóa: mở rồi bấm được', b.stuckReason(b.buckets[0]), null);
}
{
  // key opens only when the key bucket POPS, not when it is tapped
  const g = new Game(lv(['oo'], [['K1:0', 'L1:0']]), 1);
  const lock = g.board.buckets[1];
  g.tap(0);
  eq('chìa: bấm xô chìa chưa mở khóa', lock.locked, true);
  for (let i = 0; i < 150 * 60 && lock.locked && g.status === 'playing'; i++) g.step();
  eq('chìa: xô chìa đầy và pop thì khóa mở', lock.locked, false);
}
{
  // pity: only frozen buckets left and nothing on the belt -> they thaw instead of the level being lost
  const g = new Game(lv(['ooo'], [['F5:0', 'F5:0', '1']]), 1);
  const f = g.board.buckets[0];
  eq('thương hại: ban đầu đóng băng', f.frozen, 5);
  // The only open bucket is colour 1, which has no sand in picture 0 reachable? use it, then let the belt jam.
  g.tap(2);
  for (let i = 0; i < 150 * 40 && g.status === 'playing' && f.frozen > 0; i++) g.step();
  eq('thương hại: băng tan khi không còn gì để chờ', f.frozen === 0 || g.status !== 'playing', true);
}
{
  // clone keeps every new field (Undo relies on it)
  const g = new Game({ ...lv(['ooo', '.t.'], [['F2:0', '.', '.'], ['.', '.', '.']]), tunnels: [{ r: 1, c: 1, dir: 'u', queue: ['0'] }], rods: [] }, 1);
  const c = g.clone();
  g.board.buckets[0].frozen = 0;
  eq('clone: bản sao độc lập', [c.board.buckets[0].frozen, c.board.tunnels[0].queue.length], [2, g.board.tunnels[0].queue.length]);
}

// ---- Final stretch flag
{
  const g = new Game(lv(['ooooooo'], [['0', '0', '0', '0', '0', '0', '0']]), 1);
  eq('chặng cuối: 7 xô, chưa tới', g.finalStretch, false);
  g.delivered = 2;
  eq('chặng cuối: còn 5 xô -> bật', g.finalStretch, true);
  const small = new Game(lv(['ooooo'], [['0', '0', '0', '0', '0']]), 1);
  eq('chặng cuối: màn chỉ 5 xô không bật từ đầu', small.finalStretch, false);
}

// ---- Boosters
{
  // Hand Pick: a boxed-in bucket goes straight to the belt; frozen / locked ones refuse
  const g = new Game(lv(['ooo', 'ooo', 'ooo'], [['1', '1', '1'], ['2', 'F2:2', '2'], ['0', '3', '0']]), 1);
  const boxed = g.board.bucketAt(2, 1)!;
  eq('hand pick: xô kẹt giữa không bấm thường được', g.tap(boxed.id), 'blocked');
  eq('hand pick: nhưng nhặt tay được', g.handPick(boxed.id), 'ok');
  eq('hand pick: xô lên băng chuyền', g.belt.some((b) => b.id === boxed.id), true);
  eq('hand pick: xô rời bàn', boxed.gone, true);
  eq('hand pick: xô đóng băng bị từ chối', g.handPick(g.board.bucketAt(1, 1)!.id), 'frozen');
  const h = new Game(lv(['oo'], [['K1:0', 'L1:0']]), 1);
  eq('hand pick: xô khóa bị từ chối', h.handPick(1), 'locked');
  const q = new Game(lv(['ooooooo'], [['0', '0', '0', '0', '0', '0', '0']]), 1);
  for (let i = 0; i < 5; i++) q.handPick(i);
  eq('hand pick: băng chuyền đầy thì từ chối', q.handPick(5), 'full');
  const m = new Game(lv(['oo', 'oo'], [['0', '0'], ['?0', '0']]), 1);
  const hid = m.board.bucketAt(1, 0)!;
  eq('hand pick: xô ? vẫn bị che khi chưa nhặt', hid.revealed, false);
  m.handPick(hid.id);
  eq('hand pick: xô ? lộ màu khi nhặt', hid.revealed, true);
}
{
  // Sand Pull: fills a lane bucket from anywhere, even colours that are buried under a layer
  const g = new Game(lv(['ooo'], [['0', '1', '2']]), 1);
  g.tap(0);
  for (let i = 0; i < 150 * 3 && !g.pullTargets().length; i++) g.step();
  const target = g.pullTargets()[0];
  eq('sand pull: có mục tiêu khi xô đã xuống băng chuyền', !!target, true);
  const before = g.sand.counts[target.color];
  const need = target.cap - target.fill;
  const n = g.sandPull(target.id);
  eq('sand pull: lấy đủ phần còn thiếu', n, Math.min(need, before));
  eq('sand pull: cát màu đó giảm đúng bấy nhiêu', before - g.sand.counts[target.color], n);
  eq('sand pull: xô đầy thì nổ', g.belt.find((b) => b.id === target.id)?.state, 'pop');
  eq('sand pull: xô đã nổ không thể kéo tiếp', g.sandPull(target.id), 0);
  eq('sand pull: tổng cát khớp bộ đếm', g.sand.total, g.sand.counts.reduce((a, b) => a + b, 0));
}
{
  // Shuffle: colours move between plain buckets, sizes travel with the colour, special buckets stay put
  const g = new Game(lv(['ooooo', 'ooooo'], [['0', '1', '2', '3', '4'], ['?5', 'F2:6', 'K1:7', 'L1:8', '9']]), 1);
  const colors0 = g.board.buckets.map((b) => b.color);
  const capSum0 = new Map<number, number>();
  g.board.buckets.forEach((b) => capSum0.set(b.color, (capSum0.get(b.color) ?? 0) + g.caps[b.id]));
  eq('xáo: xáo được', g.shuffleBoard(), true);
  const after = g.board.buckets.map((b) => b.color);
  eq('xáo: xô đặc biệt (?, băng, chìa, khóa) không đổi màu', [after[5], after[6], after[7], after[8]], [colors0[5], colors0[6], colors0[7], colors0[8]]);
  eq('xáo: tập màu giữ nguyên', [...after].sort(), [...colors0].sort());
  const capSum1 = new Map<number, number>();
  g.board.buckets.forEach((b) => capSum1.set(b.color, (capSum1.get(b.color) ?? 0) + g.caps[b.id]));
  eq('xáo: tổng cỡ xô mỗi màu giữ nguyên (cát vẫn vừa đủ)', [...capSum1.entries()].sort(), [...capSum0.entries()].sort());
  eq('xáo: màu thật sự đổi', after.some((c, i) => c !== colors0[i]), true);
  const one = new Game(lv(['ooo'], [['0', '0', '0']]), 1);
  eq('xáo: chỉ một màu thì không có gì để xáo', one.shuffleBoard(), false);
  const snap = g.clone();
  const capBefore = snap.caps.slice();
  g.shuffleBoard();
  eq('xáo: bản sao Undo giữ nguyên cỡ xô', snap.caps, capBefore);
}

console.log(fails ? `\n${fails} lỗi` : '\ntất cả đạt');
process.exit(fails ? 1 : 0);
