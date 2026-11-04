import type { ArtSource } from '../core/art-data';
import { SAND_COLORS } from '../core/palette';
import type { DesignLevel } from './analyze';

export type Tool = 'bucket' | 'wall' | 'hidden' | 'erase';

export const MIN_SIZE = 2;
export const MAX_COLS = 7;
export const MAX_ROWS = 7;

export const cloneDef = (d: DesignLevel): DesignLevel => JSON.parse(JSON.stringify(d)) as DesignLevel;

/** Everything that changes the analysis result. */
export function levelKey(d: DesignLevel, layer: number): string {
  const art = d.customArt ? `c:${d.customArt.name}:${d.customArt.rows.join('')}` : `a:${d.art}`;
  return JSON.stringify([d.tiles, d.buckets, art, d.slots ?? 5, d.fillSeconds, layer]);
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
}

const setTile = (d: DesignLevel, r: number, c: number, ch: string) => {
  const s = d.tiles[r];
  d.tiles[r] = s.slice(0, c) + ch + s.slice(c + 1);
};

export function applyTool(d: DesignLevel, r: number, c: number, tool: Tool, color: number): void {
  const tile = d.tiles[r][c];
  const has = d.buckets[r][c] !== '.' && d.buckets[r][c] !== ' ';
  switch (tool) {
    case 'bucket':
    case 'hidden':
      if (tile !== 'o') setTile(d, r, c, 'o');
      d.buckets[r][c] = (tool === 'hidden' ? '?' : '') + color.toString(36);
      break;
    case 'wall':
      setTile(d, r, c, 'x');
      d.buckets[r][c] = '.';
      break;
    case 'erase':
      if (has) d.buckets[r][c] = '.';
      else if (tile === 'x') setTile(d, r, c, 'o');
      else if (tile === 'o') setTile(d, r, c, '.');
      break;
  }
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
