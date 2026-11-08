import { expect, test } from '@playwright/test';

test('the corner dismiss appears on hover and keyboard focus', async ({
  page,
}) => {
  await page.goto('/workspace');
  const hint = page.locator('.walkthrough-hint');
  const dismiss = page.getByRole('button', {
    name: 'Dismiss walkthrough hint',
  });
  await expect(hint).toBeVisible();
  await expect(dismiss).toHaveCSS('opacity', '0');
  await hint.hover();
  await expect(dismiss).toHaveCSS('opacity', '1');
  const corner = await hint.boundingBox();
  const button = await dismiss.boundingBox();
  expect(corner).not.toBeNull();
  expect(button).not.toBeNull();
  if (!corner || !button)
    throw new Error('The callout and dismiss button must be visible');
  expect(button.x + button.width / 2).toBeLessThan(corner.x + corner.width);
  expect(button.x + button.width / 2).toBeGreaterThan(
    corner.x + corner.width - button.width / 2,
  );
  expect(button.y + button.height / 2).toBeGreaterThan(corner.y);
  expect(button.y + button.height / 2).toBeLessThan(
    corner.y + button.height / 2,
  );
  await page.mouse.move(
    button.x + button.width + 4,
    button.y + button.height / 2,
  );
  await expect(dismiss).toHaveAttribute('data-hovered', 'true');
  await expect(dismiss).toHaveCSS('opacity', '1');
  await page.mouse.move(1000, 800);
  await expect(dismiss).toHaveCSS('opacity', '0');
  await dismiss.focus();
  await expect(dismiss).toHaveCSS('opacity', '1');
  await dismiss.press('Enter');
  await expect(hint).toHaveCount(0);
});

test('the arrow lines up with the title and both layers animate out', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/workspace');
  const hint = page.locator('.walkthrough-hint');
  const backdrop = page.locator('.walkthrough-backdrop');
  await expect(hint).toBeVisible({ timeout: 15_000 });
  await expect(hint).not.toHaveAttribute('data-entering');
  await expect
    .poll(async () =>
      hint.evaluate((element) => {
        const arrow = element
          .querySelector('.app-tooltip-arrow')
          ?.getBoundingClientRect();
        const heading = element.querySelector('h2')?.getBoundingClientRect();
        if (!arrow || !heading) return Infinity;
        return Math.abs(
          arrow.top + arrow.height / 2 - heading.top - heading.height / 2,
        );
      }),
    )
    .toBeLessThanOrEqual(1);
  await hint.hover();
  await page.getByRole('button', { name: 'Dismiss walkthrough hint' }).click();
  await expect(hint).toHaveAttribute('data-exiting', 'true');
  await expect(backdrop).toHaveAttribute('data-state', 'closing');
  const calloutDuration = await hint.evaluate(
    (element) => getComputedStyle(element).animationDuration,
  );
  await expect(backdrop).toHaveCSS('animation-duration', calloutDuration);
  await expect(hint).toHaveCount(0);
  await expect(backdrop).toHaveCount(0);
  await page.reload();
  await expect(hint).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Escape');
  await expect(hint).toHaveCount(0);
  await expect(backdrop).toHaveCount(0);
});

test('the hint preserves focus and completes through keyboard activation', async ({
  page,
}) => {
  await page.goto('/workspace');
  const hint = page.locator('.walkthrough-hint');
  await expect(hint).toBeVisible();
  await expect(page.locator('body')).toBeFocused();
  await expect(page.locator('.walkthrough-backdrop')).toBeVisible();
  const processes = page.getByRole('button', { name: /^Processes/ });
  await expect(processes).toHaveAccessibleDescription(
    /review the changes before approving them/,
  );
  await processes.focus();
  await page.keyboard.press('Enter');
  await expect(hint).toHaveCount(0);
  await expect(page.locator('.walkthrough-backdrop')).toHaveCount(0);
  const back = page.getByRole('button', { name: 'Back to workspace menu' });
  await expect(back).toBeFocused();
  await back.click();
  await expect(processes).toBeFocused();
  await expect(hint).toHaveCount(0);
  await expect(processes).not.toHaveAttribute('aria-describedby');
  await page.reload();
  await expect(hint).toBeVisible();
  await processes.click();
  await expect(hint).toHaveCount(0);
  await expect(page.locator('.walkthrough-backdrop')).toHaveCount(0);
});

test('Escape and the dismiss control close the hint without trapping focus', async ({
  page,
}) => {
  await page.goto('/workspace');
  const hint = page.locator('.walkthrough-hint');
  await expect(hint).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(hint).toHaveCount(0);
  await expect(page.locator('body')).toBeFocused();
  await page.reload();
  await expect(hint).toBeVisible();
  const processes = page.getByRole('button', { name: /^Processes/ });
  await processes.focus();
  const dismiss = page.getByRole('button', {
    name: 'Dismiss walkthrough hint',
  });
  // The non-modal portal participates in the document's natural tab order.
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press('Tab');
    if (await dismiss.evaluate((button) => button === document.activeElement))
      break;
  }
  await expect(dismiss).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dismiss).not.toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dismiss).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(hint).toHaveCount(0);
  await expect(processes).toBeFocused();
  await processes.click();
  await expect(
    page.getByRole('navigation', { name: 'Processes' }),
  ).toBeVisible();
});

test('the pointer fits narrow layouts and follows resizing in both themes', async ({
  page,
}) => {
  await page.goto('/workspace');
  const hint = page.locator('.walkthrough-hint');
  await expect(hint).toHaveAttribute('data-placement', 'right');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => localStorage.setItem('safepoint.dev.theme', theme),
      theme,
    );
    await page.reload();
    await expect(hint).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(hint).toHaveAttribute('data-placement', 'bottom');
    await expect
      .poll(async () =>
        hint.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            rect.top >= 0 &&
            rect.bottom <= innerHeight
          );
        }),
      )
      .toBe(true);
    await expect
      .poll(async () =>
        page.locator('.walkthrough-cutout').evaluate((cutout) => {
          const button = document.querySelector('.workspace-menu-entry');
          if (!button) return false;
          const box = button.getBoundingClientRect();
          return (
            Number(cutout.getAttribute('x')) === box.x &&
            Number(cutout.getAttribute('y')) === box.y &&
            Number(cutout.getAttribute('width')) === box.width &&
            Number(cutout.getAttribute('height')) === box.height
          );
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: `/tmp/safepoint-walkthrough-${theme}-mobile.png`,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(hint).toHaveAttribute('data-placement', 'right');
    await page.screenshot({
      path: `/tmp/safepoint-walkthrough-${theme}-desktop.png`,
    });
  }
});
