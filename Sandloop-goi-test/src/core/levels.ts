import { LEVEL_DATA } from './level-data';

export interface LevelDef {
  id: number;
  /** Name of the picture. */
  name: string;
  /** Index into ART_SOURCES. */
  art: number;
  /** Sky theme key. */
  theme: string;
  /** One string per board row: '.' void, 'o' floor, 'x' hole. Row 0 touches the belt side. */
  tiles: string[];
  /**
   * One array of tokens per board row: '.' none, '5' colour id (base 36), '?5' mystery bucket of that colour.
   * The buckets of a colour share that colour's sand exactly: bucket size is never stored.
   */
  buckets: string[][];
  /** Seconds a bucket needs to fill when sand is always available. */
  fillSeconds: number;
  slots?: number;
  /** Show the 'Hard level' marker. */
  hard?: boolean;
}

export const LEVELS: LevelDef[] = LEVEL_DATA;

export const LEVEL_COUNT = LEVELS.length;
