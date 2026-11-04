import { Game } from '../core/game';
import type { LevelDef } from '../core/levels';
import { Rng } from '../core/rng';
import { SIM_HZ } from '../core/config';

/**
 * Macro-step solver on the REAL game simulation.
 * A decision = tap one open bucket. After a tap the simulation runs until it is "settled": every bucket on the belt is
 * either full or has nothing of its colour within reach. A player can always wait, so a stuck settled state is a real loss.
 */
export const SETTLE_MAX_TICKS = SIM_HZ * 40;

export function isSettled(g: Game): boolean {
  if (g.status !== 'playing') return true;
  if (g.sand.quiet < 8) return false;
  const ex = g.exposure();
  for (const b of g.belt) {
    if (b.state === 'pop') return false;
    if (b.state === 'flying' || b.state === 'waiting') return false;
    if (ex[b.color] > 0) return false;
  }
  return true;
}

export function settle(g: Game): void {
  for (let i = 0; i < SETTLE_MAX_TICKS && !isSettled(g); i++) g.step();
}

export type Verdict = 'won' | 'stuck' | 'open';

export function verdict(g: Game): Verdict {
  if (g.status === 'won' || g.sand.total === 0) return 'won';
  if (g.status === 'lost') return 'stuck';
  if (!isSettled(g)) return 'open';
  return g.slotsUsed < g.slots && g.openBuckets().length > 0 ? 'open' : 'stuck';
}

/** Cheap fingerprint of everything that decides the future. */
export function fingerprint(g: Game): string {
  let h1 = 2166136261, h2 = 5381;
  const c = g.sand.cells;
  for (let i = 0; i < c.length; i++) {
    const v = c[i];
    h1 = Math.imul(h1 ^ v, 16777619);
    h2 = (Math.imul(h2, 33) + v) | 0;
  }
  const bs = g.board.buckets.map((b) => (b.gone ? 'x' : b.revealed ? 'r' : 'h')).join('');
  const belt = g.belt.filter((b) => b.state !== 'pop').map((b) => `${b.id}:${b.fill}`).sort().join(',');
  return `${h1}.${h2}|${bs}|${belt}`;
}

export interface Move { id: number; color: number; exposed: boolean; row: number }

export function legalMoves(g: Game): Move[] {
  if (g.slotsUsed >= g.slots) return [];
  const ex = g.exposure();
  return g.openBuckets().map((b) => ({ id: b.id, color: b.color, exposed: ex[b.color] > 0, row: b.r }));
}

export function applyMove(g: Game, id: number): Game {
  const n = g.clone();
  n.tap(id);
  settle(n);
  return n;
}

export interface SearchLimits { ms: number; nodes: number }

/** Depth-first search for a tap sequence that ends in `goal`. Moves are ordered by `prefer`. */
export function search(g0: Game, goal: 'won' | 'stuck', lim: SearchLimits, prefer?: (m: Move) => number, onlyExposed = false): number[] | null {
  const t0 = performance.now();
  const dead = new Set<string>();
  let nodes = 0;
  const order = (ms: Move[]) =>
    ms.slice().sort((a, b) => (prefer ? prefer(b) - prefer(a) : (b.exposed ? 1 : 0) - (a.exposed ? 1 : 0)));
  const rec = (g: Game, path: number[]): number[] | null => {
    const v = verdict(g);
    if (v === 'won') return goal === 'won' ? path : null;
    if (v === 'stuck') return goal === 'stuck' ? path : null;
    if (++nodes > lim.nodes || performance.now() - t0 > lim.ms) return null;
    const key = fingerprint(g);
    if (dead.has(key)) return null;
    let moves = legalMoves(g);
    if (onlyExposed && moves.some((m) => m.exposed)) moves = moves.filter((m) => m.exposed);
    for (const m of order(moves)) {
      const r = rec(applyMove(g, m.id), [...path, m.id]);
      if (r) return r;
      if (nodes > lim.nodes || performance.now() - t0 > lim.ms) return null;
    }
    dead.add(key);
    return null;
  };
  const start = g0.clone();
  settle(start);
  return rec(start, []);
}

export interface Playout { taps: number[]; end: Verdict }

export function randomPlayout(g0: Game, seed: number): Playout {
  const rng = new Rng(seed);
  let g = g0.clone();
  settle(g);
  const taps: number[] = [];
  for (let guard = 0; guard < 80; guard++) {
    const v = verdict(g);
    if (v !== 'open') return { taps, end: v };
    const ms = legalMoves(g);
    if (ms.length === 0) return { taps, end: 'open' };
    const m = ms[rng.int(ms.length)];
    taps.push(m.id);
    g = applyMove(g, m.id);
  }
  return { taps, end: 'open' };
}

export function newGame(level: LevelDef, seed = 1): Game {
  return new Game(level, seed);
}

/** Win search: first only follow colours that can pick right now (what a good player does), then everything. */
export function searchWin(g0: Game, ms: number): number[] | null {
  const t0 = performance.now();
  const r = search(g0, 'won', { ms: ms * 0.55, nodes: 4000 }, undefined, true);
  if (r) return r;
  return search(g0, 'won', { ms: Math.max(500, ms - (performance.now() - t0)), nodes: 6000 });
}
