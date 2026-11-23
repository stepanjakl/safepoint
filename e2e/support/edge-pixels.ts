import type { Locator, Page } from '@playwright/test';

/*
  Reading a surface's edge from its pixels, for the tests that hold every line
  to the edge it meets (docs/interface/LINE-TESTING.md, "Where the edge meets
  other lines"). A surface's edge at 2x is its ring's solid row, its soft row,
  then its sheen; every check below reads those device pixels square to the
  edge and walks along it.

  The three rules each edge keeps:

  - Nothing crosses the solid row: it is the ring's shade from end to end.
  - A line that meets the edge joins it through the soft row: on the line's
    solid row the soft row takes the line's shade.
  - Everywhere else the soft row keeps its own shade, whatever lies beside it
    -- a band, a lit row, a turn, a line's own soft row.
*/

// Levels two pixels of one line may differ by: Blink rounds a colour by one
// or two, WebKit's antialiasing by a little more.
export const SAME = 3;

export type Pixels = { width: number; height: number; grey: number[] };

// An element's pixels, one grey level per device pixel.
export async function pixels(page: Page, target: Locator): Promise<Pixels> {
  const image = await target.screenshot();
  return page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const grey: number[] = [];
    for (let index = 0; index < data.length; index += 4)
      grey.push(
        Math.round((data[index]! + data[index + 1]! + data[index + 2]!) / 3),
      );
    const { width, height } = bitmap;
    bitmap.close();
    return { width, height, grey };
  }, Array.from(image));
}

export const at = (image: Pixels, x: number, y: number) =>
  image.grey[Math.round(y) * image.width + Math.round(x)]!;

// One edge, read square to it: depth 0 is the solid row, 1 the soft row,
// further in the surface; along runs the length of the edge.
export type Edge = (depth: number, along: number) => number;

export function edges(image: Pixels) {
  const right = image.width - 1;
  const bottom = image.height - 1;
  return {
    left: ((depth, along) => at(image, depth, along)) as Edge,
    right: ((depth, along) => at(image, right - depth, along)) as Edge,
    top: ((depth, along) => at(image, along, depth)) as Edge,
    bottom: ((depth, along) => at(image, along, bottom - depth)) as Edge,
  };
}

// The commonest value at one depth along an edge.
function usual(edge: Edge, depth: number, from: number, to: number) {
  const counts = new Map<number, number>();
  for (let along = from; along < to; along++) {
    const value = edge(depth, along);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]![0];
}

// Every place along an edge where one of the three rules breaks. With
// `content`, a line may also stop at the soft row: along an edge that content
// scrolls under, a card's side running out of view meets it without joining.
export function edgeFaults(
  edge: Edge,
  from: number,
  to: number,
  { content = false }: { content?: boolean } = {},
) {
  const ringShade = usual(edge, 0, from, to);
  const softShade = usual(edge, 1, from, to);
  const near = (value: number, shade: number) =>
    Math.abs(value - shade) <= SAME;
  // A line meeting the edge runs straight in from it: the ring's shade at
  // every depth from just inside the sheen on. A glyph or an icon near the
  // edge is not. It is at most three device rows wide; more is a fill that
  // happens to be close to it (a lit row's fill).
  const ringLike = (along: number) =>
    [3, 6, 9, 12, 15].every((depth) => near(edge(depth, along), ringShade));
  const isLine = (along: number) => {
    if (!ringLike(along)) return false;
    let start = along;
    let end = along;
    while (ringLike(start - 1) && along - start < 4) start--;
    while (ringLike(end + 1) && end - along < 4) end++;
    return end - start < 3;
  };
  const faults: string[] = [];
  for (let along = from; along < to; along++) {
    const solid = edge(0, along);
    if (!near(solid, ringShade))
      faults.push(`at ${along}: the solid row ${solid}, not ${ringShade}`);
    const value = edge(1, along);
    if (isLine(along)) {
      if (!near(value, ringShade) && !(content && near(value, softShade)))
        faults.push(`at ${along}: ${value}, not ${ringShade} (a line)`);
      // The ring's own shade is a line reaching it, which a line beside a fill
      // of nearly its shade can look like; never a fault. Anything else is,
      // beside a line too: a shade between the two is the line's soft row
      // over the edge's, two soft rows on one pixel.
    } else if (!near(value, softShade) && !near(value, ringShade))
      faults.push(
        ringLike(along - 1) || ringLike(along + 1)
          ? `at ${along}: ${value}, beside a line: two soft rows`
          : `at ${along}: ${value}, not ${softShade}`,
      );
  }
  return faults;
}

// A region of the page in device pixels, read from the whole page so a region
// taller than the window is not stitched. Positions are CSS pixels.
export async function regionPixels(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
): Promise<Pixels> {
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const bytes = await page.screenshot({
    clip: { ...clip, x: clip.x + scroll.x, y: clip.y + scroll.y },
    fullPage: true,
  });
  return page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)]));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const grey: number[] = [];
    for (let index = 0; index < pixels.length; index += 4)
      grey.push(
        Math.round(
          (pixels[index]! + pixels[index + 1]! + pixels[index + 2]!) / 3,
        ),
      );
    const { width, height } = bitmap;
    bitmap.close();
    return { width, height, grey };
  }, Array.from(bytes));
}

// Strips along each edge of an element, a few pixels deep. Each is an Edge
// reading in device pixels; along is measured from the element's corner.
export async function edgeStrips(page: Page, target: Locator, deep = 10) {
  const box = (await target.boundingBox())!;
  const { x, y } = box;
  const [left, right, top, bottom] = await Promise.all([
    regionPixels(page, { x, y, width: deep, height: box.height }),
    regionPixels(page, {
      x: x + box.width - deep,
      y,
      width: deep,
      height: box.height,
    }),
    regionPixels(page, { x, y, width: box.width, height: deep }),
    regionPixels(page, {
      x,
      y: y + box.height - deep,
      width: box.width,
      height: deep,
    }),
  ]);
  return {
    length: {
      across: Math.round(box.width * 2),
      down: Math.round(box.height * 2),
    },
    left: ((depth, along) => at(left, depth, along)) as Edge,
    right: ((depth, along) =>
      at(right, right.width - 1 - depth, along)) as Edge,
    top: ((depth, along) => at(top, along, depth)) as Edge,
    bottom: ((depth, along) =>
      at(bottom, along, bottom.height - 1 - depth)) as Edge,
  };
}

/*
  Where a vertical line (a column divider) meets a horizontal one (a rule),
  inside a surface. Each is a solid pixel then a soft one: the divider's solid
  column on the left, the rule's solid row on top. They meet as one line:

  - each keeps its profile through the meeting -- the rule reads the same on
    both sides of the divider, the divider above and below the rule;
  - the solid row and column stay solid where they cross;
  - the soft pixel where they cross is a soft shade, not two soft rows on
    one pixel, which reads darker than either.

  x and y are the divider's solid column and the rule's solid row in the
  image; the divider runs on above the rule only where `above`, and the rule
  lies on the sides named. On a `lit` side the row under the rule is lit, and
  the rule's soft row is that row's fill: only its solid row is compared.
*/
export function crossingFaults(
  image: Pixels,
  x: number,
  y: number,
  {
    above,
    sides,
    lit = [],
  }: {
    above: boolean;
    sides: readonly ('left' | 'right')[];
    lit?: readonly ('left' | 'right')[];
  },
) {
  const pixel = (column: number, row: number) => at(image, column, row);
  const near = (a: number, b: number) => Math.abs(a - b) <= SAME;
  const faults: string[] = [];
  // Clear of the meeting and of anything a line carries beside it.
  const away = 6;
  const rule = Object.fromEntries(
    sides.map((side) => {
      const column = side === 'left' ? x - away : x + 1 + away;
      return [side, [pixel(column, y), pixel(column, y + 1)] as const];
    }),
  ) as Partial<Record<'left' | 'right', readonly [number, number]>>;
  const below = [pixel(x, y + away), pixel(x + 1, y + away)] as const;
  if (rule.left && rule.right) {
    if (
      !near(rule.left[0], rule.right[0]) ||
      (!lit.length && !near(rule.left[1], rule.right[1]))
    )
      faults.push(
        `the rule is ${rule.left.join('/')} left of the divider, ${rule.right.join('/')} right of it`,
      );
  }
  if (above) {
    const over = [pixel(x, y - away), pixel(x + 1, y - away)] as const;
    if (!near(over[0], below[0]) || !near(over[1], below[1]))
      faults.push(
        `the divider is ${over.join('/')} above the rule, ${below.join('/')} below it`,
      );
  }
  const ring = below[0];
  // A rule from the left ends at the divider's solid column; one from the
  // right, or across, runs on through its soft column.
  for (const [column, row, what] of [
    [x, y, 'where they cross'],
    ...(sides.includes('right')
      ? ([
          [x + 1, y, "the rule's solid row over the divider's soft column"],
        ] as const)
      : []),
    [x, y + 1, "the divider's solid column over the rule's soft row"],
  ] as const)
    if (!near(pixel(column, row), ring))
      faults.push(`${what}: ${pixel(column, row)}, not ${ring}`);
  const softs = [
    below[1],
    ...Object.entries(rule)
      .filter(([side]) => !lit.includes(side as 'left' | 'right'))
      .map(([, shades]) => shades[1]),
  ];
  const corner = pixel(x + 1, y + 1);
  if (corner < Math.min(...softs) - SAME || corner > Math.max(...softs) + SAME)
    faults.push(
      `where the soft rows cross: ${corner}, outside ${Math.min(...softs)}–${Math.max(...softs)}`,
    );
  return faults;
}

// All four edges of a rounded surface, clear of its corners. `skip` leaves
// out an edge something else owns, such as a pane's top under its notch.
export async function surfaceFaults(
  page: Page,
  target: Locator,
  {
    skip = [],
  }: { skip?: readonly ('left' | 'right' | 'top' | 'bottom')[] } = {},
) {
  const radius = await target.evaluate((element) =>
    parseFloat(getComputedStyle(element).borderTopLeftRadius),
  );
  const sides = await edgeStrips(page, target);
  // Past the corner's arc, and a little more for its antialiasing.
  const clear = Math.ceil(radius * 2) + 6;
  const faults: Record<string, string[]> = {};
  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    if (skip.includes(side)) continue;
    const length =
      side === 'left' || side === 'right'
        ? sides.length.down
        : sides.length.across;
    const found = edgeFaults(sides[side], clear, length - clear);
    if (found.length) faults[side] = found.slice(0, 12);
  }
  return faults;
}
