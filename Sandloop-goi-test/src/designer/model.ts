import type { ArtSource } from '../core/art-data';
import { Board, DIR_VEC, type Dir, type RodDef, type TunnelDef } from '../core/grid';
import { SAND_COLORS } from '../core/palette';
import type { DesignLevel } from './analyze';
import { isBucketTok, makeToken, tokInfo } from './tokens';

export type Tool = 'bucket' | 'wall' | 'hidden' | 'frozen' | 'key' | 'lock' | 'tunnel' | 'tunnelq' | 'rod' | 'erase';

/** Parameters of the mechanic tools. */
export interface ToolOptions {
  /** Frozen bucket: how many pops thaw it (1..5). */
  frozen: number;
  /** Key / lock pair number (1..9). */
  pair: number;
  /** Tunnel mouth and rod head direction. */
  dir: Dir;
  /** Rod length in tiles (2..4). */
  rodSize: number;
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = { frozen: 2, pair: 1, dir: 'u', rodSize: 2 };

export const MIN_SIZE = 2;
export const MAX_COLS = 7;
export const MAX_ROWS = 7;
export const MAX_QUEUE = 6;

export const cloneDef = (d: DesignLevel): DesignLevel => JSON.parse(JSON.stringify(d)) as DesignLevel;

/** Everything that changes the analysis result. */
export function levelKey(d: DesignLevel, layer: number): string {
  const art = d.customArt ? `c:${d.customArt.name}:${d.customArt.rows.join('')}` : `a:${d.art}`;
  return JSON.stringify([d.tiles, d.buckets, art, d.slots ?? 5, d.fillSeconds, layer, d.tunnels ?? [], d.rods ?? []]);
}

export function blankLevel(id: number, name: string, art: number, theme = 'meadow'): DesignLevel {
  const cols = 5, rows = 4;
  return {
    id, name, art, theme, fillSeconds: 2.6, slots: 5,
    tiles: Array.from({ length: rows }, () => 'o'.repeat(cols)),
    buckets: Array.from({ length: rows }, () => Array(cols).fill('.')),
  };
}

export function resize(d: DesignLevel, cols: number, rows: number): void {
  const oldRows = d.tiles.length, oldCols = d.tiles[0].length;
  const tiles: string[] = [];
  const buckets: string[][] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    const row: string[] = [];
    for (let c = 0; c < cols; c++) {
      line += r < oldRows && c < oldCols ? d.tiles[r][c] : 'o';
      row.push(r < oldRows && c < oldCols ? d.buckets[r][c] ?? '.' : '.');
    }
    tiles.push(line);
    buckets.push(row);
  }
  d.tiles = tiles;
  d.buckets = buckets;
  // a mechanic that no longer fits on the board goes away with the cells it stood on
  const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols;
  if (d.tunnels) d.tunnels = d.tunnels.filter((t) => inside(t.r, t.c) && inside(t.r + DIR_VEC[t.dir][0], t.c + DIR_VEC[t.dir][1]));
  if (d.rods) d.rods = d.rods.filter((rod) => rodCells(rod).every((x) => inside(x.r, x.c)));
  if (!d.tunnels?.length) delete d.tunnels;
  if (!d.rods?.length) delete d.rods;
  fixTunnelTiles(d);
}

/** The tiles a rod lies over, tail first, head last. */
export function rodCells(rod: RodDef): { r: number; c: number }[] {
  const [dr, dc] = DIR_VEC[rod.dir];
  const out: { r: number; c: number }[] = [];
  for (let k = rod.size - 1; k >= 0; k--) out.push({ r: rod.r - dr * k, c: rod.c - dc * k });
  return out;
}

export const rodAt = (d: DesignLevel, r: number, c: number): number => (d.rods ?? []).findIndex((rod) => rodCells(rod).some((x) => x.r === r && x.c === c));
export const tunnelAt = (d: DesignLevel, r: number, c: number): number => (d.tunnels ?? []).findIndex((t) => t.r === r && t.c === c);

/** A 't' tile with no tunnel (after a resize) becomes void again. */
function fixTunnelTiles(d: DesignLevel): void {
  for (let r = 0; r < d.tiles.length; r++) {
    for (let c = 0; c < d.tiles[0].length; c++) if (d.tiles[r][c] === 't' && tunnelAt(d, r, c) < 0) setTile(d, r, c, '.');
  }
}

const setTile = (d: DesignLevel, r: number, c: number, ch: string) => {
  const s = d.tiles[r];
  d.tiles[r] = s.slice(0, c) + ch + s.slice(c + 1);
};

function removeRod(d: DesignLevel, i: number): void {
  d.rods!.splice(i, 1);
  if (!d.rods!.length) delete d.rods;
}

function removeTunnel(d: DesignLevel, i: number): void {
  const t = d.tunnels![i];
  d.tunnels!.splice(i, 1);
  if (!d.tunnels!.length) delete d.tunnels;
  setTile(d, t.r, t.c, '.');
}

export function applyTool(d: DesignLevel, r: number, c: number, tool: Tool, color: number, opt: ToolOptions = DEFAULT_TOOL_OPTIONS): void {
  const tile = d.tiles[r][c];
  const has = isBucketTok(d.buckets[r][c]);
  const ti = tunnelAt(d, r, c);
  const place = (tok: string) => {
    if (tile === 't' || rodAt(d, r, c) >= 0) return;        // a tunnel mouth or a tile under a rod holds no bucket
    if (tile !== 'o') setTile(d, r, c, 'o');
    d.buckets[r][c] = tok;
  };
  switch (tool) {
    case 'bucket': place(makeToken(color)); break;
    case 'hidden': place(makeToken(color, { mystery: true })); break;
    case 'frozen': place(makeToken(color, { frozen: opt.frozen })); break;
    case 'key': place(makeToken(color, { key: opt.pair })); break;
    case 'lock': place(makeToken(color, { lock: opt.pair })); break;
    case 'wall': {
      if (ti >= 0) removeTunnel(d, ti);
      const ri = rodAt(d, r, c);
      if (ri >= 0) removeRod(d, ri);
      setTile(d, r, c, 'x');
      d.buckets[r][c] = '.';
      break;
    }
    case 'tunnel': {
      if (ti >= 0) { d.tunnels![ti].dir = opt.dir; break; }       // click an existing mouth: turn it
      const ri = rodAt(d, r, c);
      if (ri >= 0) removeRod(d, ri);
      d.buckets[r][c] = '.';
      setTile(d, r, c, 't');
      (d.tunnels ??= []).push({ r, c, dir: opt.dir, queue: [] } as TunnelDef);
      break;
    }
    case 'tunnelq':
      if (ti >= 0 && d.tunnels![ti].queue.length < MAX_QUEUE) d.tunnels![ti].queue.push(color.toString(36));
      break;
    case 'rod': {
      const rod: RodDef = { r, c, dir: opt.dir, size: opt.rodSize };
      const cells = rodCells(rod);
      if (!cells.every((x) => d.tiles[x.r]?.[x.c] === 'o')) break;
      // nothing may stand under a rod, and two rods never share a tile
      for (const x of cells) {
        d.buckets[x.r][x.c] = '.';
        const other = rodAt(d, x.r, x.c);
        if (other >= 0) removeRod(d, other);
      }
      (d.rods ??= []).push(rod);
      break;
    }
    case 'erase': {
      const ri = rodAt(d, r, c);
      if (ri >= 0) removeRod(d, ri);
      else if (ti >= 0) { if (d.tunnels![ti].queue.length) d.tunnels![ti].queue.pop(); else removeTunnel(d, ti); }
      else if (has) d.buckets[r][c] = '.';
      else if (tile === 'x') setTile(d, r, c, 'o');
      else if (tile === 'o') setTile(d, r, c, '.');
      break;
    }
  }
}

/** Mistakes in the mechanics of a level that the game would refuse or that can never be solved. */
export function mechProblems(d: DesignLevel): string[] {
  const out: string[] = [];
  const keys = new Set<number>();
  const locks = new Set<number>();
  for (const row of d.buckets) for (const t of row) if (isBucketTok(t)) { const p = tokInfo(t); if (p.key) keys.add(p.key); if (p.lock) locks.add(p.lock); }
  for (const l of locks) if (!keys.has(l)) out.push(`Khóa ${l} không có xô chìa ${l} — khóa này không bao giờ mở.`);
  (d.tunnels ?? []).forEach((t, i) => {
    const [dr, dc] = DIR_VEC[t.dir];
    if (d.tiles[t.r]?.[t.c] !== 't') out.push(`Hầm ${i + 1} không nằm trên ô hầm.`);
    else if (d.tiles[t.r + dr]?.[t.c + dc] !== 'o') out.push(`Hầm ${i + 1} (hàng ${t.r + 1}, cột ${t.c + 1}) chưa hướng vào ô sàn.`);
  });
  (d.rods ?? []).forEach((rod, i) => {
    const [dr, dc] = DIR_VEC[rod.dir];
    if (!rodCells(rod).every((x) => d.tiles[x.r]?.[x.c] === 'o')) out.push(`Thanh chắn ${i + 1} nằm đè lên ô không phải sàn.`);
    else if (d.tiles[rod.r + dr]?.[rod.c + dc] !== 'o') out.push(`Thanh chắn ${i + 1}: ô trước đầu thanh không phải sàn nên thanh không bao giờ mở.`);
  });
  if (!out.length) {
    try { new Board(d.tiles, d.buckets, d.tunnels, d.rods); } catch (e) { out.push(String(e instanceof Error ? e.message : e)); }
  }
  return out;
}

/**
 * Quantise any picture to the sand colours at 32 x 32.
 * `maxColors` limits how many different colours the picture keeps: the least used colour is merged into the nearest kept one
 * until that many are left. Colours under 1.5 % of the picture are specks (JPEG noise, anti-aliasing) and are merged too.
 * Fewer colours mean fewer buckets and a puzzle the generator can reason about.
 */
export function artFromImage(img: CanvasImageSource, name: string, maxColors = SAND_COLORS.length): ArtSource {
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 32;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#FFF2DC';
  ctx.fillRect(0, 0, 32, 32);
  ctx.drawImage(img, 0, 0, 32, 32);
  const px = ctx.getImageData(0, 0, 32, 32).data;
  const pal = SAND_COLORS.map((c) => [parseInt(c.hex.slice(1, 3), 16), parseInt(c.hex.slice(3, 5), 16), parseInt(c.hex.slice(5, 7), 16)]);
  const dist = (i: number, k: number) => (px[i] - pal[k][0]) ** 2 + (px[i + 1] - pal[k][1]) ** 2 + (px[i + 2] - pal[k][2]) ** 2;
  const nearest = (i: number, allowed: boolean[]) => {
    let best = -1, bd = Infinity;
    for (let k = 0; k < pal.length; k++) {
      if (!allowed[k]) continue;
      const d = dist(i, k);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };
  const assign = (allowed: boolean[]) => {
    const ids = new Array<number>(1024);
    const counts = new Array<number>(pal.length).fill(0);
    for (let n = 0; n < 1024; n++) { ids[n] = nearest(n * 4, allowed); counts[ids[n]]++; }
    return { ids, counts };
  };
  let allowed = pal.map(() => true);
  let cur = assign(allowed);
  const keep = Math.max(2, Math.min(pal.length, Math.round(maxColors)));
  // drop the least used colour while there are too many, or while a colour is only a speck
  for (let guard = 0; guard < pal.length; guard++) {
    const used = cur.counts.map((n, k) => [n, k]).filter(([n]) => n > 0).sort((a, b) => a[0] - b[0]);
    if (used.length <= 2) break;
    const [n, k] = used[0];
    if (used.length > keep || n < 1024 * 0.015) { allowed = allowed.slice(); allowed[k] = false; cur = assign(allowed); }
    else break;
  }
  const rows: string[] = [];
  for (let y = 0; y < 32; y++) {
    let s = '';
    for (let x = 0; x < 32; x++) s += cur.ids[y * 32 + x].toString(36);
    rows.push(s);
  }
  return { name: name.slice(0, 18) || 'Ảnh tải lên', w: 32, h: 32, rows };
}
