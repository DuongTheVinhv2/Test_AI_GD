import * as THREE from 'three';
import { ART_SOURCES } from '../core/art-data';
import { LANE } from '../core/config';
import { Game, LANE_TIME, LAND_FROM, laneX, type BeltBucket, type GameEvent } from '../core/game';
import type { GridBucket } from '../core/grid';
import { SAND_COLORS } from '../core/palette';
import { BeltView } from './beltview';
import { BoardView } from './boardview';
import { BELT_MOUTH_OFFSET, BucketActor, BucketKit } from './bucketmodel';
import * as fx from './fx';
import { BELT, BOARD, LOWER_STAGE_TILT, WINDOW, windowToWorldX } from './layout3d';
import type { Mats } from './materials';
import { Particles } from './particles';
import { Sky } from './sky';
import { Trophy } from './trophy';
import type { Stage } from './stage';
import type { GlyphAtlas } from './textures';
import { WindowView } from './windowview';

export type SceneEvent =
  | { type: 'tap' }
  | { type: 'reject'; reason: 'blocked' | 'frozen' | 'locked' | 'full' }
  | { type: 'reveal' }
  | { type: 'spawn' }
  | { type: 'rod' }
  | { type: 'thaw' }
  | { type: 'unlock' }
  | { type: 'pull' }
  | { type: 'land' }
  | { type: 'pick'; n: number; intensity: number }
  | { type: 'complete'; color: number }
  | { type: 'win' }
  | { type: 'lose' }
  | { type: 'warn' };

const BOARD_SCALE = 0.89;
const BELT_SCALE = 0.59;
const BELT_RIDE_Y = BELT.y + 0.16;
const BELT_RIDE_Z = 0.9;
/** Where on screen a lane phase (seconds of belt travel) is. */
const laneXAt = (phase: number) => windowToWorldX(laneX(phase / LANE_TIME));
/** A bucket that found no gap yet hovers above the lane at the picture's left edge. */
const HOVER_Y = BELT.y + 0.16 + 0.55;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** The play screen: sky, sand window, belt, board and every bucket, kept in sync with a Game. */
export class PlayScene {
  readonly group = new THREE.Group();
  readonly particles = new Particles();
  game!: Game;
  onEvent: ((e: SceneEvent) => void) | null = null;
  colorAssist = false;
  /** A booster is waiting for a target: board buckets (Hand Pick) or belt buckets (Sand Pull) glow. */
  boostMode: 'none' | 'pick' | 'pull' = 'none';

  private kit: BucketKit;
  private sky = new Sky();
  private root = new THREE.Group();
  private lowerStage = new THREE.Group();
  private win!: WindowView;
  private belt!: BeltView;
  private board!: BoardView;
  private actors = new Map<number, BucketActor>();
  private raycaster = new THREE.Raycaster();
  private shakes = new Map<number, number>();
  private popped = new Set<number>();
  private vanish = new Map<number, number>();
  private lastOpen = new Map<number, boolean>();
  /** seconds since a tunnel pushed this bucket out */
  private spawning = new Map<number, number>();
  private lastSpeed = 0;
  private time = 0;
  private winTimer = 0;
  private pickSound = 0;
  private trophy: Trophy;
  private dim: THREE.Mesh;
  private dimTarget = 0;
  private celebrated = false;

  constructor(
    private stage: Stage,
    private mats: Mats,
    private atlas: GlyphAtlas,
  ) {
    this.kit = new BucketKit(mats, atlas);
    this.group.add(this.sky.group, this.root, this.particles.mesh);
    this.particles.mesh.rotation.x = LOWER_STAGE_TILT;
    this.particles.onLand = () => {};
    this.trophy = new Trophy();
    this.trophy.group.position.set(0, 1.42, 3.4);
    this.group.add(this.trophy.group);
    this.dim = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshBasicMaterial({ color: '#060916', transparent: true, opacity: 0, depthWrite: false }),
    );
    this.dim.position.z = 1.7;
    this.dim.renderOrder = 60;
    this.group.add(this.dim);
  }

  load(game: Game): void {
    this.dispose();
    this.game = game;
    this.root = new THREE.Group();
    this.group.add(this.root);
    this.sky.setTheme(game.level.theme);
    this.stage.setBoardRows(game.board.rows);

    this.win = new WindowView(this.mats, game.sand);
    this.belt = new BeltView(this.mats);
    this.board = new BoardView(this.mats, game.board);
    this.lowerStage.clear();
    this.lowerStage.rotation.x = LOWER_STAGE_TILT;
    this.lowerStage.add(this.belt.group, this.board.group);
    this.root.add(this.win.group, this.lowerStage);

    this.actors.clear();
    for (const b of game.board.buckets) {
      const actor = new BucketActor(this.kit, b.color, b.color, b.mystery);
      actor.setColorAssist(this.colorAssist);
      actor.setStatus(b);
      actor.root.visible = !b.queued;
      this.lowerStage.add(actor.root);
      this.actors.set(b.id, actor);
    }
    this.shakes.clear();
    this.popped.clear();
    this.vanish.clear();
    this.lastOpen.clear();
    this.spawning.clear();
    this.particles.clear();
    this.winTimer = 0;
    this.celebrated = false;
    this.dimTarget = 0;
    this.trophy.hide();
    (this.dim.material as THREE.MeshBasicMaterial).opacity = 0;
    game.onEvent = (e) => this.handle(e);
    this.sync(0, 0);
  }

  dispose(): void {
    if (!this.win) return; // first load: nothing to free yet
    this.group.remove(this.root);
    // Per-level materials and textures (the geometry sweep below only covers geometry).
    this.win.dispose();
    this.belt.dispose();
    for (const a of this.actors.values()) a.dispose();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry && !m.userData.keep) {
        // Shared bucket geometry belongs to the kit; the rest is per-level.
        const g = m.geometry;
        if (g !== this.kit.shellGeo && g !== this.kit.innerGeo && g !== this.kit.rimGeo && g !== this.kit.markerGeo && g !== this.kit.moundGeo && g !== this.kit.shadowGeo) g.dispose();
      }
    });
    this.actors.clear();
  }

  // ------------------------------------------------------------ input

  projectSpeedAnchor(): THREE.Vector3 {
    return this.belt.speedAnchor.getWorldPosition(this.speedAnchorPosition).project(this.stage.camera);
  }

  private readonly speedAnchorPosition = new THREE.Vector3();

  /** Bucket id under a screen position, if any. */
  pick(clientX: number, clientY: number): number | null {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.45);
    this.lowerStage.updateWorldMatrix(true, false);
    plane.applyMatrix4(this.lowerStage.matrixWorld);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
    const local = this.lowerStage.worldToLocal(hit);
    const cell = this.board.cellAt(local.x, local.y);
    if (!cell) return null;
    const b = this.game.board.bucketAt(cell.r, cell.c);
    return b ? b.id : null;
  }

  private readonly tmpV = new THREE.Vector3();

  /** Belt bucket nearest to a screen position (within reach of a finger), if any can take Sand Pull. */
  pickBelt(clientX: number, clientY: number): number | null {
    let best: number | null = null;
    let bestD = 56;
    for (const bb of this.game.pullTargets()) {
      const a = this.actors.get(bb.id);
      if (!a) continue;
      const p = a.root.getWorldPosition(this.tmpV).project(this.stage.camera);
      const d = Math.hypot((p.x + 1) * window.innerWidth / 2 - clientX, (1 - p.y) * window.innerHeight / 2 - clientY);
      if (d < bestD) {
        bestD = d;
        best = bb.id;
      }
    }
    return best;
  }

  tap(id: number): void {
    this.game.tap(id);
  }

  // ------------------------------------------------------------ events

  private emit(e: SceneEvent): void {
    this.onEvent?.(e);
  }

  private handle(e: GameEvent): void {
    switch (e.type) {
      case 'tap': {
        const a = this.actors.get(e.bucket.id);
        a?.punch(0.25);
        this.emit({ type: 'tap' });
        break;
      }
      case 'reject': {
        this.shakes.set(e.id, 0.0001);
        if (e.reason === 'full') this.belt.nudge();
        this.emit({ type: 'reject', reason: e.reason });
        break;
      }
      case 'reveal': {
        const a = this.actors.get(e.bucket.id);
        const p = a?.root.position;
        if (p) {
          fx.sparkle(this.particles, p.x, p.y, '#ffffff', 10, 1.4, 1.2);
          fx.dust(this.particles, p.x, p.y, '#cfd6f0', 6, 0.4, 1.2, 0.5, 1.1);
        }
        a?.punch(0.4);
        this.emit({ type: 'reveal' });
        break;
      }
      case 'land': {
        const a = this.actors.get(e.bucket.id);
        a?.punch(0.3);
        this.emit({ type: 'land' });
        break;
      }
      case 'spawn': {
        this.spawning.set(e.bucket.id, 0.0001);
        this.emit({ type: 'spawn' });
        break;
      }
      case 'rod': {
        const p = this.board.cellCenter(e.rod.cells[e.rod.cells.length - 1].r, e.rod.cells[e.rod.cells.length - 1].c);
        fx.dust(this.particles, p.x, p.y, '#d9b27a', 8, 0.5, 1.2, 0.5, 1.1);
        this.emit({ type: 'rod' });
        break;
      }
      case 'thaw': {
        const a = this.actors.get(e.bucket.id);
        const p = a?.root.position;
        a?.setStatus(e.bucket);
        a?.punch(e.left === 0 ? 0.5 : 0.25);
        if (p) fx.sparkle(this.particles, p.x, p.y, e.left === 0 ? '#bfeaff' : '#e8fbff', e.left === 0 ? 14 : 4, 1.4, 1.2);
        if (e.left === 0) this.shakes.set(e.bucket.id, 0.0001);
        this.emit({ type: 'thaw' });
        break;
      }
      case 'pull': {
        const a = this.actors.get(e.bucket.id);
        const p = a?.root.position;
        a?.punch(0.5);
        if (p) fx.sparkle(this.particles, p.x, p.y, SAND_COLORS[e.bucket.color].hex, 16, 1.6, 1.2);
        this.emit({ type: 'pull' });
        break;
      }
      case 'unlock': {
        const a = this.actors.get(e.bucket.id);
        const p = a?.root.position;
        a?.setStatus(e.bucket);
        a?.punch(0.5);
        if (p) fx.sparkle(this.particles, p.x, p.y, '#ffe27a', 14, 1.5, 1.2);
        this.emit({ type: 'unlock' });
        break;
      }
      case 'pick': {
        // A stream of grains falls from the picked columns into the mouth of the bucket that is catching them.
        const sim = this.game.sand;
        const n = Math.min(6, e.xs.length);
        // The picture faces the camera, while the particles and bucket ride in the tilted space.
        const source = this.lowerStage.worldToLocal(new THREE.Vector3(0, WINDOW.bottom - 0.05, 0.32));
        const mouthY = BELT_RIDE_Y + BELT_MOUTH_OFFSET.y * BELT_SCALE;
        const mouthZ = BELT_RIDE_Z + BELT_MOUTH_OFFSET.z * BELT_SCALE;
        const gravity = 16;
        const launchSpeed = 3;
        const fall = Math.max(0.01, source.y - mouthY);
        const life = (Math.sqrt(launchSpeed ** 2 + 2 * gravity * fall) - launchSpeed) / gravity;
        const arrival = Math.min(1, e.bucket.s + life / LANE_TIME);
        const mouthX = windowToWorldX(laneX(arrival));
        for (let i = 0; i < n; i++) {
          const x = windowToWorldX((e.xs[Math.floor((i * e.xs.length) / n)] + 0.5) / sim.w);
          this.particles.spawn({
            kind: 'grain',
            x,
            y: source.y,
            z: source.z,
            vx: (mouthX - x + (Math.random() - 0.5) * 0.18) / life,
            vy: -launchSpeed,
            vz: (mouthZ - source.z) / life,
            life,
            size: 0.1 + Math.random() * 0.05,
            color: e.bucket.color,
            gravity,
          });
        }
        this.pickSound += e.n;
        break;
      }
      case 'complete': {
        const a = this.actors.get(e.bucket.id);
        a?.punch(0.6);
        this.emit({ type: 'complete', color: e.bucket.color });
        break;
      }
      case 'warn':
        this.belt.nudge();
        this.emit({ type: 'warn' });
        break;
      case 'win':
        this.winTimer = 0.0001;
        for (const bb of this.game.belt) {
          const a = this.actors.get(bb.id);
          if (a && bb.state !== 'pop') {
            fx.sparkle(this.particles, a.root.position.x, a.root.position.y, SAND_COLORS[bb.color].hex, 8, 1.4, 1.3);
            this.vanish.set(bb.id, 0.0001);
          }
        }
        this.emit({ type: 'win' });
        break;
      case 'lose':
        this.emit({ type: 'lose' });
        break;
    }
  }

  // ------------------------------------------------------------ frame

  update(dt: number, time: number): void {
    this.time = time;
    const g = this.game;
    g.advance(dt);
    this.sync(dt, time);
    this.board.update(dt);
    this.win.update(time);
    const speed = g.status === 'lost' ? 0 : LANE.speed * WINDOW.size;
    this.lastSpeed += (speed - this.lastSpeed) * (1 - Math.exp(-dt * 6));
    this.belt.update(dt, this.lastSpeed);
    this.belt.setCount(g.slotsUsed, g.slots);
    this.belt.setAlarm(g.jamWarning);
    this.particles.update(dt, this.stage.camera);
    this.sky.update(time, this.stage.camera);

    if (this.pickSound > 0) {
      this.emit({ type: 'pick', n: this.pickSound, intensity: Math.min(1, this.pickSound / 40) });
      this.pickSound = 0;
    }
    if (this.winTimer > 0) {
      this.winTimer += dt;
      if (this.winTimer > 0.7 && !this.celebrated) {
        this.celebrated = true;
        this.dimTarget = 0.96;
        this.trophy.show(ART_SOURCES[this.game.level.art]);
        fx.confetti(this.particles, 0, WINDOW.cy + 4.2, 130, 11, 2.6);
        fx.sparkle(this.particles, 0, 0.5, '#fff2b0', 22, 3.2, 2.7);
        this.stage.flash(0.1);
        this.stage.kick(0.08);
      }
    }
    const dm = this.dim.material as THREE.MeshBasicMaterial;
    dm.opacity += (this.dimTarget - dm.opacity) * (1 - Math.exp(-dt * 4));
    this.trophy.update(dt, time);
    if (this.trophy.shown && Math.random() < dt * 14) {
      fx.sparkle(this.particles, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, '#fff3c0', 1, 0.5, 2.7);
    }
  }

  private cellOf(b: GridBucket): { x: number; y: number } {
    return this.board.cellCenter(b.r, b.c);
  }

  private sync(dt: number, time: number): void {
    const g = this.game;
    const beltById = new Map<number, BeltBucket>();
    for (const bb of g.belt) beltById.set(bb.id, bb);

    // shake timers
    for (const [id, t] of this.shakes) {
      const n = t + dt;
      if (n > 0.45) this.shakes.delete(id);
      else this.shakes.set(id, n);
    }

    for (const gb of g.board.buckets) {
      const a = this.actors.get(gb.id)!;
      const bb = beltById.get(gb.id);
      if (gb.queued) {
        a.root.visible = false;
        continue;
      }
      if (bb) {
        this.syncBelt(a, bb, dt, time);
        const vt = this.vanish.get(gb.id);
        if (vt !== undefined) {
          const n = vt + dt;
          this.vanish.set(gb.id, n);
          a.root.scale.multiplyScalar(Math.max(0, 1 - n / 0.45));
          if (n >= 0.45) a.root.visible = false;
        }
      } else if (gb.gone) {
        a.root.visible = false;
      } else {
        this.syncBoard(a, gb, dt, time);
      }
      a.update(dt, time);
    }
  }

  private syncBoard(a: BucketActor, gb: GridBucket, dt: number, time: number): void {
    const g = this.game;
    a.root.visible = true;
    const open = g.board.isOpen(gb);
    const was = this.lastOpen.get(gb.id);
    const mode = gb.mystery && !gb.revealed ? 'mystery' : gb.frozen > 0 ? 'frozen' : gb.locked ? 'locked' : open ? 'open' : 'blocked';
    a.setStatus(gb);
    if (a.mode !== mode) {
      a.setMode(mode);
      if (mode === 'open' && was === false) a.punch(0.3);
    }
    this.lastOpen.set(gb.id, open);
    const c = this.cellOf(gb);
    let sx = 0;
    const st = this.shakes.get(gb.id);
    if (st !== undefined) sx = Math.sin(st * 70) * 0.12 * (1 - st / 0.45);
    const bob = open && g.status === 'playing' ? Math.sin(time * 2.6 + gb.c * 1.7 + gb.r) * 0.04 : 0;
    a.root.position.set(c.x + sx, c.y + 0.1 + bob, 0.95);
    a.root.scale.setScalar(BOARD_SCALE);
    // Just pushed out of a tunnel: slide from the mouth to its tile while growing.
    const sp = this.spawning.get(gb.id);
    if (sp !== undefined) {
      const n = sp + dt;
      const k = clamp01(n / 0.4);
      const tn = g.board.tunnels[gb.tunnel];
      if (tn) {
        const m = this.board.cellCenter(tn.r, tn.c);
        const e = ease(k);
        a.root.position.set(m.x + (c.x - m.x) * e, m.y + 0.1 + (c.y - m.y) * e, 0.95 + (1 - e) * 0.2);
        a.root.scale.setScalar(BOARD_SCALE * (0.35 + 0.65 * e));
      }
      if (n >= 0.4) this.spawning.delete(gb.id);
      else this.spawning.set(gb.id, n);
    }
    const want = this.boostMode === 'pick' ? (gb.frozen === 0 && !gb.locked ? 6 : 0) : open && g.slotsUsed < g.slots && g.status === 'playing' ? 1 : 0;
    a.hint += (want - a.hint) * (1 - Math.exp(-dt * 8));
    a.wobble = sx * 1.5;
    a.setFill(0);
    a.setColorAssist(this.colorAssist);
  }

  private syncBelt(a: BucketActor, bb: BeltBucket, dt: number, time: number): void {
    a.root.visible = true;
    a.hint = 0;
    a.setColorAssist(this.colorAssist);
    a.setBeam(0);
    const g = this.game;
    const gb = g.board.buckets[bb.id];
    const fillF = bb.fill / bb.cap;
    switch (bb.state) {
      case 'flying': {
        a.setMode('open');
        const u = clamp01(bb.t / bb.flyTime);
        // Follow the path over the board, then hop onto the lane at the spot it will land on.
        const pts = bb.path.map((p) => this.board.cellCenter(p.r, p.c));
        const viaReturn = bb.returnExitAt !== undefined;
        const landX = laneXAt(viaReturn ? LANE_TIME : bb.landPhase >= 0 ? bb.landPhase : LAND_FROM);
        const landY = viaReturn ? BELT.y + 1.25 : bb.landPhase >= 0 ? BELT.y + 0.16 : HOVER_Y;
        const topCell = pts[pts.length - 1];
        const route = [...pts, { x: topCell.x + (landX - topCell.x) * 0.3, y: BELT.y - 1.5 }, { x: landX, y: landY }];
        // length-parametrised position
        let total = 0;
        const segs: number[] = [];
        for (let i = 1; i < route.length; i++) {
          const d = Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
          segs.push(d);
          total += d;
        }
        let d = ease(u) * total;
        let px = route[0].x;
        let py = route[0].y;
        for (let i = 0; i < segs.length; i++) {
          if (d <= segs[i] || i === segs.length - 1) {
            const k = segs[i] > 0 ? d / segs[i] : 0;
            px = route[i].x + (route[i + 1].x - route[i].x) * k;
            py = route[i].y + (route[i + 1].y - route[i].y) * k;
            break;
          }
          d -= segs[i];
        }
        const sc = BOARD_SCALE + (BELT_SCALE - BOARD_SCALE) * ease(u);
        a.root.position.set(px, py + 0.1, 1.3);
        const tuck = viaReturn ? ease(clamp01((u - 0.75) / 0.25)) : 0;
        a.root.scale.setScalar(Math.max(0.001, sc * (1 - tuck)));
        a.label.visible = false;
        a.setFill(0);
        void gb;
        break;
      }
      case 'waiting': {
        if (bb.returnExitAt !== undefined) {
          a.root.visible = false;
          break;
        }
        // No gap on the belt yet: hover over the lane's left edge and drop in as soon as one comes.
        a.setMode('belt');
        a.label.visible = false;
        a.root.position.set(laneXAt(LAND_FROM), HOVER_Y + Math.sin(time * 6 + bb.id) * 0.05, 1.0);
        a.root.scale.setScalar(BELT_SCALE);
        a.setFill(0);
        break;
      }
      case 'lane': {
        a.setMode('belt');
        const x = windowToWorldX(laneX(bb.s));
        // Slide in from, and out of, the end caps.
        const edge = Math.min(bb.s, 1 - bb.s) / 0.045;
        const sc = BELT_SCALE * clamp01(edge);
        // A bucket that has just dropped in settles with a small bounce.
        const sinceLand = bb.t - (bb.landPhase >= 0 ? bb.landPhase : LAND_FROM);
        const settle = bb.laps === 0 && sinceLand >= 0 && sinceLand < 0.25 ? Math.sin((sinceLand / 0.25) * Math.PI) * 0.12 * (1 - sinceLand / 0.25) : 0;
        a.root.position.set(x, BELT_RIDE_Y + settle, BELT_RIDE_Z);
        a.root.scale.setScalar(Math.max(0.001, sc));
        a.setFill(fillF);
        a.setLabel(fillF * 100);
        a.wobble = Math.sin(time * 5 + bb.id) * 0.02;
        // Show where this bucket reaches while it is under the picture and still has room.
        if (this.boostMode === 'pull' && bb.fill < bb.cap && this.game.sand.counts[bb.color] > 0) a.hint = 6;
        const underPicture = bb.s > 0.09 && bb.s < 0.91 && bb.fill < bb.cap;
        a.setBeam(underPicture ? (bb.lastPick > 0 ? 0.55 : 0.2) : 0);
        break;
      }
      case 'return': {
        a.root.visible = false;
        break;
      }
      case 'pop': {
        a.setMode('belt');
        const u = clamp01(bb.t / LANE.popTime);
        const x = windowToWorldX(laneX(bb.s));
        const up = ease(clamp01(u / 0.5));
        const sc = BELT_SCALE * (1 + up * 0.9);
        a.root.position.set(x, BELT.y + 0.16 + up * 0.5, 1.1);
        a.setFill(1);
        a.setLabel(100);
        if (u < 0.5) {
          a.root.scale.setScalar(sc);
        } else {
          a.root.visible = false;
          if (!this.popped.has(bb.id)) {
            this.popped.add(bb.id);
            const col = SAND_COLORS[bb.color].hex;
            fx.confetti(this.particles, x, BELT.y + 0.5, 46, 6.5, 1.3);
            fx.sparkle(this.particles, x, BELT.y + 0.5, col, 14, 2.4, 1.3);
            fx.sparkle(this.particles, x, BELT.y + 0.5, '#ffffff', 8, 1.6, 1.35);
            this.stage.kick(0.06);
          }
        }
        break;
      }
    }
  }
}
