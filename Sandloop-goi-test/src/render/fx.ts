import * as THREE from 'three';
import { SAND_COLORS } from '../core/palette';
import type { Particles } from './particles';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Soft puff of dust in the colour of the sand that caused it. */
export function dust(p: Particles, x: number, y: number, color: number | THREE.ColorRepresentation, n = 5, size = 0.26, spread = 0.7, up = 0.5, z = 0.9): void {
  for (let i = 0; i < n; i++) {
    p.spawn({
      kind: 'dust',
      x: x + rnd(-0.12, 0.12),
      y: y + rnd(-0.05, 0.08),
      z,
      vx: rnd(-spread, spread),
      vy: rnd(0.1, up),
      life: rnd(0.45, 0.85),
      size: size * rnd(0.7, 1.3),
      color,
      alpha: 0.42,
      drag: 2.2,
      growth: 1.4,
      glow: 1.15,
    });
  }
}

export function sparkle(p: Particles, x: number, y: number, color: number | THREE.ColorRepresentation, n = 8, radius = 0.9, z = 1.0): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rnd(0.5, 1.6) * radius;
    p.spawn({
      kind: 'spark',
      x,
      y,
      z,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: rnd(0.4, 0.8),
      size: rnd(0.18, 0.34),
      color,
      alpha: 1,
      drag: 3.2,
      spin: rnd(-3, 3),
      glow: 2.2,
    });
  }
}

const CONFETTI_COLORS = SAND_COLORS.slice(0, 10).map((c) => c.hex);

export function confetti(p: Particles, x: number, y: number, n = 90, power = 9, z = 1.2): void {
  for (let i = 0; i < n; i++) {
    const a = rnd(Math.PI * 0.12, Math.PI * 0.88);
    const s = rnd(0.35, 1) * power;
    p.spawn({
      kind: 'confetti',
      x: x + rnd(-1.4, 1.4),
      y,
      z,
      vx: Math.cos(a) * s * rnd(0.5, 1),
      vy: Math.sin(a) * s,
      life: rnd(1.6, 2.8),
      size: rnd(0.22, 0.4),
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      alpha: 1,
      gravity: 9,
      drag: 0.9,
      spin: rnd(-7, 7),
      glow: 1.1,
    });
  }
}

export function iceShatter(p: Particles, x: number, y: number): void {
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rnd(1.2, 3.4);
    p.spawn({
      kind: 'shard',
      x: x + rnd(-0.4, 0.4),
      y: y + rnd(-0.4, 0.4),
      z: 1.0,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s + 1.5,
      life: rnd(0.5, 0.95),
      size: rnd(0.2, 0.42),
      color: '#bfeaff',
      alpha: 0.95,
      gravity: 10,
      drag: 0.6,
      spin: rnd(-9, 9),
      glow: 1.3,
    });
  }
  dust(p, x, y, '#dff6ff', 6, 0.34, 1.2, 0.6, 1.1);
}

/** A cascade of sand grains, used when a bucket empties onto the artwork. */
export function sandSpill(p: Particles, x: number, y: number, color: number, toX: number, toY: number, n = 46): void {
  for (let i = 0; i < n; i++) {
    const x0 = x + rnd(-0.3, 0.3);
    const fall = Math.max(0.2, y - toY);
    const t = Math.sqrt((2 * fall) / 20);
    p.spawn({
      kind: 'grain',
      x: x0,
      y: y + rnd(-0.1, 0.1),
      z: 0.6,
      vx: (toX + rnd(-0.5, 0.5) - x0) / t,
      vy: -rnd(0.5, 1.5),
      life: t * 1.05,
      size: rnd(0.05, 0.09),
      color,
      alpha: 1,
      gravity: 20,
      killY: toY,
    });
  }
}
