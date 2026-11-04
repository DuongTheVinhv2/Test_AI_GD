import { LEVELS } from '../src/core/levels';
import { prepare, type DesignLevel } from '../src/designer/analyze';
import { Puzzle, initial, sandFor, tap } from '../src/designer/fast';
import { newGame, settle } from '../src/designer/solver';
const def = prepare(LEVELS[10] as DesignLevel, 4);
const p = new Puzzle(def, sandFor(def.art, 4));
const real = newGame(def, 1); settle(real);
let s = initial(p);
real.tap(1); settle(real); s = tap(p, s, 1);
const W = 128;
const bottom = (x: number) => { const out: string[] = []; for (let y = 0; y < 10; y++) out.push(String(real.sand.cells[y * W + x] - 1)); return out.join(''); };
const fastBottom = (x: number) => { const col = s.cols[x]; let o = ''; for (let i = 0; i < col.length && o.length < 10; i += 2) o += String(col[i]).repeat(col[i + 1]); return o.slice(0, 10); };
console.log('start col of #1:', p.bStart[1], 'perCol', p.bPerCol[1]);
for (const x of [0, 4, 8, 16, 32, 48, 64, 80, 96, 112, 127]) console.log('col', x, 'real', bottom(x), 'fast', fastBottom(x));
console.log('c7 left real', real.sand.counts[7], 'fast', s.colorLeft[7]);
const remReal: number[] = [], remFast: number[] = [];
const init = sandFor(def.art, 4).init;
for (let x = 0; x < W; x++) {
  let h0 = 0; for (let i = 0; i < init[x].length; i += 2) h0 += init[x][i + 1];
  let hr = 0; for (let y = 0; y < 128; y++) if (real.sand.cells[y * W + x]) hr++;
  let hf = 0; for (let i = 0; i < s.cols[x].length; i += 2) hf += s.cols[x][i + 1];
  remReal.push(h0 - hr); remFast.push(h0 - hf);
}
const sum8 = (a: number[]) => Array.from({ length: 16 }, (_, k) => a.slice(k * 8, k * 8 + 8).reduce((x, y) => x + y, 0)).join(' ');
console.log('removed per 8 cols real:', sum8(remReal));
console.log('removed per 8 cols fast:', sum8(remFast));
console.log('board', def.tiles.join('|'), 'bucket #1 at', real.board.buckets[1].r, real.board.buckets[1].c);
