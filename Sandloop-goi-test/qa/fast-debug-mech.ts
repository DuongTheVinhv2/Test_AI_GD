// Bước đầu tiên mà các xô bấm được của mô hình nhanh khác game thật (màn có cơ chế mới).
import { LEVELS } from '../src/core/levels';
import { prepare, type DesignLevel } from '../src/designer/analyze';
import { Puzzle, initial, openMoves, sandFor, tap } from '../src/designer/fast';
import { legalMoves, newGame, randomPlayout, settle } from '../src/designer/solver';

const li = Number(process.argv[2] ?? 14);
const lv = LEVELS[li];
const def = prepare(lv as DesignLevel, 4);
const p = new Puzzle(def, sandFor(def.art, 4));
const g0 = newGame(def, 1);
settle(g0);
let shown = 0;
for (let i = 0; i < 12 && shown < 2; i++) {
  const pl = randomPlayout(g0, 500 + i);
  const real = newGame(def, 1);
  settle(real);
  let s = initial(p);
  for (let step = 0; step <= pl.taps.length; step++) {
    const rm = legalMoves(real).map((m) => m.id).sort((a, b) => a - b);
    const fm = openMoves(p, s).sort((a, b) => a - b);
    if (rm.join() !== fm.join()) {
      shown++;
      console.log(`${lv.name} playout ${i} step ${step}: real open [${rm}] fast open [${fm}]`);
      const info = (id: number) => { const b = real.board.buckets[id]; return `#${id} c${b.color} r${b.r}c${b.c} fro${b.frozen} lock${b.locked ? 1 : 0} q${b.queued ? 1 : 0} mys${b.mystery && !b.revealed ? 1 : 0}`; };
      const diffIds = [...new Set([...rm, ...fm])].filter((x) => rm.includes(x) !== fm.includes(x));
      for (const id of diffIds) console.log('   ', info(id), '| fast: where', s.where[id], 'rev', s.rev[id], 'frozen', s.frozen[id], 'locked', s.locked[id], rm.includes(id) ? '(real open)' : '(fast open)');
      console.log('    real belt:', real.belt.map((b) => `#${b.id}c${b.color} ${b.fill}/${b.cap}`).join(' '), '| fast belt:', Array.from(s.belt.slice(0, s.beltN)).map((b) => `#${b}c${p.bColor[b]} ${s.fill[b]}/${p.bCap[b]}`).join(' '));
      console.log('    real rods open', real.board.rods.map((r) => r.open ? 1 : 0).join(''), 'fast', Array.from(s.rodOpen).join(''), '| real frozen left', real.board.buckets.filter((b) => !b.gone && b.frozen > 0).map((b) => `#${b.id}:${b.frozen}`).join(' '));
      break;
    }
    if (step === pl.taps.length) break;
    real.tap(pl.taps[step]);
    settle(real);
    s = tap(p, s, pl.taps[step]);
  }
}
