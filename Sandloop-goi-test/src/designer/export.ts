import type { ArtSource } from '../core/art-data';
import type { DesignLevel } from './analyze';

/**
 * Moves levels from the designer into the game's source, without rewriting what is already there:
 *   src/core/level-data.ts  gets a block per level: a new level is appended, a level that was exported before (or a level of the
 *                           game that was edited) replaces its own block and keeps the comments written inside it;
 *   src/core/art-data.ts    gets the pictures of uploaded images appended (a picture that is already there is reused).
 * Every other level stays byte for byte as it was.
 */
export interface ExportEntry {
  def: DesignLevel;
  /** 'super' marks a new level as a hard level in the game. */
  tag: 'easy' | 'hard' | 'super' | null;
  /** A level of the game (it keeps its own id and `hard` flag). */
  builtin?: boolean;
  /** Id this level got in the game the last time it was exported. */
  gameId?: number;
  /** Builtin level changed in the designer. Untouched builtin levels are not written. */
  edited?: boolean;
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export interface MergeResult {
  levelData: string;
  artData: string;
  /** Levels added / levels whose block was replaced / pictures appended. */
  added: number;
  replaced: number;
  newArts: number;
  /** For each entry index that was written: the id it has in the game. */
  ids: Map<number, number>;
  /** The same text as blocks only, for pasting by hand when the files cannot be written. */
  levelBlocks: string;
  artBlocks: string;
}

function artBlock(a: ArtSource): string {
  return [`  { name: ${JSON.stringify(a.name)}, w: ${a.w}, h: ${a.h}, rows: [`, ...a.rows.map((r) => `    '${r}',`), '  ] },'].join('\n');
}

function levelBlock(e: ExportEntry, id: number, art: number, comments: string[]): string {
  const d = e.def;
  const hard = e.builtin ? !!d.hard : d.hard ?? e.tag === 'super';
  const out: string[] = [
    '  {',
    `    id: ${id},`,
    `    name: ${q(d.name)},`,
    `    art: ${art},`,
    `    theme: ${q(d.theme)},`,
    `    fillSeconds: ${d.fillSeconds},`,
  ];
  if (d.slots !== undefined) out.push(`    slots: ${d.slots},`);
  if (hard) out.push('    hard: true,');
  out.push(...comments);
  out.push(`    tiles: [${d.tiles.map(q).join(', ')}],`);
  if (d.tunnels?.length) {
    out.push('    tunnels: [');
    for (const t of d.tunnels) out.push(`      { r: ${t.r}, c: ${t.c}, dir: ${q(t.dir)}, queue: [${t.queue.map(q).join(', ')}] },`);
    out.push('    ],');
  }
  if (d.rods?.length) out.push(`    rods: [${d.rods.map((r) => `{ r: ${r.r}, c: ${r.c}, dir: ${q(r.dir)}, size: ${r.size} }`).join(', ')}],`);
  out.push('    buckets: [');
  for (const row of d.buckets) out.push(`      [${row.map(q).join(', ')}],`);
  out.push('    ],', '  },');
  return out.join('\n');
}

interface Block { start: number; end: number; id: number }

/** Level objects of LEVEL_DATA: lines "  {" ... "  },". */
function findBlocks(lines: string[]): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^ {2}\{\s*$/.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && !/^ {2}\},?\s*$/.test(lines[j])) j++;
    let id = -1;
    for (let k = i; k <= j && k < lines.length; k++) { const m = /^\s{4}id:\s*(\d+),/.exec(lines[k]); if (m) { id = Number(m[1]); break; } }
    out.push({ start: i, end: j, id });
    i = j;
  }
  return out;
}

const norm = (t: string) => t.replace(/\s+/g, '');

export function mergeIntoGame(levelText: string, artText: string, entries: ExportEntry[]): MergeResult {
  // ---- pictures
  const eol = levelText.includes('\r\n') ? '\r\n' : '\n';
  const artLines = artText.split(/\r?\n/);
  const artStarts: number[] = [];
  artLines.forEach((l, i) => { if (/^ {2}\{ name: /.test(l)) artStarts.push(i); });
  const artEnd = artLines.lastIndexOf('];');
  const existingArts = artStarts.map((s, k) => norm(artLines.slice(s, (artStarts[k + 1] ?? artEnd)).join('\n').replace(/,\s*$/, '')));
  const newArtBlocks: string[] = [];
  const artIndex = (d: DesignLevel): number => {
    if (!d.customArt) return d.art;
    const text = norm(artBlock(d.customArt).replace(/,\s*$/, ''));
    const same = existingArts.indexOf(text);
    if (same >= 0) return same;
    existingArts.push(text);
    newArtBlocks.push(artBlock(d.customArt));
    return existingArts.length - 1;
  };

  // ---- levels
  const lines = levelText.split(/\r?\n/);
  const blocks = findBlocks(lines);
  const endLine = lines.lastIndexOf('];');
  let nextId = blocks.reduce((m, b) => Math.max(m, b.id), 0) + 1;
  const ids = new Map<number, number>();
  const replacements = new Map<number, string>();   // block index -> new text
  const appended: string[] = [];
  let added = 0, replaced = 0;
  entries.forEach((e, i) => {
    const wantId = e.builtin ? e.def.id : e.gameId;
    const bi = wantId !== undefined ? blocks.findIndex((b) => b.id === wantId) : -1;
    if (e.builtin && (!e.edited || bi < 0)) return;     // untouched game levels stay as they are
    const art = artIndex(e.def);
    if (bi >= 0) {
      const old = lines.slice(blocks[bi].start, blocks[bi].end + 1);
      const comments = old.filter((l) => /^\s{4}\/\//.test(l));
      replacements.set(bi, levelBlock(e, blocks[bi].id, art, comments));
      ids.set(i, blocks[bi].id);
      replaced++;
    } else {
      const id = nextId++;
      appended.push(levelBlock(e, id, art, []));
      ids.set(i, id);
      added++;
    }
  });

  const outLines: string[] = [];
  let pos = 0;
  const order = [...replacements.keys()].sort((a, b) => blocks[a].start - blocks[b].start);
  for (const bi of order) {
    outLines.push(...lines.slice(pos, blocks[bi].start), replacements.get(bi)!);
    pos = blocks[bi].end + 1;
  }
  outLines.push(...lines.slice(pos, endLine < 0 ? lines.length : endLine));
  if (appended.length) outLines.push(...appended);
  if (endLine >= 0) outLines.push(...lines.slice(endLine));
  const levelData = outLines.join(eol).replace(/\r?\n/g, eol);

  const artOut = [...artLines.slice(0, artEnd < 0 ? artLines.length : artEnd), ...newArtBlocks, ...(artEnd >= 0 ? artLines.slice(artEnd) : [])].join('\n').replace(/\r?\n/g, artText.includes('\r\n') ? '\r\n' : '\n');
  return {
    levelData, artData: artOut, added, replaced, newArts: newArtBlocks.length, ids,
    levelBlocks: [...replacements.values(), ...appended].join('\n'), artBlocks: newArtBlocks.join('\n'),
  };
}
