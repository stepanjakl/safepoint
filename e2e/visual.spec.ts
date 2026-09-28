/*
  What every element paints, compared with a committed baseline.

    pnpm check:visual          compare against e2e/visual-baseline/
    pnpm check:visual:update   re-record it, after an intended change

  Each element's colours, shadows, opacity and box are read from the live page
  in thirteen states and both themes. A difference fails with the element, the
  property, and the old and new values -- the check that caught a stray tile
  outline, a dead brand colour and a contrast shift in the colour refactor.

  Colours are compared as the 8-bit value a display receives, so a change in
  how a colour is written (oklab against rgb) is not a difference, and a
  change of one 8-bit step is. Boxes are rounded to half a pixel.

  The baseline is machine-specific in one respect: text metrics come from the
  installed fonts and the platform's rasteriser. Record it on the machine that
  checks it.
*/
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

const UPDATE = process.env.UPDATE_VISUAL === '1';
const BASELINE_DIR = new URL('./visual-baseline/', import.meta.url);

const SCENARIOS = {
  home: async () => {},
  workspace: async (page: Page) => {
    await page
      .getByRole('button', { name: 'Back to workspace menu', exact: true })
      .click();
    await expect(
      page.getByRole('navigation', { name: 'Workspace' }),
    ).toBeVisible();
  },
  'row-hover': async (page: Page) => {
    await page
      .getByRole('navigation', { name: 'Processes' })
      .getByRole('link', { name: 'Support handoff', exact: true })
      .hover();
  },
  arrange: async (page: Page) => {
    await page.getByRole('button', { name: 'Arrange processes' }).click();
    await expect(
      page.getByRole('button', { name: 'Save order' }),
    ).toBeVisible();
  },
  search: async (page: Page) => {
    await page
      .getByRole('button', { name: 'Search processes', exact: true })
      .click();
    await page
      .getByRole('searchbox', { name: 'Search processes' })
      .fill('Promotion');
  },
  review: async (page: Page) => {
    await page.getByRole('button', { name: 'Review release' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByText('Loading item details…', { exact: true }),
    ).toBeHidden();
  },
  tooltip: async (page: Page) => {
    await page
      .getByRole('button', { name: 'Search processes', exact: true })
      .focus();
    await expect(page.locator('.app-tooltip')).toBeVisible();
  },
  'input-detail': async (page: Page) => {
    await page
      .getByRole('button', { name: /^Inputs/ })
      .first()
      .click();
    await page
      .locator('.process-panels')
      .getByRole('button', { name: /^Supply position/ })
      .click();
    await expect(
      page
        .locator('.drawer-aside')
        .getByRole('heading', { name: 'Supply position' }),
    ).toBeVisible();
  },
  instructions: async (page: Page) => {
    await page
      .getByRole('button', { name: /^Instructions/ })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Instructions' }),
    ).toBeVisible();
  },
  outputs: async (page: Page) => {
    await page
      .getByRole('button', { name: /^Outputs/ })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { level: 2, name: /^Outputs/ }),
    ).toBeVisible();
  },
  support: async () => {},
  states: async () => {},
  // Every control in every interaction state, pinned once hydrated.
  controls: async (page: Page) => {
    await expect(
      page.locator('section[aria-label="Button"] [data-hovered]').first(),
    ).toBeAttached();
  },
} satisfies Record<string, (page: Page) => Promise<void>>;

const ROUTES: Partial<Record<keyof typeof SCENARIOS, string>> = {
  support: '/examples/support',
  states: '/examples/states',
  controls: '/workbench/controls',
};

/* What shows a route has rendered: the shell's search button, or for a
   workbench page outside the shell, its heading. */
const READY: Partial<Record<keyof typeof SCENARIOS, (page: Page) => Locator>> =
  {
    controls: (page) =>
      page.getByRole('heading', { level: 1, name: 'Control states' }),
  };

/* The properties recorded, in a fixed order: records are stored as arrays. */
const PROPS = [
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'border-bottom-color',
  'box-shadow',
  'opacity',
  '--control-face-top',
  '--control-face-bottom',
  '--control-ring-top',
  '--control-highlight',
  'box',
] as const;

type Recorded = { values: string[]; label: string };
type Capture = Record<string, Record<string, Recorded>>;

async function capture(page: Page): Promise<Record<string, Recorded>> {
  return page.evaluate(
    (props) => {
      const canvas = document.createElement('canvas').getContext('2d', {
        willReadFrequently: true,
      })!;
      // The 8-bit colour a display receives, whatever syntax produced it.
      const hex = (colour: string) => {
        canvas.clearRect(0, 0, 1, 1);
        canvas.fillStyle = '#000';
        canvas.fillStyle = colour;
        canvas.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
        return a === 0
          ? 'transparent'
          : `#${[r, g, b, ...(a === 255 ? [] : [a])]
              .map((n) => n!.toString(16).padStart(2, '0'))
              .join('')}`;
      };
      const colours = (value: string) =>
        value.replace(
          /(?:rgba?|hsla?|oklab|oklch|lab|lch|color)\([^()]*(?:\([^()]*\)[^()]*)*\)/g,
          hex,
        );
      const half = (n: number) => (Math.round(n * 2) / 2).toString();
      const out: Record<string, { values: string[]; label: string }> = {};
      const skip =
        '[aria-label="Design and motion controls"], #locatorjs-wrapper, script, style';
      const pathOf = (element: Element) => {
        const parts: string[] = [];
        for (
          let node: Element | null = element;
          node && node !== document.body;
          node = node.parentElement
        ) {
          parts.unshift(
            String(Array.from(node.parentElement!.children).indexOf(node)),
          );
        }
        return `${parts.join('.')}:${element.tagName.toLowerCase()}`;
      };
      for (const element of document.querySelectorAll('body *')) {
        if (element.closest(skip)) continue;
        const path = pathOf(element);
        const html = element as HTMLElement;
        const label = [
          html.dataset.component,
          html.dataset.part,
          (element.getAttribute('class') ?? '')
            .split(' ')
            .slice(0, 3)
            .join(' '),
          (element.textContent ?? '').trim().slice(0, 30),
        ]
          .filter(Boolean)
          .join(' · ');
        for (const pseudo of [null, '::before', '::after'] as const) {
          const style = getComputedStyle(element, pseudo);
          if (pseudo ? style.content === 'none' : style.display === 'none')
            continue;
          const values = props.map((prop) => {
            if (prop === 'box') {
              if (pseudo) return '';
              const box = element.getBoundingClientRect();
              return [box.x, box.y, box.width, box.height].map(half).join(' ');
            }
            const value = style.getPropertyValue(prop).trim();
            return prop === 'opacity' ? value : colours(value);
          });
          out[pseudo ? `${path}${pseudo}` : path] = { values, label };
        }
      }
      return out;
    },
    PROPS as unknown as string[],
  );
}

/* Paths, value strings and whole records are each stored once and referenced
   by index, so near-identical states cost little more than one. */
function encode(captured: Capture) {
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  const intern = (value: string) => {
    let index = stringIndex.get(value);
    if (index === undefined) {
      index = strings.push(value) - 1;
      stringIndex.set(value, index);
    }
    return index;
  };
  const records: string[] = [];
  const recordIndex = new Map<string, number>();
  const scenarios: Record<string, [number, number][]> = {};
  for (const [scenario, elements] of Object.entries(captured)) {
    scenarios[scenario] = Object.entries(elements).map(([path, element]) => {
      const record = element.values.map(intern).join(',');
      let index = recordIndex.get(record);
      if (index === undefined) {
        index = records.push(record) - 1;
        recordIndex.set(record, index);
      }
      return [intern(path), index];
    });
  }
  return { props: PROPS, strings, records, scenarios };
}

function decode(stored: ReturnType<typeof encode>) {
  const decoded: Record<string, Record<string, string[]>> = {};
  for (const [scenario, pairs] of Object.entries(stored.scenarios)) {
    decoded[scenario] = Object.fromEntries(
      pairs.map(([path, record]) => [
        stored.strings[path]!,
        stored.records[record]!.split(',').map(
          (i) => stored.strings[Number(i)]!,
        ),
      ]),
    );
  }
  return decoded;
}

// Local only: text metrics follow the installed fonts, so a baseline recorded
// on one machine is not a baseline for another (CI skips @local-baseline).
test(
  'every element paints what the baseline recorded',
  { tag: '@local-baseline' },
  async ({ page, colorScheme }) => {
    test.setTimeout(240_000);
    const theme = colorScheme === 'dark' ? 'dark' : 'light';
    const captured: Capture = {};
    for (const [name, arrive] of Object.entries(SCENARIOS)) {
      await page.goto(ROUTES[name as keyof typeof SCENARIOS] ?? '/');
      await expect(
        READY[name as keyof typeof SCENARIOS]?.(page) ??
          page.getByRole('button', { name: 'Search processes', exact: true }),
      ).toBeVisible();
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({
        content:
          '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
      });
      await page.mouse.move(1439, 899);
      await arrive(page);
      await page.waitForTimeout(150);
      captured[name] = await capture(page);
    }

    const file = new URL(`${theme}.json`, BASELINE_DIR);
    if (UPDATE || !existsSync(file)) {
      mkdirSync(BASELINE_DIR, { recursive: true });
      writeFileSync(file, JSON.stringify(encode(captured)));
      test
        .info()
        .annotations.push({ type: 'visual', description: `recorded ${theme}` });
      return;
    }

    const baseline = decode(JSON.parse(readFileSync(file, 'utf8')));
    const differences: string[] = [];
    // One entry per element and paint change, with the scenarios it appears
    // in: a token that moves shows once, not once per element or page. A
    // change that repaints nothing -- only a custom property moved -- is
    // tallied apart, so it cannot bury the changes that did repaint.
    const changes = new Map<
      string,
      { scenarios: Set<string>; count: number }
    >();
    const variables = new Map<
      string,
      { scenarios: Set<string>; count: number }
    >();
    const added = new Map<string, string[]>();
    const gone = new Map<string, string[]>();
    const tally = (
      map: Map<string, { scenarios: Set<string>; count: number }>,
      key: string,
      scenario: string,
    ) => {
      const entry = map.get(key) ?? { scenarios: new Set(), count: 0 };
      entry.scenarios.add(scenario);
      entry.count += 1;
      map.set(key, entry);
    };
    const note = (map: Map<string, string[]>, key: string, value: string) =>
      map.set(key, [...(map.get(key) ?? []), value]);
    for (const [scenario, elements] of Object.entries(captured)) {
      const before = baseline[scenario] ?? {};
      for (const [path, { values, label }] of Object.entries(elements)) {
        const old = before[path];
        if (!old) {
          differences.push(`${scenario}  ${path}  new element  (${label})`);
          note(added, scenario, label || path);
          continue;
        }
        const changed = PROPS.flatMap((prop, index) =>
          old[index] === values[index]
            ? []
            : [`${prop}: ${old[index]} → ${values[index]}`],
        );
        if (changed.length === 0) continue;
        differences.push(
          `${scenario}  ${label || path}\n    ${changed.join('\n    ')}`,
        );
        const painted = changed.filter((line) => !line.startsWith('--'));
        if (painted.length > 0) {
          tally(
            changes,
            `${label || path}\n    ${painted.join('\n    ')}`,
            scenario,
          );
        } else {
          for (const line of changed) tally(variables, line, scenario);
        }
      }
      for (const path of Object.keys(before)) {
        if (!elements[path]) {
          differences.push(`${scenario}  ${path}  element gone`);
          note(gone, scenario, path);
        }
      }
    }

    const listed = (items: string[], limit = 3) =>
      items.slice(0, limit).join(', ') +
      (items.length > limit ? `, … ${items.length - limit} more` : '');
    const where = ({
      scenarios,
      count,
    }: {
      scenarios: Set<string>;
      count: number;
    }) =>
      `in ${listed([...scenarios], 6)}${count > scenarios.size ? ` (${count} elements)` : ''}`;
    const summary = [
      `${differences.length} visual differences. If intended, run pnpm check:visual:update.`,
      ...[...changes]
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 20)
        .map(
          ([change, entry]) =>
            `\n  ${change.replace(/\n/g, '\n  ')}\n      ${where(entry)}`,
        ),
      ...(changes.size > 20 ? [`\n  … ${changes.size - 20} more changes`] : []),
      ...(variables.size > 0
        ? [
            '\n\n  Custom properties only, nothing repainted:',
            ...[...variables].map(
              ([change, entry]) =>
                `\n    ${change}  on ${entry.count} elements ${where(entry)}`,
            ),
          ]
        : []),
      ...[...added].map(
        ([scenario, labels]) =>
          `\n  ${labels.length} new in ${scenario}: ${listed(labels)}`,
      ),
      ...[...gone].map(
        ([scenario, paths]) =>
          `\n  ${paths.length} gone from ${scenario}: ${listed(paths)}`,
      ),
    ].join('');
    if (differences.length > 0) {
      // On disk as well as in the report, for reading with other tools.
      const list = test.info().outputPath('visual-differences.txt');
      writeFileSync(list, differences.join('\n'));
      await test.info().attach('visual-differences.txt', {
        path: list,
        contentType: 'text/plain',
      });
    }
    expect(differences.length, summary).toBe(0);
  },
);
