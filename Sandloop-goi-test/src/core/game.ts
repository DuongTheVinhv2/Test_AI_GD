import { ART_SOURCES } from './art-data';
import { BOARD_CELL_IN_WINDOWS, DEFAULT_SLOTS, FINAL_STRETCH, GRAINS_PER_PIXEL, LANE, SIM_DT, SIM_HZ } from './config';
import { Board, type BoardChanges, type Cell, type GridBucket, type Rod } from './grid';
import type { LevelDef } from './levels';
import { COLOR_COUNT } from './palette';
import { Rng } from './rng';
import { SandSim } from './sand';

export type BeltState = 'flying' | 'waiting' | 'lane' | 'return' | 'pop';

export interface BeltBucket {
  id: number;
  color: number;
  fill: number;
  cap: number;
  /** grains it can take per simulation step */
  rate: number;
  state: BeltState;
  /** seconds in the current state */
  t: number;
  /** lane progress 0..1 (valid in the lane) */
  s: number;
  /** route over the board while flying */
  path: Cell[];
  flyTime: number;
  /** completed laps without finishing */
  laps: number;
  /** Belt slot it rides in (the five slots are evenly spaced round the loop), -1 while none is reserved. */
  slot: number;
  /** Seconds travelled round the belt loop (0 = left end of the lane); valid once it is on the belt. */
  phase: number;
  /** Lane phase of the first entry, or -1 when the slot has not been assigned. */
  landPhase: number;
  /** Absolute simulation time when this bucket's reserved slot emerges from the left cap. */
  returnExitAt?: number;
  /** grains picked in the last second, for UI */
  lastPick: number;
  tapTick: number;
}

export type TapResult = 'ok' | 'blocked' | 'frozen' | 'locked' | 'full' | 'over';

export type GameEvent =
  | { type: 'tap'; bucket: BeltBucket; path: Cell[] }
  | { type: 'reject'; reason: 'blocked' | 'frozen' | 'locked' | 'full'; id: number }
  | { type: 'reveal'; bucket: GridBucket }
  /** A tunnel pushed a bucket onto the board. */
  | { type: 'spawn'; bucket: GridBucket }
  /** A gate bar slid out. */
  | { type: 'rod'; rod: Rod }
  /** A frozen bucket counted down (`left` > 0) or thawed (`left` = 0). */
  | { type: 'thaw'; bucket: GridBucket; left: number }
  /** A key bucket popped and this lock bucket opened. */
  | { type: 'unlock'; bucket: GridBucket; key: GridBucket }
  /** Sand Pull pulled grains straight out of the picture into a belt bucket. */
  | { type: 'pull'; bucket: BeltBucket; n: number }
  | { type: 'land'; bucket: BeltBucket }
  | { type: 'pick'; bucket: BeltBucket; n: number; xs: number[] }
  | { type: 'complete'; bucket: BeltBucket }
  | { type: 'warn' }
  | { type: 'win' }
  | { type: 'lose' };

export interface GameStats {
  taps: number;
  rejects: number;
  completed: number;
  /** Buckets that finished without ever circling the belt. */
  firstPass: number;
  laps: number;
  maxOnBelt: number;
  /** Seconds the belt was at capacity. */
  fullTime: number;
  /** Seconds in which no belt bucket was picking anything up. */
  idleTime: number;
}

/** A jam that cannot be undone shows a warning after this many seconds and ends the level after LOSE_AFTER. */
export const WARN_AFTER = 0.4;
export const LOSE_AFTER = 3.2;

/** Seconds a bucket takes to cross the lane, and to go once round the whole belt. */
export const LANE_TIME = (LANE.x1 - LANE.x0) / LANE.speed;
export const LOOP_TIME = LANE_TIME + LANE.returnTime;
/**
 * A tapped bucket drops onto a free belt slot that is on the lane when its flight ends, anywhere on the visible lane (it
 * slides out of the end caps, so even the very ends work), and it picks the slot nearest to where it leaves the board, so it
 * drops roughly straight down instead of always sliding in from the left. The five slots are evenly spaced, so neighbours
 * are always LOOP_TIME / 5 apart (one empty bucket width at the default speed) and five buckets always fit.
 */
export const LAND_FROM = 0.15;
export const LAND_TO = LANE_TIME - 0.3;
/** Where over the sand window (0..1) a board column sits. */
export function columnWindowX(col: number, cols: number): number {
  return 0.5 + (col - (cols - 1) / 2) * BOARD_CELL_IN_WINDOWS;
}

export function laneX(s: number): number {
  return LANE.x0 + s * (LANE.x1 - LANE.x0);
}

/**
 * Bucket sizes are not authored: the buckets of one colour share that colour's sand exactly, so every bucket
 * ends full and the last one of a colour cannot be left half empty. Sizes differ by at most one grain.
 */
export function bucketCaps(board: Board, counts: ArrayLike<number>): number[] {
  const caps = new Array<number>(board.buckets.length).fill(0);
  const byColor = new Map<number, number[]>();
  for (const b of board.buckets) {
    const list = byColor.get(b.color);
    if (list) list.push(b.id);
    else byColor.set(b.color, [b.id]);
  }
  for (const [color, ids] of byColor) {
    const total = counts[color] ?? 0;
    const base = Math.floor(total / ids.length);
    const extra = total - base * ids.length;
    ids.forEach((id, j) => (caps[id] = base + (j < extra ? 1 : 0)));
  }
  return caps;
}

export class Game {
  readonly sand: SandSim;
  readonly board: Board;
  readonly belt: BeltBucket[] = [];
  readonly slots: number;
  /** Grains each board bucket holds, by bucket id. */
  readonly caps: number[];
  /** Unused bucket ids per colour, for level-design free play. */
  private pool: number[][];
  private readonly fillSeconds: number;
  time = 0;
  ticks = 0;
  status: 'playing' | 'won' | 'lost' = 'playing';
  delivered = 0;
  readonly stats: GameStats = { taps: 0, rejects: 0, completed: 0, firstPass: 0, laps: 0, maxOnBelt: 0, fullTime: 0, idleTime: 0 };
  onEvent: ((e: GameEvent) => void) | null = null;

  private acc = 0;
  private stuckFor = 0;
  private warned = false;
  private expo = new Int32Array(COLOR_COUNT);
  private xs: number[] = [];
  /** Cached exposure, refreshed when the sand changes. */
  private expoVersion = -1;
  /** Grains in the picture at the start. */
  private initialSand = 0;

  constructor(readonly level: LevelDef, seed = 1) {
    this.sand = SandSim.fromArt(ART_SOURCES[level.art], GRAINS_PER_PIXEL, seed * 2654435761);
    this.board = new Board(level.tiles, level.buckets, level.tunnels, level.rods);
    this.slots = level.slots ?? DEFAULT_SLOTS;
    this.fillSeconds = level.fillSeconds;
    this.caps = bucketCaps(this.board, this.sand.counts);
    this.initialSand = this.sand.total;
    this.pool = Array.from({ length: COLOR_COUNT }, () => []);
    for (const b of this.board.buckets) this.pool[b.color].push(b.id);
  }

  private rateFor(cap: number): number {
    return Math.max(1, Math.ceil(cap / (this.fillSeconds * SIM_HZ)));
  }

  get slotsUsed(): number {
    let n = 0;
    for (const b of this.belt) if (b.state !== 'pop') n++;
    return n;
  }

  /** Buckets that still have to fill: on the board or riding the belt, not yet popped. */
  get bucketsLeft(): number {
    return this.board.buckets.length - this.delivered;
  }

  /** The last FINAL_STRETCH.buckets buckets of a level big enough to have an "earlier part". */
  get finalStretch(): boolean {
    return this.status === 'playing' && this.board.buckets.length > FINAL_STRETCH.buckets && this.bucketsLeft <= FINAL_STRETCH.buckets;
  }

  /** Share of the picture's sand already collected, 0..1. */
  get cleared(): number {
    return this.initialSand > 0 ? 1 - this.sand.total / this.initialSand : 1;
  }

  /** True while the belt is jammed for good and the level is about to be lost (drives the visible alarm). */
  get jamWarning(): boolean {
    return this.status === 'playing' && this.warned && this.stuckFor > 0;
  }

  /** Colours currently touching the belt floor, with grain counts. */
  exposure(): Int32Array {
    if (this.expoVersion !== this.sand.version) {
      this.sand.exposure(this.expo);
      this.expoVersion = this.sand.version;
    }
    return this.expo;
  }

  private emit(e: GameEvent): void {
    this.onEvent?.(e);
  }

  // ---------------------------------------------------------------- input

  tap(id: number): TapResult {
    if (this.status !== 'playing') return 'over';
    const gb = this.board.buckets[id];
    if (!gb || gb.gone || gb.queued) return 'blocked';
    const why = this.board.stuckReason(gb);
    const path = why === null ? this.board.path(gb) : null;
    if (!path) {
      const reason = why === 'frozen' || why === 'locked' ? why : 'blocked';
      this.stats.rejects++;
      this.emit({ type: 'reject', reason, id });
      return reason;
    }
    if (this.slotsUsed >= this.slots) {
      this.stats.rejects++;
      this.emit({ type: 'reject', reason: 'full', id });
      return 'full';
    }
    return this.launch(gb, path);
  }

  /** Put a board bucket on the belt along `path` (its own tile alone when a booster skips the walk). */
  private launch(gb: GridBucket, path: Cell[]): TapResult {
    const id = gb.id;
    const changes = this.board.remove(gb);
    const flyTime = LANE.flyBase + LANE.flyPerCell * (path.length - 1);
    const b: BeltBucket = {
      id,
      color: gb.color,
      fill: 0,
      cap: this.caps[id],
      rate: this.rateFor(this.caps[id]),
      state: 'flying',
      t: 0,
      s: 0,
      path,
      flyTime,
      laps: 0,
      slot: -1,
      phase: 0,
      landPhase: -1,
      lastPick: 0,
      tapTick: this.ticks,
    };
    this.reserveSlot(b, columnWindowX(path[path.length - 1].c, this.board.cols));
    this.belt.push(b);
    this.stats.taps++;
    this.stats.maxOnBelt = Math.max(this.stats.maxOnBelt, this.slotsUsed);
    this.emit({ type: 'tap', bucket: b, path });
    this.emitChanges(changes);
    return 'ok';
  }

  // ---------------------------------------------------------------- boosters

  /** Hand Pick: any free bucket goes straight onto the belt, however it is boxed in. Frozen and locked ones stay put. */
  handPick(id: number): TapResult {
    if (this.status !== 'playing') return 'over';
    const gb = this.board.buckets[id];
    if (!gb || gb.gone || gb.queued) return 'blocked';
    if (gb.frozen > 0) return 'frozen';
    if (gb.locked) return 'locked';
    if (this.slotsUsed >= this.slots) return 'full';
    if (gb.mystery && !gb.revealed) {
      gb.revealed = true;
      this.emit({ type: 'reveal', bucket: gb });
    }
    return this.launch(gb, [{ r: gb.r, c: gb.c }]);
  }

  /** Belt buckets Sand Pull can fill: riding the lane, with room left, and sand of their colour still in the picture. */
  pullTargets(): BeltBucket[] {
    return this.belt.filter((b) => b.state === 'lane' && b.fill < b.cap && this.sand.counts[b.color] > 0);
  }

  /** Sand Pull: fill a belt bucket from anywhere in the picture. Returns the grains taken (0 = it could not). */
  sandPull(id: number): number {
    if (this.status !== 'playing') return 0;
    const b = this.pullTargets().find((x) => x.id === id);
    if (!b) return 0;
    this.xs.length = 0;
    const n = this.sand.take(b.color, b.cap - b.fill, this.xs);
    if (!n) return 0;
    b.fill += n;
    b.lastPick = n;
    this.stuckFor = 0;
    this.warned = false;
    this.emit({ type: 'pick', bucket: b, n, xs: this.xs });
    this.emit({ type: 'pull', bucket: b, n });
    if (b.fill >= b.cap) this.completeBucket(b);
    return n;
  }

  /**
   * Shuffle: the plain buckets still on the board (no `?`, ice, key, lock, nor any still inside a tunnel) swap colours at
   * random, carrying their size with the colour so every colour keeps exactly its sand. At least one bucket that can be
   * tapped now ends up a different colour. Returns false when there is nothing to shuffle.
   */
  shuffleBoard(): boolean {
    if (this.status !== 'playing') return false;
    const ids = this.board.buckets.filter((b) => !b.gone && !b.queued && !b.mystery && b.frozen === 0 && b.key === 0 && b.lock === 0).map((b) => b.id);
    if (new Set(ids.map((i) => this.board.buckets[i].color)).size < 2) return false;
    const openBefore = this.board.openBuckets().map((b) => b.id).filter((i) => ids.includes(i));
    const rng = new Rng(this.ticks * 31 + 7);
    const colors = ids.map((i) => this.board.buckets[i].color);
    const sizes = ids.map((i) => this.caps[i]);
    for (let attempt = 0; attempt < 30; attempt++) {
      const order = ids.map((_, k) => k);
      for (let k = order.length - 1; k > 0; k--) {
        const j = rng.int(k + 1);
        [order[k], order[j]] = [order[j], order[k]];
      }
      const changed = openBefore.some((id) => colors[order[ids.indexOf(id)]] !== this.board.buckets[id].color);
      if (!changed && attempt < 29) continue;
      ids.forEach((id, k) => {
        this.board.buckets[id].color = colors[order[k]];
        this.caps[id] = sizes[order[k]];
      });
      return true;
    }
    return false;
  }

  private emitChanges(c: BoardChanges): void {
    for (const rod of c.rodsOpened) this.emit({ type: 'rod', rod });
    for (const b of c.spawned) this.emit({ type: 'spawn', bucket: b });
    for (const m of c.revealed) this.emit({ type: 'reveal', bucket: m });
  }

  /**
   * Level-design hook: put a bucket of `color` straight onto the belt, as if it had been tapped,
   * without involving the board. Returns false when the belt is full.
   */
  deployFree(color: number): boolean {
    if (this.status !== 'playing' || this.slotsUsed >= this.slots) return false;
    const id = this.pool[color].shift();
    if (id === undefined) return false;
    const b: BeltBucket = {
      id,
      color,
      fill: 0,
      cap: this.caps[id],
      rate: this.rateFor(this.caps[id]),
      state: 'flying',
      t: 0,
      s: 0,
      path: [],
      flyTime: LANE.flyBase,
      laps: 0,
      slot: -1,
      phase: 0,
      landPhase: -1,
      lastPick: 0,
      tapTick: this.ticks,
    };
    this.reserveSlot(b);
    this.belt.push(b);
    this.stats.taps++;
    this.stats.maxOnBelt = Math.max(this.stats.maxOnBelt, this.slotsUsed);
    return true;
  }

  /** Open buckets a player could tap right now. */
  openBuckets(): GridBucket[] {
    return this.board.openBuckets();
  }

  // ---------------------------------------------------------------- simulation

  /** Advance by real time using fixed steps. */
  advance(dt: number): void {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.step();
    }
  }

  /** Fraction into the current fixed step, for render interpolation. */
  get alpha(): number {
    return this.acc / SIM_DT;
  }

  step(): void {
    this.ticks++;
    this.time += SIM_DT;
    const dt = SIM_DT;
    const sand = this.sand;

    // Pickup first, then gravity.
    let picking = false;
    this.boardWaiting();
    for (const b of this.belt) {
      b.t += dt;
      switch (b.state) {
        case 'flying':
          if (b.t >= b.flyTime) {
            const ph = b.slot >= 0 ? this.slotPhase(b.slot) : -1;
            // A direct arrival may be a fraction of a step early.
            if (b.returnExitAt === undefined && ph >= LAND_FROM - 0.03 && ph <= LAND_TO) this.land(b, Math.max(ph, LAND_FROM));
            else {
              b.state = 'waiting';
              b.t = 0;
            }
          }
          break;
        case 'waiting':
          break;
        case 'lane':
        case 'return': {
          // Buckets ride fixed, evenly spaced slots, so their position is the slot's position.
          const ph = this.slotPhase(b.slot);
          b.phase = ph;
          if (ph >= LANE_TIME) {
            if (b.state === 'lane') {
              b.s = 1;
              b.state = 'return';
              b.laps++;
              this.stats.laps++;
            }
            b.t = ph - LANE_TIME;
            break;
          }
          b.state = 'lane';
          b.s = ph / LANE_TIME;
          b.t = ph;
          b.lastPick = 0;
          if (b.fill < b.cap) {
            this.xs.length = 0;
            const want = Math.min(b.rate, b.cap - b.fill);
            const n = sand.pickup(laneX(b.s) * sand.w, LANE.pickRadius, b.color, want, this.xs);
            if (n) {
              b.fill += n;
              b.lastPick = n;
              picking = true;
              this.emit({ type: 'pick', bucket: b, n, xs: this.xs });
              if (b.fill >= b.cap) this.completeBucket(b);
            }
          }
          break;
        }
        case 'pop':
          break;
      }
    }
    // Drop finished pops.
    for (let i = this.belt.length - 1; i >= 0; i--) {
      const b = this.belt[i];
      if (b.state === 'pop' && b.t >= LANE.popTime) this.belt.splice(i, 1);
    }

    sand.step();

    if (this.status === 'playing') {
      if (this.slotsUsed >= this.slots) this.stats.fullTime += dt;
      if (!picking && this.belt.some((b) => b.state === 'lane')) this.stats.idleTime += dt;
      if (sand.total === 0) {
        this.status = 'won';
        this.emit({ type: 'win' });
      } else if (this.ticks % 15 === 0) this.checkStuck(15 * dt);
    }
  }

  /** Seconds since `slot` last passed the left end of the lane. The slots are spaced evenly round the belt. */
  private slotPhase(slot: number, at = this.time): number {
    const ph = (at - (slot * LOOP_TIME) / this.slots) % LOOP_TIME;
    return ph < 0 ? ph + LOOP_TIME : ph;
  }

  /** Is `slot` taken by a bucket that is still on screen (a finished bucket keeps it while it pops)? */
  private slotTaken(slot: number): boolean {
    return this.belt.some((o) => o.slot === slot);
  }

  /** Put a bucket on the lane at `phase` and let it run. */
  private land(b: BeltBucket, phase: number): void {
    b.state = 'lane';
    b.phase = phase;
    b.s = phase / LANE_TIME;
    b.t = phase;
    this.emit({ type: 'land', bucket: b });
  }

  /** Seconds until `slot` is free of the buckets that hold it: 0 when it is empty, the rest of the pop when a finished bucket is leaving, Infinity when a bucket is still using it. */
  private slotBusyFor(slot: number): number {
    let busy = 0;
    for (const o of this.belt) {
      if (o.slot !== slot) continue;
      if (o.state !== 'pop') return Infinity;
      busy = Math.max(busy, LANE.popTime - o.t);
    }
    return busy;
  }

  /**
   * Reserve a free slot and remember where it will be when the flight ends. Any free slot will do, not just the one
   * nearest the left end: if it is on the lane when the flight ends the bucket takes the one closest to `srcX`, where it
   * leaves the board, so it drops roughly straight down. Without `srcX` (free play) it takes the leftmost one, which has
   * the longest ride ahead. If the next free slot is on the return leg, send the bucket through the caps.
   */
  private reserveSlot(b: BeltBucket, srcX?: number): void {
    let best = -1;
    let bestPhase = Infinity;
    let bestScore = Infinity;
    let bestFly = b.flyTime;
    let soon = -1;
    let soonFly = Infinity;
    let soonViaReturn = false;
    for (let k = 0; k < this.slots; k++) {
      const busy = this.slotBusyFor(k);
      if (busy === Infinity) continue;
      const fly = Math.max(b.flyTime, busy);
      const ph = this.slotPhase(k, this.time + fly);
      if (ph >= LAND_FROM && ph <= LAND_TO) {
        const score = srcX === undefined ? ph : Math.abs(laneX(ph / LANE_TIME) - srcX);
        if (score < bestScore - 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && ph < bestPhase)) {
          best = k;
          bestPhase = ph;
          bestScore = score;
          bestFly = fly;
        }
      } else {
        const total = fly + (ph < LAND_FROM ? LAND_FROM - ph : LOOP_TIME - ph + LAND_FROM);
        if (total < soonFly) {
          soon = k;
          soonFly = total;
          soonViaReturn = ph > LAND_TO;
        }
      }
    }
    if (best >= 0) {
      b.slot = best;
      b.landPhase = bestPhase;
      b.flyTime = bestFly;
    } else if (soon >= 0) {
      b.slot = soon;
      b.landPhase = soonViaReturn ? 0 : LAND_FROM;
      if (soonViaReturn) {
        const riders = this.belt.filter((o) => o.state !== 'pop');
        let exitAt = this.time + soonFly - LAND_FROM;
        // With a full visible train, use the first pass of the spare slot after the tail has returned.
        if (riders.length > 0 && riders.length === this.slots - 1 && riders.every((o) => o.state === 'lane')) {
          const tailExit = Math.max(...riders.map((o) => this.time + LOOP_TIME - this.slotPhase(o.slot)));
          if (exitAt < tailExit) exitAt += LOOP_TIME;
        }
        b.returnExitAt = exitAt;
        let nextCapArrival = Infinity;
        for (const rider of riders) {
          if (rider.state === 'lane' || rider.state === 'return') {
            nextCapArrival = Math.min(nextCapArrival, Math.max(0, LANE_TIME - this.slotPhase(rider.slot)));
          }
        }
        // Join when the front bucket reaches the right cap, with time to disappear before the slot emerges.
        const beforeExit = exitAt - this.time - SIM_DT;
        b.flyTime = Math.max(b.flyTime, Math.min(nextCapArrival, beforeExit));
      } else {
        b.flyTime = soonFly;
      }
    }
  }

  /** A waiting bucket boards as soon as its slot reaches the entry. Oldest tap first. */
  private boardWaiting(): void {
    const waiting = this.belt.filter((o) => o.state === 'waiting').sort((a, b) => a.tapTick - b.tapTick || a.id - b.id);
    for (const b of waiting) {
      if (b.slot < 0) {
        for (let k = 0; k < this.slots; k++) {
          if (this.slotTaken(k)) continue;
          const ph = this.slotPhase(k);
          if (ph >= LAND_FROM && ph <= LAND_TO) {
            b.slot = k;
            break;
          }
        }
      }
      if (b.slot < 0) continue;
      if (b.returnExitAt !== undefined && this.time < b.returnExitAt) continue;
      const ph = this.slotPhase(b.slot);
      if (ph >= (b.returnExitAt === undefined ? LAND_FROM : 0) && ph <= LAND_TO) this.land(b, ph);
    }
  }

  private completeBucket(b: BeltBucket): void {
    b.state = 'pop';
    b.t = 0;
    this.delivered++;
    this.stats.completed++;
    if (b.laps === 0) this.stats.firstPass++;
    this.emit({ type: 'complete', bucket: b });
    // A pop is what melts frozen buckets and what a key bucket is for.
    const gb = this.board.buckets[b.id];
    const r = this.board.onPop(gb);
    for (const f of r.ticked) this.emit({ type: 'thaw', bucket: f, left: f.frozen });
    for (const f of r.thawed) this.emit({ type: 'thaw', bucket: f, left: 0 });
    for (const l of r.unlocked) this.emit({ type: 'unlock', bucket: l, key: gb });
  }

  /** A level is lost when nothing on the belt can pick anything up and the player cannot add anything useful. */
  private checkStuck(elapsed: number): void {
    const sand = this.sand;
    if (sand.quiet < SIM_HZ / 3) {
      this.stuckFor = 0;
      return;
    }
    const ex = this.exposure();
    const pending = this.belt.some((b) => b.state !== 'pop' && (b.state === 'flying' || b.state === 'waiting' || ex[b.color] > 0));
    if (pending) {
      this.stuckFor = 0;
      this.warned = false;
      return;
    }
    const canAct = this.slotsUsed < this.slots && this.board.openBuckets().length > 0;
    if (canAct) {
      this.stuckFor = 0;
      this.warned = false;
      return;
    }
    // Nothing left to wait for: a frozen bucket only thaws when others pop, so when none can, it thaws now. A level
    // is never lost to a countdown alone.
    if (this.board.hasFrozen()) {
      for (const f of this.board.thawAll()) this.emit({ type: 'thaw', bucket: f, left: 0 });
      this.stuckFor = 0;
      return;
    }
    this.stuckFor += elapsed;
    if (this.stuckFor > WARN_AFTER && !this.warned) {
      this.warned = true;
      this.emit({ type: 'warn' });
    }
    if (this.stuckFor > LOSE_AFTER) {
      this.status = 'lost';
      this.emit({ type: 'lose' });
    }
  }

  clone(): Game {
    const g = Object.create(Game.prototype) as Game;
    const set = <K extends keyof Game>(k: K, v: Game[K]) => ((g as unknown as Record<string, unknown>)[k as string] = v);
    set('level', this.level);
    set('sand', this.sand.clone());
    set('board', this.board.clone());
    set('belt', this.belt.map((b) => ({ ...b, path: b.path })));
    set('slots', this.slots);
    set('caps', this.caps.slice());
    (g as unknown as { pool: number[][] }).pool = this.pool.map((p) => p.slice());
    (g as unknown as { fillSeconds: number }).fillSeconds = this.fillSeconds;
    g.time = this.time;
    g.ticks = this.ticks;
    g.status = this.status;
    g.delivered = this.delivered;
    set('stats', { ...this.stats });
    g.onEvent = null;
    (g as unknown as { acc: number }).acc = this.acc;
    (g as unknown as { stuckFor: number }).stuckFor = this.stuckFor;
    (g as unknown as { warned: boolean }).warned = this.warned;
    (g as unknown as { expo: Int32Array }).expo = new Int32Array(COLOR_COUNT);
    (g as unknown as { xs: number[] }).xs = [];
    (g as unknown as { expoVersion: number }).expoVersion = -1;
    (g as unknown as { initialSand: number }).initialSand = this.initialSand;
    return g;
  }
}
