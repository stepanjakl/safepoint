/*
  Line geometry checker.

  Measures how lines are painted -- their thickness in device pixels, whether
  they are even all round, whether they meet where they meet -- in Chromium,
  WebKit and Safari itself, from screenshots rather than from computed styles.
  A computed style says what was asked for; only pixels say what each engine
  drew, and that is where they disagree: Safari rounds a fractional shadow or
  gradient to whole device pixels, edge by edge, where Chrome antialiases.

  Two kinds of page:

  - /workbench/edge-lab (the default) holds specimens that declare what they
    should measure. Border and layered specimens must be even, of the declared
    thickness, and alike in every browser; native and live ones are reported.
  - Any other route is read as a screen: every straight line is found in the
    image, and the checker reports lines that change thickness along their
    length, junctions with a gap or a line poking through, and lines that
    differ from the reference browser (the first --browser). It writes the
    screenshot marked up with each finding.

  Glyphs, icons and the development overlays are made invisible before each
  capture (without moving anything), so only faces and lines remain.

  Run `pnpm check:lines -- --help`.
*/

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { at, describe } from './line-geometry/analyse.ts';
import {
  capturePlaywright,
  captureSafari,
  type Capture,
  type CaptureOptions,
  type Engine,
} from './line-geometry/capture.ts';
import {
  compareReadings,
  compareScreens,
  gated,
  readScreen,
  readSpecimen,
  type Mark,
  type SpecimenReading,
} from './line-geometry/evaluate.ts';
import { encodePng, type Pixels } from './line-geometry/png.ts';

const HELP = `
check-line-geometry — measure painted lines in each browser

  pnpm check:lines [-- options]

  --url <url>           default http://localhost:3000
  --route <path>        repeatable; default /workbench/edge-lab
  --browser <list>      comma-separated: chromium, webkit, safari
                        default chromium,webkit; the first is the reference
  --theme <name>        light | dark, default light
  --edges <mode>        retina | default, default retina
  --scale <n>           device pixel ratio for chromium and webkit, default 2
                        (Safari draws at the screen's own ratio)
  --width <px>          viewport, default 1440
  --height <px>         viewport, default 900
  --out <dir>           marked-up screenshots of screens, default
                        test-results/line-geometry
  --strict              a screen's findings fail the run, not only the lab's
  --loupe               on a page of specimens, also write each one enlarged,
                        the browsers side by side, to <out>/loupe/
  --json                print the readings as JSON and nothing else

  Exit 0 clean, 1 findings that fail, 2 it could not run.

  Safari must be quit first (safaridriver launches its own), with Settings >
  Developer > Allow remote automation on and \`safaridriver --enable\` run once.
`;

type Options = {
  url: string;
  routes: string[];
  browsers: Engine[];
  theme: 'light' | 'dark';
  edges: 'retina' | 'default';
  scale: number;
  width: number;
  height: number;
  out: string;
  strict: boolean;
  loupe: boolean;
  json: boolean;
};

function parseArgs(argv: string[]): Options | null {
  const opts: Options = {
    url: 'http://localhost:3000',
    routes: [],
    browsers: ['chromium', 'webkit'],
    theme: 'light',
    edges: 'retina',
    scale: 2,
    width: 1440,
    height: 900,
    out: 'test-results/line-geometry',
    strict: false,
    loupe: false,
    json: false,
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
    else if (arg === '--url') opts.url = value().replace(/\/$/, '');
    else if (arg === '--route') opts.routes.push(value());
    else if (arg === '--browser') {
      opts.browsers = value().split(',') as Engine[];
      for (const b of opts.browsers)
        if (!['chromium', 'webkit', 'safari'].includes(b))
          throw new Error(`Unknown browser ${b}.`);
    } else if (arg === '--theme') {
      const v = value();
      if (v !== 'light' && v !== 'dark') throw new Error(`Unknown theme ${v}.`);
      opts.theme = v;
    } else if (arg === '--edges') {
      const v = value();
      if (v !== 'retina' && v !== 'default')
        throw new Error(`Unknown edges mode ${v}.`);
      opts.edges = v;
    } else if (arg === '--scale') opts.scale = Number(value());
    else if (arg === '--width') opts.width = Number(value());
    else if (arg === '--height') opts.height = Number(value());
    else if (arg === '--out') opts.out = value();
    else if (arg === '--strict') opts.strict = true;
    else if (arg === '--loupe') opts.loupe = true;
    else if (arg === '--json') opts.json = true;
    else throw new Error(`Unknown option ${arg}. Use --help.`);
  }
  if (!opts.routes.length) opts.routes.push('/workbench/edge-lab');
  return opts;
}

async function capture(
  engine: Engine,
  route: string,
  opts: Options,
  fullPage: boolean,
) {
  const url = new URL(route, `${opts.url}/`);
  url.searchParams.set('edges', opts.edges);
  const captureOpts: CaptureOptions = {
    url: url.toString(),
    theme: opts.theme,
    edges: opts.edges,
    scale: opts.scale,
    width: opts.width,
    height: opts.height,
    fullPage,
  };
  const captures =
    engine === 'safari'
      ? await captureSafari(captureOpts)
      : [await capturePlaywright(engine, captureOpts)];
  for (const c of captures) {
    const edges = opts.edges === 'retina' ? 'retina' : null;
    if (c.page.edges !== edges) {
      throw new Error(
        `${engine} ${route}: data-edges is ${c.page.edges ?? '(absent)'}, not ${edges ?? '(absent)'}.`,
      );
    }
    if (c.page.theme && c.page.theme !== opts.theme) {
      throw new Error(
        `${engine} ${route}: theme is ${c.page.theme}, not ${opts.theme}.`,
      );
    }
  }
  return captures;
}

/* ── The lab ───────────────────────────────────────────────────────────── */

const cellOf = (row: LabRow, engine: Engine) => {
  const cell = row.cells[engine];
  if (!cell) throw new Error(`No ${engine} reading for ${row.group}.`);
  return cell;
};

type LabRow = {
  group: string;
  approach: string;
  cells: Record<string, { ok: boolean; summary: string; problems: string[] }>;
};

function labReport(
  byEngine: Map<Engine, Map<string, SpecimenReading>>,
  browsers: Engine[],
) {
  const reference = at(browsers, 0);
  const groups = new Map<string, string[]>();
  for (const id of byEngine.get(reference)!.keys()) {
    const group = id.split('/').slice(0, 3).join('/');
    groups.set(group, [...(groups.get(group) ?? []), id]);
  }
  const rows: LabRow[] = [];
  for (const [group, ids] of groups) {
    const row: LabRow = { group, approach: '', cells: {} };
    for (const engine of browsers) {
      const problems: string[] = [];
      let summary = '';
      for (const id of ids) {
        const reading = byEngine.get(engine)!.get(id);
        const offset = id.split('/')[3] ?? '0';
        if (!reading) {
          problems.push(`+${offset}: not captured`);
          continue;
        }
        row.approach = reading.approach;
        if (!summary)
          summary = reading.profiles.length
            ? describe(at(reading.profiles, 0).colours)
            : reading.crop
              ? 'shape'
              : `${reading.joins.length} joins`;
        const own = [...reading.problems];
        if (engine !== reference) {
          const ref = byEngine.get(reference)!.get(id);
          const diff = ref ? compareReadings(ref, reading, reference) : null;
          if (diff) own.push(diff);
        }
        problems.push(...own.map((p) => `+${offset}: ${p}`));
      }
      row.cells[engine] = { ok: problems.length === 0, summary, problems };
    }
    rows.push(row);
  }
  return rows;
}

function printLab(rows: LabRow[], browsers: Engine[]) {
  const pad = (s: string, n: number) =>
    s.length >= n ? s : s + ' '.repeat(n - s.length);
  console.log(
    `\n${pad('specimen (recipe/width/variant)', 38)}${pad('approach', 10)}${browsers.map((b) => pad(b, 28)).join('')}`,
  );
  for (const row of rows) {
    const cells = browsers.map((b) => {
      const c = cellOf(row, b);
      return pad(`${c.ok ? '✓' : '✗'} ${c.summary}`, 28);
    });
    console.log(
      `${pad(row.group, 38)}${pad(row.approach, 10)}${cells.join('')}`,
    );
  }
  const failing = rows.filter((r) => browsers.some((b) => !cellOf(r, b).ok));
  if (failing.length)
    console.log('\nFindings (✗ above), by browser and offset:');
  for (const row of failing) {
    console.log(
      `\n  ${row.group}  [${row.approach}${gated(row.approach) ? ', must pass' : ', reported'}]`,
    );
    for (const b of browsers)
      for (const p of cellOf(row, b).problems.slice(0, 6))
        console.log(`    ${b}: ${p}`);
  }
}

/* ── Screens ───────────────────────────────────────────────────────────── */

function markUp(
  image: Pixels,
  marks: { mark: Mark; colour: [number, number, number] }[],
) {
  const data = new Uint8Array(image.data.length);
  for (let i = 0; i < data.length; i++) data[i] = (image.data[i] ?? 0) * 0.55;
  const out = { ...image, data };
  const set = (x: number, y: number, c: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= out.width || y >= out.height) return;
    out.data.set(c, (y * out.width + x) * 3);
  };
  for (const { mark, colour } of marks) {
    const x0 = mark.x - 4;
    const y0 = mark.y - 4;
    const x1 = mark.x + mark.width + 3;
    const y1 = mark.y + mark.height + 3;
    for (let t = 0; t < 2; t++) {
      for (let x = x0; x <= x1; x++) {
        set(x, y0 + t, colour);
        set(x, y1 - t, colour);
      }
      for (let y = y0; y <= y1; y++) {
        set(x0 + t, y, colour);
        set(x1 - t, y, colour);
      }
    }
  }
  return out;
}

/* ── Loupe ─────────────────────────────────────────────────────────────── */

/* Each specimen at offset 0, cropped with a margin and enlarged so every
   device pixel is a block of LOUPE screen pixels, one browser after another. */
const LOUPE = 8;

function writeLoupes(captures: Map<Engine, Capture[]>, opts: Options) {
  const dir = join(opts.out, 'loupe');
  mkdirSync(dir, { recursive: true });
  const engines = opts.browsers.filter((b) => captures.has(b));
  const ids = new Set<string>();
  for (const list of captures.values())
    for (const c of list)
      for (const sp of c.specimens)
        if ((sp.id.split('/')[3] ?? '0') === '0') ids.add(sp.id);
  for (const id of ids) {
    const crops: Pixels[] = [];
    for (const engine of engines) {
      const c = captures
        .get(engine)
        ?.find((x) => x.specimens.some((sp) => sp.id === id));
      const sp = c?.specimens.find((x) => x.id === id);
      if (!c || !sp) continue;
      const margin = 6;
      const x0 = Math.max(0, Math.floor((sp.x - margin) * c.scale));
      const y0 = Math.max(0, Math.floor((sp.y - margin) * c.scale));
      const w = Math.min(
        c.image.width - x0,
        Math.ceil((sp.width + 2 * margin) * c.scale),
      );
      const h = Math.min(
        c.image.height - y0,
        Math.ceil((sp.height + 2 * margin) * c.scale),
      );
      const data = new Uint8Array(w * LOUPE * h * LOUPE * 3);
      for (let y = 0; y < h * LOUPE; y++)
        for (let x = 0; x < w * LOUPE; x++) {
          const from =
            ((y0 + Math.floor(y / LOUPE)) * c.image.width +
              x0 +
              Math.floor(x / LOUPE)) *
            3;
          data.set(
            c.image.data.subarray(from, from + 3),
            (y * w * LOUPE + x) * 3,
          );
        }
      crops.push({ width: w * LOUPE, height: h * LOUPE, data });
    }
    if (!crops.length) continue;
    const gap = 16;
    const width =
      crops.reduce((sum, c) => sum + c.width, 0) + gap * (crops.length - 1);
    const height = Math.max(...crops.map((c) => c.height));
    const data = new Uint8Array(width * height * 3).fill(255);
    let left = 0;
    for (const crop of crops) {
      for (let y = 0; y < crop.height; y++)
        data.set(
          crop.data.subarray(y * crop.width * 3, (y + 1) * crop.width * 3),
          (y * width + left) * 3,
        );
      left += crop.width + gap;
    }
    writeFileSync(
      join(dir, `${id.replace(/[^a-z0-9.]+/gi, '_')}.png`),
      encodePng({ width, height, data }),
    );
  }
  if (!opts.json)
    console.log(
      `Enlarged specimens (${engines.join(', ')}, left to right) in ${dir}`,
    );
}

/* ── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  let opts: Options | null;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  if (!opts) {
    console.log(HELP);
    return 0;
  }
  let failed = false;
  const json: Record<string, unknown> = {};

  for (const route of opts.routes) {
    // A workbench page is read whole; it is a lab if it holds specimens.
    const workbench = new URL(route, 'http://x').pathname.startsWith(
      '/workbench/',
    );
    const captures = new Map<Engine, Capture[]>();
    // Safari's window is bounded by the screen. Capture it first and lay the
    // others out at the viewport it got, so all of them lay out alike.
    const order = [...opts.browsers].sort(
      (a, b) => Number(b === 'safari') - Number(a === 'safari'),
    );
    let viewport = { width: opts.width, height: opts.height };
    for (const engine of order) {
      try {
        const got = await capture(
          engine,
          route,
          { ...opts, ...viewport },
          workbench,
        );
        captures.set(engine, got);
        if (engine === 'safari') {
          const first = at(got, 0);
          viewport = {
            width: first.viewport.width,
            height: first.viewport.height,
          };
          if (viewport.width !== opts.width && !opts.json) {
            console.log(
              `Safari's screen allows ${viewport.width}×${viewport.height}; every browser is read at that size.`,
            );
          }
        }
      } catch (error) {
        console.error(
          `Could not capture ${route} in ${engine}: ${(error as Error).message}`,
        );
        return 2;
      }
    }
    const scaleNote = opts.browsers
      .map((b) => `${b} ${at(captures.get(b)!, 0).scale}×`)
      .join(', ');

    const lab = [...captures.values()].some((list) =>
      list.some((c) => c.specimens.length),
    );
    if (lab) {
      if (opts.loupe) writeLoupes(captures, opts);
      const byEngine = new Map<Engine, Map<string, SpecimenReading>>();
      for (const [engine, list] of captures) {
        const readings = new Map<string, SpecimenReading>();
        for (const c of list)
          for (const sp of c.specimens)
            if (!readings.has(sp.id)) readings.set(sp.id, readSpecimen(c, sp));
        if (!readings.size) {
          console.error(`${engine}: no specimens on ${route}.`);
          return 2;
        }
        byEngine.set(engine, readings);
      }
      const rows = labReport(byEngine, opts.browsers);
      json[route] = rows;
      const gatedFailures = rows.filter(
        (r) => gated(r.approach) && opts.browsers.some((b) => !cellOf(r, b).ok),
      );
      if (gatedFailures.length) failed = true;
      if (!opts.json) {
        console.log(
          `\n${route}  (${opts.theme}, edges ${opts.edges}; ${scaleNote})`,
        );
        console.log(
          'Profiles are device pixels across the top edge, outside first, as luminance.',
        );
        printLab(rows, opts.browsers);
        console.log(
          gatedFailures.length
            ? `\nFAIL: ${gatedFailures.length} border or layered specimen group(s) are not even, not the declared thickness, or differ between browsers.`
            : '\nPASS: every border and layered specimen is even, of the declared thickness, and alike in every browser.',
        );
      }
      continue;
    }

    const readings = new Map(
      opts.browsers.map((b) => [b, readScreen(at(captures.get(b)!, 0))]),
    );
    const referenceEngine = at(opts.browsers, 0);
    const reference = readings.get(referenceEngine)!;
    const slug =
      route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
    mkdirSync(opts.out, { recursive: true });
    const summary: Record<string, unknown> = {};
    for (const engine of opts.browsers) {
      const reading = readings.get(engine)!;
      const c = at(captures.get(engine)!, 0);
      const differences =
        engine === referenceEngine
          ? []
          : compareScreens(reference, reading, c.scale);
      const file = join(opts.out, `${slug}-${engine}.png`);
      writeFileSync(
        file,
        encodePng(
          markUp(c.image, [
            ...reading.faults.map((mark) => ({
              mark,
              colour: [255, 60, 60] as [number, number, number],
            })),
            ...differences.map((mark) => ({
              mark,
              colour: [255, 0, 255] as [number, number, number],
            })),
          ]),
        ),
      );
      summary[engine] = {
        widths: reading.widths,
        faults: reading.faults,
        differences,
        file,
      };
      if (opts.strict && (reading.faults.length || differences.length))
        failed = true;
      if (!opts.json) {
        const where = (m: Mark) =>
          `${(m.x / c.scale).toFixed(1)},${(m.y / c.scale).toFixed(1)}`;
        const widths = Object.entries(reading.widths)
          .map(([w, n]) => `${w}dp×${n}`)
          .join(' ');
        console.log(
          `\n${route} in ${engine} (${c.scale}×): ${reading.segments.length} lines — ${widths}`,
        );
        console.log(
          `  ${reading.faults.length} finding(s) on this screen, ${differences.length} difference(s) from ${referenceEngine}; marked up in ${file}`,
        );
        for (const m of reading.faults.slice(0, 12))
          console.log(`  red     at ${where(m)} css px: ${m.note}`);
        for (const m of differences.slice(0, 12))
          console.log(`  magenta at ${where(m)} css px: ${m.note}`);
      }
    }
    json[route] = summary;
  }

  if (opts.json) console.log(JSON.stringify(json, null, 2));
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(2);
  },
);
