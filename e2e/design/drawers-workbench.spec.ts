import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((theme) => {
    localStorage.setItem('safepoint.dev.theme', theme);
  }, testInfo.project.name);
  await page.goto('/workbench/drawers');
});

test('live drawer supports detail swaps, scrolling and keyboard dismissal', async ({
  page,
}) => {
  await page.getByLabel('Fixed · 35rem', { exact: true }).check();
  await page.getByLabel('Metadata and long title', { exact: true }).check();
  await page.getByLabel('Scrolling body', { exact: true }).check();
  const opener = page.getByRole('button', { name: 'Open drawer', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Workbench drawer' });
  await expect(dialog).toBeVisible();
  const first = dialog.getByRole('button', { name: 'Item 1', exact: true });
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('heading', { name: /^Item 1:/ })).toBeFocused();
  await dialog.getByRole('button', { name: 'Item 3', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: /^Item 3:/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Item 2', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: /^Item 2:/ })).toBeVisible();
  const body = dialog.locator('.swap-body');
  expect(
    await body.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    body.getByRole('heading', { name: 'Section 24' }),
  ).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(dialog.locator('.drawer-aside')).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Item 2', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('narrow drawer replaces the main panel and has a reachable detail exit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open drawer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Workbench drawer' });
  await dialog.getByRole('button', { name: 'Item 1', exact: true }).click();
  await expect(dialog.locator('[data-drawer-main]')).toBeHidden();
  await expect(
    dialog.getByRole('heading', { name: 'Item 1', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Show item 2' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Item 2', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Close detail' }).click();
  await expect(dialog.locator('[data-drawer-main]')).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Close drawer', exact: true })
    .click();
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('motion previews pin real swap animations and keep heading IDs unique', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  const swaps = page
    .getByRole('region', { name: 'Drawer motion' })
    .locator('.swap-enter');
  await expect(swaps).toHaveCount(2);
  await expect
    .poll(async () =>
      swaps
        .first()
        .evaluate((element) =>
          element.getAnimations().map((animation) => animation.playState),
        ),
    )
    .toEqual(['paused']);
  const ids = await page
    .locator('[id]')
    .evaluateAll((elements) => elements.map((element) => element.id));
  expect(new Set(ids).size).toBe(ids.length);
  await page.screenshot({
    path: `/tmp/safepoint-drawers-${test.info().project.name}.png`,
    fullPage: true,
  });
});
