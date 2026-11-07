/*
  Motion takes durations in seconds and curves as arrays. The values below
  mirror their CSS counterparts; motion.test.ts catches drift.
*/

/** --duration-state: one control answering a pointer. */
export const DURATION_STATE = 0.15;

/** --duration-pane: a whole pane, or a band of one, travelling. */
export const DURATION_PANE = 0.22;

/** A tab's old body going (Motion only): quick, as the new one waits on it. */
export const DURATION_TAB_LEAVE = 0.1;

/** --detail-after: a detail column trailing its list on arrival. */
export const DETAIL_AFTER = 0.15;

/** --ease-out-emphasized. */
export const EASE_OUT_EMPHASIZED = [0.22, 1, 0.36, 1] as const;

/** Quadratic ease-out preset for screen-level motion. */
export const EASE_OUT_QUAD = [0.25, 0.46, 0.45, 0.94] as const;

/**
  An empty state's parts rising into place: each part takes these variants,
  and their parent staggers them by EMPTY_STATE_STAGGER.
*/
export const EMPTY_STATE_ARRIVE = {
  hidden: { opacity: 0, y: 8 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE_OUT_EMPHASIZED },
  },
};
export const EMPTY_STATE_STAGGER = 0.12;

/*
  A duration paced by how far something travels: so many ms per px, within
  limits. Pace and limits are tokens on the element's style, named
  --<name>-pace, --<name>-min and --<name>-max (geometry.css), the same ones
  a stylesheet pacing that motion by clamp() reads, so the two agree. In ms.
*/
export function pacedDuration(
  element: Element,
  name: string,
  distance: number,
) {
  const style = getComputedStyle(element);
  const read = (part: string) =>
    parseFloat(style.getPropertyValue(`--${name}-${part}`));
  const [pace, min, max] = [read('pace'), read('min'), read('max')];
  return Math.min(
    max || Infinity,
    Math.max(min || 0, Math.abs(distance) * (pace || 0)),
  );
}
