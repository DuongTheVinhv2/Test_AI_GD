import * as THREE from 'three';
import { SAND_COLORS } from '../core/palette';
import type { SandSim } from '../core/sand';

const PALETTE: THREE.Vector3[] = Array.from({ length: 16 }, (_, i) => {
  const c = SAND_COLORS[i] ? new THREE.Color(SAND_COLORS[i].hex) : new THREE.Color('#ff00ff');
  return new THREE.Vector3(c.r, c.g, c.b);
});

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uGrid;
  uniform vec2 uSize;
  uniform vec3 uPal[16];
  uniform float uTime;
  uniform float uBright;
  varying vec2 vUv;

  void main(){
    vec2 p = vUv * uSize;
    ivec2 base = ivec2(floor(p));
    vec2 fp = p - vec2(base);
    ivec2 dim = ivec2(uSize);

    float bestScore = -1.0;
    vec3 bestN = vec3(0.0, 0.0, 1.0);
    vec3 bestBase = vec3(0.0);
    float bestRnd = 0.0;
    ivec2 bestCell = base;

    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        ivec2 c = base + ivec2(dx, dy);
        if (c.x < 0 || c.y < 0 || c.x >= dim.x || c.y >= dim.y) continue;
        vec4 t = texelFetch(uGrid, c, 0);
        int id = int(t.r * 255.0 + 0.5);
        if (id == 0) continue;
        float rnd = t.g;
        vec2 j = vec2(fract(rnd * 7.13 + 0.31), fract(rnd * 13.71 + 0.73)) - 0.5;
        vec2 center = vec2(float(dx), float(dy)) + 0.5 + j * 0.30;
        float rad = 0.72 + 0.10 * fract(rnd * 3.77);
        vec2 q = fp - center;
        float d2 = dot(q, q);
        if (d2 > rad * rad) continue;
        float z = sqrt(rad * rad - d2) / rad;
        float score = z + 0.12 * fract(rnd * 5.3);
        if (score > bestScore) {
          bestScore = score;
          bestN = normalize(vec3(q / rad * 0.72, z));
          bestBase = uPal[id - 1] * (0.94 + 0.14 * fract(rnd * 17.9));
          bestRnd = rnd;
          bestCell = c;
        }
      }
    }

    if (bestScore < 0.0) {
      vec4 t0 = texelFetch(uGrid, base, 0);
      int id0 = int(t0.r * 255.0 + 0.5);
      if (id0 == 0 || base.x < 0 || base.y < 0 || base.x >= dim.x || base.y >= dim.y) discard;
      gl_FragColor = vec4(uPal[id0 - 1] * 0.52 * uBright, 1.0);
      return;
    }

    // Grains buried in the pile are darker than those at its surface.
    float filled = 0.0;
    for (int ay = -1; ay <= 1; ay++) {
      for (int ax = -1; ax <= 1; ax++) {
        if (ax == 0 && ay == 0) continue;
        ivec2 c = bestCell + ivec2(ax, ay);
        if (c.x < 0 || c.x >= dim.x || c.y < 0) { filled += 1.0; continue; }
        if (c.y >= dim.y) continue;
        filled += texelFetch(uGrid, c, 0).r > 0.0 ? 1.0 : 0.0;
      }
    }
    float ao = mix(1.0, 0.91, filled / 8.0);

    vec3 L = normalize(vec3(-0.40, 0.62, 0.68));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float diff = max(dot(bestN, L), 0.0);
    float spec = pow(max(dot(bestN, H), 0.0), 38.0);
    float rim = pow(1.0 - bestN.z, 2.4);
    vec3 col = bestBase * (0.96 + 0.16 * diff) * ao;
    col += vec3(1.0, 0.97, 0.9) * spec * 0.065 * ao;
    col += bestBase * rim * 0.12;
    // A few grains flash as the light breathes.
    float tw = 0.5 + 0.5 * sin(uTime * (1.4 + bestRnd * 2.2) + bestRnd * 60.0);
    // Rare and soft: flat areas of the picture must read as clean colour, not noise.
    float sparkle = step(0.992, fract(bestRnd * 91.37)) * (0.3 + 0.7 * tw);
    col += vec3(1.0, 0.95, 0.85) * sparkle * (0.018 + spec * 0.12) * ao;
    // Soft light falling from above the window.
    col *= 0.94 + 0.12 * vUv.y;
    gl_FragColor = vec4(col * uBright, 1.0);
  }
`;

/** Draws a SandSim as a plane of lit grains. */
export class SandView {
  readonly mesh: THREE.Mesh;
  private texture: THREE.DataTexture;
  private material: THREE.ShaderMaterial;
  private seen = -1;

  constructor(readonly sim: SandSim, size: number) {
    this.texture = new THREE.DataTexture(new Uint8Array(sim.w * sim.h * 4), sim.w, sim.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.flipY = false;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uGrid: { value: this.texture },
        uSize: { value: new THREE.Vector2(sim.w, sim.h) },
        uPal: { value: PALETTE },
        uTime: { value: 0 },
        uBright: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, (size * sim.h) / sim.w), this.material);
    this.upload();
  }

  upload(): void {
    const data = this.texture.image.data as Uint8Array;
    const { cells, rnd } = this.sim;
    const n = cells.length;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      data[o] = cells[i];
      data[o + 1] = rnd[i];
      data[o + 3] = 255;
    }
    this.texture.needsUpdate = true;
    this.seen = this.sim.version;
  }

  update(time: number): void {
    this.material.uniforms.uTime.value = time;
    if (this.seen !== this.sim.version) this.upload();
  }

  setBrightness(b: number): void {
    this.material.uniforms.uBright.value = b;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
