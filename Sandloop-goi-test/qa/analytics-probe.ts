// Probe: win rate and speed of the analytics bot personas on a few levels. npx tsx qa/analytics-probe.ts [levels] [seeds]
import { LEVELS } from '../src/core/levels';
import { playGame, toCell, levelMeta } from '../src/analytics/bot';
import { DEFAULT_PERSONAS } from '../src/analytics/personas';

const levels = (process.argv[2] ?? '1,4,5').split(',').map(Number);
const seeds = Number(process.argv[3] ?? 6);
for (const L of levels) {
  const def = LEVELS[L - 1];
  const m = levelMeta(def, L - 1);
  console.log(`L${L} ${def.name}`, JSON.stringify(m));
  for (const p of DEFAULT_PERSONAS) {
    const t0 = Date.now();
    const rs = [];
    for (let s = 1; s <= seeds; s++) rs.push(playGame(def, p, s));
    const c = toCell(L, p.id, rs);
    console.log(`  ${p.name.padEnd(13)} win ${(c.winRate * 100).toFixed(0)}%  winT ${c.avgWinTime?.toFixed(1)}  taps ${c.taps?.toFixed(1)}  stuck ${c.stuckShare?.toFixed(2)}  sandLeft ${c.sandLeftOnLoss?.toFixed(2)}  ${((Date.now() - t0) / seeds).toFixed(0)}ms/game`);
  }
}
