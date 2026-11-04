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

    // Blue shoulders and a recessed tray make the tile field read as one molded piece.
    const trayWidth = board.cols * cell + 0.12;
    const trayHeight = board.rows * cell + 0.12;
    const apronTop = BOARD.top + 0.78;
    const trayBottom = BOARD.top - trayHeight;
    const sideWidth = Math.max(0.7, (STAGE.w - trayWidth) / 2 + 0.12);
    const shoulderHeight = apronTop - trayBottom;
    const shoulder = new RoundedBoxGeometry(sideWidth, shoulderHeight + 0.2, 0.64, 3, 0.15);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(shoulder, mats.slate);
      wall.position.set(side * (trayWidth + sideWidth) / 2, apronTop - shoulderHeight / 2, 0.03);
      wall.receiveShadow = true;
      this.group.add(wall);
    }
    const bottom = new THREE.Mesh(
      new RoundedBoxGeometry(trayWidth + sideWidth * 2, 14, 0.64, 3, 0.15), mats.slate,
    );
    bottom.position.set(0, trayBottom - 7, 0.03);
    this.group.add(bottom);

    const well = new THREE.Mesh(
      new RoundedBoxGeometry(trayWidth + 0.1, trayHeight, 0.28, 3, 0.1), mats.frameInner,
    );
    well.position.set(0, BOARD.top - trayHeight / 2, -0.31);
    well.receiveShadow = true;
    this.group.add(well);

    const tileGeo = new RoundedBoxGeometry(cell - 0.23, cell - 0.20, 0.19, 4, 0.095);
    const edgeGeo = new RoundedBoxGeometry(cell - 0.21, cell - 0.18, 0.16, 3, 0.08);
    const wallGeo = new RoundedBoxGeometry(cell - 0.10, cell - 0.08, 0.84, 4, 0.13);
    // The outward face is blue, while the sides show the depth of the obstacle.
    const wallMats = [mats.hole, mats.hole, mats.slate, mats.hole, mats.slate, mats.hole];
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const t = board.tile(r, c);
        const x = BOARD.colX(c, board.cols);
        const y = BOARD.rowY(r);
        if (t === Tile.Floor) {
          const edge = new THREE.Mesh(edgeGeo, mats.frameInner);
          edge.position.set(x, y, 0.0);
          edge.receiveShadow = true;
          const tile = new THREE.Mesh(tileGeo, mats.tile);
          tile.position.set(x, y, 0.06);
          tile.receiveShadow = true;
          this.group.add(edge, tile);
        } else {
          const wall = new THREE.Mesh(wallGeo, wallMats);
          wall.position.set(x, y, 0.38);
          wall.castShadow = true;
          wall.receiveShadow = true;
          this.group.add(wall);
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
