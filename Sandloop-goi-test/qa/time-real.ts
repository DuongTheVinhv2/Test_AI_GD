import { LEVELS } from '../src/core/levels';
import { applyMove, legalMoves, newGame, settle } from '../src/designer/solver';

for (const lv of [LEVELS[0], LEVELS[3], LEVELS[9]]) {
  const g = newGame(lv, 1);
  const t0 = performance.now();
  settle(g);
  const t1 = performance.now();
  const ms = legalMoves(g);
  let n = 0;
  const t2 = performance.now();
  for (const m of ms) { applyMove(g, m.id); n++; }
  const t3 = performance.now();
  console.log(`${lv.name}: initial settle ${(t1 - t0).toFixed(0)}ms, ${n} moves avg ${((t3 - t2) / Math.max(1, n)).toFixed(0)}ms each, buckets ${g.board.buckets.length}`);
}
