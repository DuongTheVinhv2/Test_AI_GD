import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DIR_VEC, Tile, type Board, type Dir, type Rod, type Tunnel } from '../core/grid';
import { SAND_COLORS } from '../core/palette';
import { BOARD, STAGE } from './layout3d';
import type { Mats } from './materials';
import { arrowTexture, numberTexture, ringTexture } from './textures';

/** Rotation of an up-pointing arrow plane for each direction on the board (row 0 is up). */
const ARROW_ROT: Record<Dir, number> = { u: 0, l: Math.PI / 2, d: Math.PI, r: -Math.PI / 2 };

interface TunnelObj {
  t: Tunnel;
  ring: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  count: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  key: string;
}

interface RodObj {
  rod: Rod;
  group: THREE.Group;
  /** seconds since it opened; -1 while closed */
  t: number;
}

const SLIDE_TIME = 0.5;

/** Slate slab, tiles and holes of the bucket board. */
export class BoardView {
  readonly group = new THREE.Group();
  readonly cols: number;
  readonly rows: number;
  private tunnels: TunnelObj[] = [];
  private rods: RodObj[] = [];

  constructor(
    mats: Mats,
    private board: Board,
  ) {
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
        } else if (t === Tile.Tunnel) {
          // the mouth is drawn below, with the tunnel's own look
        } else {
          const wall = new THREE.Mesh(wallGeo, wallMats);
          wall.position.set(x, y, 0.38);
          wall.castShadow = true;
          wall.receiveShadow = true;
          this.group.add(wall);
        }
      }
    }
    this.buildMechanics(mats);
    this.update(0);
  }

  /** Tunnel mouths and gate bars, built after the tiles. */
  private buildMechanics(mats: Mats): void {
    const board = this.board;
    const cell = BOARD.cell;
    const pipeGeo = new RoundedBoxGeometry(cell - 0.10, cell - 0.08, 0.84, 4, 0.13);
    const pipeMat = new THREE.MeshStandardMaterial({ color: '#2f6f86', roughness: 0.55, metalness: 0.1 });
    const holeMat = new THREE.MeshBasicMaterial({ color: '#0d1c26' });
    for (const t of board.tunnels) {
      const p = this.cellCenter(t.r, t.c);
      const g = new THREE.Group();
      g.position.set(p.x, p.y, 0);
      const body = new THREE.Mesh(pipeGeo, pipeMat);
      body.position.z = 0.38;
      body.castShadow = true;
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.66, 32), holeMat);
      mouth.position.z = 0.81;
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 1.62), new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false }));
      ring.position.z = 0.82;
      const count = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      count.position.z = 0.83;
      const [dr, dc] = DIR_VEC[t.dir];
      const arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: arrowTexture(), transparent: true, depthWrite: false }));
      arrow.position.set(dc * (cell / 2 - 0.2), -dr * (cell / 2 - 0.2), 0.84);
      arrow.rotation.z = ARROW_ROT[t.dir];
      g.add(body, mouth, ring, count, arrow);
      this.group.add(g);
      this.tunnels.push({ t, ring, count, key: '' });
    }
    const woodMat = new THREE.MeshStandardMaterial({ color: '#c98a4a', roughness: 0.6, metalness: 0.05 });
    const pegMat = new THREE.MeshStandardMaterial({ color: '#6b3f1b', roughness: 0.7 });
    for (const rod of board.rods) {
      const g = new THREE.Group();
      const first = this.cellCenter(rod.cells[0].r, rod.cells[0].c);
      const last = this.cellCenter(rod.cells[rod.cells.length - 1].r, rod.cells[rod.cells.length - 1].c);
      const horizontal = rod.dir === 'l' || rod.dir === 'r';
      const len = rod.cells.length * cell - 0.34;
      const bar = new THREE.Mesh(new RoundedBoxGeometry(horizontal ? len : 0.78, horizontal ? 0.78 : len, 0.6, 3, 0.22), woodMat);
      bar.position.z = 0.5;
      bar.castShadow = true;
      g.add(bar);
      for (const cc of rod.cells) {
        const q = this.cellCenter(cc.r, cc.c);
        const peg = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), pegMat);
        peg.position.set(q.x - (first.x + last.x) / 2, q.y - (first.y + last.y) / 2, 0.81);
        g.add(peg);
      }
      const arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: arrowTexture(), transparent: true, depthWrite: false }));
      arrow.position.set(last.x - (first.x + last.x) / 2, last.y - (first.y + last.y) / 2, 0.83);
      arrow.rotation.z = ARROW_ROT[rod.dir];
      g.add(arrow);
      g.position.set((first.x + last.x) / 2, (first.y + last.y) / 2, 0);
      this.group.add(g);
      this.rods.push({ rod, group: g, t: rod.open ? SLIDE_TIME : -1 });
      if (rod.open) g.visible = false;
    }
    void mats;
  }

  /** Per-frame upkeep: tunnel counters and ring colours, gate bars sliding out. */
  update(dt: number): void {
    for (const o of this.tunnels) {
      const q = o.t.queue;
      const next = q.length ? this.board.buckets[q[0]].color : -1;
      const key = `${q.length}|${next}`;
      if (key === o.key) continue;
      o.key = key;
      const live = q.length > 0;
      o.ring.visible = o.count.visible = live;
      if (!live) continue;
      o.ring.material.color.set(SAND_COLORS[next].hex);
      o.count.material.map = numberTexture(String(q.length), '#ffffff', '#0d1c26');
      o.count.material.needsUpdate = true;
    }
    for (const o of this.rods) {
      if (o.rod.open && o.t < 0) o.t = 0;
      if (o.t < 0 || !o.group.visible) continue;
      o.t += dt;
      const k = Math.min(1, o.t / SLIDE_TIME);
      const [dr, dc] = DIR_VEC[o.rod.dir];
      const slide = k * k * BOARD.cell * 0.9;
      const base = o.group.userData.base as { x: number; y: number } | undefined;
      if (!base) o.group.userData.base = { x: o.group.position.x, y: o.group.position.y };
      const b = o.group.userData.base as { x: number; y: number };
      o.group.position.set(b.x + dc * slide, b.y - dr * slide, 0);
      o.group.scale.setScalar(1 - k * 0.6);
      if (k >= 1) o.group.visible = false;
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
