import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  compareSegments,
  findJunctions,
  findSegments,
  segmentOptions,
  sideProfile,
  thickness,
  thicknessSteps,
  type Colour,
} from './analyse.ts';
import { decodePng, type Pixels } from './png.ts';

const CANVAS: Colour = [30, 30, 30];
const FACE: Colour = [40, 40, 40];
const RING: Colour = [90, 90, 90];
const SOFT: Colour = [65, 65, 65];

function image(width: number, height: number, fill: Colour): Pixels {
  const data = new Uint8Array(width * height * 3);
  for (let p = 0; p < width * height; p++) data.set(fill, p * 3);
  return { width, height, data };
}

function paint(
  img: Pixels,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: Colour,
) {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) img.data.set(c, (y * img.width + x) * 3);
}

/* A face with a ring of `layers` drawn inside its edge, outermost first. */
function framed(
  layers: [top: Colour[], right: Colour[], bottom: Colour[], left: Colour[]],
  size = { w: 120, h: 80 },
) {
  const img = image(size.w + 40, size.h + 40, CANVAS);
  paint(img, 20, 20, 20 + size.w, 20 + size.h, FACE);
  // layers[side] in order top, right, bottom, left
  const [top, right, bottom, left] = layers;
  top.forEach((c, i) => paint(img, 20, 20 + i, 20 + size.w, 21 + i, c));
  bottom.forEach((c, i) =>
    paint(img, 20, 19 + size.h - i, 20 + size.w, 20 + size.h - i, c),
  );
  left.forEach((c, i) => paint(img, 20 + i, 20, 21 + i, 20 + size.h, c));
  right.forEach((c, i) =>
    paint(img, 19 + size.w - i, 20, 20 + size.w - i, 20 + size.h, c),
  );
  return { img, rect: { x: 20, y: 20, width: size.w, height: size.h } };
}

describe('decodePng', () => {
  it('reads an RGBA screenshot with every row filter', () => {
    const width = 3;
    const height = 5;
    const rgba = (x: number, y: number, k: number) =>
      [x * 40, y * 30, 7, 255][k] ?? 0;
    const rows: number[] = [];
    for (let y = 0; y < height; y++) {
      // Filter type = row index: none, sub, up, average, Paeth.
      rows.push(y);
      for (let x = 0; x < width; x++) {
        for (let k = 0; k < 4; k++) {
          const a = x > 0 ? rgba(x - 1, y, k) : 0;
          const b = y > 0 ? rgba(x, y - 1, k) : 0;
          const c = x > 0 && y > 0 ? rgba(x - 1, y - 1, k) : 0;
          const p = a + b - c;
          const paeth =
            Math.abs(p - a) <= Math.abs(p - b) &&
            Math.abs(p - a) <= Math.abs(p - c)
              ? a
              : Math.abs(p - b) <= Math.abs(p - c)
                ? b
                : c;
          const pred = [0, a, b, (a + b) >> 1, paeth][y] ?? 0;
          rows.push((rgba(x, y, k) - pred) & 0xff);
        }
      }
    }
    const chunk = (type: string, body: Uint8Array) => {
      const out = Buffer.alloc(12 + body.length);
      out.writeUInt32BE(body.length, 0);
      out.write(type, 4, 'latin1');
      Buffer.from(body).copy(out, 8);
      return out; // CRC is not checked by the decoder.
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.set([8, 6, 0, 0, 0], 8);
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(Buffer.from(rows))),
      chunk('IEND', new Uint8Array()),
    ]);
    const img = decodePng(png);
    expect([img.width, img.height]).toEqual([3, 5]);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        expect([
          ...img.data.subarray((y * 3 + x) * 3, (y * 3 + x) * 3 + 3),
        ]).toEqual([0, 1, 2].map((k) => rgba(x, y, k)));
  });
});

describe('sideProfile', () => {
  it('reads each side outside first, so an even ring gives four equal profiles', () => {
    const ring = [RING, SOFT];
    const { img, rect } = framed([ring, ring, ring, ring]);
    const profiles = (['top', 'right', 'bottom', 'left'] as const).map((side) =>
      sideProfile(
        img,
        rect,
        side,
        side === 'top' || side === 'bottom' ? 80 : 60,
        { out: 6, in: 8 },
      ),
    );
    for (const p of profiles) expect(p.colours).toEqual([RING, SOFT]);
  });

  it('shows a side that is a pixel thicker than the rest', () => {
    const { img, rect } = framed([[RING], [RING, RING], [RING], [RING]]);
    const top = sideProfile(img, rect, 'top', 80, { out: 6, in: 8 });
    const right = sideProfile(img, rect, 'right', 60, { out: 6, in: 8 });
    expect(top.colours.length).toBe(1);
    expect(right.colours.length).toBe(2);
  });
});

describe('findSegments', () => {
  it('finds the four sides of a frame with their thickness and layers', () => {
    const ring = [RING, SOFT];
    const { img } = framed([ring, ring, ring, ring]);
    const segments = findSegments(
      img,
      { x: 0, y: 0, width: img.width, height: img.height },
      segmentOptions(2),
    );
    const h = segments.filter((s) => s.orientation === 'horizontal');
    const v = segments.filter((s) => s.orientation === 'vertical');
    expect(h.map((s) => [s.bandFrom, thickness(s)])).toEqual([
      [20, 2],
      [98, 2],
    ]);
    expect(v.map((s) => [s.bandFrom, thickness(s)])).toEqual([
      [20, 2],
      [138, 2],
    ]);
    expect(h.map((s) => s.colours)).toEqual([
      [RING, SOFT],
      [SOFT, RING],
    ]);
  });

  it('ignores a smooth gradient face', () => {
    const img = image(80, 80, CANVAS);
    for (let y = 10; y < 70; y++)
      paint(img, 10, y, 70, y + 1, [40 + y, 40 + y, 40 + y]);
    const segments = findSegments(
      img,
      { x: 0, y: 0, width: 80, height: 80 },
      segmentOptions(2),
    );
    expect(segments.filter((s) => s.orientation === 'horizontal')).toEqual([]);
  });

  it('splits a line that thickens part-way, and reports the step', () => {
    const img = image(120, 40, CANVAS);
    paint(img, 0, 20, 60, 21, RING);
    paint(img, 60, 20, 120, 22, RING);
    const segments = findSegments(
      img,
      { x: 0, y: 0, width: 120, height: 40 },
      segmentOptions(2),
    );
    const steps = thicknessSteps(segments);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.after.from).toBe(60);
  });
});

describe('findJunctions', () => {
  const scene = (ruleEnd: number) => {
    // A vertical edge two pixels thick (x 100-101), a rule along y 40 ending at ruleEnd.
    const img = image(140, 80, CANVAS);
    paint(img, 100, 0, 102, 80, RING);
    paint(img, 0, 40, ruleEnd + 1, 41, SOFT);
    const segs = findSegments(
      img,
      { x: 0, y: 0, width: 140, height: 80 },
      segmentOptions(2),
    );
    return findJunctions(segs, 6).filter(
      (j) => j.line.orientation === 'horizontal' && j.end === 'end',
    );
  };

  it('tells a gap from a meeting, an entry and an overshoot', () => {
    expect(scene(97)[0]).toMatchObject({ relation: 'gap', depth: 2 });
    expect(scene(99)[0]).toMatchObject({ relation: 'meets', depth: 0 });
    expect(scene(100)[0]).toMatchObject({ relation: 'enters', depth: 1 });
    expect(scene(104)[0]).toMatchObject({ relation: 'overshoot', depth: 3 });
  });
});

describe('compareSegments', () => {
  it('pairs lines by position and names what differs', () => {
    const a = framed([
      [RING, SOFT],
      [RING, SOFT],
      [RING, SOFT],
      [RING, SOFT],
    ]);
    const b = framed([
      [RING, SOFT],
      [RING, RING],
      [RING, SOFT],
      [RING, SOFT],
    ]);
    const opts = segmentOptions(2);
    const all = { x: 0, y: 0, width: a.img.width, height: a.img.height };
    const diff = compareSegments(
      findSegments(a.img, all, opts),
      findSegments(b.img, all, opts),
      {
        shift: 2,
        colourTolerance: 3,
      },
    );
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({
      kind: 'colours',
      segment: { orientation: 'vertical', bandFrom: 138 },
    });
  });
});
