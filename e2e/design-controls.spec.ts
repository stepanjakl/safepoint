import { expect, test } from '@playwright/test';

test('moved design controls scroll within the remaining viewport height', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    localStorage.setItem(
      'safepoint.dev.controls-position',
      JSON.stringify({ left: 100, top: 300 }),
    );
  });
  await page.goto('/examples/promotion?run=run-104');
  const panel = page.locator('.sp-devctl');
  const toggle = panel.getByRole('button', { name: 'Design controls' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect
    .poll(() =>
      panel.evaluate((element) => element.getBoundingClientRect().bottom),
    )
    .toBeLessThanOrEqual(592);
  const body = panel.locator('.tp-rotv > .tp-rotv_c');
  const headerTop = await toggle.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  await body.hover();
  await page.mouse.wheel(0, 1000);
  await expect
    .poll(() => body.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(
    panel.getByRole('button', { name: 'Reset defaults' }),
  ).toBeInViewport();
  await expect(toggle).toBeInViewport();
  expect(
    await toggle.evaluate((element) => element.getBoundingClientRect().top),
  ).toBe(headerTop);

  const header = await toggle.boundingBox();
  if (!header) throw new Error('Design controls header has no bounds');
  const grip = {
    x: header.x + header.width / 2,
    y: header.y + header.height / 2,
  };
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x, grip.y + 150, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() =>
      toggle.evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBe(headerTop + 150);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.focus();
  await page.keyboard.press('ArrowDown');
  await expect
    .poll(() =>
      toggle.evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBe(headerTop + 166);
  await expect(toggle).toBeInViewport();
});

test('design controls can be moved, persisted, and reset', async ({ page }) => {
  await page.goto('/examples/promotion?run=run-104');
  await page.evaluate(() =>
    localStorage.removeItem('safepoint.dev.controls-position'),
  );
  await page.reload();

  const panel = page.locator('.sp-devctl');
  const toggle = panel.getByRole('button', { name: 'Design controls' });
  await expect(toggle).toBeVisible();
  await expect(page.locator('#sp-devctl-move-help')).toHaveCSS(
    'clip',
    'rect(0px, 0px, 0px, 0px)',
  );

  const before = await panel.boundingBox();
  if (!before) throw new Error('Design controls panel has no bounds');
  const start = { x: before.x + before.width / 2, y: before.y + 12 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 120, start.y - 90, { steps: 8 });
  await page.mouse.up();

  const moved = await panel.boundingBox();
  expect(moved?.x).toBe(before.x - 120);
  expect(moved?.y).toBe(before.y - 90);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem('safepoint.dev.controls-position'),
      ),
    )
    .not.toBeNull();

  await page.reload();
  await expect(toggle).toBeVisible();
  const restored = await panel.boundingBox();
  expect(restored?.x).toBe(moved?.x);
  expect(restored?.y).toBe(moved?.y);

  await toggle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await panel.boundingBox())?.x)
    .toBe((restored?.x ?? 0) - 16);
  await page.keyboard.press('Shift+ArrowUp');
  await expect
    .poll(async () => (await panel.boundingBox())?.y)
    .toBe((restored?.y ?? 0) - 64);
  await page.keyboard.press('Home');
  const reset = await panel.boundingBox();
  expect(reset?.x).toBe(before.x);
  expect(reset?.y).toBe(before.y);
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem('safepoint.dev.controls-position'),
      ),
    )
    .toBeNull();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
