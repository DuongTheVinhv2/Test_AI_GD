import { parseToken, type ParsedToken } from '../core/grid';

/** Helpers for bucket tokens: '5' plain, '?5' mystery, 'F2:5' frozen (2 pops), 'K1:5' key, 'L1:5' lock. */
export const isBucketTok = (t: string | undefined): t is string => !!t && t !== '.' && t !== ' ';

export const tokInfo = (t: string): ParsedToken => parseToken(t);
export const tokColor = (t: string): number => parseToken(t).color;

/** A token with no mechanic on it (a plain bucket, not even mystery). */
export const isPlain = (t: string): boolean => {
  const p = parseToken(t);
  return !p.mystery && !p.frozen && !p.key && !p.lock;
};

export function makeToken(color: number, o: { mystery?: boolean; frozen?: number; key?: number; lock?: number } = {}): string {
  const c = color.toString(36);
  if (o.frozen) return `F${o.frozen}:${c}`;
  if (o.key) return `K${o.key}:${c}`;
  if (o.lock) return `L${o.lock}:${c}`;
  return (o.mystery ? '?' : '') + c;
}

/** The same token (same mechanic) with another colour. */
export function withColor(t: string, color: number): string {
  const p = parseToken(t);
  return makeToken(color, { mystery: p.mystery, frozen: p.frozen, key: p.key, lock: p.lock });
}

/** The same colour with the mechanic of another token (used to move a mechanic mark between buckets). */
export function withMechanic(t: string, from: string): string {
  const p = parseToken(from);
  return makeToken(parseToken(t).color, { mystery: p.mystery, frozen: p.frozen, key: p.key, lock: p.lock });
}

export const DIR_ARROW: Record<'u' | 'd' | 'l' | 'r', string> = { u: '↑', d: '↓', l: '←', r: '→' };
