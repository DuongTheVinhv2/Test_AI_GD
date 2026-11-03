import { ART_SOURCES } from './art-data';
import { DEFAULT_SLOTS, GRAINS_PER_PIXEL, LANE, SIM_DT, SIM_HZ } from './config';
import { Board, type Cell, type GridBucket } from './grid';
import type { LevelDef } from './levels';
import { COLOR_COUNT } from './palette';
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
  /** belt slot it rides in, -1 before it boards */
  slot: number;
  /** grains picked in the last second, for UI */
  lastPick: number;
  tapTick: number;
}

export type TapResult = 'ok' | 'blocked' | 'full' | 'over';

export type GameEvent =
  | { type: 'tap'; bucket: BeltBucket; path: Cell[] }
  | { type: 'reject'; reason: 'blocked' | 'full'; id: number }
  | { type: 'reveal'; bucket: GridBucket }
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

/** Seconds a bucket takes to cross the lane, and to go once round the whole belt. */
export const LANE_TIME = (LANE.x1 - LANE.x0) / LANE.speed;
export const LOOP_TIME = LANE_TIME + LANE.returnTime;

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

  constructor(readonly level: LevelDef, seed = 1) {
    this.sand = SandSim.fromArt(ART_SOURCES[level.art], GRAINS_PER_PIXEL, seed * 2654435761);
    this.board = new Board(level.tiles, level.buckets);
    this.slots = level.slots ?? DEFAULT_SLOTS;
    this.fillSeconds = level.fillSeconds;
    this.caps = bucketCaps(this.board, this.sand.counts);
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
    if (!gb || gb.gone) return 'blocked';
    const path = this.board.isOpen(gb) ? this.board.path(gb) : null;
    if (!path) {
      this.stats.rejects++;
      this.emit({ type: 'reject', reason: 'blocked', id });
      return 'blocked';
    }
    if (this.slotsUsed >= this.slots) {
      this.stats.rejects++;
      this.emit({ type: 'reject', reason: 'full', id });
      return 'full';
    }
    const uncovered = this.board.remove(gb);
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
      flyTime: LANE.flyBase + LANE.flyPerCell * (path.length - 1),
      laps: 0,
      slot: -1,
      lastPick: 0,
      tapTick: this.ticks,
    };
    this.belt.push(b);
    this.stats.taps++;
    this.stats.maxOnBelt = Math.max(this.stats.maxOnBelt, this.slotsUsed);
    this.emit({ type: 'tap', bucket: b, path });
    for (const m of uncovered) this.emit({ type: 'reveal', bucket: m });
    return 'ok';
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
      lastPick: 0,
      tapTick: this.ticks,
    };
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
    this.boardSlots(dt);
    for (const b of this.belt) {
      b.t += dt;
      switch (b.state) {
        case 'flying':
          if (b.t >= b.flyTime) {
            b.state = 'waiting';
            b.t = 0;
          }
          break;
        case 'waiting':
          break;
        case 'lane':
        case 'return': {
          // Buckets ride fixed, evenly spaced slots, so their position is the slot's position.
          const ph = this.slotPhase(b.slot);
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

  /** Seconds since `slot` last passed the start of the lane. The slots are spaced evenly round the belt. */
  private slotPhase(slot: number): number {
    const ph = (this.time - (slot * LOOP_TIME) / this.slots) % LOOP_TIME;
    return ph < 0 ? ph + LOOP_TIME : ph;
  }

  /** Put the longest-waiting bucket into each free slot that has just reached the start of the lane. */
  private boardSlots(dt: number): void {
    for (let k = 0; k < this.slots; k++) {
      if (this.slotPhase(k) >= dt) continue;
      if (this.belt.some((o) => o.slot === k && o.state !== 'pop')) continue;
      let next: BeltBucket | null = null;
      for (const o of this.belt) {
        if (o.state === 'waiting' && (!next || o.tapTick < next.tapTick || (o.tapTick === next.tapTick && o.id < next.id))) next = o;
      }
      if (!next) return;
      next.slot = k;
      next.state = 'lane';
      next.s = 0;
      next.t = 0;
      this.emit({ type: 'land', bucket: next });
    }
  }

  private completeBucket(b: BeltBucket): void {
    b.state = 'pop';
    b.t = 0;
    this.delivered++;
    this.stats.completed++;
    if (b.laps === 0) this.stats.firstPass++;
    this.emit({ type: 'complete', bucket: b });
  }

  /** A level is lost when nothing on the belt can pick anything up and the player cannot add anything useful. */
  private checkStuck(elapsed: number): void {
    const sand = this.sand;
    if (sand.quiet < SIM_HZ / 3) {
      this.stuckFor = 0;
      return;
    }
    const ex = this.exposure();
    const pending = this.belt.some((b) => b.state !== 'pop' && (b.state === 'flying' || ex[b.color] > 0));
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
    this.stuckFor += elapsed;
    if (this.stuckFor > 0.6 && !this.warned) {
      this.warned = true;
      this.emit({ type: 'warn' });
    }
    if (this.stuckFor > 1.6) {
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
    set('caps', this.caps);
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
    return g;
  }
}
