import { ART_SOURCES, type ArtSource } from '../core/art-data';
import { GRAINS_PER_PIXEL, DEFAULT_SLOTS, LANE, SIM_HZ } from '../core/config';
import { columnWindowX } from '../core/game';
import type { LevelDef } from '../core/levels';
import { COLOR_COUNT } from '../core/palette';
import { DIR_VEC, parseToken } from '../core/grid';
import { Rng } from '../core/rng';

/**
 * Fast "settled-state" model of the real game, for searching thousands of layouts.
 *
 * One decision = tap one open bucket. After a tap the belt keeps running until nothing more can be picked up
 * ("settle"). The player may always wait, so a settled state with no useful move is a real loss.
 *
 * It follows the rules of the real simulation, minus what is expensive to simulate:
 *   - sand is kept per column as runs of one colour, bottom to top. A bucket reaches a grain of its colour that sits under
 *     fewer than `layer` grains of other colours (LANE.layerGrains), exactly like SandSim.reach;
 *   - sideways slumping and the real-time belt speed are ignored;
 *   - bucket sizes are the real ones: the buckets of a colour share that colour's sand exactly (bucketCaps).
 * It is about two orders of magnitude faster than Game.clone + settle, so the generator can walk the whole decision graph.
 * Whatever it picks is still verified against the real game (analyze / evaluate).
 */

// ───────────────────────────── static sand ─────────────────────────────
export class SandModel {
  readonly w: number;
  readonly layer: number;
  /** Per column: [colour, grains, colour, grains, ...] bottom to top. */
  readonly init: Uint8Array[] = [];
  readonly colorTotal = new Int32Array(COLOR_COUNT);
  total = 0;
  k1 = 0;
  k2 = 0;

  constructor(art: ArtSource, layer: number) {
    const k = GRAINS_PER_PIXEL;
    this.w = art.w * k;
    this.layer = layer <= 0 ? 1e9 : layer;
    for (let ax = 0; ax < art.w; ax++) {
      const runs: number[] = [];
      for (let ay = art.h - 1; ay >= 0; ay--) {
        const id = parseInt(art.rows[ay][ax], 36);
        this.colorTotal[id] += k * k;
        this.total += k * k;
        if (runs.length && runs[runs.length - 2] === id) runs[runs.length - 1] += k;
        else runs.push(id, k);
      }
      const col = Uint8Array.from(runs);
      for (let dx = 0; dx < k; dx++) this.init.push(col);
    }
    for (let x = 0; x < this.w; x++) {
      const h = colHash(x, this.init[x]);
      this.k1 = (this.k1 ^ h) >>> 0;
      this.k2 = (this.k2 + h) >>> 0;
    }
  }
}

function colHash(x: number, col: Uint8Array): number {
  let h = (2166136261 ^ Math.imul(x + 1, 0x9e3779b1)) >>> 0;
  for (let i = 0; i < col.length; i++) h = Math.imul(h ^ col[i], 16777619);
  return h >>> 0;
}

const sandCache = new Map<string, SandModel>();
export function sandFor(artIndex: number, layer: number): SandModel {
  const art = ART_SOURCES[artIndex];
  const key = `${artIndex}:${art.name}:${layer}`;
  let m = sandCache.get(key);
  if (!m) { m = new SandModel(art, layer); sandCache.set(key, m); }
  return m;
}

// ───────────────────────────── board + buckets ─────────────────────────────
export class Puzzle {
  readonly rows: number;
  readonly cols: number;
  readonly cells: number;
  readonly floor: Uint8Array;
  readonly nb: number;
  readonly bColor: Int16Array;
  /** The tile a bucket stands on (for a bucket inside a tunnel: the tile in front of the mouth). */
  readonly bCell: Int16Array;
  readonly bMystery: Uint8Array;
  readonly bFrozen0: Uint8Array;
  readonly bKey: Uint8Array;
  readonly bLock: Uint8Array;
  readonly bQueued0: Uint8Array;
  readonly bCap: Int32Array;
  /** Sand column a bucket lands over, and grains it takes from each column it passes. */
  readonly bStart: Int16Array;
  readonly bPerCol: Int32Array;
  readonly slots: number;
  readonly nbr: number[][];
  readonly maxCap: number;
  readonly maxColor: number;
  /** Tunnels: the tile in front of the mouth and the bucket ids inside, next one first. */
  readonly tFront: number[] = [];
  readonly tQueue: number[][] = [];
  /** Rods: the tiles they lie over and the tile in front of the head. */
  readonly rCells: number[][] = [];
  readonly rFront: number[] = [];
  /** Per tile: index of the rod lying over it, -1 if none. */
  readonly rodOf: Int8Array;

  /** `def` must already be prepared (art index valid). Same bucket order as the core Board: board tiles, then tunnel queues. */
  constructor(def: LevelDef, readonly sand: SandModel) {
    this.rows = def.tiles.length;
    this.cols = def.tiles[0].length;
    this.cells = this.rows * this.cols;
    this.floor = new Uint8Array(this.cells);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) this.floor[r * this.cols + c] = def.tiles[r][c] === 'o' ? 1 : 0;
    const color: number[] = [], cell: number[] = [], mys: number[] = [], fro: number[] = [], key: number[] = [], lock: number[] = [], que: number[] = [];
    const add = (tok: string, at: number, queued: boolean) => {
      const t = parseToken(tok);
      color.push(t.color); cell.push(at); mys.push(t.mystery ? 1 : 0); fro.push(t.frozen); key.push(t.key); lock.push(t.lock); que.push(queued ? 1 : 0);
    };
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tok = def.buckets[r]?.[c] ?? '.';
        if (tok === '.' || tok === ' ') continue;
        if (!this.floor[r * this.cols + c]) throw new Error(`bucket on non-floor tile at ${r},${c}`);
        add(tok, r * this.cols + c, false);
      }
    }
    for (const d of def.tunnels ?? []) {
      const [dr, dc] = DIR_VEC[d.dir];
      const fr = d.r + dr, fc = d.c + dc;
      if (def.tiles[d.r]?.[d.c] !== 't') throw new Error(`tunnel on a tile that is not 't' at ${d.r},${d.c}`);
      if (def.tiles[fr]?.[fc] !== 'o') throw new Error(`tunnel at ${d.r},${d.c} does not face a floor tile`);
      const front = fr * this.cols + fc;
      const ids: number[] = [];
      for (const tok of d.queue) { ids.push(color.length); add(tok, front, true); }
      this.tFront.push(front);
      this.tQueue.push(ids);
    }
    this.rodOf = new Int8Array(this.cells).fill(-1);
    (def.rods ?? []).forEach((d, i) => {
      const [dr, dc] = DIR_VEC[d.dir];
      const cs: number[] = [];
      for (let k = d.size - 1; k >= 0; k--) {
        const r = d.r - dr * k, c = d.c - dc * k;
        if (def.tiles[r]?.[c] !== 'o') throw new Error(`rod over a non-floor tile at ${r},${c}`);
        cs.push(r * this.cols + c);
      }
      for (const x of cs) {
        if (cell.some((cc, j) => cc === x && !que[j])) throw new Error('a bucket stands under a rod');
        this.rodOf[x] = i;
      }
      this.rCells.push(cs);
      const fr = d.r + dr, fc = d.c + dc;
      this.rFront.push(fr >= 0 && fc >= 0 && fr < this.rows && fc < this.cols ? fr * this.cols + fc : -1);
    });
    this.nb = color.length;
    this.bColor = Int16Array.from(color);
    this.bCell = Int16Array.from(cell);
    this.bMystery = Uint8Array.from(mys);
    this.bFrozen0 = Uint8Array.from(fro);
    this.bKey = Uint8Array.from(key);
    this.bLock = Uint8Array.from(lock);
    this.bQueued0 = Uint8Array.from(que);
    this.slots = def.slots ?? DEFAULT_SLOTS;
    // bucketCaps: the buckets of one colour share its sand, sizes differ by at most one grain
    this.bCap = new Int32Array(this.nb);
    const byColor = new Map<number, number[]>();
    for (let b = 0; b < this.nb; b++) { const l = byColor.get(color[b]); if (l) l.push(b); else byColor.set(color[b], [b]); }
    for (const [c, ids] of byColor) {
      const total = sand.colorTotal[c] ?? 0;
      const base = Math.floor(total / ids.length);
      const extra = total - base * ids.length;
      ids.forEach((id, j) => (this.bCap[id] = base + (j < extra ? 1 : 0)));
    }
    const W = sand.w;
    const colsPerTick = (LANE.speed * W) / SIM_HZ;
    const fillSeconds = def.fillSeconds || 2.6;
    this.bStart = new Int16Array(this.nb);
    this.bPerCol = new Int32Array(this.nb);
    for (let b = 0; b < this.nb; b++) {
      const col = cell[b] % this.cols;
      this.bStart[b] = Math.max(0, Math.min(W - 1, Math.round(columnWindowX(col, this.cols) * W)));
      const rate = Math.max(1, Math.ceil(this.bCap[b] / (fillSeconds * SIM_HZ)));
      this.bPerCol[b] = Math.max(1, Math.round(rate / colsPerTick));
    }
    this.maxCap = Math.max(1, ...this.bCap);
    this.maxColor = Math.max(1, ...sand.colorTotal);
    this.nbr = [];
    for (let i = 0; i < this.cells; i++) {
      const r = Math.floor(i / this.cols), c = i % this.cols;
      const l: number[] = [];
      for (const [dr, dc] of [[-1, 0], [0, -1], [0, 1], [1, 0]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < this.rows && nc < this.cols && this.floor[nr * this.cols + nc]) l.push(nr * this.cols + nc);
      }
      this.nbr.push(l);
    }
  }
}

// ───────────────────────────── state ─────────────────────────────
export interface St {
  /** per bucket: 0 on the board, 1 on the belt, 2 done, 4 still inside a tunnel */
  where: Uint8Array;
  rev: Uint8Array;
  frozen: Uint8Array;
  locked: Uint8Array;
  tunPtr: Uint8Array;
  rodOpen: Uint8Array;
  belt: Uint8Array;
  beltN: number;
  fill: Int32Array;
  cols: Uint8Array[];
  own: Uint8Array;
  colorLeft: Int32Array;
  sandLeft: number;
  k1: number;
  k2: number;
  taps: number;
}

function clone(s: St): St {
  return {
    where: s.where.slice(), rev: s.rev.slice(), frozen: s.frozen.slice(), locked: s.locked.slice(), tunPtr: s.tunPtr.slice(), rodOpen: s.rodOpen.slice(),
    belt: s.belt.slice(), beltN: s.beltN, fill: s.fill.slice(),
    cols: s.cols.slice(), own: new Uint8Array(s.own.length), colorLeft: s.colorLeft.slice(), sandLeft: s.sandLeft,
    k1: s.k1, k2: s.k2, taps: s.taps,
  };
}

function occupancy(p: Puzzle, s: St): Int16Array {
  const occ = new Int16Array(p.cells).fill(-1);
  for (let b = 0; b < p.nb; b++) if (s.where[b] === 0) occ[p.bCell[b]] = b;
  return occ;
}

/** A floor tile nothing stands or lies on (a closed rod counts as lying on it). */
function isFree(p: Puzzle, s: St, occ: Int16Array, cell: number): boolean {
  if (!p.floor[cell] || occ[cell] >= 0) return false;
  const r = p.rodOf[cell];
  return r < 0 || s.rodOpen[r] === 1;
}

/**
 * The board reacts to a tile that just emptied, until nothing changes (same order as Board.settle):
 * a rod whose front tile is free slides out for good; a tunnel whose front tile is free pushes out its next bucket;
 * a mystery bucket with a free neighbouring tile shows its colour.
 */
function boardSettle(p: Puzzle, s: St): void {
  const occ = occupancy(p, s);
  for (let guard = 0; guard < 64; guard++) {
    let changed = false;
    for (let i = 0; i < p.rCells.length; i++) {
      if (s.rodOpen[i] || p.rFront[i] < 0) continue;
      if (isFree(p, s, occ, p.rFront[i])) { s.rodOpen[i] = 1; changed = true; }
    }
    for (let t = 0; t < p.tFront.length; t++) {
      if (s.tunPtr[t] >= p.tQueue[t].length || !isFree(p, s, occ, p.tFront[t])) continue;
      const b = p.tQueue[t][s.tunPtr[t]++];
      s.where[b] = 0;
      occ[p.bCell[b]] = b;
      changed = true;
    }
    for (let b = 0; b < p.nb; b++) {
      if (s.where[b] !== 0 || s.rev[b]) continue;
      for (const n of p.nbr[p.bCell[b]]) if (isFree(p, s, occ, n)) { s.rev[b] = 1; changed = true; break; }
    }
    if (!changed) break;
  }
}

export function initial(p: Puzzle): St {
  const w = p.sand.w;
  const s: St = {
    where: new Uint8Array(p.nb), rev: new Uint8Array(p.nb), frozen: p.bFrozen0.slice(), locked: new Uint8Array(p.nb),
    tunPtr: new Uint8Array(p.tFront.length), rodOpen: new Uint8Array(p.rCells.length),
    belt: new Uint8Array(p.nb), beltN: 0, fill: new Int32Array(p.nb),
    cols: p.sand.init.slice(), own: new Uint8Array(w), colorLeft: p.sand.colorTotal.slice(), sandLeft: p.sand.total,
    k1: p.sand.k1, k2: p.sand.k2, taps: 0,
  };
  for (let b = 0; b < p.nb; b++) {
    s.rev[b] = p.bMystery[b] ? 0 : 1;
    s.locked[b] = p.bLock[b] > 0 ? 1 : 0;
    s.where[b] = p.bQueued0[b] ? 4 : 0;
  }
  boardSettle(p, s);
  return s;
}

export const won = (s: St): boolean => s.sandLeft === 0;

/** Buckets a player could tap now: colour known, not frozen or locked, and a way of free floor to row 0. Needs a free belt slot. */
export function openMoves(p: Puzzle, s: St): number[] {
  if (s.sandLeft === 0 || s.beltN >= p.slots) return [];
  const occ = occupancy(p, s);
  const flood = new Uint8Array(p.cells);
  const q: number[] = [];
  for (let c = 0; c < p.cols; c++) if (isFree(p, s, occ, c)) { flood[c] = 1; q.push(c); }
  for (let i = 0; i < q.length; i++) {
    for (const n of p.nbr[q[i]]) if (!flood[n] && isFree(p, s, occ, n)) { flood[n] = 1; q.push(n); }
  }
  const out: number[] = [];
  for (let b = 0; b < p.nb; b++) {
    if (s.where[b] !== 0 || !s.rev[b] || s.frozen[b] > 0 || s.locked[b]) continue;
    const cell = p.bCell[b];
    if (cell < p.cols) { out.push(b); continue; }
    for (const n of p.nbr[cell]) if (flood[n]) { out.push(b); break; }
  }
  return out;
}

function takeCol(p: Puzzle, s: St, x: number, colour: number, max: number): number {
  let taken = 0;
  const L = p.sand.layer;
  while (taken < max) {
    const col = s.cols[x];
    let depth = 0, idx = -1;
    for (let i = 0; i < col.length; i += 2) {
      if (depth >= L) break;
      if (col[i] === colour) { idx = i; break; }
      depth += col[i + 1];
    }
    if (idx < 0) break;
    const n = Math.min(max - taken, col[idx + 1]);
    const oh = colHash(x, col);
    let nc: Uint8Array;
    if (n < col[idx + 1]) {
      nc = s.own[x] ? col : col.slice();
      nc[idx + 1] -= n;
    } else {
      const merge = idx > 0 && idx + 2 < col.length && col[idx - 2] === col[idx + 2];
      nc = new Uint8Array(col.length - (merge ? 4 : 2));
      let o = 0;
      for (let j = 0; j < col.length; j += 2) {
        if (j === idx) continue;
        if (merge && j === idx + 2) { nc[o - 1] += col[j + 1]; continue; }
        nc[o++] = col[j]; nc[o++] = col[j + 1];
      }
    }
    s.cols[x] = nc;
    s.own[x] = 1;
    const nh = colHash(x, nc);
    s.k1 = (s.k1 ^ oh ^ nh) >>> 0;
    s.k2 = (s.k2 + nh - oh) >>> 0;
    taken += n;
  }
  return taken;
}

/**
 * A bucket on the belt picks as it rides the lane: it lands over the column it came from and sweeps right, taking a few
 * grains from every column it passes (`bPerCol`), and goes round again from the left end until it is full. Partial picks therefore
 * empty a stretch of columns, which is what uncovers the colours below them.
 */
function takeGrains(p: Puzzle, s: St, colour: number, need: number, b: number): number {
  let got = 0;
  const W = p.sand.w;
  const perCol = p.bPerCol[b];
  let pass = 0;
  for (;;) {
    const before = got;
    for (let x = pass === 0 ? p.bStart[b] : 0; x < W && got < need; x++) got += takeCol(p, s, x, colour, Math.min(perCol, need - got));
    if (got >= need) break;
    if (pass > 0 && got === before) break;
    pass++;
  }
  s.colorLeft[colour] -= got;
  s.sandLeft -= got;
  return got;
}

/** A bucket filled and popped: frozen buckets count it down, a key bucket opens the locks of its pair. */
function onPop(p: Puzzle, s: St, popped: number): void {
  for (let j = 0; j < p.nb; j++) if (j !== popped && s.where[j] === 0 && s.frozen[j] > 0) s.frozen[j]--;
  const key = p.bKey[popped];
  if (key > 0) for (let j = 0; j < p.nb; j++) if (s.where[j] === 0 && s.locked[j] && p.bLock[j] === key) s.locked[j] = 0;
}

function settle(p: Puzzle, s: St): void {
  let progress: boolean;
  do {
    progress = false;
    for (let i = 0; i < s.beltN; i++) {
      const b = s.belt[i];
      const need = p.bCap[b] - s.fill[b];
      if (need <= 0) continue;
      const got = takeGrains(p, s, p.bColor[b], need, b);
      if (got > 0) { s.fill[b] += got; progress = true; }
    }
    let w = 0;
    const popped: number[] = [];
    for (let i = 0; i < s.beltN; i++) {
      const b = s.belt[i];
      if (s.fill[b] >= p.bCap[b]) { s.where[b] = 2; popped.push(b); }
      else s.belt[w++] = b;
    }
    s.beltN = w;
    for (const b of popped) onPop(p, s, b);
  } while (progress);
  // nothing left to wait for and nothing to tap: the game thaws every frozen bucket (a countdown never loses a level)
  if (s.sandLeft > 0 && s.frozen.some((f, j) => f > 0 && s.where[j] === 0) && openMoves(p, s).length === 0) {
    for (let j = 0; j < p.nb; j++) if (s.where[j] === 0) s.frozen[j] = 0;
  }
}

export function tap(p: Puzzle, src: St, b: number): St {
  const s = clone(src);
  s.taps++;
  s.where[b] = 1;
  s.belt[s.beltN++] = b;
  boardSettle(p, s);
  settle(p, s);
  return s;
}

export function stateKey(p: Puzzle, s: St): string {
  let a = s.k1 | 0, c = s.k2 | 0;
  const mix = (v: number) => { a = Math.imul(a ^ v, 16777619); c = Math.imul(c + v, 0x85ebca6b) ^ (c >>> 13); };
  for (let b = 0; b < p.nb; b++) mix(s.where[b] + 1 + (s.rev[b] << 3) + (s.locked[b] << 4) + (s.frozen[b] << 5));
  for (let t = 0; t < s.tunPtr.length; t++) mix(s.tunPtr[t] + 77);
  for (let r = 0; r < s.rodOpen.length; r++) mix(s.rodOpen[r] + 91);
  const bl: number[] = [];
  for (let i = 0; i < s.beltN; i++) bl.push(s.belt[i] * 20000 + s.fill[s.belt[i]]);
  bl.sort((x, y) => x - y);
  for (const v of bl) mix(v);
  return `${a >>> 0}.${c >>> 0}`;
}

/** Colours a bucket of this colour could pick right now. */
export function exposed(p: Puzzle, s: St, colour: number): boolean {
  const L = p.sand.layer;
  for (let x = 0; x < p.sand.w; x++) {
    const col = s.cols[x];
    let depth = 0;
    for (let i = 0; i < col.length; i += 2) {
      if (depth >= L) break;
      if (col[i] === colour) return true;
      depth += col[i + 1];
    }
  }
  return false;
}

// ───────────────────────────── decision graph ─────────────────────────────
export type PathClass = 'unsolvable' | 'unknown' | 'easy' | 'guided' | 'medium' | 'hard' | 'super';

export interface LineInfo {
  color: number;
  buckets: number[];
  winnable: boolean;
  visibility: number;
  /** taps the player can still make after taking a stuck line (-1 for a winning line) */
  doom: number;
}

export interface DecisionInfo {
  depth: number;
  lines: LineInfo[];
  stuckLines: number;
  winLines: number;
}

class Node {
  win = false;
  winnable = false;
  unknown = false;
  pRand = 0;
  doom = 0;
  moves: number[] = [];
  vis: number[] = [];
  next: Node[] = [];
}

export interface PathReport {
  truncated: boolean;
  nodes: number;
  winnableNodes: number;
  deadEnds: number;
  solvable: boolean;
  randomWin: number;
  start: DecisionInfo;
  critical: DecisionInfo[];
  freeChoiceStates: number;
  decisionStates: number;
  avgLines: number;
  maxLinesAtCritical: number;
  baitVisible: boolean;
  maxDoom: number;
  /** safest winning line, as bucket ids */
  winningTaps: number[];
  cls: PathClass;
  ms: number;
}

/** How tempting a tap looks to a player who has not solved the level: a big colour, near the belt, a big bucket. */
export function visibility(p: Puzzle, b: number): number {
  const share = p.sand.colorTotal[p.bColor[b]] / p.maxColor;
  const near = 1 / (Math.floor(p.bCell[b] / p.cols) + 1);
  return 0.45 * share + 0.3 * near + 0.25 * (p.bCap[b] / p.maxCap);
}

function describe(p: Puzzle, n: Node, depth: number): DecisionInfo {
  const groups = new Map<number, LineInfo>();
  const lines: LineInfo[] = [];
  for (let i = 0; i < n.moves.length; i++) {
    const b = n.moves[i], c = p.bColor[b];
    let li = groups.get(c);
    if (!li) { li = { color: c, buckets: [], winnable: false, visibility: 0, doom: -1 }; groups.set(c, li); lines.push(li); }
    li.buckets.push(b);
    li.visibility = Math.max(li.visibility, n.vis[i]);
    if (n.next[i].winnable) li.winnable = true;
    else li.doom = Math.max(li.doom, n.next[i].doom);
  }
  for (const li of lines) if (li.winnable) li.doom = -1;
  const stuckLines = lines.filter((l) => !l.winnable).length;
  return { depth, lines, stuckLines, winLines: lines.length - stuckLines };
}

export interface GraphOptions { maxNodes: number; maxMs?: number }

export function analyzeGraph(p: Puzzle, o: GraphOptions): PathReport {
  const t0 = performance.now();
  const memo = new Map<string, Node>();
  let truncated = false;
  const deadline = o.maxMs ? t0 + o.maxMs : Infinity;

  const explore = (s: St): Node => {
    const key = stateKey(p, s);
    const hit = memo.get(key);
    if (hit) return hit;
    const node = new Node();
    memo.set(key, node);
    if (won(s)) { node.win = node.winnable = true; node.pRand = 1; return node; }
    if (memo.size > o.maxNodes || (memo.size & 63) === 0 && performance.now() > deadline) {
      truncated = true; node.unknown = true; node.winnable = true; node.pRand = 0.5;
      return node;
    }
    const moves = openMoves(p, s);
    if (moves.length === 0) return node;
    node.moves = moves;
    node.vis = moves.map((b) => visibility(p, b));
    let sum = 0, doom = 0;
    for (const b of moves) {
      const ch = explore(tap(p, s, b));
      node.next.push(ch);
      if (ch.winnable) node.winnable = true;
      sum += ch.pRand;
      doom = Math.max(doom, 1 + ch.doom);
    }
    node.pRand = sum / moves.length;
    node.doom = node.winnable ? 0 : doom;
    return node;
  };

  const root = explore(initial(p));
  const rep: PathReport = {
    truncated, nodes: memo.size, winnableNodes: 0, deadEnds: 0, solvable: root.winnable, randomWin: root.pRand,
    start: describe(p, root, 0), critical: [], freeChoiceStates: 0, decisionStates: 0, avgLines: 0, maxLinesAtCritical: 0,
    baitVisible: false, maxDoom: 0, winningTaps: [], cls: 'unknown', ms: 0,
  };
  for (const n of memo.values()) {
    if (n.winnable) rep.winnableNodes++;
    else if (n.moves.length === 0 && !n.unknown) rep.deadEnds++;
  }
  // every winnable state a player can still be "in play" on
  let lineTotal = 0, lineStates = 0;
  const seen = new Set<Node>([root]);
  const queue: [Node, number][] = [[root, 0]];
  for (let qi = 0; qi < queue.length; qi++) {
    const [n, depth] = queue[qi];
    if (!n.winnable || n.win || n.moves.length === 0) continue;
    const info = describe(p, n, depth);
    if (info.lines.length >= 2) {
      rep.decisionStates++;
      if (info.winLines >= 2) rep.freeChoiceStates++;
      lineTotal += info.lines.length; lineStates++;
    }
    if (info.stuckLines > 0) rep.critical.push(info);
    for (const c of n.next) if (c.winnable && !c.win && !seen.has(c)) { seen.add(c); queue.push([c, depth + 1]); }
  }
  rep.avgLines = lineStates ? lineTotal / lineStates : 0;
  if (rep.critical.length) {
    const c0 = rep.critical[0];
    const stuck = c0.lines.filter((l) => !l.winnable), win = c0.lines.filter((l) => l.winnable);
    rep.baitVisible = stuck.length > 0 && win.length > 0 && Math.max(...stuck.map((l) => l.visibility)) > Math.max(...win.map((l) => l.visibility));
    rep.maxLinesAtCritical = Math.max(...rep.critical.map((c) => c.lines.length));
    rep.maxDoom = Math.max(...rep.critical.map((c) => Math.max(0, ...c.lines.filter((l) => !l.winnable).map((l) => l.doom))));
  }
  let n = root;
  while (n.winnable && !n.win && n.moves.length) {
    let pick = -1;
    for (let i = 0; i < n.moves.length; i++) if (n.next[i].winnable && (pick < 0 || n.next[i].pRand > n.next[pick].pRand)) pick = i;
    if (pick < 0) break;
    rep.winningTaps.push(n.moves[pick]);
    n = n.next[pick];
  }
  rep.cls = classify(rep);
  rep.ms = performance.now() - t0;
  return rep;
}

export function classify(r: PathReport): PathClass {
  if (r.truncated && !r.solvable) return 'unknown';
  if (!r.solvable) return 'unsolvable';
  if (r.critical.length === 0 && !r.truncated) return r.start.lines.length >= 2 ? 'easy' : 'guided';
  if (r.critical.length === 0) return 'unknown';
  const c0 = r.critical[0];
  const fracHard = r.critical.filter((c) => c.lines.length <= 3 && c.stuckLines === 1).length / r.critical.length;
  const fracFree = r.decisionStates === 0 ? 0 : r.freeChoiceStates / r.decisionStates;
  if (c0.lines.length <= 3 && c0.winLines === 1 && fracFree <= 0.15 && r.randomWin <= 0.1 && r.start.lines.length <= 3) return 'super';
  if (c0.lines.length <= 3 && c0.stuckLines === 1 && fracHard >= 0.8 && r.start.lines.length <= 3) return 'hard';
  return 'medium';
}

// ───────────────────────────── solver ─────────────────────────────
/**
 * Depth-first search for a tap list that ends in `goal` ('won', or 'stuck' = a jammed belt). Same idea as the real solver but
 * on the fast model, so it can look at tens of thousands of states in a second. Callers replay the result on the real game.
 */
export function fastSearch(p: Puzzle, goal: 'won' | 'stuck', o: { nodes: number; ms: number }): number[] | null {
  const t0 = performance.now();
  const dead = new Set<string>();
  let nodes = 0;
  const rec = (s: St, path: number[]): number[] | null => {
    if (won(s)) return goal === 'won' ? path : null;
    const moves = openMoves(p, s);
    if (!moves.length) return goal === 'stuck' ? path : null;
    if (++nodes > o.nodes || performance.now() - t0 > o.ms) return null;
    const key = stateKey(p, s);
    if (dead.has(key)) return null;
    const ex = new Set<number>();
    for (const b of moves) if (exposed(p, s, p.bColor[b])) ex.add(b);
    const row = (b: number) => Math.floor(p.bCell[b] / p.cols);
    const score = (b: number) => (goal === 'won' ? (ex.has(b) ? 10 : 0) - row(b) : (ex.has(b) ? 0 : 10) + (10 - row(b)));
    const order = moves.slice().sort((a, b) => score(b) - score(a));
    for (const b of order) {
      const r = rec(tap(p, s, b), [...path, b]);
      if (r) return r;
      if (nodes > o.nodes || performance.now() - t0 > o.ms) return null;
    }
    dead.add(key);
    return null;
  };
  return rec(initial(p), []);
}

// ───────────────────────────── random play ─────────────────────────────
export function samplePlays(p: Puzzle, runs: number, seed: number): { wins: number; stucks: number } {
  const rng = new Rng(seed);
  let wins = 0, stucks = 0;
  const s0 = initial(p);
  for (let r = 0; r < runs; r++) {
    let s = s0;
    for (let guard = 0; guard < 200; guard++) {
      if (won(s)) { wins++; break; }
      const mv = openMoves(p, s);
      if (!mv.length) { stucks++; break; }
      s = tap(p, s, mv[rng.int(mv.length)]);
    }
  }
  return { wins, stucks };
}

/** Replay a tap list (bucket ids). Returns the end verdict, or 'illegal' if a tap was not available. */
export function replayTaps(p: Puzzle, taps: number[]): 'won' | 'stuck' | 'open' | 'illegal' {
  let s = initial(p);
  for (const b of taps) {
    if (!openMoves(p, s).includes(b)) return 'illegal';
    s = tap(p, s, b);
  }
  if (won(s)) return 'won';
  return openMoves(p, s).length ? 'open' : 'stuck';
}

// ───────────────────────────── spec score ─────────────────────────────
export type Tag = 'easy' | 'hard' | 'super';

/**
 * Distance to the wanted tag, 0 = met (a few soft penalties are tolerated up to HIT).
 *   easy  : no stuck state is reachable at all, and the player has two lines or more to start with.
 *   hard  : two or three lines at the start; wherever a wrong line exists there are at most three lines and exactly ONE is
 *           stuck, and it is the most tempting one (visible bait); random play wins sometimes but not always.
 *   super : like hard, but wherever there is a real choice only ONE line wins; random play almost never wins and a wrong
 *           turn is punished within a few taps (fair feedback).
 */
export function specScore(r: PathReport, tag: Tag, stuckSamples = 0, samples = 0): number {
  if (!r.solvable) return 1000 + (r.truncated ? 0 : 200);
  let pen = 0;
  const startLines = r.start.lines.length;
  const nCrit = r.critical.length;
  const range = (v: number, lo: number, hi: number) => (v < lo ? lo - v : v > hi ? v - hi : 0);
  const frac = (bad: (d: DecisionInfo) => boolean) => (nCrit === 0 ? 0 : r.critical.filter(bad).length / nCrit);
  if (tag === 'easy') {
    pen += 300 * (1 - r.winnableNodes / Math.max(1, r.nodes));
    if (samples > 0) pen += (300 * stuckSamples) / samples;
    if (nCrit > 0) pen += 20;
    pen += 8 * range(startLines, 2, 99);
  } else if (tag === 'hard') {
    if (nCrit === 0) pen += 60;
    else {
      const c0 = r.critical[0];
      if (c0.lines.length > 3) pen += 15;
      if (c0.stuckLines !== 1) pen += 15;
      if (!r.baitVisible) pen += 12;
      pen += 20 * frac((c) => c.lines.length > 3 || c.stuckLines !== 1);
    }
    pen += 8 * range(startLines, 2, 3);
    pen += 60 * range(r.randomWin, 0.15, 0.85);
    if (r.cls === 'super') pen += 10;
  } else {
    if (nCrit === 0) pen += 80;
    else {
      const c0 = r.critical[0];
      if (c0.lines.length > 3) pen += 15;
      if (c0.winLines !== 1) pen += 25;
      if (!r.baitVisible) pen += 12;
      pen += 20 * frac((c) => c.lines.length > 3 || c.winLines !== 1);
    }
    pen += r.decisionStates === 0 ? 0 : (60 * r.freeChoiceStates) / r.decisionStates;
    pen += 8 * range(startLines, 2, 3);
    pen += 40 * Math.max(0, r.randomWin - 0.1);
    pen += 3 * Math.max(0, r.maxDoom - 5);
  }
  if (r.truncated && tag !== 'easy') pen += 4;
  return pen;
}

export const HIT = 6;

/** Plain, serialisable summary for the UI. */
export interface PathSummary {
  cls: PathClass;
  nodes: number;
  truncated: boolean;
  winnableFraction: number;
  randomWin: number;
  startLines: { color: number; count: number; winnable: boolean; visibility: number; doom: number }[];
  decisionStates: number;
  freeChoiceStates: number;
  critical: number;
  firstCritical: { depth: number; lines: { color: number; winnable: boolean; visibility: number }[] } | null;
  maxLinesAtCritical: number;
  baitVisible: boolean;
  maxDoom: number;
  avgLines: number;
  ms: number;
}

export function summarize(r: PathReport): PathSummary {
  const c0 = r.critical[0];
  return {
    cls: r.cls, nodes: r.nodes, truncated: r.truncated, winnableFraction: r.winnableNodes / Math.max(1, r.nodes), randomWin: r.randomWin,
    startLines: r.start.lines.map((l) => ({ color: l.color, count: l.buckets.length, winnable: l.winnable, visibility: l.visibility, doom: l.doom })),
    decisionStates: r.decisionStates, freeChoiceStates: r.freeChoiceStates, critical: r.critical.length,
    firstCritical: c0 ? { depth: c0.depth, lines: c0.lines.map((l) => ({ color: l.color, winnable: l.winnable, visibility: l.visibility })) } : null,
    maxLinesAtCritical: r.maxLinesAtCritical, baitVisible: r.baitVisible, maxDoom: r.maxDoom, avgLines: r.avgLines, ms: r.ms,
  };
}
