import { expect, test, type Page } from '@playwright/test';

import {
  at,
  crossingFaults,
  edgeFaults,
  edgeStrips,
  regionPixels,
  SAME,
  surfaceFaults,
} from '../support/edge-pixels';

/*
  Every line in the app meets the edge of the surface it lies on without
  crossing it or stopping short (e2e/support/edge-pixels.ts has the three
  rules). Read on the app's pane in every tab and both soft row styles, and on
  cards with their own section rules. Inside the pane, every column divider
  meets the header's rule and each section head's rule as one line
  (crossingFaults). e2e/shell/edge-junctions.spec.ts holds
  the pane's notch and dividers on a specimen; this holds the app itself.
*/

test.use({
  deviceScaleFactor: 2,
  launchOptions: { args: ['--force-device-scale-factor=2'] },
});

async function open(page: Page, path: string, theme: string) {
  await page.addInitScript((value) => {
    localStorage.setItem('safepoint.dev.theme', value);
  }, theme);
  await page.goto(path);
  expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('html')).toHaveAttribute('data-edges', 'retina');
  await page.evaluate(() => document.fonts.ready);
  // The development toolbar sits over the bottom of the viewport.
  await page.addStyleTag({
    content: '.sp-devctl { display: none !important; }',
  });
  // Off every row, so none is lit by the pointer.
  await page.mouse.move(0, 0);
}

const TABS = [/^Runs$/, /^Instructions:/, /^Rules$/, /^Inputs:/, /^Outputs:/];

for (const softRows of ['translucent', 'opaque'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`the pane's sides and foot in every tab, ${softRows} soft rows, ${theme}`, async ({
      page,
    }) => {
      await open(page, `/processes/brunch-orders?soft-rows=${softRows}`, theme);
      const pane = page.locator('.shell-pane');
      for (const tab of TABS) {
        const button = page.getByRole('button', { name: tab });
        if (!(await button.count())) continue;
        await button.first().click();
        await page.mouse.move(0, 0);
        await expect(button.first()).toHaveAttribute('aria-current', 'true');
        // The pane's own edges, below the header and its notch's turn.
        const { top, header, turn, radius } = await pane.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const head = element
            .querySelector('.process-header')!
            .getBoundingClientRect();
          const notch = element.querySelector('.process-header .notch');
          const probe = document.createElement('div');
          probe.style.inlineSize = 'var(--notch-corner)';
          element.append(probe);
          const corner = probe.getBoundingClientRect().width;
          probe.remove();
          return {
            top: box.top,
            header: head.bottom,
            turn: notch ? head.bottom - 1 + corner : head.bottom,
            radius: parseFloat(getComputedStyle(element).borderTopLeftRadius),
          };
        });
        const sides = await edgeStrips(page, pane);
        const y = (css: number) => Math.round((css - top) * 2);
        const clear = Math.ceil(radius * 2) + 6;
        const faults = Object.fromEntries(
          Object.entries({
            // From the header's rule down: where it meets the side is a
            // junction like any other.
            left: edgeFaults(
              sides.left,
              y(header) - 2,
              sides.length.down - clear,
            ),
            right: edgeFaults(sides.right, y(turn), sides.length.down - clear),
            // The sheet scrolls under the foot: what runs out of view there
            // may stop at the soft row. Its dividers' joins are held by
            // edge-junctions.spec.ts and process-dividers.spec.ts.
            bottom: edgeFaults(
              sides.bottom,
              clear,
              sides.length.across - clear,
              { content: true },
            ),
          })
            .filter(([, found]) => found.length)
            .map(([side, found]) => [side, found.slice(0, 8)]),
        );
        expect(faults, `the pane in ${tab}`).toEqual({});
      }
    });
  }
}

// The sheets with a column divider, and the grid whose first track it ends.
const DIVIDED = [
  { tab: /^Runs$/, grid: '.process-runs' },
  { tab: /^Instructions:/, grid: '.process-panels[data-tab="instructions"]' },
];

for (const softRows of ['translucent', 'opaque'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`each column divider meets the rules it crosses, ${softRows} soft rows, ${theme}`, async ({
      page,
    }) => {
      await open(page, `/processes/brunch-orders?soft-rows=${softRows}`, theme);
      const faults: Record<string, string[]> = {};
      for (const { tab, grid } of DIVIDED) {
        await page.getByRole('button', { name: tab }).first().click();
        await page.mouse.move(0, 0);
        const sheet = page.locator(grid);
        await expect(sheet).toBeVisible();
        // The divider, the header's rule, and every head beside the divider
        // with the sides it lies on.
        const { x, crossings } = await sheet.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const divider =
            box.left +
            parseFloat(style.paddingLeft) +
            parseFloat(style.gridTemplateColumns);
          const header = document
            .querySelector('.process-header')!
            .getBoundingClientRect();
          const found = new Map<
            number,
            {
              above: boolean;
              sides: ('left' | 'right')[];
              lit: ('left' | 'right')[];
            }
          >([
            [
              header.bottom,
              { above: false, sides: ['left', 'right'], lit: [] },
            ],
          ]);
          for (const head of element.querySelectorAll('.sheet-head')) {
            const rect = head.getBoundingClientRect();
            if (!rect.height) continue;
            const side =
              Math.abs(rect.right - divider) < 2
                ? 'left'
                : Math.abs(rect.left - divider) < 2
                  ? 'right'
                  : null;
            if (!side) continue;
            const crossing = found.get(rect.bottom) ?? {
              above: true,
              sides: [],
              lit: [],
            };
            crossing.sides.push(side);
            // The row under the head lit: the rule's soft row is its fill.
            if (
              head.nextElementSibling?.matches(
                '.sheet-list:has(> li:first-child > .sheet-row:is([data-current], :hover, :focus-visible, :focus-within))',
              )
            )
              crossing.lit.push(side);
            found.set(rect.bottom, crossing);
          }
          return { x: divider, crossings: [...found] };
        });
        expect(crossings.length, `${tab}: heads found`).toBeGreaterThan(0);
        for (const [bottom, crossing] of crossings) {
          const clip = {
            x: Math.floor(x) - 8,
            y: Math.floor(bottom) - 8,
            width: 16,
            height: 16,
          };
          const image = await regionPixels(page, clip);
          // The divider's solid column is its outer, left device pixel; the
          // rule's solid row the first of its two.
          const found = crossingFaults(
            image,
            Math.round((x - clip.x) * 2) - 2,
            Math.round((bottom - clip.y) * 2) - 2,
            crossing,
          );
          if (found.length)
            faults[`${tab.source}, the rule at ${bottom}`] = found;
        }
      }
      expect(faults).toEqual({});
    });
  }
}

// A lit row's fill reaches the solid row of every line it meets: the pane's
// ring beside it, and above the first row the head's rule, with no soft row
// between. The pixel at depth 1 lies between the ring and the fill (it is the
// fill, or the translucent soft row over it); the head's soft row is the fill.
for (const softRows of ['translucent', 'opaque'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`a lit row's fill meets the solid rows round it, ${softRows} soft rows, ${theme}`, async ({
      page,
    }) => {
      await open(page, `/processes/brunch-orders?soft-rows=${softRows}`, theme);
      await page
        .getByRole('button', { name: /^Instructions:/ })
        .first()
        .click();
      await page.mouse.move(0, 0);
      const row = page.locator('.process-panel-list .sheet-row[data-current]');
      await expect(row).toBeVisible();
      const head = page.locator('.process-panel-list > .sheet-head');
      // The first row is the lit one, under the head.
      await expect(
        page.locator(
          '.process-panel-list .sheet-list > li:first-child > .sheet-row',
        ),
      ).toHaveAttribute('data-current', '');
      const pane = (await page.locator('.shell-pane').boundingBox())!;
      const box = (await row.boundingBox())!;
      const top = (await head.boundingBox())!;
      const faults: string[] = [];
      const side = await regionPixels(page, {
        x: pane.x,
        y: box.y + box.height / 2,
        width: 3,
        height: 1,
      });
      const [ring, soft, fill] = [0, 1, 2].map((x) => at(side, x, 0));
      if (
        soft < Math.min(ring!, fill!) - SAME ||
        soft > Math.max(ring!, fill!) + SAME
      )
        faults.push(`beside the row: ${ring}/${soft}/${fill}`);
      for (const x of [top.x + 40, top.x + top.width - 6]) {
        // The rule's solid row, its soft row, and the row's fill below.
        const rule = await regionPixels(page, {
          x,
          y: top.y + top.height - 1,
          width: 1,
          height: 2,
        });
        const [solid, under, below] = [0, 1, 2].map((y) => at(rule, 0, y));
        if (Math.abs(under! - below!) > SAME)
          faults.push(
            `under the head's rule at ${x}: ${solid}/${under}/${below}`,
          );
      }
      expect(faults).toEqual([]);
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`section rules meet a card's edge, ${theme}`, async ({ page }) => {
    await open(page, '/workbench/section-rules', theme);
    expect(
      await surfaceFaults(page, page.locator('[data-rule="heavy"]')),
    ).toEqual({});
  });

  test(`a definition card's rules meet its edge, ${theme}`, async ({
    page,
  }) => {
    await open(page, '/workbench/draft-progress', theme);
    const cards = page.locator('.control-face:has(> .rule-below)');
    await expect(cards.first()).toBeVisible();
    for (let index = 0; index < Math.min(3, await cards.count()); index++)
      expect(
        await surfaceFaults(page, cards.nth(index)),
        `card ${index + 1}`,
      ).toEqual({});
  });
}
