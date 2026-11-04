import { blankLevel } from '../src/designer/model';
import { generate, type Tag } from '../src/designer/gen';
import { mechSummary, NO_MECH } from '../src/designer/mech';
import { mechProblems } from '../src/designer/model';
// npx tsx qa/gen-test.ts <arts> <tags> <budgetMs>   env: SHAPE=1 LEGACY=1 DEBUG=1 SHOW=1  MECH=hidden:3,tunnel:1,frozen:2,rod:1,key:1
const arts = (process.argv[2] ?? '2,4,6,8').split(',').map(Number);
const tags = (process.argv[3] ?? 'easy,hard,super').split(',') as Tag[];
const budget = Number(process.argv[4] ?? 40000);
const mech = { ...NO_MECH };
for (const kv of (process.env.MECH ?? 'hidden:3').split(',')) { const [k, v] = kv.split(':'); if (k in mech) (mech as Record<string, number>)[k] = Number(v); }
for (const a of arts) for (const tag of tags) {
  const def = blankLevel(99, 'test', a);
  const t = performance.now();
  const r = generate(def, { tag, layer: 4, budgetMs: budget, seed: Number(process.env.SEED ?? 7 + a), shape: process.env.SHAPE === '1', legacy: process.env.LEGACY === '1', mech, onProgress: process.env.DEBUG ? (x) => console.log(`   [${((performance.now() - t) / 1000).toFixed(1)}s] ` + x) : undefined });
  const ms = mechSummary(r.def);
  console.log(`art ${a} ${tag}: matched=${r.matched} tries=${r.tries} measured=${r.analysis?.difficulty} wins ${r.analysis?.wins}/${r.analysis?.runs} stuck ${r.analysis?.stucks} (${Math.round((performance.now() - t) / 1000)}s) mech ${JSON.stringify(ms)} problems ${JSON.stringify(mechProblems(r.def))} ${r.note}${r.hints?.length ? ' | ' + r.hints.join(' / ') : ''}`);
  if (process.env.SHOW) { console.log(r.def.tiles.join('\n')); console.log(r.def.buckets.map((x) => x.join(' ')).join('\n')); console.log(JSON.stringify(r.def.tunnels), JSON.stringify(r.def.rods)); }
}
