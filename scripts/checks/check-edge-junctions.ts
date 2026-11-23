/*
  Edge junctions in every browser.

  Holds the app's pane to the rules e2e/support/edge-pixels.ts writes down --
  every line meets the edge it reaches, crosses another as one line, and a lit
  row's fill meets the solid row round it -- in Chromium, WebKit and Safari
  itself, at any window width. The Playwright specs (surface-edges.spec.ts)
  hold the same rules in Chromium at one width; this is where Safari, and the
  narrower layouts, are held to them.

  Run `pnpm check:junctions -- --help`.
*/

import { chromium, webkit } from '@playwright/test';

import {
  at,
  crossingFaults,
  edgeFaults,
  SAME,
  type Edge,
  type Pixels,
} from '../../e2e/support/edge-pixels.ts';
import { openSafari, webdriver } from './line-geometry/capture.ts';
import { decodePng } from './line-geometry/png.ts';

const HELP = `
check-edge-junctions — the pane's edges and junctions, read from pixels

  pnpm check:junctions [-- options]

  --url <url>           default http://localhost:3000
  --browser <list>      chromium, webkit, safari; default chromium,webkit,safari
  --theme <list>        light, dark; default both
  --width <list>        viewport widths in CSS px; default 1312
                        (Safari's window is bounded by the screen)
  --height <px>         default 739
  --help

Every tab of /processes/brunch-orders is read: the pane's sides and foot,
where each column divider meets the header's rule and each head's, and the
lit first row under its head. Safari must stay in front while it runs, and
must be quit first: safaridriver launches its own.

Exit 0 clean, 1 faults found, 2 it could not run.
`;

type Driver = {
  exec<T>(source: string, ...args: unknown[]): Promise<T>;
  shot(): Promise<Buffer>;
  goto(url: string): Promise<void>;
  close(): Promise<void>;
};

const settle = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Hidden without moving anything; the pointer kept off every row.
const PREPARE = `.sp-devctl, agentation-toolbar, [data-agentation-portal], nextjs-portal,
[data-style-inspector] { visibility: hidden !important; }
html { pointer-events: none !important; cursor: none !important; }
*, *::before, *::after { caret-color: transparent !important; }`;

async function playwrightDriver(
  engine: 'chromium' | 'webkit',
  width: number,
  height: number,
): Promise<Driver> {
  const browser = await (engine === 'chromium' ? chromium : webkit).launch({
    // Emulating the ratio alone leaves Chromium's border snapping at 1x.
    args: engine === 'chromium' ? ['--force-device-scale-factor=2'] : [],
  });
  const page = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { width, height },
  });
  return {
    exec: (source, ...args) =>
      page.evaluate(
        ([s, a]) =>
          new Function(`return (${s as string})(...arguments)`)(
            ...(a as unknown[]),
          ),
        [source, args] as const,
      ) as never,
    shot: () => page.screenshot(),
    // A navigation the dev server interrupts with a reload is tried again.
    goto: async (url) => {
      for (let attempt = 0; ; attempt++) {
        try {
          await page.goto(url);
          return;
        } catch (error) {
          if (attempt < 3 && /interrupted|ERR_ABORTED/.test(String(error)))
            continue;
          throw error;
        }
      }
    },
    close: () => browser.close(),
  };
}

async function safariDriver(
  base: string,
  width: number,
  height: number,
): Promise<Driver> {
  const session = await openSafari();
  const call = (method: string, path: string, body?: unknown) =>
    webdriver(session.base, method, `/session/${session.id}${path}`, body);
  const exec = async <T>(source: string, ...args: unknown[]) => {
    // Safari answers "no such window" while a page replaces itself.
    for (let attempt = 0; ; attempt++) {
      try {
        return (await call('POST', '/execute/async', {
          script: `const done = arguments[arguments.length - 1];
            Promise.resolve((${source})(...Array.from(arguments).slice(0, -1))).then(done);`,
          args,
        })) as T;
      } catch (error) {
        if (attempt < 5 && String(error).includes('no such window')) {
          await settle(400);
          continue;
        }
        throw error;
      }
    }
  };
  const opened = (await call('POST', '/window/new', { type: 'tab' })) as {
    handle: string;
  };
  await call('POST', '/window', { handle: opened.handle });
  await call('POST', '/url', { url: `${base}/workbench` });
  // The window's frame is not the viewport: size it, read, correct.
  let size = { width, height };
  for (let i = 0; i < 3; i++) {
    await call('POST', '/window/rect', size);
    const view = await exec<{ w: number; h: number }>(
      '() => ({ w: innerWidth, h: innerHeight })',
    );
    if (view.w === width && view.h === height) break;
    size = {
      width: size.width + width - view.w,
      height: size.height + height - view.h,
    };
  }
  // Safari hands back an old frame until the page has settled.
  const shoot = async () =>
    Buffer.from((await call('GET', '/screenshot')) as string, 'base64');
  return {
    exec,
    shot: async () => {
      let png = await shoot();
      for (let i = 0; i < 6; i++) {
        await settle(250);
        const again = await shoot();
        if (again.equals(png)) break;
        png = again;
      }
      return png;
    },
    goto: async (url) => {
      await call('POST', '/url', { url });
    },
    close: async () => {
      await call('DELETE', '');
      session.driver.kill();
    },
  };
}

function grey(png: Buffer): Pixels {
  const image = decodePng(png);
  const out: number[] = new Array(image.width * image.height);
  for (let i = 0; i < out.length; i++)
    out[i] = Math.round(
      (image.data[i * 3]! + image.data[i * 3 + 1]! + image.data[i * 3 + 2]!) /
        3,
    );
  return { width: image.width, height: image.height, grey: out };
}

const TABS = ['^Runs$', '^Instructions:', '^Rules$', '^Inputs:', '^Outputs:'];
const DIVIDED: Record<string, string> = {
  '^Runs$': '.process-runs',
  '^Instructions:': '.process-panels[data-tab="instructions"]',
};

// The header's own tab, left open if it already is: a second press closes it.
const OPEN_TAB = `(source) => {
  const re = new RegExp(source);
  const name = (b) => (b.getAttribute('aria-label') || b.textContent || '').trim();
  const button = [...document.querySelectorAll('.process-header button')].find((b) => re.test(name(b)));
  if (!button) return false;
  if (button.getAttribute('aria-current') !== 'true') button.click();
  return true;
}`;

// What the checks read, in CSS px: the pane, the header's rule and the
// notch's turn, the column divider where one is drawn and every head that
// ends or starts at it, and the lit first row under the list's head.
const GEOMETRY = `(grid) => {
  const paneElement = document.querySelector('.shell-pane');
  const pane = paneElement.getBoundingClientRect();
  const head = document.querySelector('.process-header').getBoundingClientRect();
  const notch = document.querySelector('.process-header .notch');
  const probe = document.createElement('div');
  probe.style.inlineSize = 'var(--notch-corner)';
  paneElement.append(probe);
  const corner = probe.getBoundingClientRect().width;
  probe.remove();
  const out = {
    pane: { x: pane.x, y: pane.y, w: pane.width, h: pane.height },
    header: head.bottom,
    turn: notch ? head.bottom - 1 + corner : head.bottom,
    radius: parseFloat(getComputedStyle(paneElement).borderTopLeftRadius),
    innerWidth,
    divider: null,
    crossings: [],
    lit: null,
  };
  const element = grid && document.querySelector(grid);
  if (element && getComputedStyle(element, '::before').content !== 'none') {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const x = box.left + parseFloat(style.paddingLeft) + parseFloat(style.gridTemplateColumns);
    out.divider = x;
    const found = new Map([[head.bottom, { above: false, sides: ['left', 'right'], lit: [] }]]);
    for (const h of element.querySelectorAll('.sheet-head')) {
      const r = h.getBoundingClientRect();
      if (!r.height) continue;
      const side = Math.abs(r.right - x) < 2 ? 'left' : Math.abs(r.left - x) < 2 ? 'right' : null;
      if (!side) continue;
      const crossing = found.get(r.bottom) || { above: true, sides: [], lit: [] };
      crossing.sides.push(side);
      if (h.nextElementSibling && h.nextElementSibling.matches('.sheet-list:has(> li:first-child > .sheet-row:is([data-current], :hover, :focus-visible, :focus-within))'))
        crossing.lit.push(side);
      found.set(r.bottom, crossing);
    }
    out.crossings = [...found];
  }
  const row = document.querySelector('.process-panel-list .sheet-list > li:first-child > .sheet-row[data-current]');
  const listHead = document.querySelector('.process-panel-list > .sheet-head');
  if (row && listHead && row.checkVisibility() && Math.abs(row.getBoundingClientRect().width - listHead.getBoundingClientRect().width) < 1) {
    const r = row.getBoundingClientRect();
    const t = listHead.getBoundingClientRect();
    out.lit = { row: r.y + r.height / 2, head: { x: t.x, w: t.width, bottom: t.bottom } };
  }
  return out;
}`;

type Geometry = {
  pane: { x: number; y: number; w: number; h: number };
  header: number;
  turn: number;
  radius: number;
  innerWidth: number;
  divider: number | null;
  crossings: [
    number,
    { above: boolean; sides: ('left' | 'right')[]; lit: ('left' | 'right')[] },
  ][];
  lit: { row: number; head: { x: number; w: number; bottom: number } } | null;
};

function faultsIn(image: Pixels, g: Geometry) {
  const faults: Record<string, string[]> = {};
  const s = image.width / g.innerWidth;
  const px = (v: number) => Math.round(v * s);
  const left = px(g.pane.x);
  const top = px(g.pane.y);
  const right = px(g.pane.x + g.pane.w) - 1;
  const bottom = px(g.pane.y + g.pane.h) - 1;
  const sides = {
    left: ((d, a) => at(image, left + d, top + a)) as Edge,
    right: ((d, a) => at(image, right - d, top + a)) as Edge,
    bottom: ((d, a) => at(image, left + a, bottom - d)) as Edge,
  };
  const y = (css: number) => Math.round((css - g.pane.y) * s);
  const clear = Math.ceil(g.radius * s) + 6;
  const down = px(g.pane.h);
  const across = px(g.pane.w);
  // As surface-edges.spec.ts reads them: the left side from the header's
  // rule, the right from the notch's turn, the foot as content scrolls under.
  const pane = {
    left: edgeFaults(sides.left, y(g.header) - 2, down - clear),
    right: edgeFaults(sides.right, y(g.turn), down - clear),
    bottom: edgeFaults(sides.bottom, clear, across - clear, { content: true }),
  };
  for (const [side, found] of Object.entries(pane))
    if (found.length) faults[`the pane's ${side} side`] = found.slice(0, 6);
  if (g.divider !== null)
    for (const [rule, crossing] of g.crossings) {
      const found = crossingFaults(
        image,
        px(g.divider) - 2,
        px(rule) - 2,
        crossing,
      );
      if (found.length) faults[`the divider at the rule at ${rule}`] = found;
    }
  if (g.lit) {
    const row = px(g.lit.row);
    const [ring, soft, fill] = [0, 1, 2].map((d) => at(image, left + d, row));
    const found: string[] = [];
    if (Math.abs(soft! - fill!) > SAME)
      found.push(`beside the row: ${ring}/${soft}/${fill}`);
    for (const x of [g.lit.head.x + 40, g.lit.head.x + g.lit.head.w - 6]) {
      const rule = px(g.lit.head.bottom);
      const [solid, under, below] = [-2, -1, 0].map((d) =>
        at(image, px(x), rule + d),
      );
      if (Math.abs(under! - below!) > SAME)
        found.push(`under the head's rule at ${x}: ${solid}/${under}/${below}`);
    }
    if (found.length) faults['the lit first row'] = found;
  }
  return faults;
}

async function checkOne(driver: Driver, base: string, theme: string) {
  const faults: Record<string, string[]> = {};
  const read: string[] = [];
  await driver.goto(`${base}/workbench`);
  await driver.exec(
    `(t) => { localStorage.setItem('safepoint.dev.theme', t); return true; }`,
    theme,
  );
  await driver.goto(`${base}/processes/brunch-orders`);
  await settle(2500);
  await driver.exec(
    `(css) => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); return document.fonts.ready.then(() => true); }`,
    PREPARE,
  );
  for (const tab of TABS) {
    if (!(await driver.exec<boolean>(OPEN_TAB, tab))) continue;
    await settle(1500);
    const g = await driver.exec<Geometry>(GEOMETRY, DIVIDED[tab] ?? null);
    const name = tab.replace(/[\^$:]/g, '');
    read.push(
      `${name}${g.divider !== null ? ` (${g.crossings.length} crossings)` : ''}${g.lit ? ' (lit row)' : ''}`,
    );
    for (const [where, found] of Object.entries(
      faultsIn(grey(await driver.shot()), g),
    ))
      faults[`${name}: ${where}`] = found;
  }
  return { faults, read };
}

function list(args: string[], name: string, fallback: string) {
  const index = args.indexOf(name);
  return (index >= 0 ? args[index + 1]! : fallback).split(',');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(HELP);
    return 0;
  }
  const base = list(args, '--url', 'http://localhost:3000')[0]!;
  const engines = list(args, '--browser', 'chromium,webkit,safari');
  const themes = list(args, '--theme', 'light,dark');
  const widths = list(args, '--width', '1312').map(Number);
  const height = Number(list(args, '--height', '739')[0]);
  try {
    await fetch(base);
  } catch {
    console.error(`Nothing answers at ${base}: start \`pnpm dev\` first.`);
    return 2;
  }
  let failed = false;
  for (const width of widths)
    for (const engine of engines) {
      const driver =
        engine === 'safari'
          ? await safariDriver(base, width, height)
          : await playwrightDriver(
              engine as 'chromium' | 'webkit',
              width,
              height,
            );
      try {
        for (const theme of themes) {
          const { faults, read } = await checkOne(driver, base, theme);
          const keys = Object.keys(faults);
          failed ||= keys.length > 0;
          console.log(
            `${engine} ${width}px ${theme}: ${keys.length ? `${keys.length} faulty` : 'clean'} -- ${read.join(', ')}`,
          );
          for (const key of keys)
            console.log(`  ${key}: ${faults[key]!.join('; ')}`);
        }
      } finally {
        await driver.close();
      }
    }
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  },
);
