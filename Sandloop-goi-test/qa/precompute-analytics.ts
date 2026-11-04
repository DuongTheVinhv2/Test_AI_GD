// Pre-run the analytics bots so analytics.html opens with data already on screen.
//   npx tsx qa/precompute-analytics.ts part <level> [seeds=30]   -> qa/results/analytics-part-<level>.json (run one process per level, in parallel)
//   npx tsx qa/precompute-analytics.ts merge                     -> src/analytics/baseline.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { LEVELS } from '../src/core/levels';
import { levelMeta, playGame } from '../src/analytics/bot';
import { buildDataset } from '../src/analytics/data';
import { DEFAULT_PERSONAS } from '../src/analytics/personas';
import type { GameResult, LevelMeta } from '../src/analytics/types';

const mode = process.argv[2];
const part = (l: number) => `qa/results/analytics-part-${l}.json`;

if (mode === 'part') {
  const L = Number(process.argv[3]);
  const seeds = Number(process.argv[4] ?? 30);
  const def = LEVELS[L - 1];
  const results: Record<string, GameResult[]> = {};
  for (const p of DEFAULT_PERSONAS) {
    const rs: GameResult[] = [];
    for (let s = 1; s <= seeds; s++) rs.push(playGame(def, p, s));
    results[`${L}|${p.id}`] = rs;
    console.log(`L${L} ${p.name}: ${rs.filter((r) => r.won).length}/${seeds}`);
  }
  writeFileSync(part(L), JSON.stringify({ meta: levelMeta(def, L - 1), results }));
} else if (mode === 'merge') {
  const levels: LevelMeta[] = [];
  const results = new Map<string, GameResult[]>();
  for (let L = 1; L <= LEVELS.length; L++) {
    if (!existsSync(part(L))) { console.log(`missing part ${L}`); continue; }
    const j = JSON.parse(readFileSync(part(L), 'utf8')) as { meta: LevelMeta; results: Record<string, GameResult[]> };
    levels.push(j.meta);
    for (const [k, v] of Object.entries(j.results)) results.set(k, v);
  }
  const d = buildDataset({
    id: 'baseline', title: 'Bot chạy sẵn · bản game hiện tại', origin: 'sample', personas: DEFAULT_PERSONAS, levels, results,
    note: 'Bot mô phỏng chơi trên đúng luật của game (lõi game thật), không phải người chơi thật. Chạy sẵn bằng qa/precompute-analytics.ts.',
  });
  writeFileSync('src/analytics/baseline.json', JSON.stringify(d));
  console.log(`baseline.json: ${d.levels.length} levels, ${d.cells.length} cells`);
} else console.log('usage: part <level> [seeds] | merge');
