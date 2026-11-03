import * as THREE from 'three';
import { softDot } from './textures';

export interface SkyTheme {
  top: string;
  mid: string;
  bottom: string;
  glow: string;
}

export const SKIES: Record<string, SkyTheme> = {
  meadow: { top: '#86cdfb', mid: '#b4e4ff', bottom: '#e2f6ff', glow: '#ffffff' },
  dusk: { top: '#9b8cf0', mid: '#f7a8c8', bottom: '#ffe0c0', glow: '#fff1d8' },
  lagoon: { top: '#43b5e8', mid: '#7fdcf2', bottom: '#d9fbff', glow: '#eaffff' },
  garden: { top: '#7fd0e8', mid: '#bdeedc', bottom: '#effbe0', glow: '#fffff0' },
  night: { top: '#4a56c8', mid: '#7f8ce6', bottom: '#cfd4ff', glow: '#fff4dd' },
};

const FRAG = /* glsl */ `
  uniform vec3 uTop, uMid, uBottom, uGlow;
  uniform float uTime;
  uniform vec2 uAspect;
  varying vec2 vUv;
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  void main(){
    float y = vUv.y;
    vec3 col = mix(uBottom, uMid, smoothstep(0.0, 0.55, y));
    col = mix(col, uTop, smoothstep(0.5, 1.0, y));
    vec2 c = (vUv - vec2(0.5, 0.62)) * vec2(uAspect.x, 1.0);
    col += uGlow * 0.30 * exp(-dot(c, c) * 4.0);
    // Slow cloud banks.
    vec2 p = vec2(vUv.x * uAspect.x * 1.6 + uTime * 0.012, vUv.y * 2.4);
    float n = fbm(p * 1.4 + vec2(0.0, 3.0));
    float cl = smoothstep(0.55, 0.85, n) * smoothstep(0.1, 0.5, y) * 0.55;
    col = mix(col, vec3(1.0), cl);
    float n2 = fbm(p * 2.6 + vec2(uTime * 0.02, 9.0));
    col = mix(col, vec3(1.0), smoothstep(0.62, 0.9, n2) * 0.25 * smoothstep(0.0, 0.7, y));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Sky {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private plane: THREE.Mesh;
  private motes: THREE.Points;
  private seeds: Float32Array;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(SKIES.meadow.top) },
        uMid: { value: new THREE.Color(SKIES.meadow.mid) },
        uBottom: { value: new THREE.Color(SKIES.meadow.bottom) },
        uGlow: { value: new THREE.Color(SKIES.meadow.glow) },
        uTime: { value: 0 },
        uAspect: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: FRAG,
      depthWrite: false,
    });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.plane.position.z = -16;
    this.plane.frustumCulled = false;
    this.plane.renderOrder = -10;
    this.group.add(this.plane);

    const n = 90;
    const pos = new Float32Array(n * 3);
    this.seeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 2] = -3 + Math.random() * 10;
      this.seeds[i * 3] = Math.random() * 6.28;
      this.seeds[i * 3 + 1] = 0.2 + Math.random() * 0.4;
      this.seeds[i * 3 + 2] = 0.05 + Math.random() * 0.12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: softDot(), size: 0.2, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffffff', sizeAttenuation: true }),
    );
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
  }

  setTheme(name: string): void {
    const t = SKIES[name] ?? SKIES.meadow;
    const u = this.mat.uniforms;
    u.uTop.value.set(t.top);
    u.uMid.value.set(t.mid);
    u.uBottom.value.set(t.bottom);
    u.uGlow.value.set(t.glow);
  }

  update(time: number, camera: THREE.PerspectiveCamera): void {
    this.mat.uniforms.uTime.value = time;
    const dist = camera.position.z - this.plane.position.z;
    const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const w = h * camera.aspect;
    this.plane.scale.set(w * 0.62, h * 0.62, 1);
    this.plane.position.x = camera.position.x * 0.9;
    this.plane.position.y = camera.position.y - 2.0;
    this.mat.uniforms.uAspect.value.set(camera.aspect, 1);
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const s = i * 3;
      pos.setY(i, pos.getY(i) + this.seeds[s + 2] * 0.016);
      pos.setX(i, pos.getX(i) + Math.sin(time * this.seeds[s + 1] + this.seeds[s]) * 0.002);
      if (pos.getY(i) > 15) pos.setY(i, -15);
    }
    pos.needsUpdate = true;
  }
}
