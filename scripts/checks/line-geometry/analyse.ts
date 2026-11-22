/*
  What the line checker measures, on decoded screenshot pixels and nothing
  else: no browser, no DOM, no colour written down. Shared by the CLI
  (scripts/checks/check-line-geometry.ts) and the Playwright test
  (e2e/design/line-geometry.spec.ts).

  Two readings:

  - A *profile* is the run of device pixels across one edge, from outside to
    inside, trimmed to the pixels that differ from both flanks. Read where the
    caller knows an edge is (a workbench specimen's side).
  - A *segment* is a straight line found in the image itself: a stack of thin
    runs between two wide ones, repeated along a row or column. Found without
    knowing where lines are, so it reaches pseudo-elements, gradients and
    shadows that the DOM cannot hand back as boxes.

  Every length here is in device pixels.
*/

import type { Pixels } from './png.ts';

export type Colour = readonly [number, number, number];
export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Rect = { x: number; y: number; width: number; height: number };

/* An element that must be there: reading past the end is a bug here. */
export function at<T>(list: readonly T[], i: number): T {
  const value = list[i];
  if (value === undefined)
    throw new RangeError(`No element ${i} of ${list.length}.`);
  return value;
}

function colourAt(img: Pixels, x: number, y: number): Colour {
  const i = (y * img.width + x) * 3;
  return [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0];
}

function distance(a: Colour, b: Colour) {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2]),
  );
}

export function sameColours(
  a: readonly Colour[],
  b: readonly Colour[],
  tolerance: number,
) {
  return (
    a.length === b.length &&
    a.every((colour, i) => distance(colour, at(b, i)) <= tolerance)
  );
}

function luminance(c: Colour) {
  return Math.round(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
}

/* ── Profiles ──────────────────────────────────────────────────────────── */

export type Profile = {
  /* Band pixels, outside first. Empty when nothing differs from the flanks. */
  colours: Colour[];
  /* Device-pixel coordinate (y for top/bottom, x for left/right) of the
     band's outermost pixel. */
  start: number;
  outside: Colour;
  inside: Colour;
};

/*
  Samples across `side` of `rect` at `along` (a device-pixel coordinate on the
  other axis), from `reach.out` outside the edge to `reach.in` inside it.
*/
export function sideProfile(
  img: Pixels,
  rect: Rect,
  side: Side,
  along: number,
  reach: { out: number; in: number },
  tolerance = 2,
): Profile {
  const coords: number[] = [];
  if (side === 'top' || side === 'left') {
    const edge = side === 'top' ? rect.y : rect.x;
    for (
      let p = Math.floor(edge - reach.out);
      p < Math.ceil(edge + reach.in);
      p++
    )
      coords.push(p);
  } else {
    const edge = side === 'bottom' ? rect.y + rect.height : rect.x + rect.width;
    for (
      let p = Math.ceil(edge + reach.out) - 1;
      p >= Math.floor(edge - reach.in);
      p--
    )
      coords.push(p);
  }
  const vertical = side === 'top' || side === 'bottom';
  const a = Math.round(along);
  const samples = coords.map((p) =>
    vertical ? colourAt(img, a, p) : colourAt(img, p, a),
  );
  const outside = at(samples, 0);
  const inside = at(samples, samples.length - 1);
  const first = samples.findIndex((c) => distance(c, outside) > tolerance);
  let last = -1;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (distance(at(samples, i), inside) > tolerance) {
      last = i;
      break;
    }
  }
  if (first === -1 || last === -1 || last < first) {
    return { colours: [], start: at(coords, 0), outside, inside };
  }
  return {
    colours: samples.slice(first, last + 1),
    start: at(coords, first),
    outside,
    inside,
  };
}

/* How a profile reads in a table: each pixel's luminance, outside first. */
export function describe(colours: readonly Colour[]) {
  return colours.length ? colours.map(luminance).join('·') : '(none)';
}

/* ── Segments ──────────────────────────────────────────────────────────── */

export type SegmentOptions = {
  /* A run this long or shorter is a layer of a line, longer is a surface. */
  thinRun: number;
  /* A line's layers together are at most this thick. */
  maxBand: number;
  /* A segment shorter than this is not reported (glyph remnants, corners). */
  minLength: number;
  /* Neighbouring pixels within this distance are one run. */
  runTolerance: number;
  /* A band continues along the line while its colours stay this close. */
  colourTolerance: number;
};

export function segmentOptions(scale: number): SegmentOptions {
  return {
    thinRun: Math.ceil(1.5 * scale),
    maxBand: Math.ceil(3 * scale),
    minLength: Math.ceil(12 * scale),
    // Safari's screenshots carry 1-2 levels of colour-conversion noise on
    // flat faces; a soft pixel sits at least 3 from its face.
    runTolerance: 2,
    colourTolerance: 3,
  };
}

type Band = { from: number; to: number; colours: Colour[] };

/* The thin bands across one line of pixels. `read(i)` returns pixel i. */
function bandsAlong(
  length: number,
  read: (i: number) => Colour,
  opts: SegmentOptions,
): Band[] {
  const runs: { start: number; length: number; colour: Colour }[] = [];
  let previous = read(0);
  let start = 0;
  for (let i = 1; i <= length; i++) {
    const colour = i < length ? read(i) : null;
    if (!colour || distance(colour, previous) > opts.runTolerance) {
      runs.push({ start, length: i - start, colour: read(start) });
      start = i;
    }
    if (colour) previous = colour;
  }
  const bands: Band[] = [];
  for (let r = 1; r < runs.length - 1; r++) {
    if (
      at(runs, r).length > opts.thinRun ||
      at(runs, r - 1).length <= opts.thinRun
    )
      continue;
    let end = r;
    while (end + 1 < runs.length && at(runs, end + 1).length <= opts.thinRun)
      end++;
    if (end + 1 >= runs.length) break;
    const from = at(runs, r).start;
    const to = at(runs, end).start + at(runs, end).length - 1;
    if (to - from + 1 <= opts.maxBand) {
      const colours: Colour[] = [];
      for (let i = from; i <= to; i++) colours.push(read(i));
      bands.push({ from, to, colours });
    }
    r = end;
  }
  return bands;
}

export type Segment = {
  orientation: 'horizontal' | 'vertical';
  /* Along the line, inclusive. */
  from: number;
  to: number;
  /* Across the line, inclusive: the band's outer pixel rows or columns. */
  bandFrom: number;
  bandTo: number;
  colours: Colour[];
};

export const thickness = (s: { bandFrom: number; bandTo: number }) =>
  s.bandTo - s.bandFrom + 1;

/*
  Every straight line in `region`. Horizontal lines are found by scanning
  columns (a horizontal line crosses each column as a thin band), vertical
  ones by scanning rows.
*/
export function findSegments(
  img: Pixels,
  region: Rect,
  opts: SegmentOptions,
): Segment[] {
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(img.width, Math.ceil(region.x + region.width));
  const y1 = Math.min(img.height, Math.ceil(region.y + region.height));
  const out: Segment[] = [];
  const scan = (orientation: Segment['orientation']) => {
    const horizontal = orientation === 'horizontal';
    const [a0, a1] = horizontal ? [x0, x1] : [y0, y1];
    const [c0, c1] = horizontal ? [y0, y1] : [x0, x1];
    let open: (Segment & { last: number; tail: Colour[] })[] = [];
    const close = (s: (typeof open)[number]) => {
      if (s.to - s.from + 1 >= opts.minLength) {
        out.push({
          orientation,
          from: s.from,
          to: s.to,
          bandFrom: s.bandFrom,
          bandTo: s.bandTo,
          colours: s.colours,
        });
      }
    };
    for (let a = a0; a < a1; a++) {
      const bands = bandsAlong(
        c1 - c0,
        (i) =>
          horizontal ? colourAt(img, a, c0 + i) : colourAt(img, c0 + i, a),
        opts,
      ).map((b) => ({ ...b, from: b.from + c0, to: b.to + c0 }));
      const next: typeof open = [];
      for (const band of bands) {
        const match = open.find(
          (s) =>
            s.last === a - 1 &&
            s.bandFrom === band.from &&
            s.bandTo === band.to &&
            sameColours(s.tail, band.colours, opts.colourTolerance),
        );
        if (match) {
          match.to = a;
          match.last = a;
          match.tail = band.colours;
          open = open.filter((s) => s !== match);
          next.push(match);
        } else {
          next.push({
            orientation,
            from: a,
            to: a,
            bandFrom: band.from,
            bandTo: band.to,
            colours: band.colours,
            last: a,
            tail: band.colours,
          });
        }
      }
      for (const s of open) close(s);
      open = next;
    }
    for (const s of open) close(s);
  };
  scan('horizontal');
  scan('vertical');
  return out;
}

/* ── Junctions ─────────────────────────────────────────────────────────── */

export type Junction = {
  /* The line that ends. */
  line: Segment;
  end: 'start' | 'end';
  /* The line it ends against. */
  edge: Segment;
  /*
    Where the ending line stops, measured along it from the edge's band:
    gap      background between the line's end and the band, in device px
    meets    the line stops on the band's near side
    enters   the line paints into the band, `depth` of its `thickness` pixels
    overshoot the line runs past the band's far side, by `depth` pixels
  */
  relation: 'gap' | 'meets' | 'enters' | 'overshoot';
  depth: number;
};

/*
  For each end of each segment, the perpendicular segment it ends against, if
  one lies within `reach` device pixels of it.
*/
export function findJunctions(segments: Segment[], reach: number): Junction[] {
  const out: Junction[] = [];
  for (const line of segments) {
    const across = segments.filter((s) => s.orientation !== line.orientation);
    for (const end of ['start', 'end'] as const) {
      const tip = end === 'start' ? line.from : line.to;
      const direction = end === 'start' ? -1 : 1;
      let best: Junction | null = null;
      let bestDistance = Infinity;
      for (const edge of across) {
        // The edge must span the line's band, give or take its own thickness.
        if (edge.to < line.bandFrom - reach || edge.from > line.bandTo + reach)
          continue;
        // Distance from the tip to the edge band's near and far sides.
        const near = direction === 1 ? edge.bandFrom : edge.bandTo;
        const far = direction === 1 ? edge.bandTo : edge.bandFrom;
        const toNear = (near - tip) * direction; // > 0: band still ahead
        const toFar = (far - tip) * direction;
        if (toNear > reach || toFar < -reach) continue;
        let junction: Junction;
        if (toNear > 1)
          junction = { line, end, edge, relation: 'gap', depth: toNear - 1 };
        else if (toNear === 1)
          junction = { line, end, edge, relation: 'meets', depth: 0 };
        else if (toFar >= 0)
          junction = { line, end, edge, relation: 'enters', depth: 1 - toNear };
        else
          junction = { line, end, edge, relation: 'overshoot', depth: -toFar };
        if (Math.abs(toNear) < bestDistance) {
          best = junction;
          bestDistance = Math.abs(toNear);
        }
      }
      if (best) out.push(best);
    }
  }
  return out;
}

/* ── Comparing two captures ────────────────────────────────────────────── */

export type SegmentDifference =
  | { kind: 'missing'; segment: Segment }
  | { kind: 'extra'; segment: Segment }
  | {
      kind: 'thickness' | 'colours' | 'extent';
      segment: Segment;
      other: Segment;
    };

/*
  Lines in `a` matched to lines in `b` by orientation and position, and what
  differs between each pair. `shift` is how far a line may sit from its
  partner, in device pixels, before it counts as a different line.
*/
export function compareSegments(
  a: Segment[],
  b: Segment[],
  opts: { shift: number; colourTolerance: number },
): SegmentDifference[] {
  const out: SegmentDifference[] = [];
  const unmatched = new Set(b);
  for (const s of a) {
    const candidates = [...unmatched].filter(
      (t) =>
        t.orientation === s.orientation &&
        Math.abs(t.bandFrom - s.bandFrom) <= opts.shift &&
        Math.min(t.to, s.to) - Math.max(t.from, s.from) >=
          0.5 * Math.min(t.to - t.from, s.to - s.from),
    );
    const t = candidates.sort(
      (p, q) =>
        Math.abs(p.bandFrom - s.bandFrom) - Math.abs(q.bandFrom - s.bandFrom),
    )[0];
    if (!t) {
      out.push({ kind: 'missing', segment: s });
      continue;
    }
    unmatched.delete(t);
    if (thickness(t) !== thickness(s))
      out.push({ kind: 'thickness', segment: s, other: t });
    else if (!sameColours(s.colours, t.colours, opts.colourTolerance))
      out.push({ kind: 'colours', segment: s, other: t });
    else if (Math.abs(t.from - s.from) > 1 || Math.abs(t.to - s.to) > 1)
      out.push({ kind: 'extent', segment: s, other: t });
  }
  for (const t of unmatched) out.push({ kind: 'extra', segment: t });
  return out;
}

/*
  A straight line that changes thickness part-way along: two segments in line
  with each other, end to end, whose bands differ. Colour alone may change
  (the line crosses a different face); thickness may not.
*/
export function thicknessSteps(segments: Segment[]) {
  const out: { before: Segment; after: Segment }[] = [];
  for (const s of segments) {
    for (const t of segments) {
      if (
        t.orientation === s.orientation &&
        t.from === s.to + 1 &&
        t.bandFrom <= s.bandTo &&
        t.bandTo >= s.bandFrom &&
        thickness(t) !== thickness(s)
      ) {
        out.push({ before: s, after: t });
      }
    }
  }
  return out;
}
