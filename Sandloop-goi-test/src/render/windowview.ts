import * as THREE from 'three';
import type { SandSim } from '../core/sand';
import { WINDOW } from './layout3d';
import type { Mats } from './materials';
import { SandView } from './sandview';
import { ringGeometry } from './shapes';

function innerShadowTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  // Light comes from the top left, so the frame throws its shadow down and to the right.
  const edges: Array<[number, number, number, number, number]> = [
    [0, 0, S, 0, 0.42],
    [0, 0, 0, S, 0.3],
    [S, 0, 0, 0, 0.12],
    [0, S, 0, 0, 0.18],
  ];
  void edges;
  const top = g.createLinearGradient(0, 0, 0, S * 0.14);
  top.addColorStop(0, 'rgba(40,56,96,0.26)');
  top.addColorStop(1, 'rgba(40,56,96,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, S, S * 0.14);
  const left = g.createLinearGradient(0, 0, S * 0.12, 0);
  left.addColorStop(0, 'rgba(40,56,96,0.2)');
  left.addColorStop(1, 'rgba(40,56,96,0)');
  g.fillStyle = left;
  g.fillRect(0, 0, S * 0.12, S);
  const right = g.createLinearGradient(S, 0, S * 0.94, 0);
  right.addColorStop(0, 'rgba(40,56,96,0.1)');
  right.addColorStop(1, 'rgba(40,56,96,0)');
  g.fillStyle = right;
  g.fillRect(S * 0.94, 0, S * 0.06, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function backTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, S);
  // Light neutral blue-grey like the frame and the sky, so cleared areas do not read as a hole in the picture.
  grad.addColorStop(0, '#a2afbf');
  grad.addColorStop(1, '#8f9eb3');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 7;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class WindowView {
  readonly group = new THREE.Group();
  readonly sand: SandView;
  private ownMats: THREE.MeshBasicMaterial[] = [];

  constructor(mats: Mats, sim: SandSim) {
    const S = WINDOW.size;
    const f = WINDOW.frame;

    const backMat = new THREE.MeshBasicMaterial({ map: backTexture() });
    const shadowMat = new THREE.MeshBasicMaterial({ map: innerShadowTexture(), transparent: true, depthWrite: false });
    this.ownMats.push(backMat, shadowMat);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(S, S), backMat);
    back.position.set(WINDOW.cx, WINDOW.cy, -0.3);
    this.group.add(back);

    this.sand = new SandView(sim, S);
    this.sand.mesh.position.set(WINDOW.cx, WINDOW.cy, -0.1);
    this.group.add(this.sand.mesh);

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(S, S), shadowMat);
    shadow.position.set(WINDOW.cx, WINDOW.cy, 0.02);
    shadow.renderOrder = 5;
    this.group.add(shadow);

    // Frame: a glossy white ring with a lighter inner lip.
    const frame = new THREE.Mesh(
      ringGeometry({ outerW: S + f * 2, outerH: S + f * 2, outerR: 0.75, innerW: S + 0.14, innerH: S + 0.14, innerR: 0.2, cx: WINDOW.cx, cy: WINDOW.cy, depth: 0.3, bevel: 0.085 }),
      mats.frame,
    );
    frame.position.z = -0.2;
    frame.castShadow = true;
    frame.receiveShadow = true;
    this.group.add(frame);
    const lip = new THREE.Mesh(
      ringGeometry({ outerW: S + 0.27, outerH: S + 0.27, outerR: 0.4, innerW: S - 0.02, innerH: S - 0.02, innerR: 0.18, cx: WINDOW.cx, cy: WINDOW.cy, depth: 0.08, bevel: 0.035 }),
      mats.frameInner,
    );
    lip.position.z = 0.12;
    this.group.add(lip);

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(S, S), mats.glass);
    glass.position.set(WINDOW.cx, WINDOW.cy, 0.26);
    glass.renderOrder = 30;
    this.group.add(glass);
    const sheen = new THREE.Mesh(new THREE.PlaneGeometry(S, S), mats.sheen);
    sheen.position.set(WINDOW.cx, WINDOW.cy, 0.27);
    sheen.renderOrder = 31;
    this.group.add(sheen);
  }

  update(time: number): void {
    this.sand.update(time);
  }

  /** Free the textures and materials this view owns (geometry is freed by the scene). */
  dispose(): void {
    for (const m of this.ownMats) {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
    this.sand.dispose();
  }
}
