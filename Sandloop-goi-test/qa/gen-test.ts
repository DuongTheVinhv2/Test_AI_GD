import { LEVELS } from '../src/core/levels';
import { blankLevel } from '../src/designer/model';
import { generate, type Tag } from '../src/designer/gen';
const arts = (process.argv[2] ?? '2,4,6,8').split(',').map(Number);
const tags = (process.argv[3] ?? 'easy,hard,super').split(',') as Tag[];
const budget = Number(process.argv[4] ?? 40000);
for (const a of arts) for (const tag of tags) {
  const def = blankLevel(99, 'test', a);
  const t = performance.now();
  const r = generate(def, { tag, layer: 4, budgetMs: budget, seed: 7 + a, shape: process.env.SHAPE === '1', legacy: process.env.LEGACY === '1', onProgress: process.env.DEBUG ? (x) => console.log(`   [${((performance.now() - t) / 1000).toFixed(1)}s] ` + x) : undefined });
  console.log(`art ${a} ${tag}: matched=${r.matched} tries=${r.tries} measured=${r.analysis?.difficulty} wins ${r.analysis?.wins}/${r.analysis?.runs} stuck ${r.analysis?.stucks} (${Math.round((performance.now() - t) / 1000)}s) ${r.note}${r.hints?.length ? ' | ' + r.hints.join(' / ') : ''}`);
  if (process.env.SHOW) console.log(r.def.buckets.map((x) => x.join(' ')).join('\n'));
}
