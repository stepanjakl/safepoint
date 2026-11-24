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

test('the hint preserves focus and advances through keyboard activation', async ({
  page,
}) => {
  await page.goto('/workspace');
  const hint = page.locator('.walkthrough-hint');
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'open-processes');
  await expect(page.locator('body')).toBeFocused();
  await expect(page.locator('.walkthrough-backdrop')).toBeVisible();
  const processes = page.getByRole('button', { name: /^Processes/ });
  await expect(processes).toHaveAccessibleDescription(
    /review before approving/,
  );
  await processes.focus();
  await page.keyboard.press('Enter');
  const back = page.getByRole('button', { name: 'Back to workspace menu' });
  await expect(back).toBeFocused();
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'pick-process');
  // Returning to the workspace menu without leaving /workspace does not restart step 1.
  await back.click();
  await expect(processes).toBeFocused();
  await expect(hint).toHaveCount(0);
  await expect(processes).not.toHaveAttribute('aria-describedby');
  await page.reload();
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'open-processes');
  await processes.click();
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'pick-process');
});

test('step two highlights the mock run banner by default', async ({ page }) => {
  await page.goto('/workspace');
  const hint = page.locator('.walkthrough-hint');
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'open-processes');
  await page.getByRole('button', { name: /^Processes/ }).press('Enter');

  const banner = page.getByRole('button', { name: 'Try a mock run' });
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'pick-process');
  await expect(banner).toHaveAccessibleDescription(/Start a guided mock run/);
  await expect(page.locator('a.process-menu-link').first()).not.toHaveAttribute(
    'aria-describedby',
  );
  await banner.click();
  await expect(page).toHaveURL(/\/processes\/brunch-orders-direct\?run=mock-/, {
    timeout: 15_000,
  });
  await page.evaluate(() => {
    const runId = new URL(location.href).searchParams.get('run');
    sessionStorage.setItem(
      `safepoint.mock-stage.v1:${runId}`,
      'awaiting_review',
    );
    window.dispatchEvent(new StorageEvent('storage'));
  });
  await expect(hint).toHaveAttribute(
    'data-walkthrough-step',
    'review-proposal',
  );
  await expect
    .poll(() =>
      hint.evaluate((element) => {
        const arrow = element
          .querySelector('.walkthrough-arrow')
          ?.getBoundingClientRect();
        const track = document
          .querySelector('.field-track[aria-describedby]')
          ?.getBoundingClientRect();
        if (!arrow || !track) return Infinity;
        return Math.abs(
          arrow.left + arrow.width / 2 - track.left - track.width / 2,
        );
      }),
    )
    .toBeLessThanOrEqual(1);
});

test('the legacy walkthrough runs across all four steps and restarts on /workspace', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('safepoint.walkthrough.v1', 'legacy'),
  );
  // Landing directly on a process route never starts the walkthrough.
  await page.goto('/processes/brunch-orders-direct');
  const hint = page.locator('.walkthrough-hint');
  await expect(hint).toHaveCount(0);

  // Visiting /workspace starts at step 1.
  await page.goto('/workspace');
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'open-processes');
  await page.getByRole('button', { name: /^Processes/ }).click();

  // Step 2: non-deterministic process is first and targeted by the hint.
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'pick-process');
  const firstProcess = page.locator('a.process-menu-link').first();
  await expect(firstProcess).toHaveAttribute(
    'href',
    '/processes/brunch-orders-direct',
  );
  await expect(firstProcess).toHaveAccessibleDescription(/inspect its runs/);
  await firstProcess.click();

  // Step 3: start a run, with a true pill cutout matching the button box.
  await expect(page).toHaveURL(/\/processes\/brunch-orders-direct$/);
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'start-run');
  await expect
    .poll(async () =>
      page.locator('.walkthrough-cutout').evaluate((cutout) => {
        const start = document.querySelector('button[aria-label="Start run"]');
        const pill = start?.parentElement;
        if (!pill) return false;
        const box = pill.getBoundingClientRect();
        const expectedRadius = Math.min(box.width, box.height) / 2;
        if (cutout instanceof SVGRectElement) {
          return (
            Math.abs(Number(cutout.getAttribute('x')) - box.x) < 0.5 &&
            Math.abs(Number(cutout.getAttribute('y')) - box.y) < 0.5 &&
            Math.abs(Number(cutout.getAttribute('width')) - box.width) < 0.5 &&
            Math.abs(Number(cutout.getAttribute('height')) - box.height) <
              0.5 &&
            Math.abs(Number(cutout.getAttribute('rx')) - expectedRadius) <
              0.5 &&
            Math.abs(Number(cutout.getAttribute('ry')) - expectedRadius) < 0.5
          );
        }
        const halo = 6;
        const c = cutout.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(cutout).borderRadius) || 0;
        return (
          Math.abs(c.x - (box.x - halo)) < 0.5 &&
          Math.abs(c.y - (box.y - halo)) < 0.5 &&
          Math.abs(c.width - (box.width + halo * 2)) < 0.5 &&
          Math.abs(c.height - (box.height + halo * 2)) < 0.5 &&
          Math.abs(radius - (expectedRadius + halo)) < 0.5
        );
      }),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Start run with a note' }).click();
  await expect(hint).toHaveCount(0);
  // Closing the popover keeps step 3 completed rather than reopening it.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(hint).toHaveCount(0);
  await page.getByRole('button', { name: 'Start run with a note' }).click();
  await page.getByRole('button', { name: 'Start mock run' }).click();

  // Step 4: review and decide shows during the mock run once proposals arrive.
  const stageSelect = page.getByRole('combobox', { name: 'Mock run stage' });
  const reviewValue = await stageSelect
    .locator('option', { hasText: /Awaiting review/i })
    .first()
    .getAttribute('value');
  expect(reviewValue).not.toBeNull();
  await stageSelect.selectOption(reviewValue!);
  await expect(hint).toHaveAttribute(
    'data-walkthrough-step',
    'review-proposal',
  );
  // Step 4's cutout matches the filter track on all sides, and tooltip + arrow track scroll.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const cutout = document.querySelector('.walkthrough-cutout');
        const track = document.querySelector('.field-track');
        const arrow = document.querySelector(
          '.walkthrough-hint .app-tooltip-arrow',
        );
        if (!cutout || !track || !arrow) return false;
        const box = track.getBoundingClientRect();
        const arrowBox = arrow.getBoundingClientRect();
        const expectedRadius = Math.min(box.width, box.height) / 2;
        const arrowCenter = arrowBox.left + arrowBox.width / 2;
        const arrowAligned =
          arrowCenter >= box.left && arrowCenter <= box.right;
        if (cutout instanceof SVGRectElement) {
          return (
            Math.abs(Number(cutout.getAttribute('x')) - box.x) < 1 &&
            Math.abs(Number(cutout.getAttribute('y')) - box.y) < 1 &&
            Math.abs(Number(cutout.getAttribute('width')) - box.width) < 1 &&
            Math.abs(Number(cutout.getAttribute('height')) - box.height) < 1 &&
            Math.abs(Number(cutout.getAttribute('rx')) - expectedRadius) < 1 &&
            Math.abs(Number(cutout.getAttribute('ry')) - expectedRadius) < 1 &&
            arrowAligned
          );
        }
        const halo = 6;
        const c = cutout.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(cutout).borderRadius) || 0;
        return (
          Math.abs(c.x - (box.x - halo)) < 1 &&
          Math.abs(c.y - (box.y - halo)) < 1 &&
          Math.abs(c.width - (box.width + halo * 2)) < 1 &&
          Math.abs(c.height - (box.height + halo * 2)) < 1 &&
          Math.abs(radius - (expectedRadius + halo)) < 1 &&
          arrowAligned
        );
      }),
    )
    .toBe(true);
  await page.getByRole('button', { name: /Approve all/ }).click();
  await expect(hint).toHaveCount(0);

  // Returning to /workspace after finishing starts the walkthrough again.
  await page.getByRole('button', { name: 'Back to workspace menu' }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'open-processes');
});

test('clicking outside hides the current step without cancelling later steps', async ({
  page,
}) => {
  await page.goto('/workspace');
  const hint = page.locator('.walkthrough-hint');
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'open-processes');

  // Clicking outside step 1 hides it immediately.
  await page.locator('main').click();
  await expect(hint).toHaveCount(0);

  // Opening Processes still reveals step 2.
  await page.getByRole('button', { name: /^Processes/ }).click();
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'pick-process');

  // Clicking outside step 2 hides it without cancelling step 3.
  await page.locator('main').click();
  await expect(hint).toHaveCount(0);
  await page
    .locator('a.process-menu-link[href="/processes/brunch-orders-direct"]')
    .click();
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'start-run');

  // Clicking outside step 3 hides it immediately.
  await page.locator('main').click();
  await expect(hint).toHaveCount(0);
});

test('dismissing any step completes the whole walkthrough until returning to /workspace', async ({
  page,
}) => {
  await page.goto('/workspace');
  const hint = page.locator('.walkthrough-hint');
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'open-processes');
  await page.getByRole('button', { name: /^Processes/ }).click();
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'pick-process');

  // Dismiss step 2: later steps must not appear on the process page.
  await page.keyboard.press('Escape');
  await expect(hint).toHaveCount(0);
  await page
    .locator('a.process-menu-link[href="/processes/brunch-orders-direct"]')
    .click();
  await expect(page).toHaveURL(/\/processes\/brunch-orders-direct$/);
  await expect(hint).toHaveCount(0);

  // Returning to /workspace restarts the walkthrough from step 1.
  await page.getByRole('button', { name: 'Back to workspace menu' }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(hint).toHaveAttribute('data-walkthrough-step', 'open-processes');
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
    // A phone keeps the menu in a drawer: the hint follows it there.
    await page.getByRole('button', { name: 'Menu' }).click();
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
          if (cutout instanceof SVGRectElement) {
            return (
              Number(cutout.getAttribute('x')) === box.x &&
              Number(cutout.getAttribute('y')) === box.y &&
              Number(cutout.getAttribute('width')) === box.width &&
              Number(cutout.getAttribute('height')) === box.height
            );
          }
          const halo = 6;
          const c = cutout.getBoundingClientRect();
          return (
            Math.abs(c.x - (box.x - halo)) < 0.5 &&
            Math.abs(c.y - (box.y - halo)) < 0.5 &&
            Math.abs(c.width - (box.width + halo * 2)) < 0.5 &&
            Math.abs(c.height - (box.height + halo * 2)) < 0.5
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
