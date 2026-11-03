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
  top.addColorStop(0, 'rgba(10,14,40,0.46)');
  top.addColorStop(1, 'rgba(10,14,40,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, S, S * 0.14);
  const left = g.createLinearGradient(0, 0, S * 0.12, 0);
  left.addColorStop(0, 'rgba(10,14,40,0.34)');
  left.addColorStop(1, 'rgba(10,14,40,0)');
  g.fillStyle = left;
  g.fillRect(0, 0, S * 0.12, S);
  const right = g.createLinearGradient(S, 0, S * 0.94, 0);
  right.addColorStop(0, 'rgba(10,14,40,0.16)');
  right.addColorStop(1, 'rgba(10,14,40,0)');
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
  grad.addColorStop(0, '#585a63');
  grad.addColorStop(1, '#3d3f47');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 9;
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

  constructor(mats: Mats, sim: SandSim) {
    const S = WINDOW.size;
    const f = WINDOW.frame;

    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(S, S),
      new THREE.MeshBasicMaterial({ map: backTexture() }),
    );
    back.position.set(WINDOW.cx, WINDOW.cy, -0.3);
    this.group.add(back);

    this.sand = new SandView(sim, S);
    this.sand.mesh.position.set(WINDOW.cx, WINDOW.cy, -0.1);
    this.group.add(this.sand.mesh);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(S, S),
      new THREE.MeshBasicMaterial({ map: innerShadowTexture(), transparent: true, depthWrite: false }),
    );
    shadow.position.set(WINDOW.cx, WINDOW.cy, 0.02);
    shadow.renderOrder = 5;
    this.group.add(shadow);

    // Frame: a glossy white ring with a lighter inner lip.
    const frame = new THREE.Mesh(
      ringGeometry({ outerW: S + f * 2, outerH: S + f * 2, outerR: 0.75, innerW: S + 0.06, innerH: S + 0.06, innerR: 0.2, cx: WINDOW.cx, cy: WINDOW.cy, depth: 0.5, bevel: 0.12 }),
      mats.frame,
    );
    frame.position.z = -0.2;
    frame.castShadow = true;
    frame.receiveShadow = true;
    this.group.add(frame);
    const lip = new THREE.Mesh(
      ringGeometry({ outerW: S + 0.5, outerH: S + 0.5, outerR: 0.4, innerW: S - 0.02, innerH: S - 0.02, innerR: 0.18, cx: WINDOW.cx, cy: WINDOW.cy, depth: 0.1, bevel: 0.04 }),
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
}
