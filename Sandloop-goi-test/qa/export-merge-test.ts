// mergeIntoGame trên level-data.ts / art-data.ts thật: màn không đụng tới giữ nguyên từng byte, màn mới nối vào cuối, màn sửa giữ comment.
import { readFileSync, writeFileSync } from 'node:fs';
import { LEVELS } from '../src/core/levels';
import { mergeIntoGame } from '../src/designer/export';
import { blankLevel, cloneDef } from '../src/designer/model';
import type { DesignLevel } from '../src/designer/analyze';

const lv = readFileSync('src/core/level-data.ts', 'utf8');
const art = readFileSync('src/core/art-data.ts', 'utf8');
const entries = LEVELS.map((l) => ({ def: l as DesignLevel, tag: null, builtin: true, edited: false }));
const edited = cloneDef(LEVELS[11] as DesignLevel); edited.slots = 4;
entries[11] = { def: edited, tag: null, builtin: true, edited: true };
const mine = blankLevel(500, "Màn 'của tôi'", 0) as DesignLevel;
mine.customArt = { name: 'Up', w: 32, h: 32, rows: Array.from({ length: 32 }, () => 'a'.repeat(32)) };
mine.buckets[1][0] = 'a'; mine.tunnels = [{ r: 4, c: 1, dir: 'u', queue: ['a', '1'] }]; mine.tiles.push('.t...'); mine.buckets.push(Array(5).fill('.')); mine.rods = [{ r: 1, c: 3, dir: 'r', size: 2 }];
const list = [...entries, { def: mine, tag: 'super' as const, builtin: false, edited: true }];
const m = mergeIntoGame(lv, art, list);
console.log('added', m.added, 'replaced', m.replaced, 'newArts', m.newArts, 'ids', JSON.stringify([...m.ids]));
writeFileSync('qa/results/merge-test/level-data.ts', m.levelData.replace("from './levels'", "from '../../../src/core/levels'").replace("from './grid'", "from '../../../src/core/grid'"));
writeFileSync('qa/results/merge-test/art-data.ts', m.artData);
const again = mergeIntoGame(m.levelData, m.artData, list.map((e, i) => (i === list.length - 1 ? { ...e, gameId: m.ids.get(i) } : e)));
console.log('2nd export: added', again.added, 'replaced', again.replaced, 'newArts', again.newArts, 'same text', again.levelData === m.levelData && again.artData === m.artData);
// untouched blocks byte for byte
const unchanged = LEVELS.filter((_, i) => i !== 11).every((l) => { const k = `    id: ${l.id},`; return m.levelData.includes(lv.split(k)[1]?.split('\n  },')[0] ?? '###'); });
console.log('untouched blocks identical:', unchanged, '| comment kept in level 12:', m.levelData.includes('Frozen intro'));
const count = (t: string, k: string) => t.split(k).length - 1;
console.log('comment count after 1st/2nd:', count(m.levelData, 'Frozen intro'), count(again.levelData, 'Frozen intro'), '| length', m.levelData.length, again.levelData.length);
let i = 0; while (i < m.levelData.length && m.levelData[i] === again.levelData[i]) i++;
console.log('first difference at', i, JSON.stringify(m.levelData.slice(i - 30, i + 60)), JSON.stringify(again.levelData.slice(i - 30, i + 60)));
