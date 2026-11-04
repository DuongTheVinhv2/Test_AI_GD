import * as THREE from 'three';
import type { ArtSource } from '../core/art-data';
import { SAND_COLORS } from '../core/palette';
import { slabGeometry } from './shapes';
import { softDot } from './textures';

/** The completed sand picture, framed and backlit for the win reveal. */
export class Trophy {
  readonly group = new THREE.Group();
  private model = new THREE.Group();
  private rays: THREE.Mesh[] = [];
  private glow: THREE.Mesh;
  private t = -1;
  private picture = document.createElement('canvas');
  private texture = new THREE.CanvasTexture(this.picture);

  constructor() {
    this.picture.width = this.picture.height = 384;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const frame = new THREE.Mesh(
      slabGeometry(10.3, 10.3, 1.9, 0.24, 0.16),
      new THREE.MeshPhysicalMaterial({ color: '#fff0c7', roughness: 0.41, clearcoat: 0.46 }),
    );
    const print = new THREE.Mesh(
      new THREE.PlaneGeometry(9.42, 9.42),
      new THREE.MeshBasicMaterial({ map: this.texture, alphaTest: 0.5 }),
    );
    print.position.z = 0.42;
    this.model.add(frame, print);
    this.group.add(this.model);

    // Light and rays
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 15),
      new THREE.MeshBasicMaterial({ map: softDot(), color: '#ffd67a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.glow.position.z = -0.8;
    this.glow.renderOrder = 61;
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
      m.renderOrder = 61;
      this.rays.push(m);
      this.group.add(m);
    }
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

  show(art: ArtSource): void {
    const ctx = this.picture.getContext('2d')!;
    const size = this.picture.width;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.145);
    ctx.clip();
    const dx = size / art.w;
    const dy = size / art.h;
    for (let y = 0; y < art.h; y++) {
      for (let x = 0; x < art.w; x++) {
        ctx.fillStyle = SAND_COLORS[parseInt(art.rows[y][x], 36)].hex;
        ctx.fillRect(Math.floor(x * dx), Math.floor(y * dy), Math.ceil(dx), Math.ceil(dy));
      }
    }
    const image = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const sample = Math.imul((i >>> 2) ^ ((i >>> 2) >>> 11), 0x45d9f3b);
      const grain = ((sample ^ (sample >>> 16)) & 15) - 7;
      image.data[i] += grain;
      image.data[i + 1] += grain;
      image.data[i + 2] += grain;
    }
    ctx.putImageData(image, 0, 0);
    ctx.restore();
    this.texture.needsUpdate = true;
    this.t = 0;
    this.group.visible = true;
  }

  hide(): void {
    this.t = -1;
    this.group.visible = false;
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
    this.model.rotation.y = Math.sin(time * 0.9) * 0.035;
    this.model.position.y = Math.sin(time * 1.6) * 0.045;
    (this.glow.material as THREE.MeshBasicMaterial).opacity = Math.min(1, this.t * 1.4) * (0.5 + 0.08 * Math.sin(time * 2));
    this.rays.forEach((r, i) => {
      r.rotation.z = (i / 12) * Math.PI * 2 + time * 0.12;
      (r.material as THREE.MeshBasicMaterial).opacity = Math.min(1, this.t * 1.2) * (i % 2 === 0 ? 0.19 : 0.11);
    });
  }
}
