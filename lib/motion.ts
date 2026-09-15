/*
  The motion tokens, for the animations Motion drives from JS. Motion takes a
  duration in seconds and a curve as an array, so it cannot read the custom
  properties app/tokens.css defines; these mirror them, in the same direction
  RAIL_CELL mirrors --spacing-menu-rail, and motion.test.ts fails the moment a
  token moves and its mirror does not.
*/

/** --duration-state: one control answering a pointer. */
export const DURATION_STATE = 0.15;

/** --duration-pane: a whole pane, or a band of one, travelling. */
export const DURATION_PANE = 0.22;

/** --ease-out-emphasized. */
export const EASE_OUT_EMPHASIZED = [0.22, 1, 0.36, 1] as const;
