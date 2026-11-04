import type { ArtSource } from '../core/art-data';
import type { LevelDef } from '../core/levels';
import type { DesignLevel } from './analyze';

/**
 * Turns the designer's level list into the two source files the game reads:
 *   src/core/level-data.ts  (LEVEL_DATA: board, buckets, art index, theme ...)
 *   src/core/art-data.ts    (ART_SOURCES: the 32 x 32 pictures; uploaded pictures are appended)
 * Levels keep the order of the list and are numbered 1..N. A picture that came from an uploaded image gets the next art index.
 */
export interface ExportEntry {
  def: DesignLevel;
  /** For levels made in the tool, 'super' marks the level as a hard level in the game. */
  tag: 'easy' | 'hard' | 'super' | null;
  /** A level that already shipped keeps its own `hard` flag. */
  builtin?: boolean;
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export interface ExportFiles { levelData: string; artData: string; levels: number; newArts: number }

export function buildFiles(entries: ExportEntry[], builtinArts: ArtSource[]): ExportFiles {
  const arts: ArtSource[] = builtinArts.slice();
  const artIndex = (d: DesignLevel): number => {
    if (!d.customArt) return d.art;
    const c = d.customArt;
    const same = arts.findIndex((a) => a.name === c.name && a.rows.join() === c.rows.join());
    if (same >= 0) return same;
    arts.push(c);
    return arts.length - 1;
  };

  const lv = entries.map((e, i): string => {
    const d = e.def;
    const art = artIndex(d);
    const hard = e.builtin ? !!d.hard : d.hard ?? e.tag === 'super';
    const out: string[] = [
      '  {',
      `    id: ${i + 1},`,
      `    name: ${q(d.name)},`,
      `    art: ${art},`,
      `    theme: ${q(d.theme)},`,
      `    fillSeconds: ${d.fillSeconds},`,
    ];
    if (d.slots !== undefined) out.push(`    slots: ${d.slots},`);
    if (hard) out.push('    hard: true,');
    out.push(`    tiles: [${d.tiles.map(q).join(', ')}],`, '    buckets: [');
    for (const row of d.buckets) out.push(`      [${row.map(q).join(', ')}],`);
    out.push('    ],', '  },');
    return out.join('\n');
  });

  const levelData = [
    "import type { LevelDef } from './levels';",
    '',
    '/**',
    ' * The levels: board tiles, buckets and the picture each level uses.',
    ' * Colour ids: 0 Blush, 1 Poppy, 2 Sunbeam, 3 Tangerine, 4 Amber, 5 Maroon, 6 Lime, 7 Forest, 8 Cobalt, 9 Aqua, 10 Cream.',
    " * A bucket token is the colour id in base 36; '?' in front hides the colour until a neighbouring tile is empty.",
    ' * Written by the level designer (designer.html, "Xuất về game").',
    ' */',
    'export const LEVEL_DATA: LevelDef[] = [',
    ...lv,
    '];',
    '',
  ].join('\n');

  const artBlocks = arts.map((a) => [`  { name: ${JSON.stringify(a.name)}, w: ${a.w}, h: ${a.h}, rows: [`, ...a.rows.map((r) => `    '${r}',`), '  ] },'].join('\n'));
  const artData = [
    '// The sand pictures (32 x 32 pixels each).',
    '// Each picture is 32 x 32 art pixels; every character is a sand color id in base 36.',
    'export interface ArtSource { name: string; w: number; h: number; rows: string[] }',
    'export const ART_SOURCES: ArtSource[] = [',
    ...artBlocks,
    '];',
    '',
  ].join('\n');

  return { levelData, artData, levels: entries.length, newArts: arts.length - builtinArts.length };
}

export type { LevelDef };
