/*
  Retina (2dppx+) edge & transition invariant checker.

  Checks universal DOM/computed-style invariants on live app routes (no
  workbench dependency) so agents can pinpoint retina edge regressions in any
  screen quickly:

  1. occluded-inset-border: an element that dropped its real border for an
     inset box-shadow must not have an opaque descendant painting over that
     edge without a higher-z-index overlay carrying the edge.
  2. gradient-ring-loss: any `.control-face:not(.slant)` whose
     `--control-ring-top` and `--control-ring-bottom` resolve to distinct
     colours must keep a 2-layer gradient background + real 0.5px border in
     retina mode rather than flattening into a solid inset shadow.
  3. geometry-drift: positioned inner control parts (e.g. `.switch-thumb`,
     `.header-button-count`) must keep the same outer-edge clearances between
     `default` and `retina` modes.
  4. subpixel-edge-grid: sheet headers and frames must land on whole 2x
     device pixels so 0.75px box-shadow highlights render uniformly (1.5 dev px)
     across composited and non-composited layers.
  5. chrome-swap: during a section swap (`[data-chrome-borrowed]`), every
     `.sheet-chrome-band` must carry a bottom edge, borrowed `.sheet-head`s
     must resolve to `box-shadow: none`, `.sheet-chrome-divider` must paint
     above `.sheet-chrome-band`, borrowed column dividers must not double-paint
     the outer vertical highlight, and release must not trigger a spurious
     `box-shadow` transition on `.sheet-head`.

  Run `pnpm check:edges -- --help`.
*/

import { chromium, expect, type Locator, type Page } from '@playwright/test';

type Violation = {
  check:
    | 'occluded-inset-border'
    | 'gradient-ring-loss'
    | 'geometry-drift'
    | 'chrome-swap'
    | 'subpixel-edge-grid';
  context: string;
  selector: string;
  detail: string;
};

type CliOptions = {
  baseUrl: string;
  routes: string[];
  theme: 'light' | 'dark';
  help: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const routes: string[] = [];
  let baseUrl = 'http://localhost:3000';
  let theme: 'light' | 'dark' = 'light';
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    const value = argv[i + 1];
    if (arg !== '--base-url' && arg !== '--url' && arg !== '--theme') {
      throw new Error(`Unknown option ${arg}. Use --help for usage.`);
    }
    if (!value || value.startsWith('-')) {
      throw new Error(`Missing value for ${arg}.`);
    }
    if (arg === '--base-url') baseUrl = value;
    else if (arg === '--url') routes.push(value);
    else if (value === 'light' || value === 'dark') theme = value;
    else throw new Error(`Unknown theme ${value}. Use light or dark.`);
    i++;
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    routes: routes.length ? routes : ['/processes/brunch-orders'],
    theme,
    help,
  };
}

function withEdges(
  baseUrl: string,
  route: string,
  edges: 'default' | 'retina',
) {
  const url = new URL(route, `${baseUrl}/`);
  url.searchParams.set('edges', edges);
  return url.toString();
}

const CHECK_TIMEOUT = 5000;
const PROCESS_FRAME = '.process-sheet-frame';
const AUDIT_TARGETS =
  '.control-face, .switch-track, .header-button, .process-header, .process-sheet-frame, .sheet-head';

async function loadMode(
  page: Page,
  opts: CliOptions,
  route: string,
  edges: 'default' | 'retina',
) {
  const label = `${route} [${edges}]`;
  const url = withEdges(opts.baseUrl, route, edges);
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  if (!response?.ok()) {
    throw new Error(
      `${label} returned ${response ? `HTTP ${response.status()}` : 'no HTTP response'} from ${page.url()}.`,
    );
  }

  const html = page.locator('html');
  const expected = edges === 'retina' ? 'retina' : null;
  const actual = await html.getAttribute('data-edges');
  if (actual !== expected) {
    throw new Error(
      `${label} expected data-edges=${expected ?? '(absent)'}, received ${actual ?? '(absent)'}. Use the development server.`,
    );
  }
  await expect(html, `${label} theme`).toHaveAttribute(
    'data-theme',
    opts.theme,
  );
  const display = await page.evaluate(() => ({
    ratio: devicePixelRatio,
    retina: matchMedia('(min-resolution: 2dppx)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
  if (display.ratio !== 2 || !display.retina || display.reducedMotion) {
    throw new Error(
      `${label} requires 2× DPR, the 2dppx media query, and motion enabled. Received DPR ${display.ratio}, 2dppx=${display.retina}, reduced motion=${display.reducedMotion}.`,
    );
  }
  await expect(
    page.locator(AUDIT_TARGETS).filter({ visible: true }).first(),
    `${label} has no visible edge audit targets`,
  ).toBeVisible({ timeout: CHECK_TIMEOUT });
  await page.evaluate(() => document.fonts.ready);
  return (await page.locator(PROCESS_FRAME).count()) > 0;
}

function processTabs(page: Page): [ProcessTab, ProcessTab, ...ProcessTab[]] {
  const header = page.locator('.process-header');
  return [
    {
      title: 'Runs',
      button: header.getByRole('button', { name: /^Runs$/ }),
      heading: '#runs-heading',
    },
    {
      title: 'Instructions',
      button: header.getByRole('button', { name: /: version /i }),
      heading: '#instructions-heading, #policy-heading',
    },
    {
      title: 'Rules',
      button: header.getByRole('button', { name: /^Rules$/ }),
      heading: '#rules-heading',
      optional: true,
    },
    {
      title: 'Inputs',
      button: header.getByRole('button', { name: /^Inputs:/ }),
      heading: '#inputs-heading',
      optional: true,
    },
    {
      title: 'Outputs',
      button: header.getByRole('button', { name: /^Outputs:/ }),
      heading: '#outputs-heading',
    },
    {
      title: 'Settings',
      button: header.getByRole('button', { name: /^Settings$/ }),
      heading: '#settings-heading',
    },
  ];
}

type ProcessTab = {
  title: string;
  button: Locator;
  heading: string;
  optional?: boolean;
};

async function openInitialRuns(page: Page, runs: ProcessTab, context: string) {
  if (
    (await runs.button.getAttribute('aria-current', {
      timeout: CHECK_TIMEOUT,
    })) !== 'true'
  ) {
    await runs.button.click({ timeout: CHECK_TIMEOUT });
  }
  await waitForTab(page, runs, context);
}

async function waitForTab(page: Page, tab: ProcessTab, context: string) {
  const label = `${context} (${tab.title})`;
  const frame = page.locator(PROCESS_FRAME);
  await expect(tab.button, `${label} tab selection`).toHaveAttribute(
    'aria-current',
    'true',
    { timeout: CHECK_TIMEOUT },
  );
  await expect(
    frame.locator(tab.heading),
    `${label} section heading`,
  ).toBeVisible({ timeout: CHECK_TIMEOUT });
  await expect(frame, `${label} chrome handoff`).not.toHaveAttribute(
    'data-chrome-borrowed',
    '',
    { timeout: CHECK_TIMEOUT },
  );
  await expect(
    frame.locator('> .process-sheet-swap').filter({ visible: true }),
    `${label} section entrance`,
  ).toHaveCSS('opacity', '1', { timeout: CHECK_TIMEOUT });
}

// Controls that intentionally use a 0.75px solid inset ring in retina mode
// even though their default face defines subtle top/bottom ring stops.
const GRADIENT_RING_ALLOWLIST = ['surface-menu-tile'] as const;

async function auditStaticPage(
  page: Page,
  context: string,
): Promise<Violation[]> {
  return page.evaluate(
    ({ ctx, allowlist }) => {
      const issues: Violation[] = [];

      const describe = (el: Element): string => {
        const tag = el.tagName.toLowerCase();
        const cls =
          typeof el.className === 'string'
            ? el.className
                .trim()
                .split(/\s+/)
                .filter((c) => c && !c.startsWith('['))
                .slice(0, 3)
                .map((c) => `.${c}`)
                .join('')
            : '';
        return `${tag}${cls}`;
      };

      const parseAlpha = (color: string): number => {
        if (!color || color === 'transparent') return 0;
        const m = color.match(/rgba?\([^)]+,\s*([0-9.]+)\s*\)/);
        if (m) return Number(m[1]);
        if (color.startsWith('rgb(')) return 1;
        const slash = color.match(/\/\s*([0-9.]+)\s*\)/);
        if (slash) return Number(slash[1]);
        return 1;
      };

      const isVisible = (el: Element): boolean => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const cs = getComputedStyle(el);
        return (
          cs.display !== 'none' &&
          cs.visibility !== 'hidden' &&
          Number(cs.opacity) > 0
        );
      };

      // Parse inset box-shadows with 0 blur that paint a thin border-like edge.
      type InsetEdge = {
        side: 'all' | 'top' | 'right' | 'bottom' | 'left';
        width: number;
      };
      const parseInsetEdges = (shadow: string): InsetEdge[] => {
        if (!shadow || shadow === 'none') return [];
        const parts: string[] = [];
        let depth = 0;
        let start = 0;
        for (let i = 0; i < shadow.length; i++) {
          if (shadow[i] === '(') depth++;
          else if (shadow[i] === ')') depth--;
          else if (shadow[i] === ',' && depth === 0) {
            parts.push(shadow.slice(start, i).trim());
            start = i + 1;
          }
        }
        parts.push(shadow.slice(start).trim());

        const edges: InsetEdge[] = [];
        for (const part of parts) {
          if (!/\binset\b/.test(part)) continue;
          // Skip transparent shadows
          if (/rgba?\([^)]+,\s*0\s*\)|transparent/.test(part)) continue;
          const withoutColor = part
            .replace(/rgba?\([^)]*\)|oklch\([^)]*\)|color\([^)]*\)/g, '')
            .replace(/\binset\b/g, '')
            .trim();
          const nums = withoutColor.split(/\s+/).map((v) => parseFloat(v));
          if (nums.length < 3 || nums.some((n) => Number.isNaN(n))) continue;
          const [ox = 0, oy = 0, blur = 0, spread = 0] = nums;
          if (blur > 0.01) continue;
          if (ox === 0 && oy === 0 && spread > 0 && spread <= 1.25) {
            edges.push({ side: 'all', width: spread });
          } else if (
            oy === 0 &&
            spread === 0 &&
            Math.abs(ox) > 0 &&
            Math.abs(ox) <= 1.25
          ) {
            edges.push({
              side: ox > 0 ? 'left' : 'right',
              width: Math.abs(ox),
            });
          } else if (
            ox === 0 &&
            spread === 0 &&
            Math.abs(oy) > 0 &&
            Math.abs(oy) <= 1.25
          ) {
            edges.push({
              side: oy > 0 ? 'top' : 'bottom',
              width: Math.abs(oy),
            });
          }
        }
        return edges;
      };

      const all = [...document.querySelectorAll('*')];

      for (const el of all) {
        if (!isVisible(el)) continue;
        const cs = getComputedStyle(el);

        // 1. Gradient-ring loss check on .control-face:not(.slant)
        if (
          el.classList.contains('control-face') &&
          !el.classList.contains('slant') &&
          !allowlist.some((cls) => el.classList.contains(cls))
        ) {
          const probe = document.createElement('span');
          probe.style.display = 'none';
          probe.style.color = cs.getPropertyValue('--control-ring-top').trim();
          probe.style.backgroundColor = cs
            .getPropertyValue('--control-ring-bottom')
            .trim();
          el.append(probe);
          const pcs = getComputedStyle(probe);
          const topColor = pcs.color;
          const bottomColor = pcs.backgroundColor;
          probe.remove();

          if (
            topColor &&
            bottomColor &&
            topColor !== bottomColor &&
            parseAlpha(topColor) > 0 &&
            parseAlpha(bottomColor) > 0
          ) {
            const bw = parseFloat(cs.borderTopWidth);
            const layers =
              cs.backgroundImage.split('linear-gradient').length - 1;
            if (bw < 0.25 || layers < 2) {
              issues.push({
                check: 'gradient-ring-loss',
                context: ctx,
                selector: describe(el),
                detail: `gradient ring (${topColor} -> ${bottomColor}) flattened: borderTopWidth=${cs.borderTopWidth}, gradientLayers=${layers}`,
              });
            }
          }
        }

        // 3. Subpixel device-grid check on sheet headers/frames: a 0.75px
        // box-shadow highlight on a half device pixel (.25/.75 CSS px at 2x)
        // snaps between 1.0 and 1.5 dev px depending on compositing layer.
        if (el.matches('.process-header, .process-sheet-frame, .sheet-head')) {
          const r = el.getBoundingClientRect();
          if (Math.abs(r.bottom * 2 - Math.round(r.bottom * 2)) > 0.05) {
            issues.push({
              check: 'subpixel-edge-grid',
              context: ctx,
              selector: describe(el),
              detail: `bottom=${r.bottom.toFixed(2)}px lands on a fractional 2x device pixel (${(r.bottom * 2).toFixed(2)}), causing 0.75px highlights to vary between 1.0 and 1.5 dev px`,
            });
          }
        }

        // 2. Occluded inset-shadow border check
        const insetEdges = parseInsetEdges(cs.boxShadow);
        if (insetEdges.length === 0) continue;

        // Skip if the element itself is a high-z overlay pseudo-host or has a
        // full-box ::after overlay at z-index > 0 (like .data-table-card::after).
        const afterCs = getComputedStyle(el, '::after');
        const hasOverlayAfter =
          afterCs.content !== 'none' &&
          afterCs.position === 'absolute' &&
          Number(afterCs.zIndex) > 0 &&
          parseInsetEdges(afterCs.boxShadow).length > 0;
        if (hasOverlayAfter) continue;

        const parentRect = el.getBoundingClientRect();
        // Only check direct/near structural children that have opaque backgrounds
        // (skipping .control-face panes whose own children intentionally bleed).
        if (el.classList.contains('control-face')) continue;

        const sidesToCheck: ('top' | 'right' | 'bottom' | 'left')[] = [];
        for (const edge of insetEdges) {
          if (edge.side === 'all')
            sidesToCheck.push('top', 'right', 'bottom', 'left');
          else sidesToCheck.push(edge.side);
        }

        for (const child of el.children) {
          if (!isVisible(child)) continue;
          const ccs = getComputedStyle(child);
          if (parseAlpha(ccs.backgroundColor) < 0.9) continue;
          const cr = child.getBoundingClientRect();

          for (const side of sidesToCheck) {
            const borderWidth = parseFloat(
              cs[
                side === 'top'
                  ? 'borderTopWidth'
                  : side === 'right'
                    ? 'borderRightWidth'
                    : side === 'bottom'
                      ? 'borderBottomWidth'
                      : 'borderLeftWidth'
              ],
            );
            if (borderWidth >= 0.4) continue;

            const touching =
              (side === 'top' && cr.top <= parentRect.top + 0.5) ||
              (side === 'right' && cr.right >= parentRect.right - 0.5) ||
              (side === 'bottom' && cr.bottom >= parentRect.bottom - 0.5) ||
              (side === 'left' && cr.left <= parentRect.left + 0.5);

            if (touching) {
              issues.push({
                check: 'occluded-inset-border',
                context: ctx,
                selector: `${describe(el)} > ${describe(child)}`,
                detail: `opaque child (${ccs.backgroundColor}) touches ${side} edge where parent draws an inset box-shadow border (${cs.boxShadow})`,
              });
            }
          }
        }
      }

      return issues;
    },
    { ctx: context, allowlist: [...GRADIENT_RING_ALLOWLIST] },
  );
}

async function auditChromeSwap(
  page: Page,
  context: string,
  tabs: readonly [ProcessTab, ProcessTab],
): Promise<Violation[]> {
  const issues: Violation[] = [];
  const [runs, instructions] = tabs;

  const swaps = [
    [runs, instructions],
    [instructions, runs],
  ] as const;
  for (const [from, to] of swaps) {
    const label = `${context} (${from.title} -> ${to.title})`;

    const sampleSwap = (swapLabel: string) => {
      const frame = document.querySelector(
        '.process-sheet-frame[data-chrome-borrowed]',
      );
      const bands = frame
        ? [...frame.querySelectorAll('.sheet-chrome-band')].filter(
            (band) => band.getBoundingClientRect().height > 0,
          )
        : [];
      if (!bands.length) return false;
      const errs: Violation[] = [];

      for (const band of bands) {
        const cs = getComputedStyle(band);
        const bw = parseFloat(cs.borderBottomWidth);
        const hasInsetBottom = cs.boxShadow.includes('inset');
        if (bw < 0.25 && !hasInsetBottom) {
          errs.push({
            check: 'chrome-swap',
            context: swapLabel,
            selector: '.sheet-chrome-band',
            detail: `cloned header band lost its bottom border during swap (borderBottomWidth=${cs.borderBottomWidth}, boxShadow=${cs.boxShadow})`,
          });
        }
      }

      const borrowedHeads = [
        ...document.querySelectorAll(
          '.process-sheet-frame[data-chrome-borrowed] > .process-sheet-swap .sheet-head',
        ),
      ];
      for (const head of borrowedHeads) {
        const cs = getComputedStyle(head);
        if (cs.boxShadow !== 'none') {
          errs.push({
            check: 'chrome-swap',
            context: swapLabel,
            selector: `.sheet-head (${head.textContent?.trim().slice(0, 20)})`,
            detail: `borrowed .sheet-head leaked boxShadow during swap: ${cs.boxShadow}`,
          });
        }
      }

      // Ensure borrowed column dividers do not double-paint the outer vertical
      // highlight on top of `.sheet-chrome-divider` (which darkens its 50%
      // antialiased pixel to 75% right before release).
      const borrowedPanels = document.querySelector(
        '.process-sheet-frame[data-chrome-borrowed] > .process-sheet-swap .process-panels',
      );
      if (borrowedPanels) {
        const afterCs = getComputedStyle(borrowedPanels, '::after');
        if (afterCs.content !== 'none' && afterCs.visibility !== 'hidden') {
          errs.push({
            check: 'chrome-swap',
            context: swapLabel,
            selector: '.process-panels::after',
            detail: `vertical highlight remained visible during swap (visibility=${afterCs.visibility}), double-painting over .sheet-chrome-divider`,
          });
        }
      }

      const borrowedRuns = document.querySelector(
        '.process-sheet-frame[data-chrome-borrowed] > .process-sheet-swap .process-runs',
      );
      if (borrowedRuns) {
        const beforeCs = getComputedStyle(borrowedRuns, '::before');
        const hasOuterShadow =
          beforeCs.boxShadow !== 'none' &&
          beforeCs.boxShadow
            .split(/,(?![^(]*\))/)
            .some((part) => !/\binset\b/.test(part));
        if (beforeCs.content !== 'none' && hasOuterShadow) {
          errs.push({
            check: 'chrome-swap',
            context: swapLabel,
            selector: '.process-runs::before',
            detail: `outer highlight remained in box-shadow during swap (${beforeCs.boxShadow}), double-painting over .sheet-chrome-divider`,
          });
        }
      }

      const dividers = [...document.querySelectorAll('.sheet-chrome-divider')];
      for (const div of dividers) {
        const dr = div.getBoundingClientRect();
        const dcs = getComputedStyle(div);
        const afterCs = getComputedStyle(div, '::after');
        const divZ = Number(dcs.zIndex) || 0;
        const afterZ =
          afterCs.content !== 'none' ? Number(afterCs.zIndex) || 0 : -1;

        for (const band of bands) {
          const br = band.getBoundingClientRect();
          const overlapsX =
            br.left < dr.right - 0.1 && br.right > dr.left + 0.1;
          const bandZ = Number(getComputedStyle(band).zIndex) || 0;
          if (overlapsX && Math.max(divZ, afterZ) <= bandZ) {
            errs.push({
              check: 'chrome-swap',
              context: swapLabel,
              selector: '.sheet-chrome-divider',
              detail: `divider (x=${dr.left.toFixed(2)}..${dr.right.toFixed(2)}, z=${divZ}, ::after z=${afterZ}) is covered by .sheet-chrome-band (x=${br.left.toFixed(2)}..${br.right.toFixed(2)}, z=${bandZ})`,
            });
          }
        }
      }

      return errs;
    };

    // Start observing before the click so a short-lived band still gets sampled.
    const [observed] = await Promise.all([
      page
        .waitForFunction(sampleSwap, label, { timeout: CHECK_TIMEOUT })
        .catch((error: unknown) => {
          throw new Error(
            `${label} did not show a borrowed .sheet-chrome-band.`,
            { cause: error },
          );
        }),
      to.button.click({ timeout: CHECK_TIMEOUT }),
    ]);

    const found = await observed.jsonValue();
    await observed.dispose();
    if (!found) throw new Error(`${label} could not sample the borrowed band.`);
    issues.push(...found);

    // Verify handoff commits cleanly without a spurious box-shadow transition
    // on `.sheet-head` (which would blink the retina bottom border out and in).
    const sampleHandoff = (swapLabel: string) => {
      if (
        document.querySelector('.process-sheet-frame[data-chrome-borrowed]')
      ) {
        return false;
      }
      const errs: Violation[] = [];
      for (const head of document.querySelectorAll(
        '.process-sheet-swap .sheet-head',
      )) {
        const anims = head
          .getAnimations()
          .filter(
            (a) =>
              a instanceof CSSTransition &&
              a.transitionProperty === 'box-shadow' &&
              a.playState === 'running',
          );
        if (anims.length > 0) {
          errs.push({
            check: 'chrome-swap',
            context: `${swapLabel} (handoff)`,
            selector: `.sheet-head (${head.textContent?.trim().slice(0, 20)})`,
            detail:
              'spurious box-shadow transition running on handoff (border blinks on release)',
          });
        }
      }
      // Ensure the settled Instructions two-column view paints its vertical
      // highlight beside the divider (matching `.sheet-chrome-divider`).
      const panels = document.querySelector(
        '.process-panels:has(> .process-panel-list + *)',
      );
      if (panels) {
        const afterCs = getComputedStyle(panels, '::after');
        if (afterCs.content === 'none' || afterCs.boxShadow === 'none') {
          errs.push({
            check: 'chrome-swap',
            context: `${swapLabel} (settled)`,
            selector: '.process-panels::after',
            detail: `vertical highlight missing after swap (content=${afterCs.content}, boxShadow=${afterCs.boxShadow})`,
          });
        }
      }
      return errs;
    };
    const handoff = await page.waitForFunction(sampleHandoff, label, {
      timeout: CHECK_TIMEOUT,
    });
    const handoffIssues = await handoff.jsonValue();
    await handoff.dispose();
    if (!handoffIssues)
      throw new Error(`${label} could not sample the handoff.`);
    issues.push(...handoffIssues);
    await waitForTab(page, to, context);
  }

  return issues;
}

type Side = 'gapTop' | 'gapBottom' | 'gapLeft' | 'gapRight';
type GeometryEntry = {
  sides: Side[];
  gaps: Record<Side, number>;
};
type GeometrySnapshot = Record<string, GeometryEntry>;

async function captureControlGeometry(page: Page): Promise<GeometrySnapshot> {
  return page.evaluate(() => {
    const out: GeometrySnapshot = {};
    const pairs: [string, string, string, Side[]][] = [
      [
        'switch',
        '.switch-track',
        '.switch-thumb',
        ['gapTop', 'gapBottom', 'gapLeft', 'gapRight'],
      ],
      [
        'header-count',
        '.header-button',
        '.header-button-count',
        ['gapTop', 'gapBottom'],
      ],
    ];
    for (const [prefix, parentSel, childSel, sides] of pairs) {
      const parents = [...document.querySelectorAll(parentSel)];
      parents.forEach((parent, idx) => {
        const child = parent.querySelector(childSel);
        if (!child) return;
        const pr = parent.getBoundingClientRect();
        const cr = child.getBoundingClientRect();
        if (pr.width < 2 || cr.width < 2) return;
        out[`${prefix}[${idx}]`] = {
          sides,
          gaps: {
            gapTop: +(cr.top - pr.top).toFixed(2),
            gapBottom: +(pr.bottom - cr.bottom).toFixed(2),
            gapLeft: +(cr.left - pr.left).toFixed(2),
            gapRight: +(pr.right - cr.right).toFixed(2),
          },
        };
      });
    }
    return out;
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      [
        'Usage: pnpm check:edges [-- --url <path>]... [--base-url <url>] [--theme light|dark]',
        '',
        'Checks edge invariants on the development server at 2×.',
        'Process sheets include tab swaps. Other supported pages get static checks.',
        'Exit status: 0 passed, 1 edge violations, 2 check could not complete.',
        '',
        '  1. occluded-inset-border  opaque children covering an inset box-shadow border',
        '  2. gradient-ring-loss     gradient-ring .control-face flattened to solid shadow',
        '  3. geometry-drift         inner control clearances drifting between default & retina',
        '  4. subpixel-edge-grid     sheet headers/frames landing on half 2x device pixels',
        '  5. chrome-swap            header/divider/highlight glitches during swaps & handoff',
      ].join('\n'),
    );
    return;
  }

  const browser = await chromium.launch({
    args: ['--force-device-scale-factor=2'],
  });
  const violations: Violation[] = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 2,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();

    await page.addInitScript((theme) => {
      localStorage.setItem('safepoint.dev.theme', theme);
    }, opts.theme);

    for (const route of opts.routes) {
      const [runs, instructions, ...others] = processTabs(page);
      const defaultContext = `${route} [default]`;
      const hasSheet = await loadMode(page, opts, route, 'default');
      if (hasSheet) await openInitialRuns(page, runs, defaultContext);
      const defaultGeom = await captureControlGeometry(page);
      if (hasSheet) {
        violations.push(
          ...(await auditChromeSwap(page, defaultContext, [
            runs,
            instructions,
          ])),
        );
      }

      const context = `${route} [retina]`;
      const retinaHasSheet = await loadMode(page, opts, route, 'retina');
      if (hasSheet !== retinaHasSheet) {
        throw new Error(
          `${route} did not render the same process sheet in both modes.`,
        );
      }
      if (hasSheet) await openInitialRuns(page, runs, context);
      const retinaGeom = await captureControlGeometry(page);

      const controls = new Set([
        ...Object.keys(defaultGeom),
        ...Object.keys(retinaGeom),
      ]);
      for (const key of controls) {
        const base = defaultGeom[key];
        const ret = retinaGeom[key];
        if (!base || !ret) {
          violations.push({
            check: 'geometry-drift',
            context: route,
            selector: key,
            detail: `control missing in ${base ? 'retina' : 'default'} mode`,
          });
          continue;
        }
        for (const side of base.sides) {
          const diff = Math.abs(ret.gaps[side] - base.gaps[side]);
          if (diff > 0.25) {
            violations.push({
              check: 'geometry-drift',
              context: route,
              selector: key,
              detail: `${side} shifted from ${base.gaps[side]}px (default) to ${ret.gaps[side]}px (retina)`,
            });
          }
        }
      }

      violations.push(...(await auditStaticPage(page, `${context} (initial)`)));
      if (!hasSheet) {
        console.log(
          `${route}: static edge checks only. This page has no process sheet.`,
        );
        continue;
      }

      violations.push(
        ...(await auditChromeSwap(page, context, [runs, instructions])),
      );
      for (const tab of [instructions, ...others]) {
        if (tab.optional && (await tab.button.count()) === 0) continue;
        await tab.button.click({ timeout: CHECK_TIMEOUT });
        await waitForTab(page, tab, context);
        violations.push(
          ...(await auditStaticPage(page, `${context} (${tab.title})`)),
        );
      }
    }
  } finally {
    await browser.close();
  }

  if (violations.length === 0) {
    console.log(
      `PASS: 0 retina edge violations across ${opts.routes.join(', ')} (${opts.theme}, 2x).`,
    );
    return;
  }

  console.error(`FAIL: ${violations.length} retina edge violation(s):\n`);
  for (const v of violations) {
    console.error(`  [${v.check}] ${v.context}`);
    console.error(`    ${v.selector}`);
    console.error(`    ${v.detail}\n`);
  }
  process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(
    'Could not run retina edge check:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 2;
});
