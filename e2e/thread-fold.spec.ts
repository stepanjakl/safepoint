import { expect, test } from '@playwright/test';

test('long thread folds and open-body resizes have bounded motion', async ({
  page,
}) => {
  await page.goto('/examples/promotion?run=run-104');
  const step = page
    .locator('.thread-step')
    .filter({ has: page.locator('button.thread-step-toggle') })
    .first();
  const toggle = step.locator('button.thread-step-toggle');
  const fold = step.locator('.thread-step-fold');
  const body = step.locator('.thread-step-body');
  const clip = step.locator('.thread-step-clip');
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) === 'true')
    await toggle.click();

  // Exercise the real ResizeObserver with content taller than the viewport.
  await body.evaluate((element) => {
    const content = document.createElement('div');
    content.style.height = '2000px';
    element.append(content);
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(fold).toHaveCSS('transition-duration', '0.35s');
  await fold.evaluate((element) => {
    element.addEventListener('transitionrun', (event) => {
      if (event.target !== element) return;
      const animation = element.getAnimations()[0];
      element.setAttribute(
        'data-measured-duration',
        String(Math.round(Number(animation?.effect?.getTiming().duration))),
      );
    });
  });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(fold).toHaveAttribute('data-measured-duration', '350');
  await page.mouse.wheel(0, 300);
  await expect
    .poll(() => fold.evaluate((element) => element.getAnimations().length))
    .toBe(0);
  await expect(body).toHaveCSS('opacity', '1');

  // Changing an already-open body takes the same capped time.
  const resizeDuration = await body.evaluate(async (element) => {
    const content = document.createElement('div');
    content.style.height = '2000px';
    element.append(content);
    for (let frame = 0; frame < 20; frame++) {
      await new Promise(requestAnimationFrame);
      const animation = element.parentElement?.getAnimations()[0];
      if (animation) return animation.effect?.getTiming().duration;
    }
    return null;
  });
  expect(resizeDuration).toBe(350);
  await expect
    .poll(() => clip.evaluate((element) => element.getAnimations().length))
    .toBe(0);

  await fold.evaluate((element) =>
    element.removeAttribute('data-measured-duration'),
  );
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(fold).toHaveAttribute('data-measured-duration', '350');
  await expect
    .poll(() =>
      fold.evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBe(0);
  await expect(toggle).toBeFocused();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(body).toHaveCSS('opacity', '1');
  expect(await fold.evaluate((element) => element.getAnimations().length)).toBe(
    0,
  );
});
