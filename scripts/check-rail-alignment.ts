/*
  Rail alignment checker.

  Measures where the sidebar's marked boxes actually sit and compares each with
  the guide axis it is meant to centre on. It exists because doing this by hand
  -- reading rects out of DevTools and comparing them with offsets worked out on
  paper -- is slow, and the offsets worked out on paper are themselves a source
  of error: three real misalignments were shipped that way, each of them half a
  pixel, each invisible until something measured it.

  THE RULE THIS SCRIPT IS BUILT ON: no geometry is written down here. Every axis
  position is read back from the computed style of the live `.rail-axis`
  element, so the stylesheet is the only place an axis is defined and this file
  cannot disagree with it. Change a token and the expected values move on their
  own. The moment a constant appears below, the tool has become the thing it
  replaced.

  Needs `pnpm dev` running, because the guides are development-only, and Chrome,
  which it drives over the DevTools Protocol with no dependencies -- Node has a
  WebSocket and the protocol is JSON.

  Run `node scripts/check-rail-alignment.ts --help`.
*/

import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*
  Boxes that are deliberately off-axis, and why.

  `observed` is what the offset measured when the entry was written. An entry
  that merely silenced an element would rot into a blanket mute; recording the
  number instead means the element is still watched -- it is reported again the
  moment it moves further than `drift` from the offset that was signed off.
*/
type Allowance = {
  selector: string;
  reason: string;
  observed: number;
  drift?: number;
};

const ALLOWLIST: Allowance[] = [
  {
    selector: 'button[aria-label="Add process"]',
    reason:
      'The inner button of a side-by-side pair. Only the trailing button of a group can sit on an axis; this one is a gap and a button width inside it.',
    // Re-signed off when the trailing button moved into a rail cell, which
    // widened the pair by the 2px the row used to hold as padding.
    observed: -24,
  },
];

const DRIFT_DEFAULT = 0.5;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

type Options = {
  url: string;
  routes: string[];
  level: 'processes' | 'workspace' | 'arrange' | 'all';
  width: number;
  height: number;
  tolerance: number;
  strict: boolean;
  json: boolean;
  screenshot: string | null;
  attach: number | null;
  selfTest: boolean;
};

const HELP = `
check-rail-alignment — measure the sidebar against its own guide axes

  node scripts/check-rail-alignment.ts [options]

  --url <url>           default http://localhost:3000 (falls back to :3001)
  --route <path>        repeatable; default /examples/states
  --level <name>        processes | workspace | arrange | all
                        default processes. 'arrange' opens the reorder mode,
                        the only state the drag handles exist in.
  --width <px>          default 1440; must exceed the 900px shell: breakpoint
  --tolerance <px>      default 0.01
  --strict              treat warnings as failures
  --json                emit the report as JSON and nothing else
  --screenshot <path>   also write a PNG of the sidebar
  --attach <port>       drive an already-running Chrome on this port
  --self-test           derive the axes a second, independent way and require
                        the two to agree; use it when you doubt the tool
  --help

  Exit 0 aligned · 1 something is off · 2 the tool could not run.

  The numbers are the point. A screenshot is available but it is strictly less
  informative and more expensive to read than the table -- reach for it to show
  a person, not to decide whether something is aligned.

  Requires \`pnpm dev\` to be running: the rail guides are development-only.
`;

function parseArgs(argv: string[]): Options {
  const options: Options = {
    url: '',
    routes: [],
    level: 'processes',
    width: 1440,
    height: 900,
    tolerance: 0.01,
    strict: false,
    json: false,
    screenshot: null,
    attach: null,
    selfTest: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) fail(`${arg} needs a value`);
      i += 1;
      return value as string;
    };
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (arg === '--url') options.url = next();
    else if (arg === '--route') options.routes.push(next());
    else if (arg === '--level') options.level = next() as Options['level'];
    else if (arg === '--width') options.width = Number(next());
    else if (arg === '--height') options.height = Number(next());
    else if (arg === '--tolerance') options.tolerance = Number(next());
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--screenshot') options.screenshot = next();
    else if (arg === '--attach') options.attach = Number(next());
    else if (arg === '--self-test') options.selfTest = true;
    else fail(`unknown option ${arg} (try --help)`);
  }
  if (options.routes.length === 0) options.routes.push('/examples/states');
  if (!['processes', 'workspace', 'arrange', 'all'].includes(options.level)) {
    fail(`--level must be processes, workspace, arrange or all`);
  }
  // Below the shell: breakpoint the sidebar becomes a strip on top and the
  // vertical axes mean nothing, so measuring there would report noise.
  if (options.width < 901)
    fail(`--width must exceed the 900px shell breakpoint`);
  return options;
}

function fail(message: string): never {
  process.stderr.write(`check-rail-alignment: ${message}\n`);
  process.exit(2);
}

/* ------------------------------------------------------------------ server */

async function findDevServer(preferred: string): Promise<string> {
  const candidates = preferred
    ? [preferred]
    : ['http://localhost:3000', 'http://localhost:3001'];
  for (const base of candidates) {
    try {
      const response = await fetch(base, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok || response.status < 500) return base;
    } catch {
      // Try the next one; the message below covers all of them failing.
    }
  }
  return fail(
    `no dev server answered at ${candidates.join(' or ')}. Start one with \`pnpm dev\`.`,
  );
}

/* ------------------------------------------------------------------ chrome */

type Browser = { port: number; stop: () => void };

async function startChrome(attach: number | null): Promise<Browser> {
  if (attach !== null) return { port: attach, stop: () => {} };
  if (!existsSync(CHROME)) fail(`Chrome not found at ${CHROME}`);
  const profile = mkdtempSync(join(tmpdir(), 'safepoint-rail-'));
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      // Port 0 asks for a free one. A fixed port would collide with the Chrome
      // that .vscode/launch.json opens on 9222, which may well be running.
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      // Not --hide-scrollbars: it changes layout, and layout is what we measure.
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const stop = () => {
    try {
      child.kill('SIGTERM');
    } catch {
      // Already gone.
    }
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // A temp directory we could not remove is not worth failing over.
    }
  };
  const portFile = join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const first = readFileSync(portFile, 'utf8').split('\n')[0];
      const port = Number(first);
      if (Number.isFinite(port) && port > 0) return { port, stop };
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  stop();
  return fail('Chrome did not report a debugging port within 15s');
}

/* --------------------------------------------------------------------- cdp */

/*
  Protocol replies are shaped by the command that asked for them, so the client
  hands back the envelope and each caller reads the part it knows about.
*/
type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

type Cdp = {
  send: (
    method: string,
    params?: Record<string, unknown>,
  ) => Promise<CdpMessage>;
  once: (method: string) => Promise<Record<string, unknown>>;
  close: () => void;
};

async function connect(port: number): Promise<Cdp> {
  // The page-level endpoint, so every command is already scoped to the tab and
  // there is no session id to thread through each call.
  const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: 'PUT',
  });
  if (!created.ok)
    fail(`could not open a tab on port ${port} (${created.status})`);
  const target = (await created.json()) as { webSocketDebuggerUrl: string };
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map<number, (message: CdpMessage) => void>();
  const waiters = new Map<string, (params: Record<string, unknown>) => void>();
  let nextId = 0;
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (message.id !== undefined) {
      const resolve = pending.get(message.id);
      if (resolve) {
        pending.delete(message.id);
        resolve(message);
      }
      return;
    }
    if (!message.method) return;
    const waiter = waiters.get(message.method);
    if (waiter) {
      waiters.delete(message.method);
      waiter(message.params ?? {});
    }
  };
  await new Promise((resolve, reject) => {
    socket.onopen = () => resolve(undefined);
    socket.onerror = () => reject(new Error('could not connect to Chrome'));
  });
  return {
    send: (method, params = {}) =>
      new Promise((resolve) => {
        const id = (nextId += 1);
        pending.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
      }),
    once: (method) => new Promise((resolve) => waiters.set(method, resolve)),
    close: () => socket.close(),
  };
}

async function evaluate<T>(cdp: Cdp, expression: string): Promise<T> {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  const payload = result.result as
    | {
        exceptionDetails?: {
          exception?: { description?: string };
          text?: string;
        };
        result?: { value?: unknown };
      }
    | undefined;
  const details = payload?.exceptionDetails;
  if (details) {
    fail(`page threw: ${details.exception?.description ?? details.text}`);
  }
  return payload?.result?.value as T;
}

/* ------------------------------------------------------------ measurement */

type Axis = { name: string; centre: number; probe?: number };
type Mark = {
  label: string;
  width: number;
  centre: number;
  axis: string;
  delta: number;
  verdict: 'ok' | 'warn' | 'fail' | 'allowed';
  note?: string;
};
type BorderFinding = { where: string; declared: string; property: string };
type Report = {
  error?: string;
  axes: Axis[];
  marks: Mark[];
  borders: BorderFinding[];
  skippedSheets: number;
};

/*
  Runs inside the page. Serialised with toString(), so it may not close over
  anything here -- everything it needs arrives as its one argument. It is a real
  typed function rather than a string so that `pnpm typecheck` reads it; the DOM
  lib is already in tsconfig.
*/
function measureInPage(args: {
  tolerance: number;
  allowlist: Allowance[];
  driftDefault: number;
  selfTest: boolean;
}): Report {
  const empty: Report = { axes: [], marks: [], borders: [], skippedSheets: 0 };

  const axisEl = document.querySelector('.rail-axis');
  if (!axisEl) return { ...empty, error: 'no .rail-axis element on the page' };
  const axisStyle = getComputedStyle(axisEl);
  if (axisStyle.display === 'none') {
    return {
      ...empty,
      error:
        'the guides are switched off. They are development-only — is this a production build?',
    };
  }

  const area = axisEl.getBoundingClientRect();

  /* Split a comma-separated computed value without splitting inside calc(). */
  const layers = (value: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of value) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) {
        out.push(current.trim());
        current = '';
      } else current += ch;
    }
    if (current.trim()) out.push(current.trim());
    return out;
  };

  const px = (value: string, base: number): number | null => {
    const trimmed = value.trim();
    if (trimmed.endsWith('px')) return parseFloat(trimmed);
    if (trimmed.endsWith('%')) return (parseFloat(trimmed) / 100) * base;
    return null;
  };

  const positions = layers(axisStyle.backgroundPositionX);
  const sizes = layers(axisStyle.backgroundSize);
  const images = layers(axisStyle.backgroundImage);
  if (positions.length !== images.length || sizes.length !== images.length) {
    return {
      ...empty,
      error: `background layer counts disagree (${images.length} images, ${positions.length} positions, ${sizes.length} sizes)`,
    };
  }

  const axes: Axis[] = [];
  for (let i = 0; i < images.length; i += 1) {
    const sizeX = (sizes[i] ?? '').split(/\s+/)[0] ?? '';
    const width = px(sizeX, area.width);
    if (width === null) {
      return {
        ...empty,
        error: `layer ${i} has a background-size of "${sizes[i]}" — a guide line must have an explicit width for its centre to mean anything`,
      };
    }
    /*
      Where the painted line's LEFT EDGE sits, relative to the positioning area.
      The centre follows below. Reading the position value as if it were the
      centre is the very bug this tool was built to catch: a 1px line placed at
      31 paints across 31..32, so its centre is 31.5.
    */
    let leftEdge: number | null = null;
    const raw = (positions[i] ?? '').trim();
    const keyword = raw.match(/^(left|right)\s+(.+)$/);
    if (keyword) {
      const offset = px(keyword[2] ?? '', area.width - width);
      if (offset !== null) {
        leftEdge = keyword[1] === 'left' ? offset : area.width - width - offset;
      }
    } else if (raw === 'center') {
      leftEdge = (area.width - width) / 2;
    } else if (raw.startsWith('calc(')) {
      // calc(P% +/- L) — including calc(100% - L), the other shape Chrome may
      // serialise `right L` as. Both reduce to the same number.
      const inner = raw.slice(5, -1);
      const match = inner.match(/^([\d.]+)%\s*([+-])\s*([\d.]+)px$/);
      if (match) {
        const pct = (parseFloat(match[1] ?? '0') / 100) * (area.width - width);
        const len = parseFloat(match[3] ?? '0');
        leftEdge = match[2] === '+' ? pct + len : pct - len;
      }
    } else {
      leftEdge = px(raw, area.width - width);
    }
    if (leftEdge === null) {
      return {
        ...empty,
        error: `could not read background-position "${positions[i]}" on layer ${i}`,
      };
    }
    axes.push({ name: `layer-${i}`, centre: area.left + leftEdge + width / 2 });
  }

  // Name them by where they ended up, not by the order they were declared.
  axes.sort((a, b) => a.centre - b.centre);
  const names =
    axes.length === 3
      ? ['rail-left', 'end-right', 'rail-right']
      : axes.map((_, i) => `axis-${i}`);
  axes.forEach((axis, i) => {
    axis.name = names[i] ?? `axis-${i}`;
  });

  /*
    A second derivation that shares no code with the first: let the browser
    resolve the same custom property into a real width. If the two agree the
    parser above is honest.
  */
  if (args.selfTest) {
    for (const [property, matchName] of [
      ['--rail-axis-rail', 'rail-left'],
      ['--rail-axis-end', 'end-right'],
    ] as const) {
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;height:0;width:var(${property})`;
      axisEl.appendChild(probe);
      const measured = probe.getBoundingClientRect().width;
      probe.remove();
      const axis = axes.find((a) => a.name === matchName);
      if (axis) {
        axis.probe =
          matchName === 'rail-left'
            ? area.left + measured + 0.5
            : area.right - measured - 0.5;
      }
    }
  }

  /* ------------------------------------------------------------- the marks */

  const marks: Mark[] = [];
  const all = Array.from(document.querySelectorAll('.rail-mark'));
  for (const el of all) {
    /*
      Both panes of the menu are in the DOM at once; the one that is off screen
      is translated and inert, and measuring it would report nonsense. Keyed on
      `inert` alone, not on aria-hidden: plenty of marked boxes are decorative
      and hidden from the accessibility tree -- the brand mark is one -- and
      excluding those would quietly drop the elements most worth checking.
    */
    if (el.closest('[inert]')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.right < area.left || rect.left > area.right) continue;

    const centre = rect.left + rect.width / 2;
    let nearest = axes[0];
    if (!nearest) continue;
    for (const axis of axes) {
      if (Math.abs(centre - axis.centre) < Math.abs(centre - nearest.centre))
        nearest = axis;
    }
    const delta = centre - nearest.centre;

    /*
      Most marked boxes are wrappers with nothing to say for themselves, so walk
      out until something names them -- their own label, a labelled ancestor, or
      the screen-reader text a control carries instead of one. A column of
      `span.inline-grid` would not tell the reader which icon had moved.
    */
    let describe = '';
    let node: Element | null = el;
    for (let hop = 0; hop < 4 && node && !describe; hop += 1) {
      describe = (
        node.getAttribute('aria-label') ??
        node.getAttribute('title') ??
        node.querySelector('.sr-only')?.textContent ??
        (node.tagName === 'BUTTON' || node.tagName === 'A'
          ? (node.textContent ?? '')
          : '')
      ).trim();
      node = node.parentElement;
    }
    if (!describe) describe = `${el.tagName.toLowerCase()} ${rect.width}px`;
    describe = describe.slice(0, 26);

    const allowed = args.allowlist.find(
      (entry) =>
        el.matches(entry.selector) || el.closest(entry.selector) !== null,
    );
    if (allowed) {
      const drift = allowed.drift ?? args.driftDefault;
      const moved = Math.abs(delta - allowed.observed) > drift;
      marks.push({
        label: describe,
        width: rect.width,
        centre,
        axis: nearest.name,
        delta,
        verdict: moved ? 'warn' : 'allowed',
        note: moved
          ? `allowed at ${allowed.observed.toFixed(2)} but now ${delta.toFixed(2)} — has it moved on purpose?`
          : allowed.reason,
      });
      continue;
    }

    const odd = rect.width % 2 !== 0;
    if (Math.abs(delta) <= args.tolerance) {
      marks.push({
        label: describe,
        width: rect.width,
        centre,
        axis: nearest.name,
        delta,
        verdict: 'ok',
      });
    } else if (odd && Math.abs(delta) <= 0.5) {
      // Not a mistake so much as arithmetic: a box of odd width centres on a
      // half pixel wherever it is put, so it can never sit on an integer axis.
      marks.push({
        label: describe,
        width: rect.width,
        centre,
        axis: nearest.name,
        delta,
        verdict: 'warn',
        note: `odd width — ${Math.ceil(rect.width / 2) * 2}px would land it exactly`,
      });
    } else {
      marks.push({
        label: describe,
        width: rect.width,
        centre,
        axis: nearest.name,
        delta,
        verdict: 'fail',
      });
    }
  }

  /* --------------------------------------------------- fractional borders */

  const borders: BorderFinding[] = [];
  let skippedSheets = 0;
  const fractional = /(?:^|[\s(])(\d*\.\d+)(px|rem)/;
  const widthProperties = [
    'border-width',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-inline-start-width',
    'border-inline-end-width',
    'border-block-start-width',
    'border-block-end-width',
  ];
  const visit = (rules: CSSRuleList, sheetName: string) => {
    for (const rule of Array.from(rules)) {
      const grouping = rule as CSSGroupingRule;
      if (grouping.cssRules) visit(grouping.cssRules, sheetName);
      const style = (rule as CSSStyleRule).style;
      const selector = (rule as CSSStyleRule).selectorText;
      if (!style || !selector) continue;
      /*
        One declaration, reported once. A bracketed border width compiles to
        the shorthand and all four longhands, and five lines saying the same
        thing about one rule is the noise that gets a check switched off.
      */
      for (const property of ['border', ...widthProperties]) {
        const value = style.getPropertyValue(property);
        if (!value || !fractional.test(value)) continue;
        /*
          Only if the rule is actually on the page. Tailwind scans every source
          file, so naming an arbitrary utility anywhere -- a comment, a design
          doc -- is enough to conjure the rule; this very file did that and the
          checker reported its own prose. A rule nothing matches is not a bug.
        */
        let live = false;
        try {
          live = document.querySelector(selector) !== null;
        } catch {
          live = false;
        }
        if (!live) break;
        const where = `${sheetName} ${selector}`;
        if (!borders.some((found) => found.where === where)) {
          borders.push({ where, declared: value.trim(), property });
        }
        break;
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      // Turbopack's chunk names arrive percent-encoded and are noise beside the
      // selector, which is the part anyone actually acts on.
      const name = decodeURIComponent(sheet.href ?? '')
        .split('/')
        .pop();
      visit(sheet.cssRules, name && name.length < 40 ? name : 'stylesheet');
    } catch {
      skippedSheets += 1;
    }
  }

  return { axes, marks, borders, skippedSheets };
}

/* -------------------------------------------------------------------- run */

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const base = await findDevServer(options.url);
  const browser = await startChrome(options.attach);
  let exitCode = 0;
  try {
    const cdp = await connect(browser.port);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: options.width,
      height: options.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    /*
      Every transition and every animated width in the sidebar already answers
      to prefers-reduced-motion, so asking for it puts the app at its resting
      geometry by its own rules -- no sleeping, and no injected stylesheet that
      would itself be a thing the measurement depends on.
    */
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    // Before any of the page's own scripts: the app's pre-paint script reads
    // this key and sets the attribute itself, so the guides are on from the
    // first frame rather than switched on after a layout we then have to redo.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('safepoint.dev.rail-guides', 'on'); } catch {}`,
    });

    const reports: { route: string; level: string; report: Report }[] = [];
    const levels =
      options.level === 'all'
        ? ['processes', 'arrange', 'workspace']
        : [options.level];

    for (const route of options.routes) {
      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', { url: `${base}${route}` });
      await loaded;
      // The belt to the pre-paint braces: the app only ever sets this attribute
      // and never clears it, so setting it again cannot fight anything.
      await evaluate(cdp, `document.documentElement.dataset.railGuides = 'on'`);
      await evaluate(
        cdp,
        `document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))`,
      );

      for (const level of levels) {
        const opener =
          level === 'workspace'
            ? '[aria-label="Back to workspace menu"]'
            : level === 'arrange'
              ? '[aria-label="Arrange processes"]'
              : null;
        if (opener) {
          const opened = await evaluate<boolean>(
            cdp,
            `(() => { const el = document.querySelector('${opener}'); if (!el) return false; el.click(); return true; })()`,
          );
          if (!opened) fail(`could not reach the ${level} level: no ${opener}`);
          await evaluate(
            cdp,
            `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`,
          );
        }
        const argument = JSON.stringify({
          tolerance: options.tolerance,
          allowlist: ALLOWLIST,
          driftDefault: DRIFT_DEFAULT,
          selfTest: options.selfTest,
        });
        const report = await evaluate<Report>(
          cdp,
          `(${measureInPage.toString()})(${argument})`,
        );
        reports.push({ route, level, report });

        /*
          Shot inside the loop, so the picture is of the level that was just
          measured rather than whichever one the loop happened to end on.
        */
        if (options.screenshot) {
          await evaluate(
            cdp,
            `(() => { const s = document.createElement('style');
               s.textContent = '.sp-devctl, #locatorjs-wrapper, #locatorjs-layer, #locatorjs-labels-wrapper { display: none !important }';
               document.head.appendChild(s); })()`,
          );
          const clip = await evaluate<{
            x: number;
            y: number;
            width: number;
            height: number;
          }>(
            cdp,
            `(() => { const r = document.querySelector('.process-menu-fade').getBoundingClientRect();
               return { x: Math.max(0, r.left - 4), y: Math.max(0, r.top - 4), width: r.width + 8, height: Math.min(r.height + 8, ${options.height}) }; })()`,
          );
          const shot = await cdp.send('Page.captureScreenshot', {
            format: 'png',
            clip: { ...clip, scale: 2 },
            captureBeyondViewport: true,
          });
          const target =
            levels.length > 1
              ? options.screenshot.replace(/(\.png)?$/, `-${level}.png`)
              : options.screenshot;
          writeFileSync(
            target,
            Buffer.from(String(shot.result?.data ?? ''), 'base64'),
          );
        }
      }
    }
    cdp.close();
    exitCode = render(reports, options, base);
  } finally {
    browser.stop();
  }
  process.exit(exitCode);
}

function render(
  reports: { route: string; level: string; report: Report }[],
  options: Options,
  base: string,
): number {
  let bad = 0;
  let warned = 0;
  for (const { report } of reports) {
    if (report.error) fail(report.error);
    if (report.axes.length === 0)
      fail('no guide axes were found — nothing to measure against');
    if (report.marks.length === 0)
      fail('no marked boxes were found — nothing was measured');
    bad += report.marks.filter((m) => m.verdict === 'fail').length;
    warned += report.marks.filter((m) => m.verdict === 'warn').length;
    bad += report.borders.length;
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: bad === 0 && (!options.strict || warned === 0),
          base,
          viewport: [options.width, options.height],
          reports,
        },
        null,
        1,
      )}\n`,
    );
    return bad === 0 && (!options.strict || warned === 0) ? 0 : 1;
  }

  const mark = { ok: '  ok ', warn: ' warn', fail: ' fail', allowed: '  -- ' };
  for (const { route, level, report } of reports) {
    process.stdout.write(
      `\n${base}${route} · ${options.width}×${options.height} · ${level}\n`,
    );
    process.stdout.write(
      `axes   ${report.axes
        .map((a) => {
          const probe =
            a.probe === undefined
              ? ''
              : Math.abs(a.probe - a.centre) < 0.01
                ? ' ✓'
                : ` ✗ probe ${a.probe.toFixed(2)}`;
          return `${a.name} ${a.centre.toFixed(2)}${probe}`;
        })
        .join('   ')}\n`,
    );
    if (options.selfTest) {
      const disagreed = report.axes.filter(
        (a) => a.probe !== undefined && Math.abs(a.probe - a.centre) >= 0.01,
      );
      if (disagreed.length > 0) {
        fail(
          `self-test: the two derivations disagree on ${disagreed.map((a) => a.name).join(', ')}`,
        );
      }
    }
    for (const m of report.marks) {
      const note = m.note ? `  ${m.note}` : '';
      process.stdout.write(
        `${mark[m.verdict]}  ${m.label.padEnd(26)} ${`${m.width}`.padStart(5)}w  c ${m.centre
          .toFixed(2)
          .padStart(
            7,
          )}  Δ ${(m.delta >= 0 ? '+' : '') + m.delta.toFixed(2)}  ${m.axis}${note}\n`,
      );
    }
    for (const b of report.borders) {
      process.stdout.write(
        `borders  ${b.where}: ${b.property} ${b.declared} — laid out floored to a whole pixel\n`,
      );
    }
    if (report.skippedSheets > 0) {
      process.stdout.write(
        `         ${report.skippedSheets} stylesheet(s) unreadable, not scanned\n`,
      );
    }
    const counts = report.marks.reduce<Record<string, number>>((acc, m) => {
      acc[m.verdict] = (acc[m.verdict] ?? 0) + 1;
      return acc;
    }, {});
    process.stdout.write(
      `${report.marks.length} marks · ${Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(' · ')}\n`,
    );
  }
  return bad === 0 && (!options.strict || warned === 0) ? 0 : 1;
}

await main();
