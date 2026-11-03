import * as THREE from 'three';

export function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  appendRoundedRect(s, w, h, r, cx, cy);
  return s;
}

function appendRoundedRect(p: THREE.Path, w: number, h: number, r: number, cx: number, cy: number): void {
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x0 + r, y0);
  p.lineTo(x0 + w - r, y0);
  p.absarc(x0 + w - r, y0 + r, r, -Math.PI / 2, 0, false);
  p.lineTo(x0 + w, y0 + h - r);
  p.absarc(x0 + w - r, y0 + h - r, r, 0, Math.PI / 2, false);
  p.lineTo(x0 + r, y0 + h);
  p.absarc(x0 + r, y0 + h - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(x0, y0 + r);
  p.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
}

export interface RingSpec {
  outerW: number;
  outerH: number;
  outerR: number;
  innerW: number;
  innerH: number;
  innerR: number;
  cx?: number;
  cy?: number;
  depth: number;
  bevel?: number;
}

/** A raised frame: outer rounded rectangle with a rounded rectangular hole. */
export function ringGeometry(s: RingSpec): THREE.ExtrudeGeometry {
  const cx = s.cx ?? 0;
  const cy = s.cy ?? 0;
  const shape = roundedRectShape(s.outerW, s.outerH, s.outerR, cx, cy);
  const hole = new THREE.Path();
  appendRoundedRect(hole, s.innerW, s.innerH, s.innerR, cx, cy);
  shape.holes.push(hole);
  const bevel = s.bevel ?? 0.05;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: s.depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 18,
  });
  return g;
}

export function slabGeometry(w: number, h: number, r: number, depth: number, bevel = 0.05, cx = 0, cy = 0): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(roundedRectShape(w, h, r, cx, cy), {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 18,
  });
}

/** Lathe profile of a bucket: tapered wall, fat rim, closed bottom. Open top, 1 unit wide at the rim. */
export function bucketGeometries(): { shell: THREE.BufferGeometry; inner: THREE.BufferGeometry; rim: THREE.BufferGeometry } {
  const top = 0.5;
  const bot = 0.38;
  const h = 0.95;
  const shellPts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -h / 2),
    new THREE.Vector2(bot - 0.05, -h / 2),
    new THREE.Vector2(bot, -h / 2 + 0.04),
    new THREE.Vector2(bot + 0.01, -h / 2 + 0.1),
    new THREE.Vector2(top - 0.015, h / 2 - 0.04),
    new THREE.Vector2(top, h / 2),
  ];
  const shell = new THREE.LatheGeometry(shellPts, 40);
  // Inner wall (visible through the translucent shell and from above).
  const innerPts: THREE.Vector2[] = [
    new THREE.Vector2(top - 0.07, h / 2),
    new THREE.Vector2(bot - 0.06, -h / 2 + 0.1),
    new THREE.Vector2(bot - 0.12, -h / 2 + 0.07),
    new THREE.Vector2(0.0, -h / 2 + 0.07),
  ];
  const inner = new THREE.LatheGeometry(innerPts, 40);
  const rim = new THREE.TorusGeometry(top - 0.02, 0.045, 12, 48);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, h / 2, 0);
  return { shell, inner, rim };
}

/** Samples a point on a rounded rectangle outline offset by `off` (positive = outward). */
export function offsetLoopPoints(
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  r: number,
  off: number,
  steps = 360,
): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const R = r + off;
  const W = hw + off;
  const H = hh + off;
  const straightX = hw - r;
  const straightY = hh - r;
  const per = 2 * (2 * straightX) + 2 * (2 * straightY) + 2 * Math.PI * R;
  for (let i = 0; i < steps; i++) {
    let d = (i / steps) * per;
    // Walk the outline starting at the top middle, clockwise.
    const segs: Array<[number, (t: number) => [number, number]]> = [
      [straightX, (t) => [t, H]],
      [(Math.PI / 2) * R, (t) => [straightX + R * Math.sin(t / R), straightY + R * Math.cos(t / R)]],
      [2 * straightY, (t) => [W, straightY - t]],
      [(Math.PI / 2) * R, (t) => [straightX + R * Math.cos(t / R), -straightY - R * Math.sin(t / R)]],
      [2 * straightX, (t) => [straightX - t, -H]],
      [(Math.PI / 2) * R, (t) => [-straightX - R * Math.sin(t / R), -straightY - R * Math.cos(t / R)]],
      [2 * straightY, (t) => [-W, -straightY + t]],
      [(Math.PI / 2) * R, (t) => [-straightX - R * Math.cos(t / R), straightY + R * Math.sin(t / R)]],
      [straightX, (t) => [-straightX + t, H]],
    ];
    for (const [len, f] of segs) {
      if (d <= len) {
        const [x, y] = f(d);
        pts.push(new THREE.Vector2(cx + x, cy + y));
        break;
      }
      d -= len;
    }
  }
  return pts;
}
