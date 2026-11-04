import { DIR_VEC, type Dir } from '../core/grid';
import type { Rng } from '../core/rng';
import type { DesignLevel } from './analyze';
import { MAX_ROWS, rodCells } from './model';
import { isBucketTok, isPlain, makeToken, tokColor, tokInfo } from './tokens';

/** How many of each mechanic the generator should put in the level (0 = none). */
export interface MechCounts { hidden: number; tunnel: number; frozen: number; rod: number; key: number }
export const NO_MECH: MechCounts = { hidden: 0, tunnel: 0, frozen: 0, rod: 0, key: 0 };

const DIRS: Dir[] = ['u', 'd', 'l', 'r'];

const setTile = (d: DesignLevel, r: number, c: number, ch: string) => {
  d.tiles[r] = d.tiles[r].slice(0, c) + ch + d.tiles[r].slice(c + 1);
};

export interface Structure {
  def: DesignLevel;
  /** Buckets that will wait inside tunnels (they come on top of the buckets on the board). */
  queueCount: number;
  notes: string[];
}

/**
 * Tunnels and rods change the board itself, so they go in before the buckets are placed.
 *  - a tunnel mouth is a non-floor tile next to a floor tile (a free void tile, or a new row under the board) facing that tile;
 *  - a rod lies over 2-3 floor tiles below the first row, and the tile in front of its head is a floor tile.
 * Tiles under rods and the queue of every tunnel are filled later (place / fillQueues).
 */
export function addStructure(base: DesignLevel, mech: MechCounts, rng: Rng): Structure {
  const d: DesignLevel = JSON.parse(JSON.stringify(base)) as DesignLevel;
  delete d.tunnels;
  delete d.rods;
  const notes: string[] = [];
  let queueCount = 0;

  // an old 't' tile of the board we start from is not kept: tunnels are generated fresh
  for (let r = 0; r < d.tiles.length; r++) d.tiles[r] = d.tiles[r].replace(/t/g, '.');

  if (mech.tunnel > 0) {
    const cols = d.tiles[0].length;
    const candidates = (): { r: number; c: number; dir: Dir }[] => {
      const out: { r: number; c: number; dir: Dir }[] = [];
      for (let r = 0; r < d.tiles.length; r++) {
        for (let c = 0; c < cols; c++) {
          if (d.tiles[r][c] !== '.') continue;
          for (const dir of DIRS) {
            const [dr, dc] = DIR_VEC[dir];
            if (d.tiles[r + dr]?.[c + dc] === 'o') out.push({ r, c, dir });
          }
        }
      }
      return out;
    };
    const qLen = mech.tunnel === 1 ? 3 : 2;
    let placed = 0;
    for (let i = 0; i < mech.tunnel; i++) {
      let cand = candidates().filter((x) => !(d.tunnels ?? []).some((t) => t.r + DIR_VEC[t.dir][0] === x.r + DIR_VEC[x.dir][0] && t.c + DIR_VEC[t.dir][1] === x.c + DIR_VEC[x.dir][1]));
      if (!cand.length && d.tiles.length < MAX_ROWS) {
        d.tiles.push('.'.repeat(cols));
        d.buckets.push(Array(cols).fill('.'));
        cand = candidates().filter((x) => x.r === d.tiles.length - 1);
      }
      if (!cand.length) break;
      // prefer mouths that do not sit on the row of the belt, and spread them over the board
      const pick = cand[rng.int(cand.length)];
      setTile(d, pick.r, pick.c, 't');
      (d.tunnels ??= []).push({ r: pick.r, c: pick.c, dir: pick.dir, queue: Array(qLen).fill('0') });
      queueCount += qLen;
      placed++;
    }
    if (placed < mech.tunnel) notes.push(`Chỉ đặt được ${placed}/${mech.tunnel} hầm (bàn không còn chỗ cho miệng hầm).`);
  }

  if (mech.rod > 0) {
    const rows = d.tiles.length, cols = d.tiles[0].length;
    let placed = 0;
    const frontOfTunnel = (r: number, c: number) => (d.tunnels ?? []).some((t) => t.r + DIR_VEC[t.dir][0] === r && t.c + DIR_VEC[t.dir][1] === c);
    for (let i = 0; i < mech.rod; i++) {
      for (let tries = 0; tries < 80; tries++) {
        const dir = DIRS[rng.int(4)];
        const size = rng.chance(0.4) && cols >= 5 ? 3 : 2;
        const r = 1 + rng.int(Math.max(1, rows - 1)), c = rng.int(cols);
        const rod = { r, c, dir, size };
        const cells = rodCells(rod);
        if (!cells.every((x) => x.r >= 1 && d.tiles[x.r]?.[x.c] === 'o' && !frontOfTunnel(x.r, x.c))) continue;
        if (cells.some((x) => (d.rods ?? []).some((o) => rodCells(o).some((y) => y.r === x.r && y.c === x.c)))) continue;
        const [dr, dc] = DIR_VEC[dir];
        const fr = r + dr, fc = c + dc;
        if (d.tiles[fr]?.[fc] !== 'o' || cells.some((x) => x.r === fr && x.c === fc)) continue;
        if ((d.rods ?? []).some((o) => rodCells(o).some((y) => y.r === fr && y.c === fc))) continue;
        (d.rods ??= []).push(rod);
        placed++;
        break;
      }
    }
    if (placed < mech.rod) notes.push(`Chỉ đặt được ${placed}/${mech.rod} thanh chắn (bàn quá nhỏ hoặc thiếu ô sàn).`);
  }
  return { def: d, queueCount, notes };
}

/** Floor tiles that can hold a bucket: not under a rod. */
export function bucketCells(d: DesignLevel): [number, number][] {
  const under = new Set<string>();
  for (const rod of d.rods ?? []) for (const x of rodCells(rod)) under.add(`${x.r},${x.c}`);
  const out: [number, number][] = [];
  for (let r = 0; r < d.tiles.length; r++) for (let c = 0; c < d.tiles[0].length; c++) if (d.tiles[r][c] === 'o' && !under.has(`${r},${c}`)) out.push([r, c]);
  return out;
}

/** Put the colours into the tunnel queues, in order. */
export function fillQueues(d: DesignLevel, colors: number[]): void {
  let i = 0;
  for (const t of d.tunnels ?? []) t.queue = t.queue.map(() => (colors[i++ % colors.length] ?? 0).toString(36));
}

/**
 * Marks on buckets that are already placed: frozen, key / lock pairs and hidden (?). Every mark lands on a different plain
 * bucket. Keys go near the belt and locks deeper, so a key can be reached before the lock it opens.
 */
export function applyMarks(d: DesignLevel, mech: MechCounts, rng: Rng): string[] {
  const notes: string[] = [];
  const cells: [number, number][] = [];
  for (let r = 0; r < d.tiles.length; r++) for (let c = 0; c < d.tiles[0].length; c++) if (isBucketTok(d.buckets[r][c]) && isPlain(d.buckets[r][c])) cells.push([r, c]);
  const free = rng.shuffle(cells.slice());
  const take = (pred: (r: number, c: number) => boolean): [number, number] | null => {
    const i = free.findIndex(([r, c]) => pred(r, c));
    return i < 0 ? null : free.splice(i, 1)[0];
  };
  const set = (cell: [number, number], o: { mystery?: boolean; frozen?: number; key?: number; lock?: number }) => {
    d.buckets[cell[0]][cell[1]] = makeToken(tokColor(d.buckets[cell[0]][cell[1]]), o);
  };
  const front = Math.min(1, d.tiles.length - 1);
  for (let k = 1; k <= mech.key; k++) {
    const key = take((r) => r <= front + 1) ?? take(() => true);
    const lock = take((r) => r >= 2) ?? take(() => true);
    if (!key || !lock) { notes.push(`Chỉ đặt được ${k - 1}/${mech.key} cặp chìa/khóa (không đủ xô).`); break; }
    set(key, { key: k });
    set(lock, { lock: k });
  }
  for (let k = 0; k < mech.frozen; k++) {
    const cell = take(() => true);
    if (!cell) { notes.push(`Chỉ đặt được ${k}/${mech.frozen} xô băng (không đủ xô).`); break; }
    set(cell, { frozen: 1 + rng.int(3) });
  }
  for (let k = 0; k < mech.hidden; k++) {
    const cell = take((r) => r >= 1) ?? take(() => true);
    if (!cell) { notes.push(`Chỉ đặt được ${k}/${mech.hidden} xô ẩn (không đủ xô).`); break; }
    set(cell, { mystery: true });
  }
  return notes;
}

/** Counts of every mechanic on a level (for the result panel). */
export function mechSummary(d: DesignLevel): MechCounts {
  const out = { ...NO_MECH };
  const keys = new Set<number>();
  for (const row of d.buckets) for (const t of row) {
    if (!isBucketTok(t)) continue;
    const p = tokInfo(t);
    if (p.mystery) out.hidden++;
    if (p.frozen) out.frozen++;
    if (p.key) keys.add(p.key);
  }
  out.key = keys.size;
  out.tunnel = d.tunnels?.length ?? 0;
  out.rod = d.rods?.length ?? 0;
  return out;
}
