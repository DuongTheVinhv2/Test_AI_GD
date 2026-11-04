import { DIR_VEC } from '../core/grid';
import { COLOR_COUNT } from '../core/palette';
import { Rng } from '../core/rng';
import { prepare, type DesignLevel } from './analyze';
import { HIT, Puzzle, analyzeGraph, samplePlays, sandFor, specScore, type PathReport, type Tag } from './fast';
import { cloneDef, rodCells } from './model';
import { isBucketTok, isPlain, tokColor, tokInfo, withColor, withMechanic } from './tokens';

/**
 * Generate-and-verify tuner: simulated annealing over the bucket layout, scored by the fast decision-graph model.
 * The spec is the tag (see specScore): the search walks towards a layout whose lines, stuck lines and bait fit it.
 * Moves: swap two buckets (or only their colours), move a bucket, move a mechanic mark (?, frozen, key, lock) to another
 * bucket, change how many pops a frozen bucket needs, swap a tunnel queue colour with a bucket, dig or fill a hole.
 * Mechanics never change in number: only where they stand.
 */
export interface TuneOptions {
  tag: Tag;
  layer: number;
  budgetMs: number;
  rng: Rng;
  /** Corridor board: only swaps / moves / marks, the tiles never change. */
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
  /** Layouts (layoutSig) that must not be returned, e.g. the ones generated before. */
  avoid?: Set<string>;
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

/** Identity of a layout: board, buckets and mechanics. */
export const layoutSig = (d: DesignLevel): string =>
  d.tiles.join('/') + '|' + d.buckets.map((r) => r.join(',')).join('/') + '|' + JSON.stringify(d.tunnels ?? []) + JSON.stringify(d.rods ?? []);

function problems(def: DesignLevel, layer: number): boolean {
  // a colour with sand but no bucket (or the reverse) can never be solved
  const prepared = prepare(def, layer);
  const sand = sandFor(prepared.art, layer);
  const has = new Array(COLOR_COUNT).fill(0);
  for (const row of def.buckets) for (const t of row) if (isBucketTok(t)) has[tokColor(t)]++;
  for (const tn of def.tunnels ?? []) for (const q of tn.queue) has[parseInt(q, 36)]++;
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
  const under = new Set<number>();
  for (const rod of out.rods ?? []) for (const x of rodCells(rod)) under.add(x.r * cols + x.c);
  // the tile in front of a rod head or a tunnel mouth must keep its bucket, or the mechanic fires at the very start
  const fronts = new Set<number>();
  for (const rod of out.rods ?? []) { const [dr, dc] = DIR_VEC[rod.dir]; fronts.add((rod.r + dr) * cols + rod.c + dc); }
  for (const t of out.tunnels ?? []) { const [dr, dc] = DIR_VEC[t.dir]; fronts.add((t.r + dr) * cols + t.c + dc); }
  const filled: [number, number][] = [], empty: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (out.tiles[r][c] !== 'o' || under.has(r * cols + c)) continue;
      if (isBucketTok(out.buckets[r][c])) filled.push([r, c]);
      else empty.push([r, c]);
    }
  }
  if (filled.length < 2) return null;
  const roll = rng.next();
  const pickF = () => filled[rng.int(filled.length)];
  const tok = (x: [number, number]) => out.buckets[x[0]][x[1]];
  const put = (x: [number, number], t: string) => { out.buckets[x[0]][x[1]] = t; };

  if (roll < 0.3) {
    // swap two buckets, mechanics travel with them
    const a = pickF(), b = pickF();
    if (tok(a) === tok(b)) return null;
    const t = tok(a); put(a, tok(b)); put(b, t);
    return out;
  }
  if (roll < 0.45) {
    // swap only the colours: every mechanic stays where it is
    const a = pickF(), b = pickF();
    const ca = tokColor(tok(a)), cb = tokColor(tok(b));
    if (ca === cb) return null;
    put(a, withColor(tok(a), cb)); put(b, withColor(tok(b), ca));
    return out;
  }
  if (roll < 0.58) {
    if (!empty.length) return null;
    const movable = filled.filter(([r, c]) => !fronts.has(r * cols + c));
    if (!movable.length) return null;
    const a = movable[rng.int(movable.length)], b = empty[rng.int(empty.length)];
    put(b, tok(a)); put(a, '.');
    return out;
  }
  if (roll < 0.72) {
    // move a mechanic mark (?, frozen, key, lock) from one bucket to a plain one
    const marked = filled.filter((x) => !isPlain(tok(x)));
    const plain = filled.filter((x) => isPlain(tok(x)));
    if (!marked.length || !plain.length) return null;
    const a = marked[rng.int(marked.length)], b = plain[rng.int(plain.length)];
    const ta = tok(a), tb = tok(b);
    put(b, withMechanic(tb, ta));
    put(a, withMechanic(ta, tb));
    return out;
  }
  if (roll < 0.78) {
    // frozen: change the number of pops
    const ice = filled.filter((x) => tokInfo(tok(x)).frozen > 0);
    if (!ice.length) return null;
    const a = ice[rng.int(ice.length)];
    const p = tokInfo(tok(a));
    const n = Math.max(1, Math.min(4, p.frozen + (rng.chance(0.5) ? 1 : -1)));
    if (n === p.frozen) return null;
    put(a, `F${n}:${p.color.toString(36)}`);
    return out;
  }
  if (roll < 0.86 && out.tunnels?.length) {
    // swap a colour in a tunnel queue with the colour of a bucket on the board
    const t = out.tunnels[rng.int(out.tunnels.length)];
    const qi = rng.int(t.queue.length);
    const a = pickF();
    const cq = parseInt(t.queue[qi], 36), cb = tokColor(tok(a));
    if (cq === cb) return null;
    t.queue[qi] = cb.toString(36);
    put(a, withColor(tok(a), cq));
    return out;
  }
  if (!o.fixedCount && roll < 0.93) {
    // change the number of buckets: split one colour into one more, or merge two of a colour
    const count = new Map<number, number>();
    for (const x of filled) { const k = tokColor(tok(x)); count.set(k, (count.get(k) ?? 0) + 1); }
    if (rng.chance(0.5) && empty.length) {
      const src = pickF();
      const b = empty[rng.int(empty.length)];
      put(b, String(tokColor(tok(src)).toString(36)));
      return out;
    }
    const multi = filled.filter((x) => (count.get(tokColor(tok(x))) ?? 0) >= 2 && isPlain(tok(x)));
    if (!multi.length) return null;
    put(multi[rng.int(multi.length)], '.');
    return out;
  }
  if (o.shape && !o.lanes) {
    // dig or fill a hole on a free board; holes the user drew are never touched
    const dig = rng.chance(0.55);
    if (dig && empty.length) {
      const front = empty.filter(([r]) => r === 1);
      const b = front.length && rng.chance(0.5) ? front[rng.int(front.length)] : empty[rng.int(empty.length)];
      if (b[0] === 0 || protectedCells.has(b[0] * cols + b[1]) || fronts.has(b[0] * cols + b[1]) || holes.size >= 5) return null;
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
  if (tok(a) === tok(b)) return null;
  const t = tok(a); put(a, tok(b)); put(b, t);
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
    const sig = layoutSig(def);
    const hit = cache.get(sig);
    if (hit) return hit;
    if (o.avoid?.has(sig)) return null;
    try {
      if (problems(def, o.layer)) return null;
      evals++;
      const e = evaluateFast(def, o.tag, o.layer, nodes, samples, o.rng.int(1_000_000));
      const cand: Cand = { def, score: e.score, rep: e.rep, stucks: e.stucks, runs: e.runs, sig };
      cache.set(sig, cand);
      return cand;
    } catch {
      return null;   // a layout the game would refuse
    }
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

