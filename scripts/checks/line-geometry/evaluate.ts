/*
  Turns captures into findings. The workbench lab is judged against what each
  specimen declares; a live screen against itself (no line changes thickness
  along its length, no junction gaps or pokes through) and against the
  reference browser.
*/

import {
  at,
  compareSegments,
  describe,
  findJunctions,
  findSegments,
  sameColours,
  segmentOptions,
  sideProfile,
  thickness,
  thicknessSteps,
  type Colour,
  type Junction,
  type Rect,
  type Segment,
  type Side,
} from './analyse.ts';
import type { Capture, SpecimenBox } from './capture.ts';

/* ── The lab ───────────────────────────────────────────────────────────── */

export type SpecimenReading = {
  id: string;
  approach: string;
  /* Every profile read, side by side, outside first. */
  profiles: { side: Side; colours: Colour[] }[];
  /* For junction specimens: each line end and how it meets the line it ends
     against, as text that compares equal across browsers when the drawing is. */
  joins: string[];
  problems: string[];
};

export const gated = (approach: string) =>
  approach === 'border' || approach === 'layered';

function expectedThickness(sp: SpecimenBox, scale: number) {
  const dp = sp.total * scale;
  if (sp.approach === 'border') return Math.max(1, Math.floor(dp + 1e-6));
  if (sp.approach === 'layered') return Math.ceil(dp - 1e-6);
  return null;
}

const ALL_SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const SIDES: Record<string, Side[]> = {
  all: ALL_SIDES,
  bottom: ['bottom'],
  // A pill: its ends are half circles, only the long sides are straight.
  horizontal: ['top', 'bottom'],
};

function dpRect(sp: SpecimenBox, scale: number): Rect {
  return {
    x: sp.x * scale,
    y: sp.y * scale,
    width: sp.width * scale,
    height: sp.height * scale,
  };
}

function junctionText(j: Junction, origin: Rect) {
  const where = (s: Segment) =>
    `${s.orientation === 'horizontal' ? 'h' : 'v'}@${s.bandFrom - Math.round(s.orientation === 'horizontal' ? origin.y : origin.x)}`;
  return `${where(j.line)}.${j.end} ${j.relation}${j.depth ? ` ${j.depth}` : ''} ${where(j.edge)} (${thickness(j.line)}/${thickness(j.edge)}dp)`;
}

/*
  A line that pokes through an edge of its own colour does not cross it as a
  band -- the edge's columns are one colour top to bottom -- so it surfaces as
  a short stub just past the edge. `short` holds segments of any length.
*/
function stubsPast(short: Segment[], junctions: Junction[], minLength: number) {
  const out: Segment[] = [];
  for (const j of junctions) {
    if (j.relation === 'gap' || j.relation === 'overshoot') continue;
    const forward = j.end === 'end';
    const far = forward ? j.edge.bandTo : j.edge.bandFrom;
    const stub = short.find(
      (s) =>
        s.orientation === j.line.orientation &&
        s.bandFrom === j.line.bandFrom &&
        s.bandTo === j.line.bandTo &&
        s.to - s.from + 1 < minLength &&
        (forward ? s.from === far + 1 : s.to === far - 1),
    );
    // A line that carries on past the junction (a T, a crossing) is not a
    // stub, even where its layers change for a few pixels after it.
    const continues =
      stub &&
      short.some(
        (s) =>
          s !== stub &&
          s.orientation === stub.orientation &&
          s.bandFrom <= stub.bandTo &&
          s.bandTo >= stub.bandFrom &&
          (forward ? s.from === stub.to + 1 : s.to === stub.from - 1),
      );
    if (stub && !continues) out.push(stub);
  }
  return out;
}

export function readSpecimen(
  capture: Capture,
  sp: SpecimenBox,
): SpecimenReading {
  const { image, scale } = capture;
  const rect = dpRect(sp, scale);
  const problems: string[] = [];
  const profiles: SpecimenReading['profiles'] = [];
  const joins: string[] = [];

  if (sp.kind === 'junction') {
    const region = {
      x: rect.x - 4 * scale,
      y: rect.y - 4 * scale,
      width: rect.width + 8 * scale,
      height: rect.height + 8 * scale,
    };
    const opts = segmentOptions(scale);
    const segments = findSegments(image, region, opts);
    const junctions = findJunctions(segments, opts.maxBand);
    joins.push(...junctions.map((j) => junctionText(j, rect)).sort());
    for (const j of junctions) {
      if (j.relation === 'gap' || j.relation === 'overshoot')
        problems.push(`${junctionText(j, rect)}`);
    }
    for (const stub of stubsPast(
      findSegments(image, region, { ...opts, minLength: 1 }),
      junctions,
      opts.minLength,
    )) {
      problems.push(
        `pokes ${stub.to - stub.from + 1}dp past the edge it ends at`,
      );
    }
    const steps = thicknessSteps(segments);
    for (const step of steps)
      problems.push(
        `a line changes from ${thickness(step.before)} to ${thickness(step.after)}dp`,
      );
    // The frame's sides lie along the specimen's box; every other line is
    // inside it. Each group is meant to be one thickness.
    const onFrame = (s: Segment) => {
      const [lo, hi] =
        s.orientation === 'horizontal'
          ? [rect.y, rect.y + rect.height]
          : [rect.x, rect.x + rect.width];
      return (
        Math.abs(s.bandFrom - lo) <= opts.maxBand ||
        Math.abs(s.bandTo + 1 - hi) <= opts.maxBand
      );
    };
    for (const [name, group] of [
      ['frame', segments.filter(onFrame)],
      ['inner', segments.filter((s) => !onFrame(s))],
    ] as const) {
      const widths = new Set(group.map(thickness));
      if (widths.size > 1)
        problems.push(`${name} lines of ${[...widths].sort().join(' and ')}dp`);
    }
    return { id: sp.id, approach: sp.approach, profiles, joins, problems };
  }

  // A radius larger than the box (a pill's 999px) is drawn as half the box.
  const inset = Math.min(sp.radius, sp.width / 2, sp.height / 2) + 3;
  const reach = { out: 4 * scale, in: Math.min(6, sp.height / 2 - 2) * scale };
  for (const side of SIDES[sp.sides] ?? ALL_SIDES) {
    const horizontal = side === 'top' || side === 'bottom';
    const start = (horizontal ? sp.x : sp.y) + inset;
    const length = (horizontal ? sp.width : sp.height) - 2 * inset;
    for (const f of [0.25, 0.5, 0.75]) {
      const along = Math.floor((start + length * f) * scale) + 0.5;
      profiles.push({
        side,
        colours: sideProfile(image, rect, side, along, reach).colours,
      });
    }
  }
  const first = at(profiles, 0).colours;
  // Two levels: Safari dithers gradients by one, which no eye can see.
  const uneven = profiles.filter((p) => !sameColours(p.colours, first, 2));
  if (uneven.length) {
    // Every distinct profile and where it was read: side and how far along.
    const seen = new Map<string, string[]>();
    profiles.forEach((p, i) => {
      const key = describe(p.colours);
      const where = `${p.side} ${[25, 50, 75][i % 3]}%`;
      seen.set(key, [...(seen.get(key) ?? []), where]);
    });
    problems.push(
      `uneven: ${[...seen].map(([d, at]) => `${d} at ${at.join(', ')}`).join('; ')}`,
    );
  }
  const expected = expectedThickness(sp, scale);
  const thicknesses = new Set(profiles.map((p) => p.colours.length));
  if (
    expected !== null &&
    (thicknesses.size !== 1 || !thicknesses.has(expected))
  ) {
    problems.push(
      `${[...thicknesses].join('/')}dp where ${expected}dp is meant`,
    );
  }
  return { id: sp.id, approach: sp.approach, profiles, joins, problems };
}

/* Each specimen in `other` against the same specimen in `reference`. */
export function compareReadings(
  reference: SpecimenReading,
  other: SpecimenReading,
  refName: string,
) {
  if (reference.profiles.length) {
    const differs = other.profiles.some((p, i) => {
      const ref = reference.profiles[i];
      return !ref || !sameColours(p.colours, ref.colours, 2);
    });
    if (differs) {
      return `differs from ${refName}: ${describe(at(reference.profiles, 0).colours)} there, ${describe(at(other.profiles, 0).colours)} here`;
    }
    return null;
  }
  const only = (x: string[], y: string[]) => x.filter((j) => !y.includes(j));
  const there = only(reference.joins, other.joins);
  const here = only(other.joins, reference.joins);
  if (!there.length && !here.length) return null;
  return `joins differ from ${refName}: ${there[0] ?? '(nothing)'} there, ${here[0] ?? '(nothing)'} here`;
}

/* ── Live screens ──────────────────────────────────────────────────────── */

export type Mark = {
  x: number;
  y: number;
  width: number;
  height: number;
  note: string;
};

export type ScreenReading = {
  segments: Segment[];
  /* Thickness in device px -> number of lines. */
  widths: Record<number, number>;
  faults: Mark[];
};

const markOf = (s: Segment, note: string): Mark =>
  s.orientation === 'horizontal'
    ? {
        x: s.from,
        y: s.bandFrom,
        width: s.to - s.from + 1,
        height: thickness(s),
        note,
      }
    : {
        x: s.bandFrom,
        y: s.from,
        width: thickness(s),
        height: s.to - s.from + 1,
        note,
      };

export function readScreen(capture: Capture): ScreenReading {
  const { image, scale } = capture;
  const opts = segmentOptions(scale);
  const all = { x: 0, y: 0, width: image.width, height: image.height };
  const segments = findSegments(image, all, opts);
  const widths: Record<number, number> = {};
  for (const s of segments)
    widths[thickness(s)] = (widths[thickness(s)] ?? 0) + 1;
  const faults: Mark[] = [];
  for (const { before, after } of thicknessSteps(segments)) {
    faults.push(
      markOf(
        after,
        `changes from ${thickness(before)} to ${thickness(after)}dp`,
      ),
    );
  }
  const junctions = findJunctions(segments, opts.maxBand);
  for (const j of junctions) {
    if (j.relation === 'gap')
      faults.push(
        markOf(j.line, `stops ${j.depth}dp short of the line it meets`),
      );
    if (j.relation === 'overshoot')
      faults.push(markOf(j.line, `runs ${j.depth}dp past the line it meets`));
  }
  const short = findSegments(image, all, { ...opts, minLength: 1 });
  for (const stub of stubsPast(short, junctions, opts.minLength)) {
    faults.push(
      markOf(stub, `pokes ${stub.to - stub.from + 1}dp past the line it meets`),
    );
  }
  return { segments, widths, faults };
}

export function compareScreens(
  reference: ScreenReading,
  other: ScreenReading,
  scale: number,
): Mark[] {
  return compareSegments(reference.segments, other.segments, {
    shift: Math.ceil(scale),
    colourTolerance: 3,
  }).map((d) => {
    if (d.kind === 'missing') return markOf(d.segment, 'missing here');
    if (d.kind === 'extra') return markOf(d.segment, 'not in the reference');
    return markOf(
      d.other,
      d.kind === 'thickness'
        ? `${thickness(d.other)}dp here, ${thickness(d.segment)}dp in the reference`
        : d.kind === 'colours'
          ? `layers ${describe(d.other.colours)} here, ${describe(d.segment.colours)} in the reference`
          : 'ends elsewhere than in the reference',
    );
  });
}
