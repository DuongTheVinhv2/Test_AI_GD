import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LANE } from '../core/config';
import { BELT, WINDOW, windowToWorldX } from './layout3d';
import type { Mats } from './materials';
import { laneTextures } from './textures';

function plateTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 256);
  g.font = '800 150px "Unbounded", system-ui, sans-serif';
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

export class BeltView {
  readonly group = new THREE.Group();
  private tex = laneTextures();
  private scroll = 0;
  private plateMat: THREE.MeshBasicMaterial;
  private plate: THREE.Group;
  private shown = '';
  private rollers: THREE.Mesh[] = [];
  private pulse = 0;

  constructor(private mats: Mats) {
    const y = BELT.y;
    const half = BELT.innerHalf;

    // Back wall of the lane.
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 0.6, BELT.laneH + 0.2), new THREE.MeshStandardMaterial({ color: '#58638f', roughness: 0.9 }));
    wall.position.set(0, y, -0.3);
    this.group.add(wall);

    // Tread: scrolls at belt speed.
    this.tex.map.repeat.set((half * 2) / 2.08, 1);
    this.tex.bump.repeat.set((half * 2) / 2.08, 1);
    const tread = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2, BELT.laneH - 0.14),
      new THREE.MeshStandardMaterial({ map: this.tex.map, bumpMap: this.tex.bump, bumpScale: 1.4, roughness: 0.6, metalness: 0.05 }),
    );
    tread.position.set(0, y, -0.12);
    tread.receiveShadow = true;
    this.group.add(tread);

    // Rails.
    const railGeo = new RoundedBoxGeometry(half * 2 + 0.4, 0.2, 0.42, 3, 0.07);
    const top = new THREE.Mesh(railGeo, mats.silver);
    top.position.set(0, y + BELT.laneH / 2 + 0.04, 0.05);
    top.castShadow = true;
    const bottom = new THREE.Mesh(railGeo, mats.silver);
    bottom.position.set(0, y - BELT.laneH / 2 - 0.04, 0.05);
    bottom.castShadow = true;
    this.group.add(top, bottom);

    // End caps.
    for (const side of [-1, 1]) {
      const cap = new THREE.Group();
      const w = BELT.capHalfW * 2;
      const body = new THREE.Mesh(new RoundedBoxGeometry(w, BELT.capH, 1.6, 6, 0.7), mats.silver);
      body.castShadow = true;
      body.receiveShadow = true;
      cap.add(body);
      // darker inner arch where the lane enters
      const arch = new THREE.Mesh(new RoundedBoxGeometry(w * 0.62, BELT.capH * 0.62, 0.3, 5, 0.4), mats.silverDark);
      arch.position.set(-side * w * 0.12, 0, 0.78);
      cap.add(arch);
      const highlight = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, w * 0.5, 4, 10), mats.white);
      highlight.rotation.z = Math.PI / 2;
      highlight.position.set(side * w * 0.04, BELT.capH * 0.34, 0.82);
      cap.add(highlight);
      cap.position.set(side * (half + BELT.capHalfW - 0.35), y + 0.02, 0.55);
      this.group.add(cap);
      // roller
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.1, 24), mats.silverDark);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(side * (half - 0.2), y, 0.1);
      this.rollers.push(roller);
      this.group.add(roller);
    }

    // Plate with the belt counter.
    this.plate = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.7, 1.38, 0.4, 5, 0.3), mats.plate);
    body.castShadow = true;
    const border = new THREE.Mesh(new RoundedBoxGeometry(2.9, 1.58, 0.3, 5, 0.34), mats.frame);
    border.position.z = -0.08;
    this.plateMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.25), this.plateMat);
    txt.position.z = 0.22;
    this.plate.add(border, body, txt);
    this.plate.position.set(0, BELT.plateY, 0.35);
    this.group.add(this.plate);
    this.setCount(0, 5);
    void WINDOW;
    void windowToWorldX;
    void LANE;
  }

  setCount(n: number, max: number): void {
    const t = `${n}/${max}`;
    if (t === this.shown) return;
    if (this.shown) this.pulse = 1;
    this.shown = t;
    this.plateMat.map = plateTexture(t);
    this.plateMat.needsUpdate = true;
  }

  /** Brief shake used when a tap is refused because the belt is full. */
  nudge(): void {
    this.pulse = 1.4;
  }

  update(dt: number, speed: number): void {
    this.scroll += (speed * dt) / 2.08;
    this.tex.map.offset.x = -this.scroll;
    this.tex.bump.offset.x = -this.scroll;
    for (const r of this.rollers) r.rotation.y -= (speed * dt) / 0.62;
    this.pulse = Math.max(0, this.pulse - dt * 3.2);
    const k = 1 + 0.12 * Math.sin(this.pulse * Math.PI) ;
    this.plate.scale.set(k, k, 1);
    this.plate.rotation.z = Math.sin(this.pulse * 30) * 0.03 * this.pulse;
  }
}
