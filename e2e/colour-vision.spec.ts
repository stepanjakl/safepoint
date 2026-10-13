import { writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import {
  distinguishable,
  summarise,
} from '../scripts/colour-theme/perceptual/contracts.ts';
import {
  deltaE2000,
  simulate,
  wcag,
  type Deficiency,
} from '../scripts/colour-theme/perceptual/metrics.ts';
import { FILTER_TABS } from '../scripts/colour-theme/perceptual/recipes/filter-tabs.ts';
import {
  openAt,
  sampleFill,
  withDeficiency,
} from '../scripts/colour-theme/perceptual/runner.ts';
import type {
  Finding,
  Reading,
} from '../scripts/colour-theme/perceptual/types.ts';

/*
  Tier 2 of docs/interface/COLOUR-TESTING.md: other eyes and other palettes.
  Pixels are read back from screenshots, because only the screenshot shows what
  an emulated deficiency or a forced palette did to a colour.
*/
const DEFICIENCIES: Deficiency[] = [
  'protanopia',
  'deuteranopia',
  'tritanopia',
  'achromatopsia',
];
const THEMES = ['light', 'dark'] as const;

const strip = (page: import('@playwright/test').Page, surface: string) =>
  page.locator(
    `[data-surface="${surface}"] [data-strip="default"] .field-track`,
  );

async function pillTopPixel(
  page: import('@playwright/test').Page,
  surface: string,
) {
  const box = await strip(page, surface)
    .locator('.review-tab-indicator')
    .boundingBox();
  if (!box) throw new Error('No chosen pill');
  return sampleFill(page, {
    x: box.x + box.width / 2 - 2,
    y: box.y + 1,
    width: 4,
    height: 4,
  });
}

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === 'dark', 'the themes run inside the test');
});

test('forced colours keep the chosen tab visible', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  const failures: string[] = [];
  for (const theme of THEMES) {
    await openAt(page, FILTER_TABS.path, { theme });
    for (const surface of FILTER_TABS.surfaces) {
      const track = strip(page, surface);
      await track.locator('[data-review-filter="blocked"]').click();
      await page.mouse.move(0, 0);
      const pill = await pillTopPixel(page, surface);
      const unselected = await track
        .locator('[data-review-filter="ready"]')
        .boundingBox();
      if (!unselected) throw new Error('No unselected tab');
      const rest = await sampleFill(page, {
        x: unselected.x + unselected.width / 2 - 2,
        y: unselected.y + 1,
        width: 4,
        height: 4,
      });
      const ink = await track
        .locator('[data-selected]')
        .evaluate((element) => getComputedStyle(element).color);
      const apart = deltaE2000(pill, rest);
      const ratio = wcag(ink, pill);
      if (apart < 20)
        failures.push(
          `${theme}/${surface}: pill ΔE ${apart.toFixed(1)} from a plain tab`,
        );
      if (ratio < 4.5)
        failures.push(
          `${theme}/${surface}: ink ${ratio.toFixed(2)}:1 on the pill`,
        );
    }
  }
  expect(failures).toEqual([]);
});

test('the pills stay apart under colour-vision deficiency, and our simulation matches Chromium', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const findings: Finding[] = [];
  const mismatches: string[] = [];
  for (const theme of THEMES) {
    await openAt(page, FILTER_TABS.path, { theme });
    for (const kind of ['none', ...DEFICIENCIES] as const) {
      await withDeficiency(page, kind, async () => {
        const seen: Reading[] = [];
        const plain: Record<string, string> = {};
        for (const group of FILTER_TABS.tones.concat(['deferred' as never])) {
          const track = strip(page, 'canvas');
          await track.locator(`[data-review-filter="${group}"]`).click();
          await page.mouse.move(0, 0);
          const colour = await pillTopPixel(page, 'canvas');
          seen.push({
            component: FILTER_TABS.component,
            theme,
            family: 'graphite',
            surface: 'canvas',
            strip: 'default',
            group,
            state: `pill-seen-${kind}`,
            colour,
            ref: colour,
          });
          plain[group] = await track
            .locator('.review-tab-indicator')
            .evaluate((element) => {
              const [top] = getComputedStyle(element).backgroundImage.match(
                /(?:rgba?|color|oklab|oklch|lab|lch)\([^)]*\)/g,
              )!;
              return top!;
            });
        }
        if (kind !== 'none') {
          for (const reading of seen) {
            const expected = simulate(plain[reading.group]!, kind);
            const distance = deltaE2000(expected, reading.colour);
            if (distance > 8)
              mismatches.push(
                `${theme}/${kind}/${reading.group}: simulated vs Chromium ΔE ${distance.toFixed(1)}`,
              );
          }
          findings.push(
            ...distinguishable(seen, {
              id: `distinguishable:${kind}`,
              minimumDeltaE: 8,
              minimumLightness: 0.05,
            }),
          );
        }
      });
    }
  }
  const { advisory, total } = summarise(findings);
  for (const finding of advisory) {
    testInfo.annotations.push({
      type: 'colour-advisory',
      description: `${finding.id} ${finding.where}: ${finding.detail}`,
    });
  }
  const report = process.env.COLOUR_VISION_REPORT;
  if (report)
    writeFileSync(report, JSON.stringify({ findings, mismatches }, null, 1));
  expect(mismatches, `simulation drift across ${total} comparisons`).toEqual(
    [],
  );
});
