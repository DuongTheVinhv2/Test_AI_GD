// Tìm cách xếp màu xô cho một màn có cơ chế mới: giữ nguyên bàn, hầm, thanh chắn và vị trí các ô đặc biệt,
// chỉ hoán vị màu giữa các xô, rồi chọn bố cục mà bot "exposed" thắng gần tỉ lệ mục tiêu.
// Chạy: npx tsx qa/mech-search.ts <màn> <mục_tiêu 0..1> [số_ứng_viên=120] [seed_mỗi_ứng_viên=10]
// Kết quả: qa/results/mech-L<màn>.json (LevelDef tốt nhất) và một dòng tóm tắt.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Game } from '../src/core/game';
import { LEVELS, type LevelDef } from '../src/core/levels';
import { Rng } from '../src/core/rng';

const id = Number(process.argv[2]);
const target = Number(process.argv[3] ?? 0.65);
const CANDS = Number(process.argv[4] ?? 120);
const SEEDS = Number(process.argv[5] ?? 10);
const base = LEVELS[id - 1];

type Slot = { get(): string; set(c: string): void; prefix: string };

function split(tok: string): { pre: string; col: string } {
  if (tok.startsWith('?')) return { pre: '?', col: tok.slice(1) };
  const m = /^([FKL]\d:)(.)$/.exec(tok);
  if (m) return { pre: m[1], col: m[2] };
  return { pre: '', col: tok };
}

function clone(d: LevelDef): LevelDef {
  return JSON.parse(JSON.stringify(d));
}

/** Every place that holds a colour: board tokens and tunnel queue entries. */
function slots(d: LevelDef): Slot[] {
  const out: Slot[] = [];
  d.buckets.forEach((row, r) =>
    row.forEach((tok, c) => {
      if (tok === '.' || tok === ' ') return;
      const { pre } = split(tok);
      out.push({ prefix: pre, get: () => split(d.buckets[r][c]).col, set: (col) => (d.buckets[r][c] = pre + col) });
    }),
  );
  d.tunnels?.forEach((t) => t.queue.forEach((q, i) => out.push({ prefix: '', get: () => t.queue[i], set: (col) => (t.queue[i] = col) })));
  return out;
}

function win(d: LevelDef, seed: number): boolean {
  const g = new Game(d, seed);
  const rng = new Rng(seed);
  let next = 0;
  while (g.status === 'playing' && g.time < 150) {
    if (g.ticks >= next && g.slotsUsed < g.slots) {
      next = g.ticks + 90;
      const open = g.openBuckets();
      const ex = g.exposure();
      const good = open.filter((b) => ex[b.color] > 0);
      const pool = good.length ? good : open;
      if (pool.length) g.tap(pool[rng.int(pool.length)].id);
    }
    g.step();
  }
  return g.status === 'won';
}

function rate(d: LevelDef, seeds: number, from = 1): number {
  let w = 0;
  for (let s = from; s < from + seeds; s++) if (win(d, s)) w++;
  return w / seeds;
}

const rng = new Rng(id * 7919 + 13);
let best: { d: LevelDef; r: number; score: number } | null = null;
const baseRate = rate(base, SEEDS);
best = { d: clone(base), r: baseRate, score: Math.abs(baseRate - target) };
for (let k = 0; k < CANDS; k++) {
  const d = clone(base);
  const sl = slots(d);
  const cols = sl.map((s) => s.get());
  for (let i = cols.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [cols[i], cols[j]] = [cols[j], cols[i]];
  }
  sl.forEach((s, i) => s.set(cols[i]));
  let r: number;
  try {
    r = rate(d, SEEDS);
  } catch {
    continue;
  }
  const score = Math.abs(r - target);
  if (score < best.score) best = { d, r, score };
  if (best.score <= 0.05) break;
}
// Confirm the winner on fresh seeds.
const confirm = rate(best.d, 30, 100);
mkdirSync('qa/results', { recursive: true });
writeFileSync(`qa/results/mech-L${id}.json`, JSON.stringify(best.d, null, 2));
console.log(`L${id} ${base.name}: gốc ${Math.round(baseRate * 100)}% -> tốt nhất ${Math.round(best.r * 100)}% (xác nhận ${Math.round(confirm * 100)}% trên 30 seed, mục tiêu ${Math.round(target * 100)}%)`);
console.log(JSON.stringify(best.d.buckets), best.d.tunnels ? JSON.stringify(best.d.tunnels.map((t) => t.queue)) : '');
