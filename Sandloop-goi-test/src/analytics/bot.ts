import { SIM_HZ } from '../core/config';
import { Game } from '../core/game';
import type { GridBucket } from '../core/grid';
import type { LevelDef } from '../core/levels';
import { Rng } from '../core/rng';
import type { Cell, GameResult, LevelMeta, PersonaDef } from './types';

/** Game seconds after which a bot attempt is counted as timed out. */
export const TIME_CAP = 240;

/** Which bucket the persona taps next: an id, or -1 when it prefers to wait. */
function choose(g: Game, p: PersonaDef, rng: Rng): number {
  const open = g.openBuckets();
  if (!open.length) return -1;
  const any = () => open[rng.int(open.length)].id;
  if (p.policy === 'random' || rng.chance(p.miss)) return any();

  const ex = g.exposure();
  const good = open.filter((b) => ex[b.color] > 0);
  if (good.length) {
    if (p.policy === 'smallest') return good.reduce((a, b) => (g.caps[b.id] < g.caps[a.id] ? b : a)).id;
    return good[rng.int(good.length)].id;
  }

  // nothing useful is free: the bucket in the way has to be dug out
  const free = g.slots - g.slotsUsed;
  if (p.reserveSlots > 0 && free <= p.reserveSlots) return -1;
  if (p.lookDepth <= 0) return any();
  const depth = Math.min(p.lookDepth, free);
  const queue: { board: Game['board']; route: number[] }[] = [{ board: g.board.clone(), route: [] }];
  for (let q = 0; q < queue.length && q < 3000; q++) {
    const x = queue[q];
    if (x.route.length >= depth) continue;
    for (const b of x.board.openBuckets() as GridBucket[]) {
      const route = [...x.route, b.id];
      if (ex[b.color] > 0) return route[0];
      const board = x.board.clone();
      board.remove(board.buckets[b.id]);
      queue.push({ board, route });
    }
  }
  return any();
}

/** One bot attempt on the real game rules. */
export function playGame(def: LevelDef, p: PersonaDef, seed: number, cap = TIME_CAP): GameResult {
  const g = new Game(def, seed);
  const rng = new Rng(seed * 7919 + 13);
  let next = 0;
  while (g.status === 'playing' && g.time < cap) {
    if (g.ticks >= next && g.slotsUsed < g.slots) {
      const id = choose(g, p, rng);
      if (id >= 0) {
        g.tap(id);
        next = g.ticks + Math.max(1, Math.round(rng.range(p.thinkMin, p.thinkMax) * SIM_HZ));
      } else next = g.ticks + 15;
    }
    g.step();
  }
  const won = g.status === 'won';
  return {
    won,
    reason: won ? 'win' : g.status === 'lost' ? 'stuck' : 'timeout',
    time: g.time,
    taps: g.stats.taps,
    sandLeft: won ? 0 : 1 - g.cleared,
    maxSlots: g.stats.maxOnBelt,
    fullTime: g.stats.fullTime,
    idleTime: g.stats.idleTime,
  };
}

/** Fold the bot games of one level x persona into a cell. */
export function toCell(level: number, persona: string, rs: GameResult[]): Cell {
  const n = rs.length;
  const wins = rs.filter((r) => r.won);
  const lost = rs.filter((r) => !r.won);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : undefined);
  return {
    level, persona, runs: n,
    winRate: n ? wins.length / n : 0,
    avgWinTime: avg(wins.map((r) => r.time)),
    avgTime: avg(rs.map((r) => r.time)),
    taps: avg(rs.map((r) => r.taps)),
    stuckShare: lost.length ? lost.filter((r) => r.reason === 'stuck').length / lost.length : undefined,
    sandLeftOnLoss: avg(lost.map((r) => r.sandLeft)),
    nearMiss: lost.length ? lost.filter((r) => r.sandLeft < 0.2).length / lost.length : undefined,
    maxSlots: avg(rs.map((r) => r.maxSlots)),
    fullTime: avg(rs.map((r) => r.fullTime)),
    idleTime: avg(rs.map((r) => r.idleTime)),
  };
}

/** What a level is made of, measured on the board and the sand without playing. */
export function levelMeta(def: LevelDef, index: number): LevelMeta {
  const g = new Game(def, 1);
  const ex = g.exposure();
  const open = g.openBuckets();
  const needed = open.filter((b) => ex[b.color] > 0);
  const colors = new Set<number>();
  for (let c = 0; c < g.sand.counts.length; c++) if (g.sand.counts[c] > 0) colors.add(c);

  // depth: peel the board in rounds; a bucket's depth is the round in which it becomes tappable
  const board = g.board.clone();
  const depth = new Map<number, number>();
  for (let round = 0; round < 60; round++) {
    const now = board.openBuckets();
    if (!now.length) break;
    for (const b of now) depth.set(b.id, round);
    for (const b of now) board.remove(board.buckets[b.id]);
  }
  const depths = [...depth.values()];
  let depthFirst = 0;
  const first = g.board.buckets.filter((b) => ex[b.color] > 0).map((b) => depth.get(b.id) ?? 0);
  if (first.length) depthFirst = Math.min(...first);

  const tiles = def.tiles.join('');
  return {
    level: index + 1,
    name: def.name,
    hard: !!def.hard,
    buckets: g.board.buckets.length,
    mystery: def.buckets.flat().filter((t) => t.startsWith('?')).length,
    colors: colors.size,
    floor: [...tiles].filter((c) => c === 'o' || c === 't').length,
    holes: [...tiles].filter((c) => c === 'x').length,
    slots: g.slots,
    depthFirst,
    depthMax: depths.length ? Math.max(...depths) : 0,
    depthAvg: depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : 0,
    openAtStart: open.length,
    openNeeded: needed.length,
    firstTapGood: open.length ? needed.length / open.length : 0,
  };
}
