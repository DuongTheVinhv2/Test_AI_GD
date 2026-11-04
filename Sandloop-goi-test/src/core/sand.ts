import { LANE } from './config';
import { COLOR_COUNT } from './palette';
import type { ArtSource } from './art-data';

/**
 * Falling-sand simulation of the picture window.
 *
 * Cells are stored bottom-up: y = 0 is the floor row that sits on the belt. A cell holds 0 (empty) or
 * colorId + 1. Grains fall straight down, otherwise slump diagonally, which gives the natural 45 degree
 * slopes, funnels and craters of real sand. Buckets remove grains of their own colour from the bottom of each column,
 * reaching through stray grains of other colours (fewer than LANE.layerGrains).
 */
export class SandSim {
  readonly w: number;
  readonly h: number;
  cells: Uint8Array;
  /** Per-grain random byte that travels with the grain (used for shading variety). */
  rnd: Uint8Array;
  /** Grains of each colour still in the window. */
  readonly counts = new Int32Array(COLOR_COUNT);
  total = 0;
  /** True if any grain moved during the last step. */
  moving = true;
  /** Steps since anything moved. */
  quiet = 0;
  /** Grains that moved during the last step (drives the pouring sound). */
  flow = 0;
  tick = 0;
  /** Bumped whenever cells change, so renderers know to re-upload. */
  version = 0;
  private seed: number;

  constructor(w: number, h: number, seed = 1) {
    this.w = w;
    this.h = h;
    this.cells = new Uint8Array(w * h);
    this.rnd = new Uint8Array(w * h);
    this.seed = seed >>> 0 || 1;
  }

  /** Build the window from a pixel-art picture: every art pixel becomes k x k grains. */
  static fromArt(art: ArtSource, k: number, seed = 1): SandSim {
    const sim = new SandSim(art.w * k, art.h * k, seed);
    for (let ay = 0; ay < art.h; ay++) {
      const row = art.rows[ay];
      for (let ax = 0; ax < art.w; ax++) {
        const id = parseInt(row[ax], 36);
        for (let dy = 0; dy < k; dy++) {
          const y = sim.h - 1 - (ay * k + dy);
          for (let dx = 0; dx < k; dx++) {
            const i = y * sim.w + ax * k + dx;
            sim.cells[i] = id + 1;
            sim.rnd[i] = 1 + (sim.nextRand() % 255);
            sim.counts[id]++;
            sim.total++;
          }
        }
      }
    }
    return sim;
  }

  clone(): SandSim {
    const c = new SandSim(this.w, this.h, this.seed);
    c.cells.set(this.cells);
    c.rnd.set(this.rnd);
    c.counts.set(this.counts);
    c.total = this.total;
    c.moving = this.moving;
    c.quiet = this.quiet;
    c.tick = this.tick;
    c.version = this.version;
    return c;
  }

  /** xorshift32 */
  private nextRand(): number {
    let s = this.seed;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.seed = s >>> 0;
    return this.seed;
  }

  /**
   * One gravity tick in two passes: first every grain that can fall straight down does so, then grains
   * that are resting on something roll off the edge of a pile if both the side and the diagonal are free.
   * Straight falls going first keeps funnels clean, so a bucket draws from the column above it.
   */
  step(): boolean {
    const { w, h, cells, rnd } = this;
    let moved = 0;
    const flip = this.tick & 1;
    this.tick++;
    let s = this.seed;

    for (let y = 1; y < h; y++) {
      const row = y * w;
      const below = row - w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const v = cells[i];
        if (v !== 0 && cells[below + x] === 0) {
          const b = below + x;
          cells[b] = v;
          rnd[b] = rnd[i];
          cells[i] = 0;
          moved++;
        }
      }
    }

    for (let y = 1; y < h; y++) {
      const row = y * w;
      const below = row - w;
      const lr = ((y + flip) & 1) === 0;
      for (let k = 0; k < w; k++) {
        const x = lr ? k : w - 1 - k;
        const i = row + x;
        const v = cells[i];
        if (v === 0) continue;
        const canL = x > 0 && cells[i - 1] === 0 && cells[below + x - 1] === 0;
        const canR = x < w - 1 && cells[i + 1] === 0 && cells[below + x + 1] === 0;
        if (canL || canR) {
          let dir: number;
          if (canL && canR) {
            s ^= s << 13;
            s ^= s >>> 17;
            s ^= s << 5;
            dir = (s & 1) === 0 ? -1 : 1;
          } else dir = canL ? -1 : 1;
          const j = below + x + dir;
          cells[j] = v;
          rnd[j] = rnd[i];
          cells[i] = 0;
          moved++;
        }
      }
    }
    this.seed = s >>> 0;
    this.flow = moved;
    this.moving = moved > 0;
    this.quiet = moved ? 0 : this.quiet + 1;
    if (moved) this.version++;
    return moved > 0;
  }

  /**
   * Index of the lowest grain with this id in column x that a bucket can reach, or -1: it may sit on fewer than
   * LANE.layerGrains grains of other colours (strays), never on a layer.
   */
  private reach(x: number, id: number): number {
    const { w, h, cells } = this;
    const top = Math.min(h, LANE.layerGrains);
    for (let y = 0; y < top; y++) {
      const v = cells[y * w + x];
      if (v === 0) return -1;
      if (v === id) return y * w + x;
    }
    return -1;
  }

  /**
   * Remove up to `max` grains of `color` from the bottom of the window, one per column, working outwards from `cx`.
   * Returns how many were taken; their x positions are written to `out` (if given).
   */
  pickup(cx: number, radius: number, color: number, max: number, out?: number[]): number {
    const id = color + 1;
    const { w, cells } = this;
    const c = Math.round(cx);
    let taken = 0;
    const take = (x: number) => {
      if (x < 0 || x >= w) return;
      const i = this.reach(x, id);
      if (i < 0) return;
      cells[i] = 0;
      this.counts[color]--;
      this.total--;
      taken++;
      out?.push(x);
    };
    for (let d = 0; d <= radius && taken < max; d++) {
      take(c - d);
      if (d > 0 && taken < max) take(c + d);
    }
    if (taken) {
      this.version++;
      this.quiet = 0;
    }
    return taken;
  }

  /**
   * Booster: remove up to `max` grains of `color` from anywhere in the picture, not only from the floor row. Works in
   * passes over the columns, taking the lowest grain of the colour in each, so the sand disappears evenly across the
   * picture and layers that were blocking a bucket get thinner. Returns how many were taken; x positions go to `out`.
   */
  take(color: number, max: number, out?: number[]): number {
    const id = color + 1;
    const { w, h, cells } = this;
    let taken = 0;
    while (taken < max) {
      let pass = 0;
      for (let x = 0; x < w && taken < max; x++) {
        for (let y = 0; y < h; y++) {
          const i = y * w + x;
          if (cells[i] === id) {
            cells[i] = 0;
            this.counts[color]--;
            this.total--;
            taken++;
            pass++;
            out?.push(x);
            break;
          }
        }
      }
      if (!pass) break;
    }
    if (taken) {
      this.version++;
      this.quiet = 0;
    }
    return taken;
  }

  /** Number of columns where each colour is within reach of a bucket. */
  exposure(into = new Int32Array(COLOR_COUNT)): Int32Array {
    into.fill(0);
    const { w, cells } = this;
    for (let x = 0; x < w; x++) {
      let seen = 0;
      for (let y = 0; y < LANE.layerGrains; y++) {
        const v = cells[y * w + x];
        if (v === 0) break;
        if (!(seen & (1 << v))) {
          seen |= 1 << v;
          into[v - 1]++;
        }
      }
    }
    return into;
  }

  /** Columns inside an x range where one colour is within reach of a bucket. */
  exposureIn(color: number, x0: number, x1: number): number {
    const id = color + 1;
    let n = 0;
    const a = Math.max(0, Math.floor(x0));
    const b = Math.min(this.w - 1, Math.ceil(x1));
    for (let x = a; x <= b; x++) if (this.reach(x, id) >= 0) n++;
    return n;
  }
}
