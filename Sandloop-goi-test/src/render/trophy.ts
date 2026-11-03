import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Mats } from './materials';
import { softDot } from './textures';

function starShape(points: number, outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/** A golden sand-bucket trophy with rays, shown when a level is cleared. */
export class Trophy {
  readonly group = new THREE.Group();
  private model = new THREE.Group();
  private rays: THREE.Mesh[] = [];
  private glow: THREE.Mesh;
  private gem: THREE.Mesh;
  private t = -1;
  private spot: THREE.SpotLight;

  constructor(mats: Mats) {
    const gold = mats.gold;

    // Cup, built as one lathe from base to rim.
    const pts = [
      [0, 0], [1.5, 0], [1.64, 0.1], [1.64, 0.3], [1.34, 0.42], [0.66, 0.6], [0.5, 0.95], [0.48, 1.5], [0.66, 1.75], [1.0, 2.0], [1.6, 2.55], [2.02, 3.2], [2.12, 3.9],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 56), gold);
    cup.castShadow = true;
    this.model.add(cup);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.14, 16, 64), gold);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 3.92;
    this.model.add(rim);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.13, 14, 36), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.62;
    this.model.add(ring);

    // Handles: a half ring on each side, bulging outwards and meeting the bowl at both ends.
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.2, 16, 40, Math.PI * 1.08), gold);
      h.position.set(sx * 1.95, 2.85, 0);
      h.rotation.z = sx > 0 ? -Math.PI * 0.54 : Math.PI * 0.54;
      h.castShadow = true;
      this.model.add(h);
    }

    // Sand mound
    const sandMat = new THREE.MeshStandardMaterial({ color: '#ffe9bf', roughness: 0.85, bumpMap: mats.noise, bumpScale: 2.2, emissive: '#ffd9a0', emissiveIntensity: 0.12 });
    const mound = new THREE.Mesh(new THREE.SphereGeometry(2.0, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), sandMat);
    mound.scale.set(1, 0.62, 1);
    mound.position.y = 3.88;
    this.model.add(mound);
    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), sandMat);
    bump.scale.set(1, 0.8, 1);
    bump.position.set(0.1, 4.7, -0.1);
    this.model.add(bump);

    // Shovel
    const shovel = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.9, 12), gold);
    shovel.add(stick);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.1, 12, 24), gold);
    handle.position.y = 1.15;
    shovel.add(handle);
    const blade = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.14, 4, 0.2), gold);
    blade.position.y = -1.0;
    shovel.add(blade);
    shovel.position.set(-0.5, 5.1, -0.1);
    shovel.rotation.z = 0.32;
    this.model.add(shovel);

    // Starfish
    const starMat = new THREE.MeshPhysicalMaterial({ color: '#ff6f78', roughness: 0.4, clearcoat: 0.7, bumpMap: mats.noise, bumpScale: 1.2 });
    const star = new THREE.Mesh(
      new THREE.ExtrudeGeometry(starShape(5, 0.72, 0.34), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 3 }),
      starMat,
    );
    star.position.set(1.0, 4.55, 0.85);
    star.rotation.set(-0.5, 0.2, 0.4);
    this.model.add(star);

    // Seashell fan
    const shellMat = new THREE.MeshPhysicalMaterial({ color: '#29c5b6', roughness: 0.35, clearcoat: 0.8 });
    const fan = new THREE.Shape();
    fan.moveTo(0, 0);
    fan.absarc(0, 0, 0.7, Math.PI * 0.12, Math.PI * 0.88, false);
    fan.lineTo(0, 0);
    const shell = new THREE.Mesh(new THREE.ExtrudeGeometry(fan, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3 }), shellMat);
    shell.position.set(-0.85, 4.35, 1.0);
    shell.rotation.set(-0.7, 0.1, 0.25);
    this.model.add(shell);

    // Gem
    this.gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.46),
      new THREE.MeshPhysicalMaterial({ color: '#b04dff', emissive: '#8a2be2', emissiveIntensity: 1.3, roughness: 0.15, metalness: 0.2, clearcoat: 1 }),
    );
    this.gem.scale.set(1, 1.35, 0.75);
    this.gem.position.set(0, 2.5, 1.9);
    this.model.add(this.gem);
    const setting = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.09, 12, 28), gold);
    setting.position.set(0, 2.5, 1.9);
    this.model.add(setting);

    this.model.position.y = -2.7;
    this.model.scale.setScalar(1.08);
    this.group.add(this.model);

    // Light and rays
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 15),
      new THREE.MeshBasicMaterial({ map: softDot(), color: '#ffd67a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.glow.position.z = -0.8;
    this.group.add(this.glow);
    const rayGeo = new THREE.PlaneGeometry(1.2, 11);
    rayGeo.translate(0, 5.5, 0);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(
        rayGeo,
        new THREE.MeshBasicMaterial({ color: '#ffe6a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, map: this.rayTexture() }),
      );
      m.rotation.z = (i / 12) * Math.PI * 2;
      m.position.z = -1.0;
      this.rays.push(m);
      this.group.add(m);
    }
    this.spot = new THREE.SpotLight('#ffe7b0', 0, 40, 0.7, 0.6, 1.2);
    this.spot.position.set(0, 9, 8);
    this.spot.target = this.group;
    this.group.add(this.spot);
    this.group.visible = false;
  }

  private rayTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 256;
    const g = c.getContext('2d')!;
    const lin = g.createLinearGradient(0, 0, 32, 0);
    lin.addColorStop(0, 'rgba(255,255,255,0)');
    lin.addColorStop(0.5, 'rgba(255,255,255,1)');
    lin.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lin;
    g.fillRect(0, 0, 32, 256);
    g.globalCompositeOperation = 'destination-in';
    const vert = g.createLinearGradient(0, 0, 0, 256);
    vert.addColorStop(0, 'rgba(0,0,0,1)');
    vert.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vert;
    g.fillRect(0, 0, 32, 256);
    return new THREE.CanvasTexture(c);
  }

  show(): void {
    this.t = 0;
    this.group.visible = true;
  }

  hide(): void {
    this.t = -1;
    this.group.visible = false;
    this.spot.intensity = 0;
  }

  get shown(): boolean {
    return this.t >= 0;
  }

  update(dt: number, time: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const k = Math.min(1, this.t / 0.9);
    // elastic pop-in
    const e = k === 1 ? 1 : 1 - Math.pow(2, -9 * k) * Math.cos(k * Math.PI * 3.2);
    this.group.scale.setScalar(Math.max(0.001, e));
    this.model.rotation.y = Math.sin(time * 0.9) * 0.28;
    this.model.position.y = -2.7 + Math.sin(time * 1.6) * 0.1;
    this.gem.rotation.y = time * 1.4;
    (this.gem.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 1.1 + 0.5 * Math.sin(time * 3);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = Math.min(1, this.t * 1.4) * (0.5 + 0.08 * Math.sin(time * 2));
    this.rays.forEach((r, i) => {
      r.rotation.z = (i / 12) * Math.PI * 2 + time * 0.12;
      (r.material as THREE.MeshBasicMaterial).opacity = Math.min(1, this.t * 1.2) * (i % 2 === 0 ? 0.38 : 0.2);
    });
    this.spot.intensity = Math.min(1, this.t * 2) * 5;
  }
}
