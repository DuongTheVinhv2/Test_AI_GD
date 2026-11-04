import type { RodDef, TunnelDef } from './grid';
import { LEVEL_DATA } from './level-data';

export interface LevelDef {
  id: number;
  /** Name of the picture. */
  name: string;
  /** Index into ART_SOURCES. */
  art: number;
  /** Sky theme key. */
  theme: string;
  /** One string per board row: '.' void, 'o' floor, 'x' hole, 't' tunnel mouth. Row 0 touches the belt side. */
  tiles: string[];
  /**
   * One array of tokens per board row: '.' none, '5' colour id (base 36), '?5' mystery bucket of that colour,
   * 'F2:5' frozen bucket (thaws after 2 pops), 'K1:5' key bucket and 'L1:5' lock bucket (key 1 opens lock 1).
   * The buckets of a colour share that colour's sand exactly: bucket size is never stored.
   */
  buckets: string[][];
  /** Seconds a bucket needs to fill when sand is always available. */
  fillSeconds: number;
  /** Tunnels (each sits on a 't' tile and faces a floor tile). */
  tunnels?: TunnelDef[];
  /** Gate bars lying over floor tiles. */
  rods?: RodDef[];
  slots?: number;
  /** Show the 'Hard level' marker. */
  hard?: boolean;
}

export const LEVELS: LevelDef[] = LEVEL_DATA;

export const LEVEL_COUNT = LEVELS.length;
