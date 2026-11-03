export const enum Tile {
  Void = 0,
  Floor = 1,
  Hole = 2,
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
}

export interface Cell {
  r: number;
  c: number;
}

const DIRS: Array<[number, number]> = [
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, 0],
];

/** The tile board under the belt. Row 0 is the row closest to the belt: buckets leave through it. */
export class Board {
  readonly rows: number;
  readonly cols: number;
  readonly tiles: Uint8Array;
  readonly occ: Int16Array;
  readonly buckets: GridBucket[] = [];

  /**
   * @param tileRows one string per row: '.' void, 'o' floor, 'x' hole
   * @param bucketRows one array of tokens per row: '.' none, '5' colour id in base 36, '?5' mystery bucket of that colour
   */
  constructor(tileRows: string[], bucketRows: string[][]) {
    this.rows = tileRows.length;
    this.cols = tileRows[0].length;
    this.tiles = new Uint8Array(this.rows * this.cols);
    this.occ = new Int16Array(this.rows * this.cols).fill(-1);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = tileRows[r][c];
        this.tiles[r * this.cols + c] = ch === 'o' ? Tile.Floor : ch === 'x' ? Tile.Hole : Tile.Void;
      }
    }
    let id = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tok = bucketRows[r]?.[c] ?? '.';
        if (tok === '.' || tok === ' ') continue;
        const mystery = tok[0] === '?';
        const color = parseInt(mystery ? tok.slice(1) : tok, 36);
        if (this.tiles[r * this.cols + c] !== Tile.Floor) throw new Error(`bucket on non-floor tile at ${r},${c}`);
        const b: GridBucket = { id, color, r, c, mystery, revealed: !mystery, gone: false };
        this.buckets.push(b);
        this.occ[r * this.cols + c] = id;
        id++;
      }
    }
    this.updateReveal();
  }

  /** A mystery bucket shows its colour once any neighbouring floor tile is empty. */
  updateReveal(): GridBucket[] {
    const shown: GridBucket[] = [];
    for (const b of this.buckets) {
      if (b.gone || !b.mystery || b.revealed) continue;
      for (const [dr, dc] of DIRS) {
        const nr = b.r + dr;
        const nc = b.c + dc;
        if (this.tile(nr, nc) === Tile.Floor && this.occ[nr * this.cols + nc] < 0) {
          b.revealed = true;
          shown.push(b);
          break;
        }
      }
    }
    return shown;
  }

  clone(): Board {
    const b = Object.create(Board.prototype) as Board;
    (b as { rows: number }).rows = this.rows;
    (b as { cols: number }).cols = this.cols;
    (b as { tiles: Uint8Array }).tiles = this.tiles;
    (b as { occ: Int16Array }).occ = this.occ.slice();
    (b as { buckets: GridBucket[] }).buckets = this.buckets.map((x) => ({ ...x }));
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
    if (b.gone) return null;
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
        if (seen[ni] !== -2 || this.occ[ni] >= 0) continue;
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

  /** Tappable: colour is known and a way out exists. */
  isOpen(b: GridBucket): boolean {
    if (b.gone) return false;
    if (b.mystery && !b.revealed) return false;
    return this.path(b) !== null;
  }

  /** Take a bucket out of the board. Returns mystery buckets that this uncovered. */
  remove(b: GridBucket): GridBucket[] {
    this.occ[b.r * this.cols + b.c] = -1;
    b.gone = true;
    return this.updateReveal();
  }

  get remaining(): number {
    let n = 0;
    for (const b of this.buckets) if (!b.gone) n++;
    return n;
  }

  openBuckets(): GridBucket[] {
    return this.buckets.filter((b) => this.isOpen(b));
  }
}
