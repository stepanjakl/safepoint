/*
  Motion takes durations in seconds and curves as arrays. The values below
  mirror their CSS counterparts; motion.test.ts catches drift.
*/

/** --duration-state: one control answering a pointer. */
export const DURATION_STATE = 0.15;

/** --duration-pane: a whole pane, or a band of one, travelling. */
export const DURATION_PANE = 0.22;

/** --ease-out-emphasized. */
export const EASE_OUT_EMPHASIZED = [0.22, 1, 0.36, 1] as const;

/** Quadratic ease-out preset for screen-level motion. */
export const EASE_OUT_QUAD = [0.25, 0.46, 0.45, 0.94] as const;
