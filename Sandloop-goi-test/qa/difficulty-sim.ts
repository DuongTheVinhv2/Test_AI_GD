// Đo tỉ lệ thắng theo màn cho 3 kiểu người chơi (bot) trên đúng luật của game.
// Chạy: npx tsx qa/difficulty-sim.ts [số_seed=40] [màn,màn,...] [chính_sách,...] [file_màn.json ...]
//   chính_sách: random,exposed,lookahead (mặc định cả ba). File .json là một LevelDef thay thế màn cùng id (để thử biến thể).
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/game';
import { LEVELS as BASE_LEVELS, type LevelDef } from '../src/core/levels';
import { Rng } from '../src/core/rng';

const SEEDS = Number(process.argv[2] ?? 40);
const LEVELS: LevelDef[] = [...BASE_LEVELS];
const extra = process.argv.slice(5);
for (const f of extra) {
  const d = JSON.parse(readFileSync(f, 'utf8')) as LevelDef;
  LEVELS[d.id - 1] = d;
}
const only = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',').map(Number) : LEVELS.map((l) => l.id);
type Policy = 'random' | 'exposed' | 'lookahead';
const POLICIES = (process.argv[4] && process.argv[4] !== 'all' ? process.argv[4].split(',') : ['random', 'exposed', 'lookahead']) as Policy[];

function play(lv: (typeof LEVELS)[number], seed: number, policy: Policy): boolean {
  const g = new Game(lv, seed);
  const rng = new Rng(seed);
  let next = 0;
  while (g.status === 'playing' && g.time < 150) {
    if (g.ticks >= next && g.slotsUsed < g.slots) {
      next = g.ticks + 90;
      const open = g.openBuckets();
      const ex = g.exposure();
      let pool = open;
      if (policy !== 'random') {
        const good = open.filter((b) => ex[b.color] > 0);
        if (good.length) pool = good;
        else if (policy === 'lookahead') {
          const queue = [{ board: g.board.clone(), route: [] as number[] }];
          let route: number[] | null = null;
          for (let q = 0; q < queue.length && q < 3000; q++) {
            const x = queue[q];
            if (x.route.length >= g.slots - g.slotsUsed) continue;
            for (const b of x.board.openBuckets()) {
              const r = [...x.route, b.id];
              if (ex[b.color] > 0) { route = r; break; }
              const board = x.board.clone();
              board.remove(board.buckets[b.id]);
              queue.push({ board, route: r });
            }
            if (route) break;
          }
          pool = route ? [g.board.buckets[route[0]]] : [];
        }
      }
      if (pool.length) g.tap(pool[rng.int(pool.length)].id);
    }
    g.step();
  }
  return g.status === 'won';
}

for (const id of only) {
  const lv = LEVELS[id - 1];
  const row: string[] = [];
  for (const p of POLICIES) {
    let w = 0;
    for (let s = 1; s <= SEEDS; s++) if (play(lv, s, p)) w++;
    row.push(`${p}=${Math.round((w / SEEDS) * 100)}%`);
  }
  console.log(`L${id} ${lv.name}${lv.hard ? ' [HARD]' : ''}: ${row.join('  ')}`);
}
