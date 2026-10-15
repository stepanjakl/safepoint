import { describe, expect, it } from 'vitest';

import {
  balance,
  bounds,
  drawExtrusion,
  ISOMETRIC,
  projector,
  scene,
  type Cubic,
  type Point,
  type View,
} from './extrusion';
import { LOCKUP } from './state-illustration';

// Every view the checks below turn the lockup through: orthographic from
// above, edge-on and below, then the obliques, each rolled differently.
// Straight over or under, yaw only turns the drawing, so one of each is enough.
const VIEWS: View[] = [
  ...[-60, -20, 0, 20, ISOMETRIC.elevation, 70].flatMap((elevation, e) =>
    Array.from({ length: 9 }, (_, i) => ({
      yaw: i * 40,
      elevation,
      roll: ((e * 9 + i) * 47) % 360,
    })),
  ),
  { yaw: 0, elevation: 90, roll: 0 },
  { yaw: 0, elevation: -90, roll: 30 },
  ...[45, 135, -45].flatMap((angle, a) =>
    [1, 0.5].flatMap((depth, d) =>
      [0, 200].map((yaw, i) => ({
        kind: 'oblique' as const,
        yaw,
        angle,
        depth,
        roll: ((a * 4 + d * 2 + i) * 53) % 360,
      })),
    ),
  ),
  ...[1, 2 / 3].flatMap((height, h) =>
    [0, 100, 250].map((yaw, i) => ({
      kind: 'plan oblique' as const,
      yaw,
      height,
      roll: ((h * 3 + i) * 61) % 360,
    })),
  ),
];
const named = (view: View) =>
  Object.entries(view)
    .map(([k, v]) => `${k} ${typeof v === 'number' ? +v.toFixed(2) : v}`)
    .join(', ');

/*
  Each projection as its textbook states it, before the roll, in the plan
  turned clockwise by yaw (x', y'), y' toward the viewer.
*/
function textbook(view: View) {
  const r = Math.PI / 180;
  const [cy, sy] = [Math.cos(view.yaw * r), Math.sin(view.yaw * r)];
  return (x: number, y: number, z: number): Point => {
    const [u, w] = [x * cy - y * sy, x * sy + y * cy];
    if (view.kind === 'oblique') {
      const [ca, sa] = [Math.cos(view.angle * r), Math.sin(view.angle * r)];
      // Receding away from the viewer (−y') at the angle, up and to the right.
      return [u - w * view.depth * ca, w * view.depth * sa - z];
    }
    if (view.kind === 'plan oblique') return [u, w - z * view.height];
    const [ce, se] = [
      Math.cos(view.elevation * r),
      Math.sin(view.elevation * r),
    ];
    return [u, w * se - z * ce];
  };
}

// Written out again here rather than imported, so the checks do not share the
// generator's arithmetic.
const bezier = ([p0, p1, p2, p3]: Cubic, t: number): Point => {
  const m = 1 - t;
  const w = [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t] as const;
  return [
    w[0] * p0[0] + w[1] * p1[0] + w[2] * p2[0] + w[3] * p3[0],
    w[0] * p0[1] + w[1] * p1[1] + w[2] * p2[1] + w[3] * p3[1],
  ];
};
const polygon = (cubics: readonly Cubic[], steps = 24) =>
  cubics.flatMap((c) =>
    Array.from({ length: steps }, (_, i) => bezier(c, i / steps)),
  );
const inside = ([x, y]: Point, poly: Point[]) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] as Point;
    const [xj, yj] = poly[j] as Point;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      hit = !hit;
  }
  return hit;
};

/*
  What a sight line through a drawn point meets first, found in 3D: the roll
  undone, a top at height h and a bottom at 0, a wall wherever the line
  crosses a boundary edge between them. The sight direction is the one the
  projection draws as a point, r1 × r2, which points toward the viewer.
*/
function seen(view: View, [px, py]: Point, plans: Point[][]) {
  const r = ((view.roll ?? 0) * Math.PI) / 180;
  const [X, Y] = [
    px * Math.cos(r) + py * Math.sin(r),
    -px * Math.sin(r) + py * Math.cos(r),
  ];
  const draw = textbook(view);
  const [ex, ey, ez] = [draw(1, 0, 0), draw(0, 1, 0), draw(0, 0, 1)];
  const r1 = [ex[0], ey[0], ez[0]] as const;
  const r2 = [ex[1], ey[1], ez[1]] as const;
  const sight = [
    r1[1] * r2[2] - r1[2] * r2[1],
    r1[2] * r2[0] - r1[0] * r2[2],
    r1[0] * r2[1] - r1[1] * r2[0],
  ] as const;
  const depth = (x: number, y: number, z: number) =>
    sight[0] * x + sight[1] * y + sight[2] * z;
  // Two unknowns from the two screen equations, by Cramer's rule.
  const solve = (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => {
    const det = a * d - b * c;
    return Math.abs(det) < 1e-12
      ? null
      : [(e * d - b * f) / det, (a * f - e * c) / det];
  };
  const h = LOCKUP.height;
  let best: { depth: number; what: string } | null = null;
  const take = (d: number, what: string) => {
    if (!best || d > best.depth) best = { depth: d, what };
  };
  plans.forEach((plan, loop) => {
    for (const [z, cap] of [
      [h, 'top'],
      [0, 'bottom'],
    ] as const) {
      const p = solve(r1[0], r1[1], r2[0], r2[1], X - r1[2] * z, Y - r2[2] * z);
      if (p && inside(p as unknown as Point, plan))
        take(depth(p[0] as number, p[1] as number, z), `${loop} ${cap}`);
    }
    plan.forEach((a, i) => {
      const b = plan[(i + 1) % plan.length] as Point;
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const hit = solve(
        r1[0] * dx + r1[1] * dy,
        r1[2],
        r2[0] * dx + r2[1] * dy,
        r2[2],
        X - r1[0] * a[0] - r1[1] * a[1],
        Y - r2[0] * a[0] - r2[1] * a[1],
      );
      if (!hit) return;
      const [t, z] = hit as [number, number];
      if (t >= 0 && t <= 1 && z >= 0 && z <= h)
        take(depth(a[0] + t * dx, a[1] + t * dy, z), `${loop} wall`);
    });
  });
  return (best as { what: string } | null)?.what ?? null;
}

describe('extrusion', () => {
  it('draws the isometric figures’ projection, at √(2/3), turned 45°', () => {
    // isometric-illustration: P(x, y, z) = (cos 30°·(x − y), sin 30°·(x + y) − z)
    const project = projector({ ...ISOMETRIC, yaw: 45 });
    const k = Math.sqrt(2 / 3);
    for (const [x, y, z] of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [3, -2, 5],
    ] as const) {
      const [X, Y] = project([x, y], z);
      expect(X).toBeCloseTo(k * Math.cos(Math.PI / 6) * (x - y), 12);
      expect(Y).toBeCloseTo(k * (0.5 * (x + y) - z), 12);
    }
  });

  it('draws cavalier, cabinet and military as their textbooks do', () => {
    // Cavalier: the front true, depth receding at 45° at full length.
    const cavalier = projector({
      kind: 'oblique',
      yaw: 0,
      angle: 45,
      depth: 1,
    });
    expect(cavalier([0, -1], 0)[0]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(cavalier([0, -1], 0)[1]).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(cavalier([1, 0], 0)).toEqual([1, 0]);
    expect(cavalier([0, 0], 1)).toEqual([0, -1]);
    // Cabinet: the same at half length.
    const cabinet = projector({
      kind: 'oblique',
      yaw: 0,
      angle: 45,
      depth: 0.5,
    });
    expect(Math.hypot(...cabinet([0, -1], 0))).toBeCloseTo(0.5, 12);
    // Military: the plan true at any turn, heights drawn straight up.
    const military = projector({ kind: 'plan oblique', yaw: 30, height: 1 });
    const [a, b] = [military([3, 1], 0), military([-2, 4], 0)];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(
      Math.hypot(5, 3),
      12,
    );
    expect(military([0, 0], 1)).toEqual([0, -1]);
  });

  it.each(VIEWS.map((v) => [named(v), v] as const))(
    'draws %s as its textbook does',
    (_, view) => {
      const draw = textbook(view);
      const project = projector(view);
      const r = ((view.roll ?? 0) * Math.PI) / 180;
      for (const [x, y, z] of [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [3, -2, 5],
      ] as const) {
        const [X, Y] = draw(x, y, z);
        const [px, py] = project([x, y], z);
        expect(px).toBeCloseTo(X * Math.cos(r) - Y * Math.sin(r), 12);
        expect(py).toBeCloseTo(X * Math.sin(r) + Y * Math.cos(r), 12);
      }
    },
  );

  it.each(VIEWS.map((v) => [named(v), v] as const))(
    'splits walls only where they turn edge-on, at %s',
    (_, view) => {
      for (const layer of scene(LOCKUP, view).layers) {
        const { region } = layer;
        region.forEach((c, i) => {
          const next = region[(i + 1) % region.length] as Cubic;
          expect(next[0][0]).toBeCloseTo(c[3][0], 9);
          expect(next[0][1]).toBeCloseTo(c[3][1], 9);
        });
        if (layer.kind !== 'wall') continue;
        // A strip's top edge runs one way across the unrolled screen, so the
        // strip never covers itself. The region is top, side, bottom, side.
        const r = ((view.roll ?? 0) * Math.PI) / 180;
        const xs = polygon(region.slice(0, (region.length - 2) / 2), 32).map(
          ([x, y]) => x * Math.cos(r) + y * Math.sin(r),
        );
        const steps = xs.slice(1).map((x, i) => x - (xs[i] as number));
        const way = Math.sign(steps.find((d) => Math.abs(d) > 1e-9) ?? 0);
        expect(steps.every((d) => d * way >= -1e-9)).toBe(true);
      }
    },
  );

  it.each(VIEWS.map((v) => [named(v), v] as const))(
    'paints what a sight line meets first, at %s',
    (_, view) => {
      const { layers, bounds: box } = scene(LOCKUP, view);
      const plans = LOCKUP.loops.map((loop) => polygon(loop, 16));
      const regions = layers.map((l) => ({
        what: `${l.loop} ${l.kind}`,
        poly: polygon(l.region, 16),
      }));
      const painted = (p: Point) =>
        regions.findLast(({ poly }) => inside(p, poly))?.what ?? null;
      const [x0, y0, x1, y1] = box;
      const near = Math.max(x1 - x0, y1 - y0) / 200;
      let checked = 0;
      const wrong: string[] = [];
      for (let i = 0; i <= 24; i++)
        for (let j = 0; j <= 24; j++) {
          const p: Point = [
            x0 + ((x1 - x0) * i) / 24,
            y0 + ((y1 - y0) * j) / 24,
          ];
          const truth = seen(view, p, plans);
          // Skip points at an edge, where sampling either side may differ.
          const settled = (
            [
              [near, 0],
              [-near, 0],
              [0, near],
              [0, -near],
            ] as const
          ).every(
            ([dx, dy]) => seen(view, [p[0] + dx, p[1] + dy], plans) === truth,
          );
          if (!settled) continue;
          checked++;
          const shown = painted(p);
          if (shown !== truth)
            wrong.push(`(${p.map((n) => n.toFixed(1))}) ${shown} ≠ ${truth}`);
        }
      expect(wrong).toEqual([]);
      expect(checked).toBeGreaterThan(250);
    },
  );

  it.each(VIEWS.map((v) => [named(v), v] as const))(
    'fits the box with its margin, at %s',
    (_, view) => {
      for (const fit of ['view', 'turntable'] as const) {
        const [x0, y0, x1, y1] = bounds(
          drawExtrusion(LOCKUP, view, fit).flatMap((l) => l.region),
        );
        for (const n of [x0, y0, x1, y1]) {
          expect(n).toBeGreaterThanOrEqual(8 - 1e-9);
          expect(n).toBeLessThanOrEqual(88 + 1e-9);
        }
      }
    },
  );

  it('balances on the centroid of the area drawn, overlaps counted once', () => {
    const edge = (a: Point, b: Point): Cubic => [
      a,
      [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3],
      [a[0] + ((b[0] - a[0]) * 2) / 3, a[1] + ((b[1] - a[1]) * 2) / 3],
      b,
    ];
    const shape = (...points: Point[]) => ({
      loop: 0,
      kind: 'top' as const,
      region: points.map((p, i) =>
        edge(p, points[(i + 1) % points.length] as Point),
      ),
      lines: [],
    });
    // A right triangle balances a third of the way in from its right angle.
    const [tx, ty] = balance([shape([0, 0], [30, 0], [0, 30])], 2048);
    expect(tx).toBeCloseTo(10, 2);
    expect(ty).toBeCloseTo(10, 2);
    // Two squares overlapping by half: the union is 30 wide, centred at 15.
    const [ux, uy] = balance(
      [
        shape([0, 0], [20, 0], [20, 20], [0, 20]),
        shape([10, 0], [30, 0], [30, 20], [10, 20]),
      ],
      2048,
    );
    expect(ux).toBeCloseTo(15, 2);
    expect(uy).toBeCloseTo(10, 2);
  });

  // Every fourth view: balancing is the same arithmetic wherever it is done.
  it.each(
    VIEWS.filter((_, i) => i % 4 === 0).map((v) => [named(v), v] as const),
  )('centres the balance and stays in the box, at %s', (_, view) => {
    const layers = drawExtrusion(LOCKUP, view, 'balance');
    expect(balance(layers)[0]).toBeCloseTo(48, 6);
    for (const n of bounds(layers.flatMap((l) => l.region))) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(96);
    }
  });
});
