/**
 * Sand colors. The id is the identity of a colour everywhere: picture pixels, grains, buckets and analytics.
 * The values come from the reference footage's sand, nudged slightly for richer shading.
 */
export interface SandColor {
  id: number;
  name: string;
  hex: string;
  /** Mark used when colour-assist is on, so colour is never the only cue. */
  glyph: 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'heart' | 'plus' | 'hex' | 'drop' | 'bolt' | 'moon';
}

export const SAND_COLORS: readonly SandColor[] = [
  { id: 0, name: 'Blush', hex: '#FFB5F0', glyph: 'heart' },
  { id: 1, name: 'Poppy', hex: '#F3302F', glyph: 'circle' },
  { id: 2, name: 'Sunbeam', hex: '#FFF31C', glyph: 'star' },
  { id: 3, name: 'Tangerine', hex: '#FF7A45', glyph: 'triangle' },
  { id: 4, name: 'Amber', hex: '#FFB235', glyph: 'diamond' },
  { id: 5, name: 'Maroon', hex: '#8E1416', glyph: 'square' },
  { id: 6, name: 'Lime', hex: '#3FFB3F', glyph: 'drop' },
  { id: 7, name: 'Forest', hex: '#0A9A12', glyph: 'hex' },
  { id: 8, name: 'Cobalt', hex: '#1269CC', glyph: 'moon' },
  { id: 9, name: 'Aqua', hex: '#07EDFF', glyph: 'plus' },
  { id: 10, name: 'Cream', hex: '#FFF2DC', glyph: 'bolt' },
];

export const COLOR_COUNT = SAND_COLORS.length;
export const colorHex = (id: number): string => SAND_COLORS[id].hex;

export function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
