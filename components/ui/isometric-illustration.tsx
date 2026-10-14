import type { SVGProps } from 'react';

/*
  Isometric line illustrations for a page with nothing on it. Every vertex is
  projected from 3D, so a figure is checked by reading its dimensions:

  - x runs right and down, y left and down, z up, each 30° off the horizontal,
    all three at one scale: P(x, y, z) = (C·(x − y), S·(x + y) − z), with
    C = cos 30° and S = sin 30°;
  - a figure is drawn from its own origin, then moved so the centre of its
    bounding box is the centre of the 128 x 128 frame;
  - boxes are drawn back to front, nearer ones covering farther, in the order
    each figure lists them.

  Drawn at 128px, one unit to the pixel. Two line weights: the silhouette of a
  solid and the edges between its faces. Ink and faces are neutral roles, so
  the figure follows the theme.
*/
const FRAME = 128;
const C = Math.cos(Math.PI / 6);
const S = 0.5;
const OUTER = 1.5;
const INNER = 1;
const CORNER = 2;

type V3 = readonly [x: number, y: number, z: number];
type Face = 'top' | 'left' | 'right';
type Shape = {
  points: V3[];
  face: Face | null;
  /** A silhouette is a line only, drawn over the faces it encloses. */
  outline?: boolean;
  /** A mark on a face, drawn in the primary ink. */
  mark?: boolean;
};

const project = ([x, y, z]: V3): [number, number] => [
  C * (x - y),
  S * (x + y) - z,
];

/* Each visible face has its own tone, so a solid reads without shading. */
const FILL: Record<Face, string> = {
  top: 'fill-surface-primary',
  left: 'fill-surface-hover',
  right: 'fill-surface-hover-strong',
};

/* A solid's visible faces and its hexagonal silhouette. */
function box(
  [x, y, z]: V3,
  [w, d, h]: V3,
  visible: Face[] = ['left', 'right', 'top'],
): Shape[] {
  const t = z + h;
  const faces: Record<Face, V3[]> = {
    left: [
      [x, y + d, z],
      [x + w, y + d, z],
      [x + w, y + d, t],
      [x, y + d, t],
    ],
    right: [
      [x + w, y, z],
      [x + w, y + d, z],
      [x + w, y + d, t],
      [x + w, y, t],
    ],
    top: [
      [x, y, t],
      [x + w, y, t],
      [x + w, y + d, t],
      [x, y + d, t],
    ],
  };
  return [
    ...visible.map((face) => ({ points: faces[face], face })),
    {
      points: [
        [x, y, t],
        [x + w, y, t],
        [x + w, y, z],
        [x + w, y + d, z],
        [x, y + d, z],
        [x, y + d, t],
      ],
      face: null,
      outline: true,
    },
  ];
}

/* One flat face of any shape, with its outline. */
function plate(points: V3[], face: Face): Shape[] {
  return [
    { points, face },
    { points, face: null, outline: true },
  ];
}

/*
  A circle on a plane square to an axis, as a polygon of 48 points: a circle
  seen isometrically is an ellipse, and sampling it keeps it exact.
*/
function disc([x, y, z]: V3, r: number, axis: 'x' | 'y' | 'z', face: Face) {
  const points = Array.from({ length: 48 }, (_, i): V3 => {
    const t = (i / 48) * Math.PI * 2;
    const u = r * Math.cos(t);
    const v = r * Math.sin(t);
    return axis === 'x'
      ? [x, y + u, z + v]
      : axis === 'y'
        ? [x + u, y, z + v]
        : [x + u, y + v, z];
  });
  return plate(points, face);
}

/* A line laid on the figure, in the primary ink. */
const stroke = (...points: V3[]): Shape => ({
  points,
  face: null,
  mark: true,
});

/* A tick laid on a face of the top plane: fractions of its width and depth. */
function tick([x, y, z]: V3, w: number, d: number): Shape {
  const at = (u: number, v: number): V3 => [x + u * w, y + v * d, z];
  return {
    points: [at(0.24, 0.52), at(0.44, 0.74), at(0.78, 0.26)],
    face: null,
    mark: true,
  };
}

/* The corner of a polygon turned into a fillet: it starts CORNER short of the
   vertex, or half the edge where the edge is shorter, and the vertex steers. */
function rounded(points: [number, number][], closed: boolean) {
  const n = points.length;
  const pt = (i: number) => points[(i + n) % n] as [number, number];
  const toward = (a: [number, number], b: [number, number], len: number) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const span = Math.hypot(dx, dy);
    const k = Math.min(len, span / 2) / span;
    return [a[0] + dx * k, a[1] + dy * k] as const;
  };
  const f = (n: number) => Math.round(n * 100) / 100;
  let d = '';
  for (let i = 0; i < n; i++) {
    const edge = !closed && (i === 0 || i === n - 1);
    if (edge) {
      d += `${i === 0 ? 'M' : 'L'}${f(pt(i)[0])} ${f(pt(i)[1])}`;
      continue;
    }
    const a = toward(pt(i), pt(i - 1), CORNER);
    const b = toward(pt(i), pt(i + 1), CORNER);
    d += `${d ? 'L' : 'M'}${f(a[0])} ${f(a[1])}Q${f(pt(i)[0])} ${f(pt(i)[1])} ${f(b[0])} ${f(b[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** The box a figure fills before it is centred, as [width, height]. */
export function extentOf(shapes: Shape[]): [number, number] {
  const flat = shapes.flatMap((shape) => shape.points.map(project));
  const xs = flat.map(([x]) => x);
  const ys = flat.map(([, y]) => y);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

function Scene({
  shapes,
  ...props
}: { shapes: Shape[] } & SVGProps<SVGSVGElement>) {
  const flat = shapes.map((shape) => shape.points.map(project));
  const xs = flat.flat().map(([x]) => x);
  const ys = flat.flat().map(([, y]) => y);
  const dx = FRAME / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = FRAME / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${FRAME} ${FRAME}`}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {shapes.map((shape, i) => {
        const points = (flat[i] ?? []).map(
          ([x, y]) => [x + dx, y + dy] as [number, number],
        );
        if (shape.mark)
          return (
            <path
              key={i}
              d={rounded(points, false)}
              fill="none"
              className="stroke-primary"
              strokeWidth={OUTER}
            />
          );
        return (
          <path
            key={i}
            d={rounded(points, true)}
            strokeWidth={shape.outline ? OUTER : INNER}
            className={
              shape.outline
                ? 'stroke-muted fill-none'
                : `stroke-rule-strong ${FILL[shape.face ?? 'top']}`
            }
          />
        );
      })}
    </svg>
  );
}

/*
  A. Cube corner. A cube's three visible faces, each stood off its own normal
  by GAP: the three offsets are 120° apart on screen, the lockup's own
  symmetry. The tick is on the top face.
*/
const cubeCorner = (): Shape[] => {
  const a = 44;
  const g = 7;
  const top: V3[] = [
    [0, 0, a + g],
    [a, 0, a + g],
    [a, a, a + g],
    [0, a, a + g],
  ];
  const left: V3[] = [
    [0, a + g, 0],
    [a, a + g, 0],
    [a, a + g, a],
    [0, a + g, a],
  ];
  const right: V3[] = [
    [a + g, 0, 0],
    [a + g, a, 0],
    [a + g, a, a],
    [a + g, 0, a],
  ];
  return [
    { points: left, face: 'left' },
    { points: left, face: null, outline: true },
    { points: right, face: 'right' },
    { points: right, face: null, outline: true },
    { points: top, face: 'top' },
    { points: top, face: null, outline: true },
    tick([0, 0, a + g], a, a),
  ];
};

/* B. Stack. Three slabs on one footprint, the top one lifted clear and ticked. */
const stack = (): Shape[] => {
  const w = 52;
  const h = 8;
  const pitch = 18;
  const lift = 12;
  const top = 2 * pitch + lift;
  return [
    ...box([0, 0, 0], [w, w, h]),
    ...box([0, 0, pitch], [w, w, h]),
    ...box([0, 0, top], [w, w, h]),
    tick([0, 0, top + h], w, w),
  ];
};

/*
  C. Gate. A block on a plate, in front of a gate it has not yet passed: two
  posts and a lintel. The opening is the block's width and 14 more, so the block
  fits through with room to spare.
*/
const gate = (): Shape[] => {
  const plate = 6;
  const post = 8;
  const block = 18;
  const opening = block + 14;
  const rise = 36;
  const span = opening + post * 2;
  return [
    ...box([0, 0, 0], [span + 16, 52, plate]),
    ...box([8, 8, plate], [post, post, rise]),
    ...box([8 + post + opening, 8, plate], [post, post, rise]),
    ...box([8, 8, plate + rise], [span, post, post]),
    ...box(
      [8 + post + (opening - block) / 2, 28, plate],
      [block, block, block],
    ),
    tick([8 + post + (opening - block) / 2, 28, plate + block], block, block),
  ];
};

/*
  D. Panels. Sheets climbing a staircase above a base: each one a rise higher
  and a step further along x than the last. The last is approved.
*/
const panels = (): Shape[] => {
  const sheet = 32;
  const thick = 3;
  const rise = 12;
  const step = 14;
  const base = 8;
  const lift = 12;
  const at = (k: number): V3 => [8 + k * step, 8, base + lift + k * rise];
  return [
    ...box([0, 0, 0], [8 + 2 * step + sheet + 8, 48, base]),
    ...[0, 1, 2].flatMap((k) => box(at(k), [sheet, sheet, thick])),
    tick([at(2)[0], at(2)[1], at(2)[2] + thick], sheet, sheet),
  ];
};

/*
  E. Pipeline. Work on a belt, an arch across it, and the blocks that have
  passed it ticked. The arch is two posts and a lintel across y; the belt runs
  along x, so what is left of the arch has not been checked yet.
*/
const pipeline = (): Shape[] => {
  const belt = 26;
  const length = 76;
  const bar = 6;
  const gate = 34;
  const block = 12;
  const rise = 5;
  const ahead = (x: number): Shape[] => [
    ...box([x, 7, rise], [block, block, block]),
    tick([x, 7, rise + block], block, block),
  ];
  return [
    ...box([0, 0, 0], [length, belt, rise]),
    ...box([6, 7, rise], [block, block, block]),
    ...box([gate, 0, rise], [bar, bar, 28]),
    ...box([gate, belt - bar, rise], [bar, bar, 28]),
    ...box([gate, 0, rise + 28], [bar, belt, bar]),
    ...ahead(gate + bar + 8),
    ...ahead(gate + bar + 8 + block + 6),
  ];
};

/*
  F. Stamp. A sheet, a stamp held over it, and the mark already left in the
  clear corner. The stamp is three solids on one axis: a wide foot, a neck, a
  grip.
*/
const stamp = (): Shape[] => {
  const sheet = 60;
  const lift = 22;
  return [
    ...box([0, 0, 0], [sheet, sheet, 4]),
    tick([30, 30, 4], 28, 28),
    ...box([4, 4, lift], [30, 30, 6]),
    ...box([13, 13, lift + 6], [12, 12, 8]),
    ...box([9, 9, lift + 14], [20, 20, 8]),
  ];
};

/*
  G. Safe. A cube with a dial on its right face and a tick on its top. The
  dial is a circle on the x = face plane: an outer ring, an inner ring and one
  spoke.
*/
const safe = (): Shape[] => {
  const a = 46;
  const dial: V3 = [a, a / 2, a / 2];
  return [
    ...box([0, 0, 0], [a, a, a]),
    tick([0, 0, a], a, a),
    ...disc(dial, 14, 'x', 'top'),
    ...disc(dial, 6, 'x', 'right'),
    stroke(dial, [a, a / 2, a / 2 + 14]),
  ];
};

/*
  H. Summit. Three tiers, each inset by the same step, and a flag at the top:
  the point a run is carried to. The pennant is a triangle in the plane of the
  pole's left face.
*/
const summit = (): Shape[] => {
  const tier = 7;
  const inset = 9;
  const base = 58;
  const top = base - 2 * inset * 2;
  const pole = 3;
  const mid = base / 2;
  const at = mid - pole / 2;
  const peak = 3 * tier;
  return [
    ...box([0, 0, 0], [base, base, tier]),
    ...box([inset, inset, tier], [base - 2 * inset, base - 2 * inset, tier]),
    ...box([inset * 2, inset * 2, tier * 2], [top, top, tier]),
    ...box([at, at, peak], [pole, pole, 40]),
    ...plate(
      [
        [at + pole, at + pole, peak + 40],
        [at + pole + 22, at + pole, peak + 32],
        [at + pole, at + pole, peak + 24],
      ],
      'left',
    ),
  ];
};

/*
  I. Checklist. A board with three rows, each a box and a bar. Two boxes are
  ticked; the third is the one still to check.
*/
const checklist = (): Shape[] => {
  const row = 16;
  const first = 8;
  const check = 10;
  return [
    ...box([0, 0, 0], [66, 56, 5]),
    ...[0, 1, 2].flatMap((k) => [
      ...box([8, first + k * row, 5], [check, check, 2]),
      ...(k < 2 ? [tick([8, first + k * row, 7], check, check)] : []),
      ...box([24, first + k * row + 3, 5], [34, 4, 2]),
    ]),
  ];
};

/*
  J. Inspection. A square frame held over a sheet, with the tick held inside it, in the plane of its bars. Four bars of equal section, the back pair first.
*/
const inspection = (): Shape[] => {
  const sheet = 60;
  const outer = 40;
  const bar = 4;
  const lift = 12;
  const at = (sheet - outer) / 2;
  return [
    ...box([0, 0, 0], [sheet, sheet, 4]),
    ...box([at, at, lift], [outer, bar, bar]),
    ...box([at, at + bar, lift], [bar, outer - 2 * bar, bar]),
    ...box([at + outer - bar, at + bar, lift], [bar, outer - 2 * bar, bar]),
    ...box([at, at + outer - bar, lift], [outer, bar, bar]),
    tick([at + bar, at + bar, lift], outer - 2 * bar, outer - 2 * bar),
  ];
};

export const ISOMETRIC_FIGURES = {
  'cube corner': cubeCorner,
  stack,
  gate,
  panels,
  pipeline,
  stamp,
  safe,
  summit,
  checklist,
  inspection,
} satisfies Record<string, () => Shape[]>;

export type IsometricName = keyof typeof ISOMETRIC_FIGURES;

export function IsometricIllustration({
  name,
  ...props
}: { name: IsometricName } & SVGProps<SVGSVGElement>) {
  return <Scene shapes={ISOMETRIC_FIGURES[name]()} {...props} />;
}
