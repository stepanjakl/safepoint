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
  4. chrome-swap: during a section swap (`[data-chrome-borrowed]`), every
     `.sheet-chrome-band` must carry a bottom edge, borrowed `.sheet-head`s
     must resolve to `box-shadow: none`, borrowed column dividers must be
     hidden, and `.sheet-chrome-divider` must paint above `.sheet-chrome-band`.

  Run `pnpm check:edges -- --help`.
*/

import { chromium, type Page } from '@playwright/test';

type Violation = {
  check:
    | 'occluded-inset-border'
    | 'gradient-ring-loss'
    | 'geometry-drift'
    | 'chrome-swap';
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
    if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--base-url' && argv[i + 1]) baseUrl = argv[++i]!;
    else if (arg === '--url' && argv[i + 1]) routes.push(argv[++i]!);
    else if (
      arg === '--theme' &&
      (argv[i + 1] === 'light' || argv[i + 1] === 'dark')
    )
      theme = argv[++i] as 'light' | 'dark';
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
  if (edges === 'retina') url.searchParams.set('edges', 'retina');
  else url.searchParams.delete('edges');
  return url.toString();
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
): Promise<Violation[]> {
  const issues: Violation[] = [];
  const hasFrame = (await page.locator('.process-sheet-frame').count()) > 0;
  if (!hasFrame) return issues;

  const instructionsBtn = page.getByRole('button', { name: /instructions:/i });
  const runsBtn = page.getByRole('button', { name: 'Runs', exact: true });
  if ((await instructionsBtn.count()) === 0 || (await runsBtn.count()) === 0)
    return issues;

  const swaps: [string, typeof instructionsBtn][] = [
    ['Runs -> Instructions', instructionsBtn],
    ['Instructions -> Runs', runsBtn],
  ];

  for (const [label, button] of swaps) {
    await button.click();
    try {
      await page.waitForSelector(
        '.process-sheet-frame[data-chrome-borrowed] .sheet-chrome-band',
        {
          timeout: 2000,
        },
      );
    } catch {
      continue;
    }

    const found = await page.evaluate((swapLabel) => {
      const errs: Violation[] = [];

      const bands = [...document.querySelectorAll('.sheet-chrome-band')];
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

      for (const sel of ['.process-runs', '.process-panels']) {
        const host = document.querySelector(
          `.process-sheet-frame[data-chrome-borrowed] > .process-sheet-swap ${sel}`,
        );
        if (!host) continue;
        const beforeCs = getComputedStyle(host, '::before');
        if (beforeCs.content !== 'none' && beforeCs.visibility !== 'hidden') {
          errs.push({
            check: 'chrome-swap',
            context: swapLabel,
            selector: `${sel}::before`,
            detail: `borrowed column divider remained visible during swap (visibility=${beforeCs.visibility})`,
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
    }, `${context} (${label})`);

    issues.push(...found);
    await page.waitForFunction(
      () => !document.querySelector('[data-chrome-borrowed]'),
      {
        timeout: 3000,
      },
    );
    await page.waitForTimeout(150);
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
        'Checks universal retina (2dppx) edge invariants on live app routes:',
        '  1. occluded-inset-border  opaque children covering an inset box-shadow border',
        '  2. gradient-ring-loss     gradient-ring .control-face flattened to solid shadow',
        '  3. geometry-drift         inner control clearances drifting between default & retina',
        '  4. chrome-swap            header/divider glitches during [data-chrome-borrowed] swaps',
      ].join('\n'),
    );
    process.exit(0);
  }

  const browser = await chromium.launch({
    args: ['--force-device-scale-factor=2'],
  });
  const violations: Violation[] = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.addInitScript((theme) => {
      localStorage.setItem('safepoint.dev.theme', theme);
    }, opts.theme);

    for (const route of opts.routes) {
      // Capture default control geometry first
      await page.goto(withEdges(opts.baseUrl, route, 'default'), {
        waitUntil: 'networkidle',
      });
      await page.waitForTimeout(250);
      const defaultGeom = await captureControlGeometry(page);

      // Load retina mode
      await page.goto(withEdges(opts.baseUrl, route, 'retina'), {
        waitUntil: 'networkidle',
      });
      await page.waitForTimeout(250);
      const retinaGeom = await captureControlGeometry(page);

      for (const [key, base] of Object.entries(defaultGeom)) {
        const ret = retinaGeom[key];
        if (!ret) continue;
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

      // Static audit on initial view
      violations.push(...(await auditStaticPage(page, `${route} (initial)`)));

      // Chrome-swap transition audit (when process sheet tabs exist)
      violations.push(...(await auditChromeSwap(page, route)));

      // Audit each process tab if present (Instructions, Sources, Rules, Settings)
      const tabButtons = [
        ['instructions', page.getByRole('button', { name: /instructions:/i })],
        ['sources', page.getByRole('button', { name: /sources/i })],
        ['rules', page.getByRole('button', { name: /rules/i })],
        ['settings', page.getByRole('button', { name: /settings/i })],
      ] as const;

      for (const [name, locator] of tabButtons) {
        if ((await locator.count()) !== 1) continue;
        await locator.click();
        await page
          .waitForFunction(
            () => !document.querySelector('[data-chrome-borrowed]'),
            {
              timeout: 3000,
            },
          )
          .catch(() => {});
        await page.waitForTimeout(250);
        violations.push(...(await auditStaticPage(page, `${route} (${name})`)));
      }
    }
  } catch (err) {
    console.error('Could not run retina edge check:', err);
    process.exit(2);
  } finally {
    await browser.close();
  }

  if (violations.length === 0) {
    console.log(
      `PASS: 0 retina edge violations across ${opts.routes.join(', ')} (${opts.theme}, 2x).`,
    );
    process.exit(0);
  }

  console.error(`FAIL: ${violations.length} retina edge violation(s):\n`);
  for (const v of violations) {
    console.error(`  [${v.check}] ${v.context}`);
    console.error(`    ${v.selector}`);
    console.error(`    ${v.detail}\n`);
  }
  process.exit(1);
}

void main();
