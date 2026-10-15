import { Fragment, useId, type SVGProps } from 'react';

/*
  Outlines extruded into solids and drawn in parallel projection, hidden lines
  removed. Nothing is approximated: a parallel projection of a plane is affine,
  so every curve stays a cubic Bézier through every step, and a curve is split
  only where its wall turns edge-on to the viewer, a root of a quadratic.

  - A solid is closed loops in its own plan (x right, y toward the viewer at
    yaw 0), all extruded from the ground to one height.
  - A view turns the plan by `yaw` (clockwise seen from above) into x', y',
    projects it, then turns the drawing by `roll` (clockwise). Orthographic
    looks at `elevation` (negative from below): X = x', Y = y'·sin ε − z·cos ε;
    ISOMETRIC is the elevation at which three axes turned 45° from the plan's
    are drawn equal, 120° apart. Oblique keeps the front true and draws depth
    receding at `angle`, scaled by `depth` (cavalier 1, cabinet ½). Plan
    oblique keeps the plan true and draws heights scaled by `height`.
  - Every one is X = l·p, Y = m·p − rise·z, so verticals stay vertical until
    the roll. The sight direction is the one that draws as a point, l × m with
    the sign that makes X, Y and it a right-handed frame.
  - A wall faces the viewer where its edge runs against the loop's turn across
    the screen. A run of such edges is a strip, and a strip runs one way across
    the screen, so it never covers itself.

  Hidden lines are removed by painting, inside a mask: each strip, then each
  cap, fills black over what it hides and strokes its own edges white. The caps
  facing the viewer go last: tops from above, bottoms from below, each all at
  one height, so a sight line that reaches one has met nothing else. Two
  strips over one X are ordered by depth along the sight direction there.
*/
const BOX = 96;
const C = BOX / 2;
const SPAN = 80;
const STROKE = 1;
const EPSILON = 1e-9;

export type Point = readonly [x: number, y: number];
export type Cubic = readonly [Point, Point, Point, Point];
export type Loop = readonly Cubic[];
export type Solid = {
  loops: readonly Loop[];
  height: number;
  /** The plan point it turns about; the centre of its box if not given. */
  axis?: Point;
};
export type View = { yaw: number; roll?: number } & (
  | { kind?: 'orthographic'; elevation: number }
  | { kind: 'oblique'; angle: number; depth: number }
  | { kind: 'plan oblique'; height: number }
);
/**
 * `view` fills the box; `balance` too, but centred across on where the drawn
 * area balances, which is where the eye puts its middle; `turntable` keeps one
 * scale, and the axis at the centre, in every view.
 */
export type Fit = 'view' | 'balance' | 'turntable';
export type Layer = {
  loop: number;
  kind: 'wall' | 'top' | 'bottom';
  /** The closed region it covers. */
  region: Cubic[];
  /** The lines it draws, each a run of joined cubics. */
  lines: Cubic[][];
};

const DEG = 180 / Math.PI;
export const ISOMETRIC = {
  yaw: 0,
  elevation: Math.atan(Math.SQRT1_2) * DEG,
} satisfies View;

const lerp = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const line = (a: Point, b: Point): Cubic => [
  a,
  lerp(a, b, 1 / 3),
  lerp(a, b, 2 / 3),
  b,
];
const mapCubic = (c: Cubic, f: (p: Point) => Point): Cubic => [
  f(c[0]),
  f(c[1]),
  f(c[2]),
  f(c[3]),
];
const reverse = (c: Cubic): Cubic => [c[3], c[2], c[1], c[0]];

export const mapLoop = (loop: Loop, f: (p: Point) => Point): Loop =>
  loop.map((c) => mapCubic(c, f));

/** Path data as closed loops: absolute M, L, H, V, C and Z only. */
export function loopsFromPath(d: string): Loop[] {
  const loops: Cubic[][] = [];
  let start: Point = [0, 0];
  let at: Point = [0, 0];
  const push = (c: Cubic) => {
    loops.at(-1)?.push(c);
    at = c[3];
  };
  for (const [, cmd = '', args = ''] of d.matchAll(/([MLHVCZ])([^MLHVCZ]*)/g)) {
    const n = (args.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    if (cmd === 'M') {
      start = at = [n[0] ?? 0, n[1] ?? 0];
      loops.push([]);
    } else if (cmd === 'L') push(line(at, [n[0] ?? 0, n[1] ?? 0]));
    else if (cmd === 'H') push(line(at, [n[0] ?? 0, at[1]]));
    else if (cmd === 'V') push(line(at, [at[0], n[0] ?? 0]));
    else if (cmd === 'C')
      push([
        at,
        [n[0] ?? 0, n[1] ?? 0],
        [n[2] ?? 0, n[3] ?? 0],
        [n[4] ?? 0, n[5] ?? 0],
      ]);
    else if (at[0] !== start[0] || at[1] !== start[1]) push(line(at, start));
  }
  return loops;
}

export function pointAt([p0, p1, p2, p3]: Cubic, t: number): Point {
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(p2, p3, t);
  return lerp(lerp(a, b, t), lerp(b, c, t), t);
}

function split([p0, p1, p2, p3]: Cubic, t: number): [Cubic, Cubic] {
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(p2, p3, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  const f = lerp(d, e, t);
  return [
    [p0, a, d, f],
    [f, e, c, p3],
  ];
}

/* Where one coordinate of a curve turns: the roots in (0, 1) of its derivative. */
function turns(c: Cubic, axis: 0 | 1): number[] {
  const [p0, p1, p2, p3] = c.map((p) => p[axis]) as [
    number,
    number,
    number,
    number,
  ];
  const a = p3 - 3 * p2 + 3 * p1 - p0;
  const b = 2 * (p2 - 2 * p1 + p0);
  const k = p1 - p0;
  let roots: number[] = [];
  if (Math.abs(a) < EPSILON) roots = Math.abs(b) < EPSILON ? [] : [-k / b];
  else {
    const disc = b * b - 4 * a * k;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      roots = [(-b - s) / (2 * a), (-b + s) / (2 * a)];
    }
  }
  return roots
    .filter((t) => t > EPSILON && t < 1 - EPSILON)
    .sort((a, b) => a - b);
}

function splitAt(c: Cubic, ts: number[]): Cubic[] {
  const out: Cubic[] = [];
  let rest = c;
  let done = 0;
  for (const t of ts) {
    const [head, tail] = split(rest, (t - done) / (1 - done));
    out.push(head);
    rest = tail;
    done = t;
  }
  out.push(rest);
  return out;
}

/** The exact box around curves, as [minX, minY, maxX, maxY]. */
export function bounds(cubics: readonly Cubic[]) {
  const points = cubics.flatMap((c) => [
    c[0],
    c[3],
    ...[...turns(c, 0), ...turns(c, 1)].map((t) => pointAt(c, t)),
  ]);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ] as const;
}

const rotate = (deg: number) => {
  const cos = Math.cos(deg / DEG);
  const sin = Math.sin(deg / DEG);
  return ([x, y]: Point): Point => [x * cos - y * sin, x * sin + y * cos];
};
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];

/** A view as X = l·p, Y = m·p − rise·z for a plan point p at height z, before the roll. */
export function projection(view: View) {
  // X = x' + b·y' and Y = d·y', in the plan turned by yaw.
  let [b, d, rise] = [0, 1, 1];
  if (view.kind === 'oblique') {
    b = -view.depth * Math.cos(view.angle / DEG);
    d = view.depth * Math.sin(view.angle / DEG);
  } else if (view.kind === 'plan oblique') rise = view.height;
  else {
    d = Math.sin(view.elevation / DEG);
    rise = Math.cos(view.elevation / DEG);
  }
  const cy = Math.cos(view.yaw / DEG);
  const sy = Math.sin(view.yaw / DEG);
  return {
    l: [cy + b * sy, b * cy - sy] as Point,
    m: [d * sy, d * cy] as Point,
    rise,
    roll: view.roll ?? 0,
  };
}

/** A point of the plan at height z, as the view draws it. */
export function projector(view: View) {
  const { l, m, rise, roll } = projection(view);
  const turn = rotate(roll);
  return (p: Point, z: number): Point =>
    turn([dot(l, p), dot(m, p) - rise * z]);
}

/* +1 or −1 by the way a loop turns. */
function turning(loop: Loop) {
  let sum = 0;
  for (const c of loop)
    for (let i = 0; i < 16; i++) {
      const [x0, y0] = pointAt(c, i / 16);
      const [x1, y1] = pointAt(c, (i + 1) / 16);
      sum += x0 * y1 - x1 * y0;
    }
  return Math.sign(sum);
}

type Strip = Layer & { plan: Cubic[]; x: readonly [number, number] };

/* An edge's depth at screen X: one value, or a span where it runs edge-on. */
function spanAt(top: Cubic[], x: number): [number, number] | null {
  let span: [number, number] | null = null;
  const take = (y: number) => {
    span = span ? [Math.min(span[0], y), Math.max(span[1], y)] : [y, y];
  };
  for (const c of top) {
    const x0 = c[0][0];
    const x3 = c[3][0];
    if (Math.abs(x3 - x0) < EPSILON) {
      if (Math.abs(x - x0) < EPSILON) {
        take(c[0][1]);
        take(c[3][1]);
      }
      continue;
    }
    if (x <= Math.min(x0, x3) || x >= Math.max(x0, x3)) continue;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (pointAt(c, mid)[0] < x === x3 > x0) lo = mid;
      else hi = mid;
    }
    take(pointAt(c, (lo + hi) / 2)[1]);
  }
  return span;
}

/* Whether a is nearer than b, where one could cover the other; null if neither can. */
function nearer(a: Strip, b: Strip): boolean | null {
  const lo = Math.max(a.x[0], b.x[0]);
  const hi = Math.min(a.x[1], b.x[1]);
  if (hi < lo - EPSILON) return null;
  const x = (lo + hi) / 2;
  const sa = spanAt(a.plan, x);
  const sb = spanAt(b.plan, x);
  if (!sa || !sb) return null;
  if (sa[0] > sb[1] + EPSILON) return true;
  if (sb[0] > sa[1] + EPSILON) return false;
  return null;
}

/* Strips far to near: a topological order of "is covered by". */
function paintOrder(strips: Strip[]): Strip[] {
  const after = strips.map(() => [] as number[]);
  const before = strips.map(() => 0);
  strips.forEach((a, i) =>
    strips.forEach((b, j) => {
      if (j <= i) return;
      const near = nearer(a, b);
      if (near === null) return;
      const [far, close] = near ? [j, i] : [i, j];
      after[far]?.push(close);
      before[close] = (before[close] ?? 0) + 1;
    }),
  );
  const ready = strips.flatMap((_, i) => (before[i] ? [] : [i]));
  const order: Strip[] = [];
  while (ready.length) {
    const i = ready.shift() ?? 0;
    order.push(strips[i] as Strip);
    for (const j of after[i] ?? [])
      if (--(before[j] as number) === 0) ready.push(j);
  }
  if (order.length !== strips.length)
    throw new Error('Walls cover each other in a cycle.');
  return order;
}

/** A solid in a view, in its own units: what to paint, far to near. */
export function scene({ loops, height }: Solid, view: View) {
  const { l, m, rise, roll } = projection(view);
  const sight = [-rise * l[1], rise * l[0], l[0] * m[1] - l[1] * m[0]] as const;
  const draw = (p: Point, z: number): Point => [
    dot(l, p),
    dot(m, p) - rise * z,
  ];
  // A plan point's screen X and its depth along the sight line, where walls are sorted.
  const across = (p: Point): Point => [
    dot(l, p),
    sight[0] * p[0] + sight[1] * p[1],
  ];
  const drop = height * rise;
  const below = sight[2] < 0;
  const strips: Strip[] = [];
  const caps: Layer[] = [];
  loops.forEach((plan, loop) => {
    const pieces = plan.flatMap((c) =>
      splitAt(c, turns(mapCubic(c, across), 0)),
    );
    const at = (run: Cubic[], z: number) =>
      run.map((c) => mapCubic(c, (p) => draw(p, z)));
    const cap = at(pieces, below ? 0 : height);
    caps.push({
      loop,
      kind: below ? 'bottom' : 'top',
      region: cap,
      lines: [cap],
    });
    if (drop < EPSILON) return;
    const sorted = pieces.map((c) => mapCubic(c, across));
    const sign = turning(sorted);
    const facing = sorted.map((c) => {
      const dx = c[3][0] - c[0][0];
      if (Math.abs(dx) < EPSILON) return 'edge';
      return dx * sign < 0 ? 'front' : 'back';
    });
    const first = facing.indexOf('back');
    if (first < 0) return;
    let run: number[] = [];
    for (let k = 1; k <= pieces.length; k++) {
      const i = (first + k) % pieces.length;
      if (facing[i] !== 'back') {
        run.push(i);
        continue;
      }
      if (!run.length) continue;
      const part = run.map((j) => pieces[j] as Cubic);
      const depth = run.map((j) => sorted[j] as Cubic);
      const top = at(part, height);
      const bottom = at(part, 0);
      const [x0, , x1] = bounds(depth);
      // Every edge of a strip is a crease or a silhouette, so its outline is its lines.
      const region = [
        ...top,
        line(top.at(-1)?.[3] as Point, bottom.at(-1)?.[3] as Point),
        ...bottom.map(reverse).reverse(),
        line(bottom[0]?.[0] as Point, top[0]?.[0] as Point),
      ];
      strips.push({
        loop,
        kind: 'wall',
        plan: depth,
        x: [x0, x1],
        region,
        lines: [region],
      });
      run = [];
    }
  });
  const turn = rotate(roll);
  const layers: Layer[] = [...paintOrder(strips), ...caps].map(
    ({ loop, kind, region, lines }) => ({
      loop,
      kind,
      region: region.map((c) => mapCubic(c, turn)),
      lines: lines.map((r) => r.map((c) => mapCubic(c, turn))),
    }),
  );
  return { layers, bounds: bounds(layers.flatMap((l) => l.region)) };
}

/**
  Where the area a drawing covers balances: its centroid, found a row at a
  time. Each row's intervals inside any region are merged, so overlapping
  regions count once.
*/
export function balance(layers: readonly Layer[], rows = 256): Point {
  const polys = layers.map((l) =>
    l.region.flatMap((c) =>
      Array.from({ length: 16 }, (_, i) => pointAt(c, i / 16)),
    ),
  );
  const [, y0, , y1] = bounds(layers.flatMap((l) => l.region));
  let area = 0;
  let mx = 0;
  let my = 0;
  for (let r = 0; r < rows; r++) {
    const y = y0 + ((r + 0.5) * (y1 - y0)) / rows;
    const spans: [number, number][] = [];
    for (const poly of polys) {
      const xs: number[] = [];
      poly.forEach(([xa, ya], i) => {
        const [xb, yb] = poly[(i + 1) % poly.length] as Point;
        if (ya > y !== yb > y) xs.push(xa + ((xb - xa) * (y - ya)) / (yb - ya));
      });
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2)
        spans.push([xs[i] as number, xs[i + 1] as number]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    let [a, b] = [Number.NaN, Number.NaN];
    const close = () => {
      if (!(b > a)) return;
      area += b - a;
      mx += ((b - a) * (a + b)) / 2;
      my += (b - a) * y;
    };
    for (const [s0, s1] of spans) {
      if (s0 > b || Number.isNaN(b)) {
        close();
        [a, b] = [s0, s1];
      } else b = Math.max(b, s1);
    }
    close();
  }
  return [mx / area, my / area];
}

/** A solid in a view, placed in the 96 box with `span` across its longer side. */
export function drawExtrusion(
  solid: Solid,
  view: View,
  fit: Fit = 'view',
  span = SPAN,
) {
  const { layers, bounds: box } = scene(solid, view);
  let k: number;
  let at: Point;
  if (fit !== 'turntable') {
    const [x0, y0, x1, y1] = box;
    k = span / Math.max(x1 - x0, y1 - y0);
    // Down the page the box still centres, so the space above the text holds.
    at = [
      fit === 'balance' ? balance(layers)[0] : (x0 + x1) / 2,
      (y0 + y1) / 2,
    ];
  } else {
    // A sphere about the axis at mid-height draws within a circle of its radius
    // times the projection's largest stretch, whatever the yaw or roll; the
    // control points bound the curves.
    const all = solid.loops.flat();
    const [x0, y0, x1, y1] = bounds(all);
    const centre: Point = solid.axis ?? [(x0 + x1) / 2, (y0 + y1) / 2];
    const reach = Math.max(
      ...all.flat().map(([x, y]) => Math.hypot(x - centre[0], y - centre[1])),
    );
    const { l, m, rise } = projection(view);
    const [a, b, d] = [dot(l, l), dot(l, m), dot(m, m) + rise * rise];
    const stretch = Math.sqrt((a + d) / 2 + Math.hypot((a - d) / 2, b));
    k = span / 2 / (stretch * Math.hypot(reach, solid.height / 2));
    at = projector(view)(centre, solid.height / 2);
  }
  const place = ([x, y]: Point): Point => [
    C + (x - at[0]) * k,
    C + (y - at[1]) * k,
  ];
  return layers.map((layer) => ({
    ...layer,
    region: layer.region.map((c) => mapCubic(c, place)),
    lines: layer.lines.map((run) => run.map((c) => mapCubic(c, place))),
  }));
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const xy = ([x, y]: Point) => `${round(x)} ${round(y)}`;
const pathOf = (run: Cubic[], closed: boolean) =>
  run.length
    ? `M${xy(run[0]?.[0] as Point)}${run
        .map((c) => `C${xy(c[1])} ${xy(c[2])} ${xy(c[3])}`)
        .join('')}${closed ? 'Z' : ''}`
    : '';

/**
 * Layers drawn as lines in currentColor, one stroke wide at 96px. `crop` trims
 * the box to the drawing's height and its line, rounded out to whole pixels
 * about the same middle, and sizes it one unit to the pixel.
 */
export function Extrusion({
  layers,
  crop = false,
  ...props
}: { layers: Layer[]; crop?: boolean } & SVGProps<SVGSVGElement>) {
  const id = useId();
  let frame = { y: 0, height: BOX };
  if (crop) {
    const [, y0, , y1] = bounds(layers.flatMap((l) => l.region));
    const height = Math.ceil(y1 - y0 + STROKE);
    frame = { y: (y0 + y1) / 2 - height / 2, height };
  }
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 ${frame.y} ${BOX} ${frame.height}`}
      {...(crop ? { width: BOX, height: frame.height } : {})}
      {...props}
    >
      <mask
        id={id}
        maskUnits="userSpaceOnUse"
        x={0}
        y={0}
        width={BOX}
        height={BOX}
      >
        {layers.map((layer, i) => (
          <Fragment key={i}>
            <path d={pathOf(layer.region, true)} fill="black" />
            <path
              d={layer.lines.map((run) => pathOf(run, false)).join('')}
              fill="none"
              stroke="white"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Fragment>
        ))}
      </mask>
      <rect width={BOX} height={BOX} fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}
