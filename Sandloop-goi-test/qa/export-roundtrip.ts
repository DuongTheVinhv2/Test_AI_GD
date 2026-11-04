// Xuất danh sách màn ra text, nạp lại, so với dữ liệu gốc (kể cả một tranh tải lên).
import { writeFileSync } from 'node:fs';
import { ART_SOURCES } from '../src/core/art-data';
import { LEVELS } from '../src/core/levels';
import { buildFiles } from '../src/designer/export';
import { blankLevel } from '../src/designer/model';
import type { DesignLevel } from '../src/designer/analyze';

const custom = blankLevel(99, "Test 'quote'", 0) as DesignLevel;
custom.customArt = { name: 'Up', w: 32, h: 32, rows: Array.from({ length: 32 }, () => 'a'.repeat(32)) };
custom.buckets[1][0] = 'a';
const entries = [...LEVELS.map((l) => ({ def: l as DesignLevel, tag: null, builtin: true })), { def: custom, tag: 'super' as const }];
const f = buildFiles(entries, ART_SOURCES.slice());
writeFileSync('qa/results/export-test/level-data.ts', f.levelData.replace("from './levels'", "from '../../../src/core/levels'"));
writeFileSync('qa/results/export-test/art-data.ts', f.artData);
console.log(f.levels, 'levels', f.newArts, 'new arts');
