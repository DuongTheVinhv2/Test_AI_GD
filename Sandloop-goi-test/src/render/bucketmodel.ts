import * as THREE from 'three';
import { SAND_COLORS } from '../core/palette';
import type { Mats } from './materials';
import { labelTexture, numberTexture, softDot, type GlyphAtlas } from './textures';

/** Bucket diameter is 2.0 world units; everything below is expressed in that scale. */
const R_TOP = 1.0;
const R_BOT = 0.8;
const H = 1.05;

/** Flat black used for the toon outline hulls. */
export function outlineMaterial(color = '#0b0a1c'): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
}

interface ColorKit {
  shell: THREE.MeshPhysicalMaterial;
  inner: THREE.MeshStandardMaterial;
  rim: THREE.MeshPhysicalMaterial;
  dome: THREE.MeshPhysicalMaterial;
  sand: THREE.MeshStandardMaterial;
  color: THREE.Color;
}

/** Shared geometry and materials for every bucket. */
export class BucketKit {
  readonly shellGeo: THREE.LatheGeometry;
  readonly innerGeo: THREE.LatheGeometry;
  readonly rimGeo: THREE.TorusGeometry;
  readonly domeGeo: THREE.SphereGeometry;
  readonly bandGeo: THREE.CylinderGeometry;
  readonly moundGeo: THREE.SphereGeometry;
  readonly shadowGeo = new THREE.PlaneGeometry(2.7, 2.2);
  readonly outline = outlineMaterial();
  readonly shadowMat: THREE.MeshBasicMaterial;
  readonly band: THREE.MeshPhysicalMaterial;
  readonly mystery: THREE.MeshPhysicalMaterial;
  readonly question: THREE.MeshBasicMaterial;
  private kits: ColorKit[] = [];

  constructor(
    readonly mats: Mats,
    readonly atlas: GlyphAtlas,
  ) {
    const shellPts = [
      new THREE.Vector2(0.0, -H / 2),
      new THREE.Vector2(R_BOT - 0.06, -H / 2),
      new THREE.Vector2(R_BOT, -H / 2 + 0.06),
      new THREE.Vector2(R_TOP - 0.02, H / 2 - 0.02),
      new THREE.Vector2(R_TOP, H / 2),
    ];
    this.shellGeo = new THREE.LatheGeometry(shellPts, 48);
    const innerPts = [
      new THREE.Vector2(R_TOP - 0.1, H / 2),
      new THREE.Vector2(R_BOT - 0.08, -H / 2 + 0.14),
      new THREE.Vector2(0.0, -H / 2 + 0.1),
    ];
    this.innerGeo = new THREE.LatheGeometry(innerPts, 48);
    // Darken the inside towards the bottom.
    const pos = this.innerGeo.getAttribute('position') as THREE.BufferAttribute;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + H / 2) / H;
      const k = 0.45 + 0.4 * t;
      cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = k;
    }
    this.innerGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.rimGeo = new THREE.TorusGeometry(R_TOP - 0.02, 0.075, 12, 56);
    this.rimGeo.rotateX(Math.PI / 2);
    this.rimGeo.translate(0, H / 2, 0);
    this.domeGeo = new THREE.SphereGeometry(R_TOP - 0.04, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
    this.bandGeo = new THREE.CylinderGeometry(R_TOP, R_TOP - 0.06, 0.46, 40);
    this.moundGeo = new THREE.SphereGeometry(R_TOP - 0.12, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2);

    SAND_COLORS.forEach((sc) => {
      const color = new THREE.Color(sc.hex);
      const light = color.clone().lerp(new THREE.Color('#ffffff'), 0.34);
      const shell = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.32,
        clearcoat: 1,
        clearcoatRoughness: 0.14,
        envMapIntensity: 0.9,
      });
      const inner = new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color('#000000'), 0.32), roughness: 0.9, vertexColors: true, side: THREE.DoubleSide });
      const rim = new THREE.MeshPhysicalMaterial({ color: light, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.0 });
      const dome = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2 });
      const sand = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.82,
        bumpMap: mats.noise,
        bumpScale: 1.6,
        emissive: color,
        emissiveIntensity: 0.1,
      });
      this.kits.push({ shell, inner, rim, dome, sand, color });
    });

    this.shadowMat = new THREE.MeshBasicMaterial({ map: softDot(), color: '#1c2a60', transparent: true, opacity: 0.2, depthWrite: false });
    this.band = new THREE.MeshPhysicalMaterial({ color: '#5a6279', roughness: 0.5, clearcoat: 0.4 });
    this.mystery = new THREE.MeshPhysicalMaterial({ color: '#4c4f5c', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 });
    this.question = new THREE.MeshBasicMaterial({ map: numberTexture('?', '#ffffff', '#14162c'), transparent: true, depthWrite: false });
  }

  kit(color: number): ColorKit {
    return this.kits[color];
  }
}

export type BucketMode = 'open' | 'dome' | 'mystery' | 'belt';

const TILT_BOARD = 0.86;
const TILT_BELT = 1.12;

/** One bucket in the world: an open cup, a closed dome, a mystery dome, or a small belt cup. */
export class BucketActor {
  readonly root = new THREE.Group();
  /** Everything that tilts toward the camera. */
  readonly body = new THREE.Group();
  readonly cupGroup = new THREE.Group();
  readonly domeGroup = new THREE.Group();
  readonly mysteryGroup = new THREE.Group();
  private mound: THREE.Mesh;
  private badge: THREE.Mesh;
  private shadow: THREE.Mesh;
  private questionMark!: THREE.Mesh;
  private labelMat: THREE.MeshBasicMaterial;
  readonly label: THREE.Mesh;
  mode: BucketMode = 'dome';
  color: number;
  /** 0..1 fill shown by the mound */
  fill = 0;
  /** spring state for squash and stretch */
  private sy = 0;
  private vy = 0;
  private sx = 0;
  private vx = 0;
  private labelText = '';
  /** extra glow when tappable */
  private glow: THREE.Mesh;
  private glowMat: THREE.MeshBasicMaterial;
  hint = 0;
  /** 0 = flat-on, used to rock the cup around */
  wobble = 0;

  constructor(
    private kit: BucketKit,
    color: number,
    readonly trueColor: number,
    mystery: boolean,
  ) {
    this.color = color;
    const k = kit.kit(trueColor);
    this.root.add(this.body);
    this.body.add(this.cupGroup, this.domeGroup, this.mysteryGroup);

    // open cup
    const shell = new THREE.Mesh(kit.shellGeo, k.shell);
    const inner = new THREE.Mesh(kit.innerGeo, k.inner);
    const rim = new THREE.Mesh(kit.rimGeo, k.rim);
    const outline = new THREE.Mesh(kit.shellGeo, kit.outline);
    outline.scale.set(1.085, 1.06, 1.085);
    outline.position.y = -0.02;
    const outlineRim = new THREE.Mesh(kit.rimGeo, kit.outline);
    outlineRim.scale.set(1.1, 1.5, 1.1);
    this.cupGroup.add(outline, outlineRim, shell, inner, rim);
    this.mound = new THREE.Mesh(kit.moundGeo, k.sand);
    this.mound.position.y = H / 2 - 0.18;
    this.mound.visible = false;
    this.cupGroup.add(this.mound);

    // closed dome
    const dome = new THREE.Mesh(kit.domeGeo, k.dome);
    dome.position.y = 0.08;
    dome.scale.set(1, 0.78, 1);
    const band = new THREE.Mesh(kit.bandGeo, kit.band);
    band.position.y = -0.2;
    this.domeGroup.add(dome, band);

    // mystery dome
    const mdome = new THREE.Mesh(kit.domeGeo, kit.mystery);
    mdome.position.y = 0.08;
    mdome.scale.set(1, 0.78, 1);
    const mband = new THREE.Mesh(kit.bandGeo, kit.band);
    mband.position.y = -0.2;
    this.mysteryGroup.add(mdome, mband);
    this.questionMark = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), kit.question);
    this.questionMark.position.set(0, 0.28, 1.12);
    this.root.add(this.questionMark);

    // colour mark for colour-assist
    this.badge = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: kit.atlas.texture, transparent: true, opacity: 0.0, depthWrite: false }));
    const [u0, v0, u1, v1] = kit.atlas.rect(trueColor);
    this.badge.geometry = this.badge.geometry.clone();
    const uv = this.badge.geometry.getAttribute('uv') as THREE.BufferAttribute;
    uv.setXY(0, u0, v1);
    uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0);
    uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
    this.badge.position.set(0, -0.12, 1.15);
    this.root.add(this.badge);

    this.shadow = new THREE.Mesh(kit.shadowGeo, kit.shadowMat);
    this.shadow.position.set(0, -0.25, -0.76);
    this.root.add(this.shadow);

    this.glowMat = new THREE.MeshBasicMaterial({ map: softDot(), color: k.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), this.glowMat);
    this.glow.position.z = -0.8;
    this.root.add(this.glow);

    this.labelMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), this.labelMat);
    this.label.visible = false;
    this.label.position.set(0, -1.05, 0.5);
    this.root.add(this.label);

    this.setMode(mystery ? 'mystery' : 'dome');
  }

  setMode(mode: BucketMode): void {
    this.mode = mode;
    this.cupGroup.visible = mode === 'open' || mode === 'belt';
    this.domeGroup.visible = mode === 'dome';
    this.mysteryGroup.visible = mode === 'mystery';
    this.questionMark.visible = mode === 'mystery';
    this.body.rotation.x = mode === 'belt' ? TILT_BELT : TILT_BOARD;
    this.shadow.visible = mode !== 'belt';
    this.label.visible = mode === 'belt';
    this.mound.visible = mode === 'belt' && this.fill > 0.01;
  }

  setColorAssist(on: boolean): void {
    (this.badge.material as THREE.MeshBasicMaterial).opacity = on ? 0.55 : 0;
  }

  /** Set the mound height (0..1). */
  setFill(f: number): void {
    this.fill = f;
    this.mound.visible = this.mode === 'belt' && f > 0.005;
    const h = 0.08 + f * 0.62;
    this.mound.scale.set(0.9 + f * 0.08, h, 0.9 + f * 0.08);
    this.mound.position.y = H / 2 - 0.34 + f * 0.26;
  }

  setLabel(pct: number): void {
    const t = `${Math.max(0, Math.min(100, Math.floor(pct)))}%`;
    if (t === this.labelText) return;
    this.labelText = t;
    this.labelMat.map = labelTexture(t);
    this.labelMat.needsUpdate = true;
  }

  /** Squash and stretch kick. Positive stretches vertically first. */
  punch(s = 0.2): void {
    this.vy += s * 16;
    this.vx -= s * 9;
  }

  update(dt: number, time: number): void {
    const ay = -210 * this.sy - 15 * this.vy;
    const ax = -210 * this.sx - 15 * this.vx;
    this.vy += ay * dt;
    this.vx += ax * dt;
    this.sy += this.vy * dt;
    this.sx += this.vx * dt;
    this.body.scale.set(1 + this.sx, 1 + this.sy, 1 + this.sx * 0.5);
    const pulse = 0.5 + 0.5 * Math.sin(time * 4 + this.root.position.x * 0.7);
    this.glowMat.opacity = this.hint * (0.16 + 0.2 * pulse);
    this.body.rotation.z = this.wobble;
  }

  dispose(): void {
    this.badge.geometry.dispose();
  }
}
