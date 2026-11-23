/*
  Screenshots for the line checker, from Chromium and WebKit (Playwright) and
  from Safari itself (its WebDriver, spoken over HTTP with no client library).
  Every capture is prepared the same way first: glyphs, icons, media and the
  development overlays are made invisible without moving anything, so what is
  left is faces and lines.
*/

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

import { decodePng, type Pixels } from './png.ts';

export type Engine = 'chromium' | 'webkit' | 'safari';

export type SpecimenBox = {
  id: string;
  kind: string;
  recipe: string;
  approach: string;
  sides: string;
  total: number;
  /* CSS px, relative to the captured image's origin. */
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

export type Capture = {
  engine: Engine;
  /* Device pixels per CSS px in the image. */
  scale: number;
  image: Pixels;
  specimens: SpecimenBox[];
  /* What the page reported, to catch a capture that is not what was asked. */
  page: { edges: string | null; theme: string | null; dpr: number };
  /* The layout viewport, CSS px. */
  viewport: { width: number; height: number };
  probes: Record<
    string,
    { x: number; y: number; width: number; height: number } | null
  >;
};

export type CaptureOptions = {
  url: string;
  theme: 'light' | 'dark';
  edges: 'retina' | 'default';
  scale: number;
  width: number;
  height: number;
  fullPage: boolean;
  /* Appended to the preparation stylesheet: a variant to measure. */
  css?: string;
  /* Selectors whose first match's box is reported (CSS px, image origin). */
  probes?: string[];
};

/* Hidden, not removed: nothing below changes layout. -webkit-text-fill-color
   hides glyphs and leaves `color` alone, so lines drawn in currentColor stay. */
const PREPARE_CSS = `
*, *::before, *::after {
  -webkit-text-fill-color: transparent !important;
  text-shadow: none !important;
  caret-color: transparent !important;
  scrollbar-width: none !important;
  transition: none !important;
  animation-play-state: paused !important;
  cursor: none !important;
}
::-webkit-scrollbar { display: none !important; }
svg, img, video, canvas, picture,
.sp-devctl, agentation-toolbar, [data-agentation-portal], [data-feedback-toolbar],
nextjs-portal, [data-style-inspector] { visibility: hidden !important; }
::placeholder { color: transparent !important; }
`;

/* Runs in the page: the edges mode and theme are applied, then motion is
   stopped and everything it needs to settle has settled. */
const PREPARE_SCRIPT = ({ css, edges }: { css: string; edges: string }) => {
  const root = document.documentElement;
  if (edges === 'retina') root.dataset.edges = 'retina';
  else delete root.dataset.edges;
  const style = document.createElement('style');
  style.dataset.lineGeometry = '';
  style.textContent = css;
  document.head.append(style);
  // An infinite animation cannot be finished (it throws); it is paused.
  for (const animation of document.getAnimations()) {
    try {
      animation.finish();
    } catch {
      animation.pause();
    }
  }
};

const READ_SCRIPT = (probes: string[]) => {
  const sx = window.scrollX;
  const sy = window.scrollY;
  const box = (selector: string) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + sx, y: r.y + sy, width: r.width, height: r.height };
  };
  return {
    probes: Object.fromEntries(probes.map((p) => [p, box(p)])),
    edges: document.documentElement.dataset.edges ?? null,
    theme: document.documentElement.dataset.theme ?? null,
    dpr: window.devicePixelRatio,
    specimens: [
      ...document.querySelectorAll<HTMLElement>('[data-specimen]'),
    ].map((el) => {
      const r = el.getBoundingClientRect();
      const d = el.dataset;
      return {
        id: d.specimen!,
        kind: d.kind ?? '',
        recipe: d.recipe ?? '',
        approach: d.approach ?? '',
        sides: d.sides ?? 'all',
        total: Number(d.total),
        x: r.x + sx,
        y: r.y + sy,
        width: r.width,
        height: r.height,
        radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
      };
    }),
  };
};

const settle = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* ── Chromium and WebKit ───────────────────────────────────────────────── */

export async function capturePlaywright(
  engine: 'chromium' | 'webkit',
  opts: CaptureOptions,
): Promise<Capture> {
  const playwright = await import('@playwright/test');
  const type = engine === 'chromium' ? playwright.chromium : playwright.webkit;
  // Chromium snaps borders to the screen's pixels, not the emulated ones:
  // without the flag a 1.5px edge lays out as it would at 1x.
  const browser = await type.launch({
    args:
      engine === 'chromium'
        ? [`--force-device-scale-factor=${opts.scale}`]
        : [],
  });
  try {
    const page = await browser.newPage({
      deviceScaleFactor: opts.scale,
      viewport: { width: opts.width, height: opts.height },
      reducedMotion: 'reduce',
    });
    await page.addInitScript((theme) => {
      try {
        localStorage.setItem('safepoint.dev.theme', theme);
      } catch {}
    }, opts.theme);
    // Not networkidle: a page polling a run in progress never goes quiet.
    const response = await page.goto(opts.url, { waitUntil: 'load' });
    if (!response?.ok())
      throw new Error(
        `${opts.url} returned ${response?.status() ?? 'nothing'}.`,
      );
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(PREPARE_SCRIPT, {
      css: PREPARE_CSS + (opts.css ?? ''),
      edges: opts.edges,
    });
    await settle(1200);
    const read = await page.evaluate(READ_SCRIPT, opts.probes ?? []);
    const png = await page.screenshot({ fullPage: opts.fullPage });
    const image = decodePng(png);
    return {
      engine,
      scale: opts.scale,
      image,
      specimens: read.specimens,
      page: { edges: read.edges, theme: read.theme, dpr: read.dpr },
      viewport: { width: opts.width, height: opts.height },
      probes: read.probes,
    };
  } finally {
    await browser.close();
  }
}

/* ── Safari ────────────────────────────────────────────────────────────── */

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('No port.')),
      );
    });
  });
}

export type Session = { base: string; id: string; driver: ChildProcess };

export async function webdriver(
  base: string,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json()) as {
    value: { error?: string; message?: string } & Record<string, unknown>;
  };
  if (
    json.value &&
    typeof json.value === 'object' &&
    'error' in json.value &&
    json.value.error
  ) {
    throw new Error(
      `Safari WebDriver ${path}: ${json.value.error}${json.value.message ? ` -- ${json.value.message}` : ''}`,
    );
  }
  return json.value as unknown;
}

/* Also used by check-edge-junctions.ts, which drives its own pages. */
export async function openSafari(): Promise<Session> {
  const port = await freePort();
  const driver = spawn('safaridriver', ['-p', String(port)], {
    stdio: 'ignore',
  });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${base}/status`);
      break;
    } catch {
      await settle(100);
    }
  }
  try {
    const value = (await webdriver(base, 'POST', '/session', {
      capabilities: { alwaysMatch: { browserName: 'safari' } },
    })) as { sessionId: string };
    return { base, id: value.sessionId, driver };
  } catch (error) {
    driver.kill();
    throw new Error(
      `${(error as Error).message}\n` +
        // Safari logs "Safari was not launched for automation" and the request
        // times out: safaridriver must start Safari itself.
        'Quit Safari (Cmd+Q) first: a Safari that is already open refuses automation ' +
        'sessions. Also needed once: Settings > Developer > Allow remote automation, ' +
        'and `safaridriver --enable`.',
    );
  }
}

/*
  Safari draws at the screen's own ratio and screenshots only the viewport.
  A full page is taken as viewport-high tiles; each specimen is kept from the
  tile that holds it whole.
*/
export async function captureSafari(opts: CaptureOptions): Promise<Capture[]> {
  const s = await openSafari();
  const call = (method: string, path: string, body?: unknown) =>
    webdriver(s.base, method, `/session/${s.id}${path}`, body);
  // Safari answers "no such window" when the page is replaced under a script
  // that is still waiting -- a client-side navigation just after load -- so a
  // script is tried again once the new page is there.
  const run = async <T>(
    fn: (...args: never[]) => unknown,
    ...args: unknown[]
  ) => {
    const name = fn.name || fn.toString().slice(0, 60).replace(/\s+/g, ' ');
    for (let attempt = 0; ; attempt++) {
      try {
        return (await call('POST', '/execute/sync', {
          script: `return (${fn.toString()})(...arguments)`,
          args,
        })) as T;
      } catch (error) {
        const message = (error as Error).message;
        if (attempt < 5 && message.includes('no such window')) {
          await settle(400);
          continue;
        }
        throw new Error(`${message} (in ${name})`);
      }
    }
  };
  try {
    // A Safari left open by an earlier session may hand this one a window
    // that is already gone; work in a fresh one.
    const opened = (await call('POST', '/window/new', { type: 'tab' })) as {
      handle: string;
    };
    await call('POST', '/window', { handle: opened.handle });
    await call('POST', '/url', { url: opts.url });
    // The window's frame is not the viewport: size it, read what the page
    // got, and correct by the difference, so Safari lays out at the same
    // width as the other browsers it is compared with.
    let size = { width: opts.width, height: opts.height };
    for (let i = 0; i < 3; i++) {
      await call('POST', '/window/rect', size);
      const view = await run<{ width: number; height: number }>(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      if (view.width === opts.width && view.height === opts.height) break;
      size = {
        width: size.width + opts.width - view.width,
        height: size.height + opts.height - view.height,
      };
    }
    await run((theme: string) => {
      localStorage.setItem('safepoint.dev.theme', theme);
    }, opts.theme);
    await call('POST', '/url', { url: opts.url });
    await run(() => document.fonts.ready.then(() => true));
    await run(PREPARE_SCRIPT, {
      css: PREPARE_CSS + (opts.css ?? ''),
      edges: opts.edges,
    });
    await settle(600);
    const view = await run<{
      innerWidth: number;
      innerHeight: number;
      scrollHeight: number;
    }>(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    const step = view.innerHeight - 64;
    const tops = [0];
    if (opts.fullPage)
      for (let y = step; y < view.scrollHeight; y += step) tops.push(y);
    const captures: Capture[] = [];
    for (const top of tops) {
      const sy = await run<number>((y: number) => {
        window.scrollTo(0, y);
        return window.scrollY;
      }, top);
      await settle(200);
      const read = await run<ReturnType<typeof READ_SCRIPT>>(
        READ_SCRIPT,
        opts.probes ?? [],
      );
      // Safari stops rendering while its window is covered or in the
      // background, and then hands back a stale frame. Wait for two frames;
      // if none comes, say so rather than measure an old picture.
      const rendering = await run<boolean>(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(false), 1500);
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve(true)),
            );
          }),
      );
      if (!rendering) {
        throw new Error(
          'Safari is not rendering: its window must stay visible, not covered or minimised, while it is measured.',
        );
      }
      const shoot = async () =>
        Buffer.from((await call('GET', '/screenshot')) as string, 'base64');
      let png = await shoot();
      for (let attempt = 0; attempt < 6; attempt++) {
        await settle(250);
        const again = await shoot();
        if (again.equals(png)) break;
        png = again;
      }
      const image = decodePng(png);
      const scale = image.width / view.innerWidth;
      const visible = image.height / scale;
      captures.push({
        engine: 'safari',
        scale,
        image,
        specimens: read.specimens
          .map((sp) => ({ ...sp, y: sp.y - sy }))
          .filter((sp) => sp.y >= 8 && sp.y + sp.height <= visible - 8),
        page: { edges: read.edges, theme: read.theme, dpr: read.dpr },
        viewport: { width: view.innerWidth, height: view.innerHeight },
        probes: Object.fromEntries(
          Object.entries(read.probes).map(([k, r]) => [
            k,
            r && { ...r, y: r.y - sy },
          ]),
        ),
      });
      if (!opts.fullPage) break;
    }
    return captures;
  } finally {
    await call('DELETE', '').catch(() => {});
    s.driver.kill();
  }
}
