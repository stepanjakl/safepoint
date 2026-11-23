import { expect, test, type Page } from '@playwright/test';

import {
  at,
  edgeFaults,
  pixels,
  SAME,
  type Edge,
} from '../support/edge-pixels';

/*
  Every place the pane's edge meets another line, read from the pixels of
  /workbench/edge-junctions, which builds the pane from the app's own parts.
  Each check names a way the edge has broken before (docs/interface/
  LINE-TESTING.md, "Causes found"):

  - a seam where the top edge runs into the notch's bend;
  - the header rule broken where the notch's foot crosses it;
  - the column divider stopping short of the rule's solid row;
  - a rule stopping a device pixel short of the pane's solid ring;
  - the side's soft row a different shade beside a band, a lit row or the
    end of the notch's turn.
*/

test.use({
  deviceScaleFactor: 2,
  launchOptions: { args: ['--force-device-scale-factor=2'] },
});

type Geometry = {
  pane: { left: number; top: number; right: number; bottom: number };
  headerBottom: number;
  headBottom: number;
  notch: { left: number; right: number };
  corner: number;
  divider: number;
};

async function geometry(page: Page, name: string): Promise<Geometry> {
  return page.locator(`[data-junctions="${name}"]`).evaluate((pane) => {
    const box = (element: Element) => element.getBoundingClientRect();
    const notch = pane.querySelector('.notch')!;
    const columns = pane.querySelector('.process-panels')!;
    const first = parseFloat(getComputedStyle(columns).gridTemplateColumns);
    // The turn's radius, resolved: the token is a length in rem.
    const probe = document.createElement('div');
    probe.style.inlineSize = 'var(--notch-corner)';
    notch.append(probe);
    const radius = probe.getBoundingClientRect().width;
    probe.remove();
    return {
      pane: box(pane).toJSON(),
      headerBottom: box(pane.querySelector('.process-header')!).bottom,
      headBottom: box(pane.querySelector('.sheet-head')!).bottom,
      notch: box(notch).toJSON(),
      corner: radius,
      divider: box(columns).left + first,
    };
  });
}

for (const mode of ['retina', 'default'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`edge junctions in ${mode} and ${theme}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((value) => {
          localStorage.setItem('safepoint.dev.theme', value);
        }, theme);
        await page.goto(`/workbench/edge-junctions?edges=${mode}`);
        expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect
          .poll(() => page.locator('html').getAttribute('data-edges'))
          .toBe(mode === 'retina' ? 'retina' : null);
        await page.evaluate(() => document.fonts.ready);
      });

      for (const name of ['band-under-turn', 'no-band']) {
        test(`${name}: every line the pane's edge meets joins it`, async ({
          page,
        }) => {
          const g = await geometry(page, name);
          const image = await pixels(
            page,
            page.locator(`[data-junctions="${name}"]`),
          );
          const y = (css: number) => (css - g.pane.top) * 2;
          const x = (css: number) => (css - g.pane.left) * 2;
          const last = image.width - 1;

          // No seam where the top edge runs into the bend: a seam is one
          // column off both its neighbours the same way; a curve only eases.
          for (let row = 0; row < 3; row++) {
            const reference = at(image, 40, row);
            const seams: number[] = [];
            for (let column = 41; column < last; column++) {
              if (Math.abs(at(image, column, row) - reference) > 12) break;
              const before =
                at(image, column, row) - at(image, column - 1, row);
              const after = at(image, column, row) - at(image, column + 1, row);
              if (
                before * after > 0 &&
                Math.min(Math.abs(before), Math.abs(after)) >= SAME
              )
                seams.push(column);
            }
            expect(seams, `top edge, row ${row}`).toEqual([]);
          }

          // The rule's solid row runs on under the notch's foot to its turn.
          const ruleRow = y(g.headerBottom - 1);
          const ruleShade = at(image, 40, ruleRow);
          const turnStart = x(g.notch.right - g.corner) - 4;
          const breaks: number[] = [];
          for (let column = 40; column < turnStart; column++)
            if (Math.abs(at(image, column, ruleRow) - ruleShade) > SAME)
              breaks.push(column);
          expect(breaks, 'the header rule under the notch').toEqual([]);

          // The divider runs up to the rule's solid row: its solid column is
          // its outer, left device pixel.
          const dividerColumn = x(g.divider) - 2;
          for (let row = ruleRow; row < ruleRow + 8; row++)
            expect(
              Math.abs(at(image, dividerColumn, row) - ruleShade),
              `divider, row ${row}`,
            ).toBeLessThanOrEqual(SAME);

          // A section head's rule with its lit line, and the divider with
          // its own, read as the pane's side does: solid, soft, sheen.
          const sideMid = y(g.pane.bottom - 30);
          const side = [0, 1, 2].map((depth) => at(image, depth, sideMid));
          const headRule = y(g.headBottom);
          const head = [-2, -1, 0].map((step) =>
            at(image, 60, headRule + step),
          );
          const divider = [-2, -1, 0].map((step) =>
            at(image, x(g.divider) + step, sideMid),
          );
          for (const [name, line] of [
            ['the section head\u2019s rule', head],
            ['the column divider', divider],
          ] as const)
            line.forEach((value, index) =>
              expect(
                Math.abs(value - side[index]!),
                `${name}, row ${index}: ${line} against the side\u2019s ${side}`,
              ).toBeLessThanOrEqual(SAME),
            );

          // Both sides and the bottom, clear of the pane's bottom corners.
          const lastRow = image.height - 1;
          const bottom = y(g.pane.bottom - 12);
          const left: Edge = (depth, along) => at(image, depth, along);
          const right: Edge = (depth, along) => at(image, last - depth, along);
          const foot: Edge = (depth, along) =>
            at(image, along, lastRow - depth);
          expect(
            edgeFaults(left, y(g.headerBottom) + 2, bottom),
            'the pane’s left side',
          ).toEqual([]);
          expect(
            edgeFaults(right, y(g.headerBottom - 1 + g.corner), bottom),
            'the pane’s right side, from the notch’s turn down',
          ).toEqual([]);
          expect(
            edgeFaults(foot, 24, last - 24),
            'the pane’s bottom, where the divider meets it',
          ).toEqual([]);
        });
      }
    });
  }
}
