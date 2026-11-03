/**
 * World layout of the play screen, measured from the reference footage.
 * 1 world unit = 50 px of the 720 x 1280 reference, so the screen is 14.4 x 25.6 units, y up, origin at its centre.
 */
export const PX = 1 / 50;

export const STAGE = { w: 14.4, h: 25.6 };

/** Sand window. */
export const WINDOW = {
  /** inner sand area */
  size: 9.0,
  cx: 0,
  cy: 6.62,
  frame: 0.5,
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
  y: 0.62,
  /** visible lane length is the distance between the end caps' inner faces */
  innerHalf: 5.4,
  capHalfW: 2.2,
  capH: 3.0,
  laneH: 1.5,
  plateY: -1.22,
};

/** Tile board. */
export const BOARD = {
  top: -2.12,
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
