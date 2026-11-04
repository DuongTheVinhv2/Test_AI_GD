import { LEVELS } from '../src/core/levels';
import { Game } from '../src/core/game';
import { search, randomPlayout, newGame } from '../src/designer/solver';
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : LEVELS.map((l) => l.id);
for (const id of only) {
  const lv = LEVELS[id - 1];
  const g = newGame(lv, 1);
  let t = performance.now();
  const win = search(g, "won", { ms: 8000, nodes: 400 });
  const tw = performance.now() - t; t = performance.now();
  const stuck = search(g, 'stuck', { ms: 6000, nodes: 400 }, (m) => (m.exposed ? 0 : 1));
  const ts = performance.now() - t; t = performance.now();
  let w = 0, s = 0, o = 0;
  for (let i = 1; i <= 6; i++) { const p = randomPlayout(g, i); if (p.end === 'won') w++; else if (p.end === 'stuck') s++; else o++; }
  const tp = performance.now() - t;
  console.log(`L${id} ${lv.name}: win=${win ? win.length + ' taps' : 'none'} (${Math.round(tw)}ms) stuck=${stuck ? stuck.length + ' taps' : 'none'} (${Math.round(ts)}ms) random8 w${w}/s${s}/o${o} (${Math.round(tp)}ms)`);
}
