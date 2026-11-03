import * as THREE from 'three';
import { SAND_COLORS, type SandColor } from '../core/palette';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Belt lane: blue-grey rubber with vertical cleat lines, like the reference. u runs along the belt. */
export function laneTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const W = 256;
  const H = 128;
  const [c, g] = canvas(W, H);
  const [b, bg] = canvas(W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#7585b8');
  grad.addColorStop(0.5, '#6b7bae');
  grad.addColorStop(1, '#5b6a9c');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  bg.fillStyle = '#9a9a9a';
  bg.fillRect(0, 0, W, H);
  const step = W / 8;
  for (let i = 0; i < 8; i++) {
    const x = i * step;
    g.fillStyle = 'rgba(40,52,100,0.55)';
    g.fillRect(x, 0, 3, H);
    g.fillStyle = 'rgba(255,255,255,0.20)';
    g.fillRect(x + 3, 0, 2, H);
    bg.fillStyle = '#2a2a2a';
    bg.fillRect(x, 0, 3, H);
    bg.fillStyle = '#e8e8e8';
    bg.fillRect(x + 3, 0, 3, H);
  }
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  const bump = new THREE.CanvasTexture(b);
  for (const t of [map, bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, bump };
}

const GLYPH_CELL = 128;
const GLYPH_COLS = 4;

function glyphPath(kind: SandColor['glyph'], s: number): Path2D {
  const p = new Path2D();
  const c = s / 2;
  const r = s * 0.34;
  switch (kind) {
    case 'circle':
      p.arc(c, c, r, 0, Math.PI * 2);
      break;
    case 'square':
      p.roundRect(c - r * 0.92, c - r * 0.92, r * 1.84, r * 1.84, r * 0.28);
      break;
    case 'triangle':
      p.moveTo(c, c - r * 1.05);
      p.lineTo(c + r * 1.05, c + r * 0.8);
      p.lineTo(c - r * 1.05, c + r * 0.8);
      p.closePath();
      break;
    case 'diamond':
      p.moveTo(c, c - r * 1.15);
      p.lineTo(c + r * 0.95, c);
      p.lineTo(c, c + r * 1.15);
      p.lineTo(c - r * 0.95, c);
      p.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r * 1.2 : r * 0.52;
        const x = c + Math.cos(a) * rr;
        const y = c + Math.sin(a) * rr;
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
      p.closePath();
      break;
    case 'heart':
      p.moveTo(c, c + r * 1.0);
      p.bezierCurveTo(c - r * 1.6, c - r * 0.1, c - r * 0.9, c - r * 1.2, c, c - r * 0.45);
      p.bezierCurveTo(c + r * 0.9, c - r * 1.2, c + r * 1.6, c - r * 0.1, c, c + r * 1.0);
      p.closePath();
      break;
    case 'plus': {
      const t = r * 0.42;
      p.roundRect(c - t, c - r * 1.05, t * 2, r * 2.1, t * 0.5);
      p.roundRect(c - r * 1.05, c - t, r * 2.1, t * 2, t * 0.5);
      break;
    }
    case 'hex':
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        const x = c + Math.cos(a) * r * 1.1;
        const y = c + Math.sin(a) * r * 1.1;
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
      p.closePath();
      break;
    case 'drop':
      p.moveTo(c, c - r * 1.2);
      p.bezierCurveTo(c + r * 0.3, c - r * 0.5, c + r * 1.0, c + r * 0.1, c + r * 0.8, c + r * 0.55);
      p.bezierCurveTo(c + r * 0.55, c + r * 1.1, c - r * 0.55, c + r * 1.1, c - r * 0.8, c + r * 0.55);
      p.bezierCurveTo(c - r * 1.0, c + r * 0.1, c - r * 0.3, c - r * 0.5, c, c - r * 1.2);
      p.closePath();
      break;
    case 'bolt':
      p.moveTo(c + r * 0.25, c - r * 1.2);
      p.lineTo(c - r * 0.85, c + r * 0.15);
      p.lineTo(c - r * 0.05, c + r * 0.15);
      p.lineTo(c - r * 0.3, c + r * 1.2);
      p.lineTo(c + r * 0.85, c - r * 0.2);
      p.lineTo(c + r * 0.05, c - r * 0.2);
      p.closePath();
      break;
    case 'moon':
      p.arc(c, c, r * 1.05, Math.PI * 0.2, Math.PI * 1.8, false);
      p.arc(c + r * 0.55, c - r * 0.05, r * 0.85, Math.PI * 1.55, Math.PI * 0.45, true);
      p.closePath();
      break;
  }
  return p;
}

export interface GlyphAtlas {
  texture: THREE.CanvasTexture;
  /** uv rectangle [u0, v0, u1, v1] per palette id */
  rect(id: number): [number, number, number, number];
}

/** White glyphs on a transparent atlas. Tint them per use. */
export function glyphAtlas(): GlyphAtlas {
  const rows = Math.ceil(SAND_COLORS.length / GLYPH_COLS);
  const [c, g] = canvas(GLYPH_CELL * GLYPH_COLS, GLYPH_CELL * rows);
  SAND_COLORS.forEach((col, i) => {
    const gx = (i % GLYPH_COLS) * GLYPH_CELL;
    const gy = Math.floor(i / GLYPH_COLS) * GLYPH_CELL;
    g.save();
    g.translate(gx, gy);
    const p = glyphPath(col.glyph, GLYPH_CELL);
    g.lineJoin = 'round';
    g.lineWidth = 9;
    g.strokeStyle = 'rgba(20,10,50,0.55)';
    g.stroke(p);
    g.fillStyle = '#ffffff';
    g.fill(p);
    g.restore();
  });
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return {
    texture,
    rect(id) {
      const col = id % GLYPH_COLS;
      const row = Math.floor(id / GLYPH_COLS);
      const u0 = col / GLYPH_COLS;
      const u1 = (col + 1) / GLYPH_COLS;
      const v1 = 1 - row / rows;
      const v0 = 1 - (row + 1) / rows;
      return [u0, v0, u1, v1];
    },
  };
}

const numberCache = new Map<string, THREE.CanvasTexture>();

/** A bold number badge. Cached per (text, color). */
export function numberTexture(text: string, fg = '#ffffff', stroke = '#1a1538'): THREE.CanvasTexture {
  const key = `${text}|${fg}|${stroke}`;
  const hit = numberCache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(128, 128);
  g.font = '800 88px "Unbounded", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 14;
  g.strokeStyle = stroke;
  g.strokeText(text, 64, 70);
  g.fillStyle = fg;
  g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  numberCache.set(key, t);
  return t;
}

const labelCache = new Map<string, THREE.CanvasTexture>();

/** Wide outlined label, used for the fill percentage under belt buckets. */
export function labelTexture(text: string, fg = '#ffffff', stroke = '#1c2350'): THREE.CanvasTexture {
  const key = `${text}|${fg}|${stroke}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '800 78px "Unbounded", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 14;
  g.strokeStyle = stroke;
  g.strokeText(text, 128, 70);
  g.fillStyle = fg;
  g.fillText(text, 128, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  labelCache.set(key, t);
  return t;
}

/** Soft round sprite for dust, glows and bokeh. */
export function softDot(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tileable value noise used as a micro surface for lacquer and sand. */
export function noiseTexture(size = 128, scale = 6): THREE.CanvasTexture {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  const lat: number[] = [];
  const n = scale;
  for (let i = 0; i < n * n; i++) lat.push(Math.random());
  const at = (x: number, y: number) => lat[((y % n) + n) % n * n + (((x % n) + n) % n)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * n;
      const fy = (y / size) * n;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
      const b = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
      const v = (a * (1 - sy) + b * sy) * 255 * 0.7 + Math.random() * 255 * 0.3;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Diagonal sheen streaks painted on glass. */
export function glassSheen(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  const streak = (x: number, w: number, a: number) => {
    const grad = g.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.save();
    g.translate(128, 128);
    g.rotate(-0.42);
    g.translate(-128, -128);
    g.fillStyle = grad;
    g.fillRect(x, -100, w, 460);
    g.restore();
  };
  streak(40, 46, 0.55);
  streak(112, 18, 0.35);
  streak(160, 70, 0.22);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
