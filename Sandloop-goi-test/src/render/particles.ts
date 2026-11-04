import * as THREE from 'three';
import { SAND_COLORS } from '../core/palette';

export type ParticleKind = 'grain' | 'dust' | 'spark' | 'confetti' | 'coin' | 'shard';
const KIND: Record<ParticleKind, number> = { grain: 0, dust: 1, spark: 2, confetti: 3, coin: 4, shard: 5 };

const VERT = /* glsl */ `
  attribute vec3 aPos;
  attribute vec4 aColor;
  attribute vec4 aData; // size, kind, rotation, extra
  uniform vec3 uRight;
  uniform vec3 uUp;
  varying vec2 vUv;
  varying vec4 vColor;
  varying vec2 vData;
  void main(){
    vUv = position.xy;
    vColor = aColor;
    vData = vec2(aData.y, aData.w);
    float c = cos(aData.z);
    float s = sin(aData.z);
    vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
    // Confetti and coins flip around their vertical axis.
    if (aData.y > 2.5 && aData.y < 4.5) p.x *= cos(aData.w);
    vec3 center = (modelMatrix * vec4(aPos, 1.0)).xyz;
    vec3 world = center + (uRight * p.x + uUp * p.y) * aData.x;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec4 vColor;
  varying vec2 vData;
  void main(){
    float kind = vData.x;
    float r = length(vUv) * 2.0; // 0 centre .. 1 edge of the quad's inscribed circle
    vec3 col = vColor.rgb;
    float a = vColor.a;
    if (kind < 0.5) {
      // lit sphere grain
      if (r > 1.0) discard;
      float z = sqrt(1.0 - r * r);
      vec3 n = normalize(vec3(vUv * 2.0, z));
      vec3 L = normalize(vec3(-0.42, 0.62, 0.66));
      float diff = max(dot(n, L), 0.0);
      float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 30.0);
      col = col * (0.35 + 0.8 * diff) + vec3(1.0, 0.95, 0.85) * spec * 0.6;
    } else if (kind < 1.5) {
      // soft dust
      float f = smoothstep(1.0, 0.0, r);
      a *= f * f;
      if (a < 0.003) discard;
    } else if (kind < 2.5) {
      // four point spark
      vec2 q = abs(vUv * 2.0);
      float d = pow(q.x, 0.5) + pow(q.y, 0.5);
      float f = smoothstep(1.15, 0.2, d);
      a *= f;
      col *= 1.0 + f * 1.8;
      if (a < 0.01) discard;
    } else if (kind < 3.5) {
      // confetti strip
      vec2 q = abs(vUv * 2.0);
      if (q.x > 1.0 || q.y > 0.55) discard;
      col *= 0.78 + 0.22 * cos(vData.y * 2.0);
    } else if (kind < 4.5) {
      // coin
      if (r > 1.0) discard;
      float rim = smoothstep(0.62, 0.78, r);
      col = mix(vec3(1.0, 0.82, 0.28), vec3(0.78, 0.5, 0.12), rim);
      col += vec3(1.0, 0.95, 0.7) * pow(max(0.0, 1.0 - length(vUv * 2.0 - vec2(-0.35, 0.4))), 3.0) * 0.8;
      col *= 0.82 + 0.18 * cos(vData.y * 2.0);
    } else {
      // ice shard: a thin triangle
      vec2 q = vUv * 2.0;
      float tri = max(abs(q.x) * 1.6 + q.y * 0.9, -q.y);
      if (tri > 0.9) discard;
      col = mix(col, vec3(1.0), 0.35 + 0.3 * (q.y + 1.0) * 0.5);
    }
    gl_FragColor = vec4(col, a);
  }
`;

export interface SpawnOptions {
  kind: ParticleKind;
  x: number;
  y: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  /** sRGB hex or palette id */
  color: THREE.ColorRepresentation | number;
  alpha?: number;
  gravity?: number;
  drag?: number;
  spin?: number;
  /** Intensity multiplier for glowing particles. */
  glow?: number;
  /** Kill the particle when it falls below this y (used for sand landing in cups). */
  killY?: number;
  growth?: number;
}

const tmpColor = new THREE.Color();

/** A single instanced draw call for every little thing that flies. */
export class Particles {
  readonly mesh: THREE.Mesh;
  private cap: number;
  private n = 0;
  private pos: Float32Array;
  private col: Float32Array;
  private dat: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private spin: Float32Array;
  private killY: Float32Array;
  private growth: Float32Array;
  private baseSize: Float32Array;
  private baseAlpha: Float32Array;
  private aPos: THREE.InstancedBufferAttribute;
  private aColor: THREE.InstancedBufferAttribute;
  private aData: THREE.InstancedBufferAttribute;
  private mat: THREE.ShaderMaterial;
  private paletteColors: THREE.Color[];

  constructor(capacity = 3200) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.dat = new Float32Array(capacity * 4);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.killY = new Float32Array(capacity);
    this.growth = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.baseAlpha = new Float32Array(capacity);
    this.paletteColors = SAND_COLORS.map((c) => new THREE.Color(c.hex));

    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(this.dat, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aData', this.aData);
    geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 40;
  }

  spawn(o: SpawnOptions): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos[i * 3] = o.x;
    this.pos[i * 3 + 1] = o.y;
    this.pos[i * 3 + 2] = o.z ?? 0.5;
    this.vel[i * 3] = o.vx ?? 0;
    this.vel[i * 3 + 1] = o.vy ?? 0;
    this.vel[i * 3 + 2] = o.vz ?? 0;
    const c = typeof o.color === 'number' ? this.paletteColors[o.color] : tmpColor.set(o.color);
    const g = o.glow ?? 1;
    this.col[i * 4] = c.r * g;
    this.col[i * 4 + 1] = c.g * g;
    this.col[i * 4 + 2] = c.b * g;
    this.col[i * 4 + 3] = o.alpha ?? 1;
    this.baseAlpha[i] = o.alpha ?? 1;
    this.baseSize[i] = o.size;
    this.dat[i * 4] = o.size;
    this.dat[i * 4 + 1] = KIND[o.kind];
    this.dat[i * 4 + 2] = Math.random() * 6.28;
    this.dat[i * 4 + 3] = Math.random() * 6.28;
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.spin[i] = o.spin ?? 0;
    this.killY[i] = o.killY ?? -1e9;
    this.growth[i] = o.growth ?? 0;
  }

  private remove(i: number): void {
    const last = --this.n;
    if (i === last) return;
    const cp = (a: Float32Array, k: number) => {
      for (let j = 0; j < k; j++) a[i * k + j] = a[last * k + j];
    };
    cp(this.pos, 3);
    cp(this.vel, 3);
    cp(this.col, 4);
    cp(this.dat, 4);
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.grav[i] = this.grav[last];
    this.drag[i] = this.drag[last];
    this.spin[i] = this.spin[last];
    this.killY[i] = this.killY[last];
    this.growth[i] = this.growth[last];
    this.baseSize[i] = this.baseSize[last];
    this.baseAlpha[i] = this.baseAlpha[last];
  }

  /** Called when a grain reaches `killY`; lets the board spawn a puff. */
  onLand: ((x: number, y: number, color: THREE.Color) => void) | null = null;

  update(dt: number, camera: THREE.Camera): void {
    const e = camera.matrixWorld.elements;
    (this.mat.uniforms.uRight.value as THREE.Vector3).set(e[0], e[1], e[2]);
    (this.mat.uniforms.uUp.value as THREE.Vector3).set(e[4], e[5], e[6]);
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      const px = this.pos[i * 3];
      let py = this.pos[i * 3 + 1];
      if (this.life[i] <= 0 || (py < this.killY[i] && this.vel[i * 3 + 1] < 0)) {
        if (py < this.killY[i] && this.onLand) {
          tmpColor.setRGB(this.col[i * 4], this.col[i * 4 + 1], this.col[i * 4 + 2]);
          this.onLand(px, py, tmpColor);
        }
        this.remove(i);
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] = px + this.vel[i * 3] * dt;
      py += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 1] = py;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.dat[i * 4 + 2] += this.spin[i] * dt;
      this.dat[i * 4 + 3] += this.spin[i] * 0.7 * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.dat[i * 4] = this.baseSize[i] * (1 + this.growth[i] * t);
      // Fade out over the last third of the life.
      const f = t > 0.66 ? 1 - (t - 0.66) / 0.34 : 1;
      this.col[i * 4 + 3] = this.baseAlpha[i] * f;
    }
    const geo = this.mesh.geometry as THREE.InstancedBufferGeometry;
    geo.instanceCount = this.n;
    this.aPos.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aData.needsUpdate = true;
  }

  get count(): number {
    return this.n;
  }

  clear(): void {
    this.n = 0;
  }
}
