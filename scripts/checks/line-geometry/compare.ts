/*
  Comparing one small region -- a corner, a junction -- between two captures:
  a browser against another, a screen against a workbench specimen, a CSS
  variant against the page as it is. Used by scripts/checks/compare-lines.ts.

  Two captures of the same thing can sit a device pixel apart (text above it
  lays out differently in each engine), so a comparison first finds the
  offset, within a couple of pixels, at which they agree best: what is left is
  a difference in drawing, not in position.
*/

import type { Pixels } from './png.ts';

export type Crop = { width: number; height: number; data: Uint8Array };

/* `size` CSS px square, device pixels out, from (x, y) CSS px. */
export function cropRegion(
  image: Pixels,
  scale: number,
  x: number,
  y: number,
  size: number,
): Crop {
  const n = Math.round(size * scale);
  const x0 = Math.round(x * scale);
  const y0 = Math.round(y * scale);
  const data = new Uint8Array(n * n * 3);
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++) {
      const from = ((y0 + row) * image.width + x0 + col) * 3;
      data.set(image.data.subarray(from, from + 3), (row * n + col) * 3);
    }
  return { width: n, height: n, data };
}

export type Corner = 'top left' | 'top right' | 'bottom left' | 'bottom right';

/* The CSS px origin of a `size` square over a box's corner, `pad` outside it. */
export function cornerOrigin(
  box: { x: number; y: number; width: number; height: number },
  corner: Corner,
  size: number,
  pad = 2,
) {
  return {
    x: corner.endsWith('left') ? box.x - pad : box.x + box.width - size + pad,
    y: corner.startsWith('top') ? box.y - pad : box.y + box.height - size + pad,
  };
}

/*
  Which pixels of a crop lie on a corner's arc: from `inside` CSS px within
  the curve to `outside` beyond it. Comparing only these keeps a difference in
  what sits near the corner (a shifted rule, a row) out of a verdict on the
  curve.
*/
export function arcMask(
  crop: Crop,
  scale: number,
  origin: { x: number; y: number },
  box: { x: number; y: number; width: number; height: number },
  corner: Corner,
  radius: number,
  inside = 2.5,
  outside = 0.5,
) {
  const cx = corner.endsWith('left')
    ? box.x + radius
    : box.x + box.width - radius;
  const cy = corner.startsWith('top')
    ? box.y + radius
    : box.y + box.height - radius;
  return Array.from({ length: crop.width * crop.height }, (_, p) => {
    const x = origin.x + ((p % crop.width) + 0.5) / scale;
    const y = origin.y + (Math.floor(p / crop.width) + 0.5) / scale;
    const quadrant =
      (corner.endsWith('left') ? x < cx : x > cx) &&
      (corner.startsWith('top') ? y < cy : y > cy);
    const d = Math.hypot(x - cx, y - cy);
    return quadrant && d > radius - inside && d < radius + outside;
  });
}

export type Difference = {
  /* Mean and worst per-pixel difference, the largest channel, 0-255. */
  mean: number;
  max: number;
  /* Pixels more than 8 levels apart: enough to see at 2x. */
  visible: number;
  /* The offset of `b` that agreed best, device pixels. */
  shift: { x: number; y: number };
};

/* `b` against `a`, at the best offset within `search` device pixels. */
export function compareAligned(
  a: Crop,
  b: Crop,
  options: { search?: number; mask?: boolean[] } = {},
): Difference {
  const search = options.search ?? 2;
  const margin = search + 1;
  let best: Difference = {
    mean: Infinity,
    max: 0,
    visible: 0,
    shift: { x: 0, y: 0 },
  };
  for (let sy = -search; sy <= search; sy++)
    for (let sx = -search; sx <= search; sx++) {
      let sum = 0;
      let max = 0;
      let visible = 0;
      let count = 0;
      for (let y = margin; y < a.height - margin; y++)
        for (let x = margin; x < a.width - margin; x++) {
          const p = y * a.width + x;
          if (options.mask && !options.mask[p]) continue;
          const i = p * 3;
          const j = ((y + sy) * b.width + x + sx) * 3;
          const d = Math.max(
            Math.abs((a.data[i] ?? 0) - (b.data[j] ?? 0)),
            Math.abs((a.data[i + 1] ?? 0) - (b.data[j + 1] ?? 0)),
            Math.abs((a.data[i + 2] ?? 0) - (b.data[j + 2] ?? 0)),
          );
          sum += d;
          count++;
          max = Math.max(max, d);
          if (d > 8) visible++;
        }
      const mean = count ? sum / count : 0;
      if (mean < best.mean)
        best = { mean, max, visible, shift: { x: sx, y: sy } };
    }
  return best;
}

/* Crops in a grid, each device pixel a `zoom`-pixel block: rows, then columns. */
export function sheet(rows: Crop[][], zoom = 10, gap = 12): Pixels {
  const cellW = Math.max(...rows.flat().map((c) => c.width)) * zoom;
  const cellH = Math.max(...rows.flat().map((c) => c.height)) * zoom;
  const columns = Math.max(...rows.map((r) => r.length));
  const width = columns * cellW + (columns - 1) * gap;
  const height = rows.length * cellH + (rows.length - 1) * gap;
  const data = new Uint8Array(width * height * 3).fill(255);
  rows.forEach((row, r) =>
    row.forEach((crop, c) => {
      for (let y = 0; y < crop.height * zoom; y++)
        for (let x = 0; x < crop.width * zoom; x++) {
          const from =
            (Math.floor(y / zoom) * crop.width + Math.floor(x / zoom)) * 3;
          const to =
            ((r * (cellH + gap) + y) * width + c * (cellW + gap) + x) * 3;
          data.set(crop.data.subarray(from, from + 3), to);
        }
    }),
  );
  return { width, height, data };
}
