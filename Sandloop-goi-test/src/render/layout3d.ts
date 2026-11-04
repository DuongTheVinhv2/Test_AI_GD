/**
 * World layout of the play screen, measured from the reference footage.
 * 1 world unit = 50 px of the 720 x 1280 reference, so the screen is 14.4 x 25.6 units, y up, origin at its centre.
 */
export const PX = 1 / 50;

export const STAGE = { w: 14.4, h: 25.6 };

/** Tilt the lower assembly toward the viewer at the bottom edge of the screen. */
export const LOWER_STAGE_TILT = -Math.PI / 10;

/** Sand window. */
export const WINDOW = {
  /** inner sand area */
  size: 9.0,
  cx: 0,
  cy: 5.58,
  frame: 0.24,
  get left() {
    return this.cx - this.size / 2;
  },
  get right() {
    return this.cx + this.size / 2;
  },
  get bottom() {
    return this.cy - this.size / 2;
  },
  get top() {
    return this.cy + this.size / 2;
  },
};

/** Conveyor belt under the window. */
export const BELT = {
  /** lane centre line */
  y: -0.42,
  /** visible lane length is the distance between the end caps' inner faces */
  innerHalf: 5.4,
  plateY: -2.02,
};

/** Tile board. */
export const BOARD = {
  top: -3.8,
  cell: 2.05,
  cols: 5,
  /** world y of the centre of row r */
  rowY: (r: number) => BOARD.top - BOARD.cell * (r + 0.5),
  colX: (c: number, cols = 5) => (c - (cols - 1) / 2) * BOARD.cell,
};

/** Position along the lane (window widths, 0 = left edge of the sand) to world x. */
export function windowToWorldX(wx: number): number {
  return WINDOW.left + wx * WINDOW.size;
}
