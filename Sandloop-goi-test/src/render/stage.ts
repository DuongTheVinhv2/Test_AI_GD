import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BOARD, LOWER_STAGE_TILT, STAGE, WINDOW } from './layout3d';

const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.045 },
    uGrain: { value: 0 },
    uSat: { value: 1.02 },
    uFringe: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uFlash: { value: 0 },
    uDesat: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uSat, uFringe, uFlash, uDesat;
    uniform vec3 uTint;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * uFringe * r2 * 4.0;
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + off).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - off).b
      );
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat * (1.0 - uDesat * 0.85));
      col *= uTint;
      col *= 1.0 - uVignette * smoothstep(0.10, 0.62, r2 * 2.0);
      col += uFlash;
      col += (hash(vUv * 1100.0 + fract(uTime) * 41.0) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface QualityState {
  pixelRatio: number;
  bloom: boolean;
  shadows: boolean;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  private t0 = performance.now();
  private last = performance.now();
  readonly quality: QualityState;
  private shake = 0;
  private shakeT = 0;
  private baseDist = 60;
  private frameTimes: number[] = [];
  private lastQualityChange = 0;
  readonly fov = 24;
  private cameraY = -0.1;
  private boardRows = 5;
  private boosterDock?: HTMLElement;

  constructor(readonly canvas: HTMLCanvasElement) {
    const renderer = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    }));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.quality = { pixelRatio: dpr, bloom: true, shadows: true };
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 1, 400);
    this.camera.position.set(0, 0, 60);

    // Image based lighting from a procedural studio so glass, brass and lacquer have something to reflect.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();

    const size = new THREE.Vector2();
    renderer.getSize(size);
    const target = new THREE.WebGLRenderTarget(size.x * dpr, size.y * dpr, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.07, 0.5, 1.1);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = this.quality.pixelRatio;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(Math.max(256, w * 0.5), Math.max(256, h * 0.5));
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Fit the whole board: limited by width on tall screens, by height on wide ones.
    this.fitCamera();
  }

  setBoosterDock(dock: HTMLElement): void {
    this.boosterDock = dock;
    this.fitCamera();
  }

  private fitCamera(): void {
    const h = window.innerHeight;
    const t = Math.tan(THREE.MathUtils.degToRad(this.fov / 2));
    // Fit the tilted tray lip, with room for the camera kick and bucket shadows.
    const boardBottom = BOARD.top - this.boardRows * BOARD.cell - 0.7;
    const bottomY = boardBottom * Math.cos(LOWER_STAGE_TILT);
    const bottomDepth = boardBottom * Math.sin(LOWER_STAGE_TILT);
    const dockTop = this.boosterDock?.getBoundingClientRect().top ?? h;
    const bottomSlope = t * (2 * (dockTop - 8) / h - 1);
    const topSlope = t * (1 - 2 * Math.max(54, h * 0.08) / h);
    const topY = WINDOW.top + WINDOW.frame + 0.4;
    // Fit both bounds, accounting for the tray being closer to the camera.
    const needH = (topY - bottomY + bottomSlope * bottomDepth) / (topSlope + bottomSlope);
    const needW = STAGE.w / 2 / (t * this.camera.aspect);
    this.baseDist = Math.max(STAGE.h / 2 / t, needH, needW);
    this.cameraY = THREE.MathUtils.clamp(
      -0.1,
      topY - topSlope * this.baseDist,
      bottomY + bottomSlope * (this.baseDist - bottomDepth),
    );
    this.camera.updateProjectionMatrix();
  }

  /** Tell the camera how many board rows the current level has so the last row never falls off screen. */
  setBoardRows(rows: number): void {
    if (rows === this.boardRows) return;
    this.boardRows = rows;
    this.fitCamera();
  }

  /** Brief camera kick used for impacts. */
  kick(strength = 0.12): void {
    this.shake = Math.max(this.shake, strength);
    this.shakeT = 0;
  }

  setTheme(tint: THREE.ColorRepresentation): void {
    (this.grade.uniforms.uTint.value as THREE.Color).set(tint);
  }

  flash(amount: number): void {
    this.grade.uniforms.uFlash.value = Math.max(this.grade.uniforms.uFlash.value, amount);
  }

  /** Seconds since the last call, clamped, plus total elapsed seconds. */
  tick(): { dt: number; time: number } {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    return { dt, time: (now - this.t0) / 1000 };
  }

  render(dt: number, time: number): void {
    let sx = 0;
    let sy = 0;
    if (this.shake > 0.001) {
      this.shakeT += dt;
      const k = this.shake * Math.exp(-this.shakeT * 9);
      sx = Math.sin(this.shakeT * 83) * k;
      sy = Math.cos(this.shakeT * 71) * k;
      this.shake *= Math.exp(-dt * 6);
    }
    const y = this.cameraY + sy;
    this.camera.position.set(sx, y, this.baseDist);
    this.camera.lookAt(sx, y, 0);

    const u = this.grade.uniforms;
    u.uTime.value = time;
    u.uFlash.value *= Math.exp(-dt * 5.5);

    if (this.quality.bloom) this.bloom.enabled = true;
    this.composer.render(dt);
    this.adapt(dt, time);
  }

  /** Lower the render resolution if frames keep taking too long. */
  private adapt(dt: number, time: number): void {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (time - this.lastQualityChange < 4) return;
    if (avg > 1 / 38 && this.quality.pixelRatio > 1) {
      this.quality.pixelRatio = Math.max(1, this.quality.pixelRatio - 0.25);
      this.lastQualityChange = time;
      this.resize();
    } else if (avg > 1 / 30 && this.quality.bloom) {
      this.quality.bloom = false;
      this.bloom.enabled = false;
      this.lastQualityChange = time;
    }
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
