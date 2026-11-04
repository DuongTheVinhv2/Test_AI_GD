import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BELT } from './layout3d';
import type { Mats } from './materials';
import { laneTextures, softDot } from './textures';

function plateTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 256);
  g.font = '900 162px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 16;
  g.strokeStyle = '#1b2447';
  g.strokeText(text, 256, 140);
  g.fillStyle = '#ffffff';
  g.fillText(text, 256, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Face of the molded conveyor. The upper ends disappear under the roller hoods. */
function trackGeometry(inset: number, depth: number): THREE.ExtrudeGeometry {
  const outer = 6.94 - inset;
  const inner = 5.23 + inset;
  const bottom = -1.12 + inset;
  const ceiling = 1.12 - inset;
  const end = 1.84;
  const bend = 1.66;
  const innerBend = 0.65;
  const shape = new THREE.Shape();
  shape.moveTo(-outer, end);
  shape.lineTo(-outer, bottom + bend);
  shape.quadraticCurveTo(-outer, bottom, -outer + bend, bottom);
  shape.lineTo(outer - bend, bottom);
  shape.quadraticCurveTo(outer, bottom, outer, bottom + bend);
  shape.lineTo(outer, end);
  shape.lineTo(inner, end);
  shape.lineTo(inner, ceiling + innerBend);
  shape.quadraticCurveTo(inner, ceiling, inner - innerBend, ceiling);
  shape.lineTo(-inner + innerBend, ceiling);
  shape.quadraticCurveTo(-inner, ceiling, -inner, ceiling + innerBend);
  shape.lineTo(-inner, end);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: 0.075, bevelThickness: 0.09,
    bevelSegments: 3, curveSegments: 20,
  });
}

export class BeltView {
  readonly group = new THREE.Group();
  readonly speedAnchor = new THREE.Object3D();
  private tex = laneTextures();
  private scroll = 0;
  private plateMat: THREE.MeshBasicMaterial;
  private plate: THREE.Group;
  private shown = '';
  private pulse = 0;
  /** Plate textures by counter text (a handful of values), so changing the count never allocates a new one. */
  private plateTex = new Map<string, THREE.CanvasTexture>();
  private ownMats: THREE.Material[] = [];
  /** Red pulsing glow behind the belt while the level is about to be lost. */
  private alarmMat: THREE.MeshBasicMaterial;
  private chassisMat: THREE.MeshPhysicalMaterial;
  private chassisIdle: THREE.Color;
  private chassisHot = new THREE.Color('#e27e68');
  private crowded = false;
  private alarmTarget = 0;
  private alarm = 0;
  private clock = 0;

  constructor(mats: Mats) {
    const y = BELT.y;
    const half = BELT.innerHalf;

    this.chassisMat = mats.silver.clone();
    this.chassisIdle = mats.silver.color.clone();
    const chassis = new THREE.Mesh(trackGeometry(0, 0.66), this.chassisMat);
    chassis.position.set(0, y, -0.73);
    chassis.castShadow = true;
    this.group.add(chassis);

    const wallMat = new THREE.MeshStandardMaterial({ color: '#6275a5', roughness: 0.76 });
    const wall = new THREE.Mesh(trackGeometry(0.24, 0.10), wallMat);
    wall.position.set(0, y, -0.12);
    this.group.add(wall);

    this.tex.map.repeat.set(half / 2.08, 1);
    const treadMat = new THREE.MeshStandardMaterial({
      map: this.tex.map, bumpMap: this.tex.bump, bumpScale: 0.08, roughness: 0.85, transparent: true, opacity: 0.12, depthWrite: false,
    });
    const tread = new THREE.Mesh(new THREE.PlaneGeometry(9.1, 1.16), treadMat);
    tread.position.set(0, y - 0.28, 0.09);
    this.group.add(tread);

    const hoodGeo = new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2);
    const collarGeo = new RoundedBoxGeometry(2.07, 0.42, 0.70, 5, 0.19);
    for (const side of [-1, 1]) {
      const x = side * 6.08;
      const hood = new THREE.Mesh(hoodGeo, mats.silverDark);
      hood.scale.set(1.04, 1.22, 0.73);
      hood.position.set(x, y + 1.59, -0.09);
      const collar = new THREE.Mesh(collarGeo, mats.frameInner);
      collar.position.set(x, y + 1.59, 0.44);
      this.group.add(hood, collar);
      if (side === 1) {
        this.speedAnchor.position.copy(hood.position);
        this.speedAnchor.position.y += hood.scale.y;
        this.group.add(this.speedAnchor);
      }
    }

    // Plate with the belt counter.
    this.plate = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.4, 1.05, 0.4, 5, 0.22), mats.plate);
    body.castShadow = true;
    const border = new THREE.Mesh(new RoundedBoxGeometry(2.85, 1.42, 0.3, 5, 0.29), mats.frame);
    border.position.z = -0.08;
    this.plateMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(2.16, 1.04), this.plateMat);
    txt.position.z = 0.22;
    this.plate.add(border, body, txt);
    this.plate.position.set(0, BELT.plateY, 1.6); // in front of a bucket that is flying past, so the N/5 counter stays readable
    this.group.add(this.plate);
    this.alarmMat = new THREE.MeshBasicMaterial({ map: softDot(), color: '#ff2a2a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.6), this.alarmMat);
    glow.position.set(0, (BELT.y + BELT.plateY) / 2, 0.25);
    glow.renderOrder = 3;
    this.group.add(glow);
    this.ownMats.push(this.chassisMat, wallMat, treadMat, this.plateMat, this.alarmMat);
    this.setCount(0, 5);
  }

  setCount(n: number, max: number): void {
    const t = `${n}/${max}`;
    if (t === this.shown) return;
    this.crowded = n >= max - 1 && n > 0;
    if (this.shown) this.pulse = 1;
    this.shown = t;
    let tex = this.plateTex.get(t);
    if (!tex) {
      tex = plateTexture(t);
      this.plateTex.set(t, tex);
    }
    this.plateMat.map = tex;
    this.plateMat.needsUpdate = true;
  }

  /** Free the GPU resources this view owns (geometry is freed by the scene; shared mats are left alone). */
  dispose(): void {
    for (const m of this.ownMats) m.dispose();
    for (const t of this.plateTex.values()) t.dispose();
    this.plateTex.clear();
    this.tex.map.dispose();
    this.tex.bump.dispose();
  }

  /** Show or hide the red jam alarm. */
  setAlarm(on: boolean): void {
    this.alarmTarget = on ? 1 : 0;
  }

  /** Brief shake used when a tap is refused because the belt is full. */
  nudge(): void {
    this.pulse = 1.4;
  }

  update(dt: number, speed: number): void {
    this.scroll += (speed * dt) / 2.08;
    this.tex.map.offset.x = -this.scroll;
    this.tex.bump.offset.x = -this.scroll;
    this.pulse = Math.max(0, this.pulse - dt * 3.2);
    this.clock += dt;
    this.alarm += (this.alarmTarget - this.alarm) * (1 - Math.exp(-dt * 8));
    this.chassisMat.color.lerp(this.crowded ? this.chassisHot : this.chassisIdle, 1 - Math.exp(-dt * 9));
    this.alarmMat.opacity = this.alarm * (0.75 + 0.25 * Math.sin(this.clock * 9));
    const k = 1 + 0.12 * Math.sin(this.pulse * Math.PI) + 0.05 * this.alarm * (0.5 + 0.5 * Math.sin(this.clock * 9));
    this.plate.scale.set(k, k, 1);
    this.plate.rotation.z = Math.sin(this.pulse * 30) * 0.03 * this.pulse + Math.sin(this.clock * 28) * 0.025 * this.alarm;
  }
}
