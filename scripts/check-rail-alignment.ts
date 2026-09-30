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
  element (and `.shell-axis` for horizontal guides), so CSS defines every axis. This file
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

import {
  ALLOWLIST,
  DRIFT_DEFAULT,
  LEVEL_OPENERS,
  measureInPage,
  type Report,
} from './rail-alignment/measure.ts';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

type Options = {
  url: string;
  routes: string[];
  level: 'processes' | 'search' | 'workspace' | 'arrange' | 'all';
  width: number;
  height: number;
  tolerance: number;
  strict: boolean;
  json: boolean;
  screenshot: string | null;
  attach: number | null;
  selfTest: boolean;
  scale: number;
};

const HELP = `
check-rail-alignment — measure the sidebar against its own guide axes

  node scripts/check-rail-alignment.ts [options]

  --url <url>           default http://localhost:3000 (falls back to :3001)
  --route <path>        repeatable; default /examples/states; use / for the sheet header
  --level <name>        processes | search | workspace | arrange | all
                        default processes. 'search' opens the search field,
                        which is closed and unmeasured at rest; 'arrange' opens
                        the reorder mode, the only state the drag handles
                        exist in.
  --width <px>          default 1440; must exceed the 900px shell: breakpoint
  --scale <n>           device pixel ratio, default 2. Borders snap to whole
                        device pixels, so a 1.5px edge lays out differently at 1
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
    scale: 2,
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
    else if (arg === '--scale') options.scale = Number(next());
    else fail(`unknown option ${arg} (try --help)`);
  }
  if (options.routes.length === 0) options.routes.push('/examples/states');
  if (
    !['processes', 'search', 'workspace', 'arrange', 'all'].includes(
      options.level,
    )
  ) {
    fail(`--level must be processes, search, workspace, arrange or all`);
  }
  // Below the shell: breakpoint the sidebar becomes a strip on top and the
  // vertical axes mean nothing, so measuring there would report noise.
  if (options.width < 901)
    fail(`--width must exceed the 900px shell breakpoint`);
  if (!(options.scale > 0)) fail(`--scale must be a positive number`);
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

async function startChrome(
  attach: number | null,
  scale: number,
): Promise<Browser> {
  if (attach !== null) return { port: attach, stop: () => {} };
  if (!existsSync(CHROME)) fail(`Chrome not found at ${CHROME}`);
  const profile = mkdtempSync(join(tmpdir(), 'safepoint-rail-'));
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      /*
        The real scale factor, not only the emulated one below. Emulation
        changes devicePixelRatio but not the scale borders snap to, so under
        emulation alone a 1.5px edge still laid out as 1px at "2x" and every
        axis measured from it reported half a pixel that no screen shows.
      */
      `--force-device-scale-factor=${scale}`,
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

/* -------------------------------------------------------------------- run */

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const base = await findDevServer(options.url);
  const browser = await startChrome(options.attach, options.scale);
  let exitCode = 0;
  try {
    const cdp = await connect(browser.port);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: options.width,
      height: options.height,
      deviceScaleFactor: options.scale,
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
      // In an order each opener can reach from the level before it: arranging
      // closes the field that 'search' opened.
      options.level === 'all'
        ? ['processes', 'search', 'arrange', 'workspace']
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
        const opener = LEVEL_OPENERS[level as keyof typeof LEVEL_OPENERS];
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
          scale: options.scale,
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
               s.textContent = '.sp-devctl { display: none !important }';
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
        `${mark[m.verdict]}  ${m.label.padEnd(26)} ${`${m.size}`.padStart(5)}${m.direction === 'x' ? 'w' : 'h'}  c ${m.centre
          .toFixed(2)
          .padStart(
            7,
          )}  Δ ${(m.delta >= 0 ? '+' : '') + m.delta.toFixed(2)}  ${m.axis}${note}\n`,
      );
    }
    for (const b of report.borders) {
      process.stdout.write(
        `borders  ${b.where}: ${b.property} ${b.declared} — snaps to whole device pixels at ${options.scale}×\n`,
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
