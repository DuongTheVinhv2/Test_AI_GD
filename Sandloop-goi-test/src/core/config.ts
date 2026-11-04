/** Simulation constants shared by the game and the headless analysis tools. */

/** Sand simulation steps per second. */
export const SIM_HZ = 150;
export const SIM_DT = 1 / SIM_HZ;
/** Grains per art pixel along one axis (32 art pixels -> 128 grains). */
export const GRAINS_PER_PIXEL = 4;

export const LANE = {
  /** Belt lane extent in window widths (0 = left edge of the sand window, 1 = right edge). */
  x0: -0.1,
  x1: 1.1,
  /** Travel speed along the lane, window widths per second. */
  speed: 0.3,
  /**
   * Seconds a bucket spends going round the end cap and back to the start. With five evenly spaced slots the loop is
   * 1.2 / speed + returnTime = 5.3 s, so neighbours are 1.06 s (0.32 window widths) apart: one bucket-sized gap between them.
   */
  returnTime: 1.3,
  /** Seconds a tapped bucket spends flying from the board to the belt start. */
  flyBase: 0.4,
  flyPerCell: 0,
  popTime: 0.7,
  /** Grains a bucket can reach on each side of its centre. */
  pickRadius: 7,
  /**
   * A run of this many grains of other colours is a layer and stops a bucket; shorter runs are strays it reaches through.
   * Sand of two colours mixes where it slides down the same slope, and the strays sink as a bucket drains the colour around
   * them; when only the floor row counted, a single stray grain blocked a whole column. A picture pixel is 4 grains tall,
   * so a real layer of the picture still has to go first.
   */
  layerGrains: 4,
};

export const DEFAULT_SLOTS = 5;

/**
 * Final stretch: once this many buckets (or fewer) are left to fill, the whole run is pushed to this speed whatever the
 * player picked with the x1/x2 button, so the end of a level is not a slow wait for the last grains.
 * Levels with no more buckets than this are left alone (a level of five buckets would be x3 from the first tap).
 */
export const FINAL_STRETCH = { buckets: 5, speed: 3 };

/** Width of one board tile in sand-window widths (BOARD.cell / WINDOW.size in render/layout3d.ts), so the core can tell where a tile is over the belt. */
export const BOARD_CELL_IN_WINDOWS = 2.05 / 9.0;

/** Coins per cleared level, as in the reference footage. */
export const LEVEL_REWARD = 25;
export const START_COINS = 0;
