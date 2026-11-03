import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Tile, type Board } from '../core/grid';
import { BOARD, STAGE } from './layout3d';
import type { Mats } from './materials';

/** Slate slab, tiles and holes of the bucket board. */
export class BoardView {
  readonly group = new THREE.Group();
  readonly cols: number;
  readonly rows: number;

  constructor(mats: Mats, board: Board) {
    this.cols = board.cols;
    this.rows = board.rows;
    const cell = BOARD.cell;

    // The slab runs the full width and well below the screen.
    const slabH = 16;
    const slab = new THREE.Mesh(new RoundedBoxGeometry(STAGE.w + 14, slabH, 0.7, 4, 0.3), mats.slate);
    slab.position.set(0, BOARD.top - slabH / 2 + 0.05, -0.35);
    slab.receiveShadow = true;
    slab.castShadow = true;
    this.group.add(slab);

    const tileGeo = new RoundedBoxGeometry(cell - 0.1, cell - 0.1, 0.16, 3, 0.08);
    const edgeGeo = new RoundedBoxGeometry(cell + 0.02, cell + 0.02, 0.12, 3, 0.1);
    const holeGeo = new RoundedBoxGeometry(cell - 0.14, cell - 0.14, 0.1, 3, 0.1);
    const ledgeGeo = new RoundedBoxGeometry(cell - 0.14, 0.34, 0.16, 3, 0.08);
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const t = board.tile(r, c);
        if (t === Tile.Void) continue;
        const x = BOARD.colX(c, board.cols);
        const y = BOARD.rowY(r);
        if (t === Tile.Floor) {
          const edge = new THREE.Mesh(edgeGeo, mats.white);
          edge.position.set(x, y, 0.0);
          edge.receiveShadow = true;
          const tile = new THREE.Mesh(tileGeo, mats.tile);
          tile.position.set(x, y, 0.06);
          tile.receiveShadow = true;
          this.group.add(edge, tile);
        } else {
          const edge = new THREE.Mesh(edgeGeo, mats.white);
          edge.position.set(x, y, 0.0);
          const hole = new THREE.Mesh(holeGeo, mats.hole);
          hole.position.set(x, y, 0.1);
          const ledge = new THREE.Mesh(ledgeGeo, mats.tile);
          ledge.position.set(x, y - cell / 2 + 0.26, 0.15);
          this.group.add(edge, hole, ledge);
        }
      }
    }
  }

  cellCenter(r: number, c: number): { x: number; y: number } {
    return { x: BOARD.colX(c, this.cols), y: BOARD.rowY(r) };
  }

  /** Which tile a world point is over. */
  cellAt(x: number, y: number): { r: number; c: number } | null {
    const cell = BOARD.cell;
    const c = Math.round(x / cell + (this.cols - 1) / 2);
    const r = Math.floor((BOARD.top - y) / cell);
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return null;
    return { r, c };
  }
}
