// Tính độ khó + lời giải (case win / case stuck) cho 10 màn có sẵn và ghi vào src/designer/precomputed.json.
// Chạy: npx tsx qa/precompute-designer.ts
import { writeFileSync } from 'node:fs';
import { LEVELS } from '../src/core/levels';
import { analyze } from '../src/designer/analyze';
import { existsSync, readFileSync } from 'node:fs';
const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
const out: Record<string, unknown> = existsSync('src/designer/precomputed.json') && only ? JSON.parse(readFileSync('src/designer/precomputed.json', 'utf8')) : {};
for (const lv of LEVELS) {
  if (only && !only.includes(lv.id)) continue;
  const a = analyze(lv, { layer: 4, playouts: 8, winMs: Number(process.env.WINMS ?? 20000), stuckMs: 8000 });
  out[`builtin-${lv.id}`] = a;
  console.log(`L${lv.id} ${lv.name}: ${a.difficulty} wins ${a.wins}/${a.runs} stuck ${a.stucks} win=${a.winTaps?.length ?? '-'} stuckSeq=${a.stuckTaps?.length ?? '-'} open=${a.openAtStart} (${Math.round(a.ms)}ms) ${a.notes.join(' ')}`);
}
writeFileSync('src/designer/precomputed.json', JSON.stringify(out));
