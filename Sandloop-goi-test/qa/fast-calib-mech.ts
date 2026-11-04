// Mô hình nhanh có hiểu hầm / băng / thanh chắn / chìa-khóa không? Replay các ván ngẫu nhiên thật của màn 11-15.
// Chạy: npx tsx qa/fast-calib-mech.ts [plays=10]
import { LEVELS } from '../src/core/levels';
import { prepare, type DesignLevel } from '../src/designer/analyze';
import { Puzzle, analyzeGraph, replayTaps, sandFor } from '../src/designer/fast';
import { newGame, randomPlayout, settle } from '../src/designer/solver';

const plays = Number(process.argv[2] ?? 10);
let same = 0, diff = 0, illegal = 0, open = 0;
for (const lv of LEVELS.slice(10)) {
  const def = prepare(lv as DesignLevel, 4);
  const p = new Puzzle(def, sandFor(def.art, 4));
  const g = newGame(def, 1);
  settle(g);
  const rep = analyzeGraph(p, { maxNodes: 4000, maxMs: 4000 });
  let s = 0, d = 0, il = 0, rw = 0;
  for (let i = 0; i < plays; i++) {
    const pl = randomPlayout(g, 500 + i);
    if (pl.end === 'won') rw++;
    if (pl.end === 'open') { open++; continue; }
    const v = replayTaps(p, pl.taps);
    if (v === 'illegal') il++; else if (v === pl.end) s++; else d++;
  }
  same += s; diff += d; illegal += il;
  console.log(`${lv.name.padEnd(10)} buckets ${p.nb} (queue ${p.bQueued0.reduce((a, b) => a + b, 0)})  fast: ${rep.cls} randomWin ${(rep.randomWin * 100).toFixed(0)}% nodes ${rep.nodes}${rep.truncated ? '+' : ''}  real wins ${rw}/${plays}  replay same ${s} diff ${d} illegal ${il}`);
}
console.log(`\nreplay agreement: same ${same}, different ${diff}, illegal tap ${illegal}, unfinished ${open}`);
