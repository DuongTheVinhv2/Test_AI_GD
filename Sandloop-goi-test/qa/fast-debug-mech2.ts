import { LEVELS } from '../src/core/levels';
import { prepare, type DesignLevel } from '../src/designer/analyze';
import { Puzzle, initial, sandFor, tap } from '../src/designer/fast';
import { newGame, randomPlayout, settle } from '../src/designer/solver';
const li = Number(process.argv[2] ?? 10);
const def = prepare(LEVELS[li] as DesignLevel, 4);
const p = new Puzzle(def, sandFor(def.art, 4));
const g0 = newGame(def, 1); settle(g0);
const pl = randomPlayout(g0, 500);
const real = newGame(def, 1); settle(real);
let s = initial(p);
for (let step = 0; step < pl.taps.length; step++) {
  const id = pl.taps[step];
  real.tap(id); settle(real); s = tap(p, s, id);
  const d = Array.from(s.colorLeft).map((v, c) => (v !== real.sand.counts[c] ? `c${c}: fast ${v} real ${real.sand.counts[c]}` : '')).filter(Boolean);
  console.log(`step ${step} tap #${id} c${p.bColor[id]} cap ${p.bCap[id]} (real cap ${real.caps[id]}): ${d.join(' | ') || 'same'} | real belt ${real.belt.length} fast belt ${s.beltN}`);
  if (d.length) break;
}
