/*
  Compare one small region -- a corner, a junction -- across browsers, against
  a reference page, and under CSS variants, by pixels. The investigation tool
  beside `pnpm check:lines`: where that one finds what differs on a screen,
  this one answers why, by trying a change without editing a file.

    pnpm lines:compare -- --route /processes/brunch-orders --box .shell-pane \
      --corner "bottom left" --radius 10 \
      --reference /workbench/rounded-edges --reference-box '[data-specimen="layered/pane"]' \
      --variant 'no clip=.shell-pane{overflow:visible!important}'

  Each browser is compared with the same browser's capture of the reference
  page, or, without --reference, with the first browser. Crops are aligned
  within two device pixels first, so a region that merely sits a pixel apart
  is not reported as drawn differently. The enlarged sheet has a row per
  variant (the reference first) and a column per browser.

  Run `pnpm lines:compare -- --help`.
*/

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  capturePlaywright,
  captureSafari,
  type Capture,
  type CaptureOptions,
  type Engine,
} from './line-geometry/capture.ts';
import {
  arcMask,
  compareAligned,
  cornerOrigin,
  cropRegion,
  sheet,
  type Corner,
  type Crop,
} from './line-geometry/compare.ts';
import { encodePng } from './line-geometry/png.ts';

const HELP = `
compare-lines — one region, by pixels, across browsers and CSS variants

  pnpm lines:compare -- --box <selector> [options]

  --route <path>          page to read, default /processes/brunch-orders
  --box <selector>        the element the region is placed on (required)
  --corner <name>         "top left" | "top right" | "bottom left" | "bottom right"
                          default "bottom left"
  --at <x,y>              instead of a corner: the region's origin, CSS px
                          from the box's top-left corner
  --size <px>             region side, CSS px, default 18
  --radius <px>           with --corner: compare only the pixels on the arc
                          of this radius (the curve itself)
  --reference <path>      compare with this page in the same browser
  --reference-box <sel>   the element on the reference page, default --box
  --variant <name=css>    repeatable: also capture with this CSS added
  --browser <list>        chromium, webkit, safari; default chromium,webkit
  --theme <light|dark>    default light
  --edges <retina|default>  default retina
  --width/--height <px>   viewport, default 1312 x 739 (Safari's, on this Mac)
  --out <file>            enlarged sheet, default test-results/line-geometry/compare.png

  Safari must stay visible while it is measured; see docs/interface/LINE-TESTING.md.
`;

type Options = {
  url: string;
  route: string;
  box: string;
  corner: Corner;
  at: { x: number; y: number } | null;
  size: number;
  radius: number | null;
  reference: string | null;
  referenceBox: string | null;
  variants: { name: string; css: string }[];
  browsers: Engine[];
  theme: 'light' | 'dark';
  edges: 'retina' | 'default';
  width: number;
  height: number;
  out: string;
};

function parse(argv: string[]): Options | null {
  const o: Options = {
    url: 'http://localhost:3000',
    route: '/processes/brunch-orders',
    box: '',
    corner: 'bottom left',
    at: null,
    size: 18,
    radius: null,
    reference: null,
    referenceBox: null,
    variants: [{ name: 'as is', css: '' }],
    browsers: ['chromium', 'webkit'],
    theme: 'light',
    edges: 'retina',
    width: 1312,
    height: 739,
    out: 'test-results/line-geometry/compare.png',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${arg}.`);
      return v;
    };
    if (arg === '--') continue;
    else if (arg === '--help' || arg === '-h') return null;
    else if (arg === '--url') o.url = value().replace(/\/$/, '');
    else if (arg === '--route') o.route = value();
    else if (arg === '--box') o.box = value();
    else if (arg === '--corner') o.corner = value() as Corner;
    else if (arg === '--at') {
      const [x, y] = value().split(',').map(Number);
      o.at = { x: x ?? 0, y: y ?? 0 };
    } else if (arg === '--size') o.size = Number(value());
    else if (arg === '--radius') o.radius = Number(value());
    else if (arg === '--reference') o.reference = value();
    else if (arg === '--reference-box') o.referenceBox = value();
    else if (arg === '--variant') {
      const v = value();
      const split = v.indexOf('=');
      if (split < 1) throw new Error(`A variant is name=css, not ${v}.`);
      o.variants.push({ name: v.slice(0, split), css: v.slice(split + 1) });
    } else if (arg === '--browser') o.browsers = value().split(',') as Engine[];
    else if (arg === '--theme') o.theme = value() as Options['theme'];
    else if (arg === '--edges') o.edges = value() as Options['edges'];
    else if (arg === '--width') o.width = Number(value());
    else if (arg === '--height') o.height = Number(value());
    else if (arg === '--out') o.out = value();
    else throw new Error(`Unknown option ${arg}. Use --help.`);
  }
  if (!o.box) throw new Error('--box is required. Use --help.');
  const corners = ['top left', 'top right', 'bottom left', 'bottom right'];
  if (!corners.includes(o.corner))
    throw new Error(`Unknown corner ${o.corner}.`);
  return o;
}

async function capture(engine: Engine, opts: CaptureOptions): Promise<Capture> {
  if (engine === 'safari') {
    const [first] = await captureSafari(opts);
    if (!first) throw new Error('Safari returned no capture.');
    return first;
  }
  return capturePlaywright(engine, opts);
}

async function main() {
  let o: Options | null;
  try {
    o = parse(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  if (!o) {
    console.log(HELP);
    return 0;
  }
  // Safari's window is bounded by the screen: capture it first, then read
  // every browser at the viewport it got.
  const order = [...o.browsers].sort(
    (a, b) => Number(b === 'safari') - Number(a === 'safari'),
  );
  let viewport = { width: o.width, height: o.height };

  const read = async (
    engine: Engine,
    route: string,
    box: string,
    css: string,
  ) => {
    const url = new URL(route, `${o!.url}/`);
    url.searchParams.set('edges', o!.edges);
    const c = await capture(engine, {
      url: url.toString(),
      theme: o!.theme,
      edges: o!.edges,
      scale: 2,
      ...viewport,
      fullPage: false,
      css,
      probes: [box],
    });
    if (engine === 'safari') viewport = c.viewport;
    const rect = c.probes[box];
    if (!rect)
      throw new Error(`${engine}: nothing matches ${box} on ${route}.`);
    const origin = o!.at
      ? { x: rect.x + o!.at.x, y: rect.y + o!.at.y }
      : cornerOrigin(rect, o!.corner, o!.size);
    const crop = cropRegion(c.image, c.scale, origin.x, origin.y, o!.size);
    const mask =
      o!.radius !== null && !o!.at
        ? arcMask(crop, c.scale, origin, rect, o!.corner, o!.radius)
        : undefined;
    return { crop, mask };
  };

  const refs = new Map<Engine, { crop: Crop; mask?: boolean[] }>();
  const rows: Crop[][] = [];
  try {
    if (o.reference) {
      const row: Crop[] = [];
      for (const engine of order) {
        const r = await read(engine, o.reference, o.referenceBox ?? o.box, '');
        refs.set(engine, r);
      }
      for (const engine of o.browsers) row.push(refs.get(engine)!.crop);
      rows.push(row);
    }
    for (const variant of o.variants) {
      const got = new Map<Engine, { crop: Crop; mask?: boolean[] }>();
      for (const engine of order)
        got.set(engine, await read(engine, o.route, o.box, variant.css));
      const first = o.browsers[0]!;
      for (const engine of o.browsers) {
        const mine = got.get(engine)!;
        const against = o.reference ? refs.get(engine)! : got.get(first)!;
        if (!o.reference && engine === first) continue;
        const d = compareAligned(against.crop, mine.crop, { mask: mine.mask });
        const label = o.reference ? `${engine} reference` : first;
        console.log(
          `${variant.name.padEnd(24)} ${engine.padEnd(8)} vs ${label.padEnd(18)} mean ${d.mean.toFixed(2)}  worst ${String(d.max).padStart(3)}  past 8 levels: ${String(d.visible).padStart(3)}  (aligned by ${d.shift.x},${d.shift.y} dp)`,
        );
      }
      rows.push(o.browsers.map((engine) => got.get(engine)!.crop));
    }
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  mkdirSync(dirname(o.out), { recursive: true });
  writeFileSync(o.out, encodePng(sheet(rows)));
  console.log(
    `\nEnlarged: ${o.out} -- rows ${[...(o.reference ? ['reference'] : []), ...o.variants.map((v) => v.name)].join(', ')}; columns ${o.browsers.join(', ')}.`,
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(2);
  },
);
