// Kiểm tra nhanh các màn có cơ chế mới: màu xô có cát không, bao nhiêu xô, bao nhiêu xô bấm được ngay.
// Chạy: npx tsx qa/mech-check.ts [màn,màn,...]
import { Game } from '../src/core/game';
import { LEVELS } from '../src/core/levels';

const only = process.argv[2] ? process.argv[2].split(',').map(Number) : [11, 12, 13, 14, 15];
for (const id of only) {
  const g = new Game(LEVELS[id - 1], 1);
  const per = new Map<number, number>();
  for (const b of g.board.buckets) per.set(b.color, (per.get(b.color) ?? 0) + 1);
  const missing = [...per.keys()].filter((c) => !g.sand.counts[c]);
  // The reverse matters more: sand of a colour with no bucket can never be collected, so the level cannot be won.
  const orphan = [...g.sand.counts].map((n, c) => (n > 0 && !per.has(c) ? c : -1)).filter((c) => c >= 0);
  if (orphan.length) console.log(`  !! L${id}: cát màu ${orphan.map((c) => c.toString(36)).join(',')} không có xô nào`);
  const cols = [...per.entries()].map(([c, n]) => `${c.toString(36)}:${n}xô/${g.sand.counts[c]}hạt`).join(' ');
  console.log(`L${id} ${LEVELS[id - 1].name}: ${g.board.buckets.length} xô (${g.board.tunnels.reduce((n, t) => n + t.queue.length, 0)} trong hầm), mở ngay ${g.openBuckets().length}; ${cols}; thiếu cát: ${missing.join(',') || 'không'}`);
}
