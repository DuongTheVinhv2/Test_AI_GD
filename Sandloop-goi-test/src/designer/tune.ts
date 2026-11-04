import { COLOR_COUNT } from '../core/palette';
import { Rng } from '../core/rng';
import { prepare, type DesignLevel } from './analyze';
import { HIT, Puzzle, analyzeGraph, samplePlays, sandFor, specScore, type PathReport, type Tag } from './fast';
import { cloneDef } from './model';

/**
 * Generate-and-verify tuner: simulated annealing over the bucket layout, scored by the fast decision-graph model.
 * The spec is the tag (see specScore): the search walks towards a layout whose lines, stuck lines and bait fit it.
 * Moves: swap two buckets, move a bucket, flip a mystery mark, add / remove a bucket of a colour, dig or fill a hole.
 */
export interface TuneOptions {
  tag: Tag;
  layer: number;
  budgetMs: number;
  rng: Rng;
  /** Corridor board: only swaps / moves / mystery / counts, the tiles never change. */
  lanes: boolean;
  /** Allow digging holes in free boards. */
  shape: boolean;
  /** Keep the number of buckets (the board stays as full as the seeds made it). */
  fixedCount?: boolean;
  /** Stop as soon as this many distinct layouts meet the spec. */
  wantHits?: number;
  /** Graph node cap per layout. */
  nodes?: number;
  samples?: number;
  onProgress?: (text: string) => void;
}

export interface Cand {
  def: DesignLevel;
  score: number;
  rep: PathReport;
  stucks: number;
  runs: number;
  sig: string;
}

export interface TuneResult { cands: Cand[]; evals: number; ms: number }

const sigOf = (d: DesignLevel) => d.tiles.join('/') + '|' + d.buckets.map((r) => r.join(',')).join('/');

const isBucket = (t: string) => t !== '.' && t !== ' ';
const colorOf = (t: string) => parseInt(t[0] === '?' ? t.slice(1) : t, 36);

function problems(def: DesignLevel, layer: number): boolean {
  // a colour with sand but no bucket (or the reverse) can never be solved
  const prepared = prepare(def, layer);
  const sand = sandFor(prepared.art, layer);
  const has = new Array(COLOR_COUNT).fill(0);
  for (const row of def.buckets) for (const t of row) if (isBucket(t)) has[colorOf(t)]++;
  for (let c = 0; c < COLOR_COUNT; c++) if ((sand.colorTotal[c] > 0) !== (has[c] > 0)) return true;
  return false;
}

export function evaluateFast(def: DesignLevel, tag: Tag, layer: number, nodes: number, samples: number, seed: number): { score: number; rep: PathReport; stucks: number; runs: number } {
  const prepared = prepare(def, layer);
  const p = new Puzzle(prepared, sandFor(prepared.art, layer));
  const rep = analyzeGraph(p, { maxNodes: nodes, maxMs: 1500 });
  let stucks = 0, runs = 0;
  if (rep.truncated || tag === 'easy') {
    const sp = samplePlays(p, samples, seed);
    runs = samples;
    stucks = sp.stucks;
    if (rep.truncated) rep.randomWin = sp.wins / samples;
  }
  return { score: specScore(rep, tag, stucks, runs), rep, stucks, runs };
}

function mutate(d: DesignLevel, rng: Rng, o: TuneOptions, holes: Set<number>, protectedCells: Set<number>): DesignLevel | null {
  const out = cloneDef(d);
  const rows = out.tiles.length, cols = out.tiles[0].length;
  const filled: [number, number][] = [], empty: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (out.tiles[r][c] !== 'o') continue;
      if (isBucket(out.buckets[r][c])) filled.push([r, c]);
      else empty.push([r, c]);
    }
  }
  if (filled.length < 2) return null;
  const roll = rng.next();
  const pickF = () => filled[rng.int(filled.length)];
  if (roll < 0.45) {
    const a = pickF(), b = pickF();
    if (colorOf(out.buckets[a[0]][a[1]]) === colorOf(out.buckets[b[0]][b[1]]) && out.buckets[a[0]][a[1]] === out.buckets[b[0]][b[1]]) return null;
    const t = out.buckets[a[0]][a[1]];
    out.buckets[a[0]][a[1]] = out.buckets[b[0]][b[1]];
    out.buckets[b[0]][b[1]] = t;
    return out;
  }
  if (roll < 0.65) {
    if (!empty.length) return null;
    const a = pickF(), b = empty[rng.int(empty.length)];
    out.buckets[b[0]][b[1]] = out.buckets[a[0]][a[1]];
    out.buckets[a[0]][a[1]] = '.';
    return out;
  }
  if (roll < 0.73) {
    const a = pickF();
    const t = out.buckets[a[0]][a[1]];
    out.buckets[a[0]][a[1]] = t[0] === '?' ? t.slice(1) : '?' + t;
    return out;
  }
  if (!o.fixedCount && roll < 0.83) {
    // change the number of buckets: split one colour into one more, or merge two of a colour
    const count = new Map<number, number>();
    for (const [r, c] of filled) { const k = colorOf(out.buckets[r][c]); count.set(k, (count.get(k) ?? 0) + 1); }
    if (rng.chance(0.5) && empty.length) {
      const src = pickF();
      const b = empty[rng.int(empty.length)];
      out.buckets[b[0]][b[1]] = out.buckets[src[0]][src[1]].replace('?', '');
      return out;
    }
    const multi = filled.filter(([r, c]) => (count.get(colorOf(out.buckets[r][c])) ?? 0) >= 2);
    if (!multi.length) return null;
    const a = multi[rng.int(multi.length)];
    out.buckets[a[0]][a[1]] = '.';
    return out;
  }
  if (o.shape && !o.lanes) {
    // dig or fill a hole on a free board; holes the user drew are never touched
    const dig = rng.chance(0.55);
    if (dig && empty.length) {
      const front = empty.filter(([r]) => r === 1);
      const b = front.length && rng.chance(0.5) ? front[rng.int(front.length)] : empty[rng.int(empty.length)];
      if (b[0] === 0 || protectedCells.has(b[0] * cols + b[1]) || holes.size >= 5) return null;
      out.tiles[b[0]] = out.tiles[b[0]].slice(0, b[1]) + 'x' + out.tiles[b[0]].slice(b[1] + 1);
      holes.add(b[0] * cols + b[1]);
      return out;
    }
    const mine = [...holes];
    if (!mine.length) return null;
    const cell = mine[rng.int(mine.length)];
    const r = Math.floor(cell / cols), c = cell % cols;
    out.tiles[r] = out.tiles[r].slice(0, c) + 'o' + out.tiles[r].slice(c + 1);
    holes.delete(cell);
    return out;
  }
  const a = pickF(), b = pickF();
  const t = out.buckets[a[0]][a[1]];
  out.buckets[a[0]][a[1]] = out.buckets[b[0]][b[1]];
  out.buckets[b[0]][b[1]] = t;
  return out;
}

export function tune(seeds: DesignLevel[], o: TuneOptions): TuneResult {
  const t0 = performance.now();
  const nodes = o.nodes ?? (o.lanes ? 3000 : 500);
  const samples = o.samples ?? 120;
  const want = o.wantHits ?? 4;
  const cache = new Map<string, Cand>();
  let evals = 0;
  const evalDef = (def: DesignLevel): Cand | null => {
    const sig = sigOf(def);
    const hit = cache.get(sig);
    if (hit) return hit;
    if (problems(def, o.layer)) return null;
    evals++;
    const e = evaluateFast(def, o.tag, o.layer, nodes, samples, o.rng.int(1_000_000));
    const cand: Cand = { def, score: e.score, rep: e.rep, stucks: e.stucks, runs: e.runs, sig };
    cache.set(sig, cand);
    return cand;
  };

  const pool: Cand[] = [];
  for (const s of seeds) { const c = evalDef(s); if (c) pool.push(c); }
  if (!pool.length) return { cands: [], evals, ms: performance.now() - t0 };
  pool.sort((a, b) => a.score - b.score);
  let cur = pool[0];
  const hits = () => [...cache.values()].filter((c) => c.score <= HIT).length;
  const ranked = () => [...cache.values()].sort((a, b) => a.score - b.score);
  o.onProgress?.(`Seed: tốt nhất ${cur.score.toFixed(1)} (${cur.rep.cls}), ${pool.length} bố cục xuất phát`);
  const protectedCells = new Set<number>();
  const base = seeds[0];
  const cols = base.tiles[0].length;
  base.tiles.forEach((row, r) => row.split('').forEach((ch, c) => { if (ch !== 'o') protectedCells.add(r * cols + c); }));
  const holes = new Set<number>();
  let best = cur.score, stale = 0, it = 0;
  const T0 = 6;
  while (performance.now() - t0 < o.budgetMs && hits() < want) {
    it++;
    const frac = Math.min(1, (performance.now() - t0) / o.budgetMs);
    const temp = T0 * (1 - frac) + 0.3;
    let cand = cloneDef(cur.def);
    // tiles may have changed: rebuild the hole set from the current layout
    holes.clear();
    cand.tiles.forEach((row, r) => row.split('').forEach((ch, c) => { if (ch === 'x' && !protectedCells.has(r * cols + c)) holes.add(r * cols + c); }));
    const n = 1 + o.rng.int(stale > 60 ? 4 : 3);
    let changed = false;
    for (let k = 0; k < n; k++) { const m = mutate(cand, o.rng, o, holes, protectedCells); if (m) { cand = m; changed = true; } }
    if (!changed) continue;
    const c = evalDef(cand);
    if (!c) continue;
    const d = c.score - cur.score;
    if (d <= 0 || o.rng.next() < Math.exp(-d / temp)) cur = c;
    if (c.score < best - 1e-9) {
      best = c.score; stale = 0;
      o.onProgress?.(`Tối ưu ${(it)} lượt: điểm ${best.toFixed(1)} (${c.rep.cls}, ${c.rep.start.lines.length} đường lúc đầu${c.rep.truncated ? ', mẫu' : ''})`);
    } else stale++;
    if (stale > 120) {
      // restart from the best layout seen
      cur = ranked()[0];
      stale = 0;
    }
  }
  return { cands: ranked().slice(0, 8), evals, ms: performance.now() - t0 };
}
