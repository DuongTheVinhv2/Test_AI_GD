// Chơi thử một màn bằng bot "exposed" và in ra vì sao thua (xô còn lại, trạng thái băng chuyền).
// Chạy: npx tsx qa/mech-debug.ts <màn> [seed=1]
import { Game } from '../src/core/game';
import { LEVELS } from '../src/core/levels';
import { Rng } from '../src/core/rng';

const id = Number(process.argv[2] ?? 13);
const seed = Number(process.argv[3] ?? 1);
const g = new Game(LEVELS[id - 1], seed);
const rng = new Rng(seed);
let next = 0;
const log: string[] = [];
while (g.status === 'playing' && g.time < 150) {
  if (g.ticks >= next && g.slotsUsed < g.slots) {
    next = g.ticks + 90;
    const open = g.openBuckets();
    const ex = g.exposure();
    const good = open.filter((b) => ex[b.color] > 0);
    const pool = good.length ? good : open;
    if (pool.length) {
      const b = pool[rng.int(pool.length)];
      log.push(`t=${g.time.toFixed(1)} tap ${b.id}@${b.r},${b.c} colour ${b.color.toString(36)}${b.key ? ' key' + b.key : ''}${b.lock ? ' lock' + b.lock : ''}`);
      g.tap(b.id);
    }
  }
  g.step();
}
console.log(log.join('\n'));
console.log(`status=${g.status} time=${g.time.toFixed(1)} cleared=${(g.cleared * 100).toFixed(0)}% belt=${g.belt.map((b) => b.color.toString(36) + ':' + b.state + ':' + Math.round((b.fill / b.cap) * 100)).join(',')}`);
const ex = g.exposure();
console.log('exposed colours:', [...ex].map((n, c) => (n ? c.toString(36) + '=' + n : '')).filter(Boolean).join(' '));
for (const b of g.board.buckets) {
  if (!b.gone) console.log(`  left ${b.id}@${b.r},${b.c} colour ${b.color.toString(36)} frozen=${b.frozen} locked=${b.locked} key=${b.key} queued=${b.queued} open=${g.board.isOpen(b)} why=${g.board.stuckReason(b)}`);
}
console.log('rods:', g.board.rods.map((r) => (r.open ? 'open' : 'closed')).join(','));
