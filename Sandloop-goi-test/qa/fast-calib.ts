// Đối chiếu mô hình nhanh (src/designer/fast.ts) với game thật: cùng một chuỗi bấm xô, kết cục có giống nhau không.
// Chạy: npx tsx qa/fast-calib.ts [art,art,...] [số_bố_cục=6] [số_ván_thật=6] [layer=4]
import { ART_SOURCES } from '../src/core/art-data';
import { Rng } from '../src/core/rng';
import { COLOR_COUNT } from '../src/core/palette';
import { prepare } from '../src/designer/analyze';
import { Puzzle, analyzeGraph, replayTaps, sandFor, samplePlays } from '../src/designer/fast';
import { blankLevel } from '../src/designer/model';
import { newGame, randomPlayout, settle } from '../src/designer/solver';

const arts = (process.argv[2] ?? '2,3,6,8').split(',').map(Number);
const layouts = Number(process.argv[3] ?? 6);
const plays = Number(process.argv[4] ?? 6);
const layer = Number(process.argv[5] ?? 4);

let same = 0, diff = 0, illegal = 0, open = 0;
const per: Record<number, number[]> = {};
let fastMs = 0, realMs = 0;
for (const a of arts) {
  const rng = new Rng(100 + a);
  for (let k = 0; k < layouts; k++) {
    const def0 = blankLevel(90, 'calib', a);
    const g0 = newGame(prepare(def0, layer), 1);
    const colors: number[] = [];
    for (let c = 0; c < COLOR_COUNT; c++) if (g0.sand.counts[c] > 0) colors.push(c);
    const total = Math.min(20, 8 + rng.int(9));
    const list: number[] = [...colors];
    while (list.length < total) list.push(colors[rng.int(colors.length)]);
    const cells: [number, number][] = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) cells.push([r, c]);
    const pick = rng.shuffle(cells.slice()).slice(0, list.length);
    const def = { ...def0, buckets: def0.buckets.map((r) => r.slice()) };
    pick.forEach(([r, c], i) => (def.buckets[r][c] = list[i].toString(36)));
    const prepared = prepare(def, layer);
    const p = new Puzzle(prepared, sandFor(prepared.art, layer));
    const t0 = performance.now();
    const rep = analyzeGraph(p, { maxNodes: 3000, maxMs: 4000 });
    fastMs += performance.now() - t0;
    const g = newGame(prepared, 1);
    settle(g);
    // real bucket ids are scan order, the same as the Puzzle's
    let rw = 0;
    const t1 = performance.now();
    for (let i = 0; i < plays; i++) {
      const pl = randomPlayout(g, 1000 + i);
      if (pl.end === 'won') rw++;
      if (pl.end === 'open') { open++; continue; }
      const v = replayTaps(p, pl.taps);
      const t = (per[a] ??= [0, 0, 0]);
      if (v === 'illegal') { illegal++; t[2]++; }
      else if (v === pl.end) { same++; t[0]++; }
      else { diff++; t[1]++; }
    }
    realMs += performance.now() - t1;
    const sp = samplePlays(p, 200, 5);
    console.log(`art ${a} #${k}: ${p.nb} buckets  fast graph nodes ${rep.nodes}${rep.truncated ? '+' : ''} class ${rep.cls} randomWin ${(rep.randomWin * 100).toFixed(0)}% (sampled ${(sp.wins / 2).toFixed(0)}%)  real wins ${rw}/${plays}  start lines ${rep.start.lines.length}  ${rep.ms.toFixed(0)}ms`);
  }
}
console.log(`\nreplay agreement: same ${same}, different ${diff}, illegal tap ${illegal}, unfinished ${open}`);
console.log(`avg fast graph ${(fastMs / (arts.length * layouts)).toFixed(0)}ms, real playouts ${(realMs / (arts.length * layouts * plays)).toFixed(0)}ms each`);
void ART_SOURCES;
