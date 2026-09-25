import { expect, test } from '@playwright/test';

import {
  ALLOWLIST,
  DRIFT_DEFAULT,
  LEVEL_OPENERS,
  measureInPage,
} from '../scripts/rail-alignment/measure';

/*
  Every marked box in the sidebar sits on its guide axis, at every level. The
  same measurement `pnpm check:rail` prints, run here so it goes wherever the
  rest of the suite goes. Use the CLI to read the table; use this to hold it.
*/

/* A real 2x device, not only an emulated one: Chrome snaps a border to the
   screen's device pixels, so under emulation alone the search field's 1.5px
   edge lays out as 1px and moves its glyph half a pixel off the axis -- the
   1x case, not the 2x one this measures. The CLI launches Chrome the same way. */
test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  launchOptions: { args: ['--force-device-scale-factor=2'] },
});

for (const route of ['/examples/states', '/']) {
  test(`the sidebar sits on its axes at ${route}`, async ({
    page,
    colorScheme,
  }) => {
    test.skip(colorScheme === 'dark', 'Geometry is theme-independent.');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      try {
        localStorage.setItem('safepoint.dev.rail-guides', 'on');
      } catch {}
    });
    await page.goto(route);
    await expect(
      page.getByRole('button', { name: 'Search processes', exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.dataset.railGuides = 'on';
      return document.fonts.ready;
    });

    // In an order each opener can reach from the level before it: arranging
    // closes the field that 'search' opened.
    for (const level of [
      'processes',
      'search',
      'arrange',
      'workspace',
    ] as const) {
      const opener = LEVEL_OPENERS[level];
      // A DOM click, as the CLI does: a real pointer would leave the button
      // it pressed hovered, and the measurement is of the resting layout.
      if (opener) {
        await page.evaluate((selector) => {
          document.querySelector<HTMLElement>(selector)?.click();
        }, opener);
      }
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const report = await page.evaluate(measureInPage, {
        tolerance: 0.01,
        allowlist: ALLOWLIST,
        driftDefault: DRIFT_DEFAULT,
        selfTest: true,
        scale: 2,
      });
      expect(
        report.error,
        `${level}: the checker could not run`,
      ).toBeUndefined();
      expect(
        report.marks.length,
        `${level}: no marks measured`,
      ).toBeGreaterThan(0);
      const failing = report.marks.filter((mark) => mark.verdict === 'fail');
      expect(failing, `${level}: off its axis`).toEqual([]);
      for (const mark of report.marks.filter((m) => m.verdict === 'warn')) {
        test.info().annotations.push({
          type: 'rail warning',
          description: `${level}: ${JSON.stringify(mark)}`,
        });
      }
    }
  });
}
