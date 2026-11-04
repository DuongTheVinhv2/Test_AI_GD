// Một lần bấm duy nhất: mô hình nhanh và game thật hút bao nhiêu cát mỗi màu?
import { COLOR_COUNT } from '../src/core/palette';
import { prepare } from '../src/designer/analyze';
import { Puzzle, initial, openMoves, sandFor, tap } from '../src/designer/fast';
import { blankLevel } from '../src/designer/model';
import { newGame, settle } from '../src/designer/solver';

const a = Number(process.argv[2] ?? 8);
const layer = 4;
const def0 = blankLevel(90, 'dbg2', a);
const g0 = newGame(prepare(def0, layer), 1);
const colors: number[] = [];
for (let c = 0; c < COLOR_COUNT; c++) if (g0.sand.counts[c] > 0) colors.push(c);
const def = { ...def0, buckets: def0.buckets.map((r) => r.slice()) };
colors.forEach((c, i) => (def.buckets[0][i] = c.toString(36)));
const prepared = prepare(def, layer);
const p = new Puzzle(prepared, sandFor(prepared.art, layer));
console.log('colours', colors.join(','), 'counts', Array.from(g0.sand.counts).join(','));
for (let b = 0; b < p.nb; b++) {
  const real = newGame(prepared, 1);
  settle(real);
  real.tap(b);
  settle(real);
  const s = tap(p, initial(p), b);
  const dc = Array.from(s.colorLeft).map((v, c) => `${c}:${v}/${real.sand.counts[c]}`).filter((x, c) => colors.includes(c));
  console.log(`tap #${b} colour ${p.bColor[b]} -> fast/real left ${dc.join(' ')}  belt real: ${real.belt.map((x) => `${x.fill}/${x.cap}`).join(',')}`);
}
