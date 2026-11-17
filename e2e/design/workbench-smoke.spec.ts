import { expect, test } from '@playwright/test';

import { WORKBENCH_GROUPS } from '@/app/workbench/menu';

/*
  Every page the workbench lists, and its menu, open and draw with nothing
  written to the console. The list is the menu's own (app/workbench/menu.ts),
  so a page added there is covered without being named here. The History pages
  are the prototypes brought back from the archive; this holds that they still
  render, not that they are right.
*/
test.describe('workbench pages render', () => {
  // Not the suite's reduced motion: with it, useReducedMotion() differs
  // between the server's render and the client's on three pages (the loaders
  // and the section transitions), and React reports a hydration mismatch.
  test.use({ reducedMotion: 'no-preference' });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'light', 'Theme-independent.');
  });

  async function opens(
    page: import('@playwright/test').Page,
    href: string,
    heading?: RegExp | string,
  ) {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));
    const response = await page.goto(href);
    expect(response?.status()).toBe(200);
    // Waits for the page to have drawn, then lets what it starts settle.
    await expect(page.locator('main').first()).toBeVisible();
    if (heading) {
      await expect(
        page.getByRole('heading', { level: 1, name: heading }),
      ).toBeAttached();
    }
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  }

  test('the menu lists every page', async ({ page }) => {
    await opens(page, '/workbench', 'Workbench');
    for (const group of WORKBENCH_GROUPS) {
      await expect(
        page.getByRole('heading', { level: 2, name: group.title }),
      ).toBeVisible();
      for (const entry of group.entries) {
        await expect(
          page.locator(`a[href="${entry.href}"]`),
          entry.href,
        ).toBeVisible();
      }
    }
  });

  for (const group of WORKBENCH_GROUPS) {
    for (const entry of group.entries) {
      test(`${group.title}: ${entry.title}`, async ({ page }) => {
        // The shell's own page has no heading of its own to name: its run
        // thread is a main landmark whose title is for a screen reader.
        await opens(page, entry.href, entry.framed ? /^Run,/ : undefined);
      });
    }
  }
});
