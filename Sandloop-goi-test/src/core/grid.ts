export const enum Tile {
  Void = 0,
  Floor = 1,
  Hole = 2,
  /** Mouth of a tunnel: not walkable, feeds buckets onto the tile in front of it. */
  Tunnel = 3,
}

export interface GridBucket {
  id: number;
  color: number;
  r: number;
  c: number;
  /** Starts as a mystery "?" bucket. */
  mystery: boolean;
  /** For mystery buckets: colour has been shown. */
  revealed: boolean;
  gone: boolean;
  /** Frozen: how many buckets still have to pop before it thaws (0 = not frozen). */
  frozen: number;
  /** Key bucket: popping it opens every lock of the same pair number (1..9, 0 = not a key). */
  key: number;
  /** Lock bucket: pair number of the key that opens it (1..9, 0 = not a lock). */
  lock: number;
  /** A lock bucket whose key has not popped yet. */
  locked: boolean;
  /** Waits inside a tunnel: not on the board yet (r, c is the tile it will appear on). */
  queued: boolean;
  /** Index of the tunnel it waits in, -1 if none. */
  tunnel: number;
}

export interface Cell {
  r: number;
  c: number;
}

export type Dir = 'u' | 'd' | 'l' | 'r';

/** A tunnel in a level: sits on a non-floor tile, faces a floor tile and feeds it buckets in queue order. */
export interface TunnelDef {
  r: number;
  c: number;
  dir: Dir;
  /** Colour tokens in the order they come out (one base-36 character each). */
  queue: string[];
}

/** A gate bar in a level: lies over `size` floor tiles ending at (r, c) (the head) and points `dir`. */
export interface RodDef {
  r: number;
  c: number;
  dir: Dir;
  size: number;
}

export interface Tunnel {
  r: number;
  c: number;
  /** The tile in front of the mouth, where buckets come out. */
  fr: number;
  fc: number;
  dir: Dir;
  /** Bucket ids still inside, next one first. */
  queue: number[];
}

export interface Rod {
  cells: Cell[];
  dir: Dir;
  /** The tile in front of the head. */
  fr: number;
  fc: number;
  open: boolean;
}

/** What a tap or a tile change did to the board, so the view can play it. */
export interface BoardChanges {
  revealed: GridBucket[];
  spawned: GridBucket[];
  rodsOpened: Rod[];
}

const DIRS: Array<[number, number]> = [
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, 0],
];

export const DIR_VEC: Record<Dir, [number, number]> = { u: [-1, 0], d: [1, 0], l: [0, -1], r: [0, 1] };

/** `F2:5` frozen 2, `K1:5` key 1, `L1:5` lock 1, `?5` mystery, `5` plain. */
const TOKEN = /^(?:\?([0-9a-z])|([FKL])(\d):([0-9a-z])|([0-9a-z]))$/i;

export interface ParsedToken {
  color: number;
  mystery: boolean;
  frozen: number;
  key: number;
  lock: number;
}

export function parseToken(tok: string): ParsedToken {
  const m = TOKEN.exec(tok);
  if (!m) throw new Error(`bad bucket token "${tok}"`);
  const t: ParsedToken = { color: 0, mystery: false, frozen: 0, key: 0, lock: 0 };
  if (m[1] !== undefined) {
    t.mystery = true;
    t.color = parseInt(m[1], 36);
  } else if (m[2] !== undefined) {
    const n = Number(m[3]);
    t.color = parseInt(m[4], 36);
    const kind = m[2].toUpperCase();
    if (kind === 'F') t.frozen = Math.max(1, n);
    else if (kind === 'K') t.key = n;
    else t.lock = n;
  } else t.color = parseInt(m[5], 36);
  return t;
}

/** The tile board under the belt. Row 0 is the row closest to the belt: buckets leave through it. */
export class Board {
  readonly rows: number;
  readonly cols: number;
  readonly tiles: Uint8Array;
  readonly occ: Int16Array;
  readonly buckets: GridBucket[] = [];
  readonly tunnels: Tunnel[] = [];
  readonly rods: Rod[] = [];

  /**
   * @param tileRows one string per row: '.' void, 'o' floor, 'x' hole, 't' tunnel mouth
   * @param bucketRows one array of tokens per row: '.' none, '5' colour id in base 36, '?5' mystery, 'F2:5' frozen,
   *   'K1:5' key, 'L1:5' lock (see parseToken)
   */
  constructor(tileRows: string[], bucketRows: string[][], tunnelDefs: TunnelDef[] = [], rodDefs: RodDef[] = []) {
    this.rows = tileRows.length;
    this.cols = tileRows[0].length;
    this.tiles = new Uint8Array(this.rows * this.cols);
    this.occ = new Int16Array(this.rows * this.cols).fill(-1);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = tileRows[r][c];
        this.tiles[r * this.cols + c] = ch === 'o' ? Tile.Floor : ch === 'x' ? Tile.Hole : ch === 't' ? Tile.Tunnel : Tile.Void;
      }
    }
    let id = 0;
    const make = (r: number, c: number, tok: string, queued: boolean, tunnel: number): GridBucket => {
      const p = parseToken(tok);
      const b: GridBucket = {
        id: id++,
        color: p.color,
        r,
        c,
        mystery: p.mystery,
        revealed: !p.mystery,
        gone: false,
        frozen: p.frozen,
        key: p.key,
        lock: p.lock,
        locked: p.lock > 0,
        queued,
        tunnel,
      };
      this.buckets.push(b);
      return b;
    };
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tok = bucketRows[r]?.[c] ?? '.';
        if (tok === '.' || tok === ' ') continue;
        if (this.tiles[r * this.cols + c] !== Tile.Floor) throw new Error(`bucket on non-floor tile at ${r},${c}`);
        const b = make(r, c, tok, false, -1);
        this.occ[r * this.cols + c] = b.id;
      }
    }
    for (const d of tunnelDefs) {
      if (this.tile(d.r, d.c) !== Tile.Tunnel) throw new Error(`tunnel on a tile that is not 't' at ${d.r},${d.c}`);
      const [dr, dc] = DIR_VEC[d.dir];
      const fr = d.r + dr;
      const fc = d.c + dc;
      if (this.tile(fr, fc) !== Tile.Floor) throw new Error(`tunnel at ${d.r},${d.c} does not face a floor tile`);
      const t: Tunnel = { r: d.r, c: d.c, fr, fc, dir: d.dir, queue: [] };
      const index = this.tunnels.length;
      for (const tok of d.queue) t.queue.push(make(fr, fc, tok, true, index).id);
      this.tunnels.push(t);
    }
    for (const d of rodDefs) {
      const [dr, dc] = DIR_VEC[d.dir];
      const cells: Cell[] = [];
      for (let k = d.size - 1; k >= 0; k--) cells.push({ r: d.r - dr * k, c: d.c - dc * k });
      for (const cell of cells) if (this.tile(cell.r, cell.c) !== Tile.Floor) throw new Error(`rod over a non-floor tile at ${cell.r},${cell.c}`);
      for (const cell of cells) if (this.occ[cell.r * this.cols + cell.c] >= 0) throw new Error(`a bucket stands under a rod at ${cell.r},${cell.c}`);
      this.rods.push({ cells, dir: d.dir, fr: d.r + dr, fc: d.c + dc, open: false });
    }
    this.settle();
  }

  /** A closed rod lies over this tile. */
  rodAt(r: number, c: number): Rod | null {
    for (const rod of this.rods) {
      if (rod.open) continue;
      for (const cell of rod.cells) if (cell.r === r && cell.c === c) return rod;
    }
    return null;
  }

  /** A floor tile nothing stands or lies on. */
  isFree(r: number, c: number): boolean {
    return this.tile(r, c) === Tile.Floor && this.occ[r * this.cols + c] < 0 && !this.rodAt(r, c);
  }

  /**
   * Let the board react to a tile that just emptied, until nothing changes:
   *  - a rod whose front tile is empty slides out for good, freeing the tiles under it;
   *  - a tunnel whose front tile is empty pushes out its next bucket;
   *  - a mystery bucket with an empty neighbouring tile shows its colour.
   */
  settle(): BoardChanges {
    const out: BoardChanges = { revealed: [], spawned: [], rodsOpened: [] };
    for (let guard = 0; guard < 64; guard++) {
      let changed = false;
      for (const rod of this.rods) {
        if (rod.open) continue;
        if (this.isFree(rod.fr, rod.fc)) {
          rod.open = true;
          out.rodsOpened.push(rod);
          changed = true;
        }
      }
      for (const t of this.tunnels) {
        if (!t.queue.length || !this.isFree(t.fr, t.fc)) continue;
        const b = this.buckets[t.queue.shift()!];
        b.queued = false;
        this.occ[b.r * this.cols + b.c] = b.id;
        out.spawned.push(b);
        changed = true;
      }
      for (const b of this.buckets) {
        if (b.gone || b.queued || !b.mystery || b.revealed) continue;
        for (const [dr, dc] of DIRS) {
          if (this.isFree(b.r + dr, b.c + dc)) {
            b.revealed = true;
            out.revealed.push(b);
            changed = true;
            break;
          }
        }
      }
      if (!changed) break;
    }
    return out;
  }

  clone(): Board {
    const b = Object.create(Board.prototype) as Board;
    (b as { rows: number }).rows = this.rows;
    (b as { cols: number }).cols = this.cols;
    (b as { tiles: Uint8Array }).tiles = this.tiles;
    (b as { occ: Int16Array }).occ = this.occ.slice();
    (b as { buckets: GridBucket[] }).buckets = this.buckets.map((x) => ({ ...x }));
    (b as { tunnels: Tunnel[] }).tunnels = this.tunnels.map((t) => ({ ...t, queue: t.queue.slice() }));
    (b as { rods: Rod[] }).rods = this.rods.map((r) => ({ ...r }));
    return b;
  }

  tile(r: number, c: number): Tile {
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return Tile.Void;
    return this.tiles[r * this.cols + c];
  }

  bucketAt(r: number, c: number): GridBucket | null {
    const id = this.occ[r * this.cols + c];
    return id >= 0 ? this.buckets[id] : null;
  }

  /**
   * Shortest route of empty floor tiles from the bucket to row 0 (the exit row).
   * The first cell is the bucket's own tile. Null if boxed in.
   */
  path(b: GridBucket): Cell[] | null {
    if (b.gone || b.queued) return null;
    if (b.r === 0) return [{ r: b.r, c: b.c }];
    const seen = new Int16Array(this.rows * this.cols).fill(-2);
    const start = b.r * this.cols + b.c;
    seen[start] = -1;
    const queue = [start];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      const cr = Math.floor(cur / this.cols);
      const cc = cur % this.cols;
      for (const [dr, dc] of DIRS) {
        const nr = cr + dr;
        const nc = cc + dc;
        if (this.tile(nr, nc) !== Tile.Floor) continue;
        const ni = nr * this.cols + nc;
        if (seen[ni] !== -2 || this.occ[ni] >= 0 || this.rodAt(nr, nc)) continue;
        seen[ni] = cur;
        if (nr === 0) {
          const out: Cell[] = [];
          for (let k = ni; k !== -1; k = seen[k]) out.push({ r: Math.floor(k / this.cols), c: k % this.cols });
          return out.reverse();
        }
        queue.push(ni);
      }
    }
    return null;
  }

  /** Why a bucket cannot be tapped right now, or null when it can. */
  stuckReason(b: GridBucket): 'frozen' | 'locked' | 'hidden' | 'blocked' | null {
    if (b.gone || b.queued) return 'blocked';
    if (b.mystery && !b.revealed) return 'hidden';
    if (b.frozen > 0) return 'frozen';
    if (b.locked) return 'locked';
    return this.path(b) ? null : 'blocked';
  }

  /** Tappable: colour is known, nothing holds it shut and a way out exists. */
  isOpen(b: GridBucket): boolean {
    return this.stuckReason(b) === null;
  }

  /** Take a bucket out of the board and let the board react. */
  remove(b: GridBucket): BoardChanges {
    this.occ[b.r * this.cols + b.c] = -1;
    b.gone = true;
    return this.settle();
  }

  /**
   * A bucket has popped on the belt: frozen buckets count it down, and a key bucket opens its locks.
   * Returns the buckets that thawed, the ones that only ticked, and the locks that opened.
   */
  onPop(popped: GridBucket): { thawed: GridBucket[]; ticked: GridBucket[]; unlocked: GridBucket[] } {
    const out = { thawed: [] as GridBucket[], ticked: [] as GridBucket[], unlocked: [] as GridBucket[] };
    for (const b of this.buckets) {
      if (b.gone || b.queued || b.frozen <= 0 || b.id === popped.id) continue;
      b.frozen--;
      (b.frozen === 0 ? out.thawed : out.ticked).push(b);
    }
    if (popped.key > 0) {
      for (const b of this.buckets) {
        if (b.gone || !b.locked || b.lock !== popped.key) continue;
        b.locked = false;
        out.unlocked.push(b);
      }
    }
    return out;
  }

  hasFrozen(): boolean {
    return this.buckets.some((b) => !b.gone && !b.queued && b.frozen > 0);
  }

  /** The "nobody left to wait for" rule: thaw everything. Returns what thawed. */
  thawAll(): GridBucket[] {
    const out: GridBucket[] = [];
    for (const b of this.buckets) {
      if (b.gone || b.queued || b.frozen <= 0) continue;
      b.frozen = 0;
      out.push(b);
    }
    return out;
  }

  /** Buckets that still have to leave the board, including the ones inside tunnels. */
  get remaining(): number {
    let n = 0;
    for (const b of this.buckets) if (!b.gone) n++;
    return n;
  }

  openBuckets(): GridBucket[] {
    return this.buckets.filter((b) => this.isOpen(b));
  }
}
