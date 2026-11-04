// Tìm bước đầu tiên mà mô hình nhanh và game thật lệch nhau, in trạng thái hai bên.
import { Rng } from '../src/core/rng';
import { COLOR_COUNT } from '../src/core/palette';
import { prepare } from '../src/designer/analyze';
import { Puzzle, initial, openMoves, sandFor, tap } from '../src/designer/fast';
import { blankLevel } from '../src/designer/model';
import { newGame, settle, randomPlayout } from '../src/designer/solver';

const a = Number(process.argv[2] ?? 8);
const layer = 4;
let shown = 0;
for (let k = 0; k < 8 && shown < 3; k++) {
  const rng = new Rng(100 + a + k * 7);
  const def0 = blankLevel(90, 'dbg', a);
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
  const g = newGame(prepared, 1);
  settle(g);
  for (let i = 0; i < 6 && shown < 3; i++) {
    const pl = randomPlayout(g, 1000 + i);
    // replay step by step on both
    const real = newGame(prepared, 1);
    settle(real);
    let s = initial(p);
    for (let step = 0; step < pl.taps.length; step++) {
      const id = pl.taps[step];
      const mv = openMoves(p, s);
      if (!mv.includes(id)) {
        shown++;
        console.log(`art ${a} layout ${k} playout ${i} step ${step}: tap ${id} (colour ${p.bColor[id]}) illegal in fast`);
        console.log('  fast belt:', Array.from(s.belt.slice(0, s.beltN)).map((b) => `#${b}c${p.bColor[b]} ${s.fill[b]}/${p.bCap[b]}`).join('  '), ' slots', p.slots);
        console.log('  real belt:', real.belt.map((b) => `#${b.id}c${b.color} ${b.fill}/${b.cap} ${b.state}`).join('  '));
        const ex = real.exposure();
        console.log('  real exposure:', Array.from(ex).map((v, c) => (v ? `c${c}:${v}` : '')).filter(Boolean).join(' '));
        console.log('  fast sandLeft', s.sandLeft, ' real sand', real.sand.total, ' per colour fast', Array.from(s.colorLeft).join(','), ' real', Array.from(real.sand.counts).join(','));
        break;
      }
      s = tap(p, s, id);
      real.tap(id);
      settle(real);
      const diffC = Array.from(s.colorLeft).map((v, c) => (v !== real.sand.counts[c] ? `c${c}: fast ${v} real ${real.sand.counts[c]}` : '')).filter(Boolean);
      if (diffC.length && shown < 3) { shown++; console.log(`art ${a} layout ${k} playout ${i} after step ${step} (tap #${id} colour ${p.bColor[id]}): ${diffC.join(' | ')}`); console.log('  real belt:', real.belt.map((b) => `#${b.id}c${b.color} ${b.fill}/${b.cap} ${b.state}`).join('  ')); break; }
    }
  }
}
