import { expect, test } from '@playwright/test';

test('arriving steps receive pointer input after their open body fades in', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/workbench/run');
  const player = page.getByRole('region', { name: 'Player' });
  const steps = player.locator('.thread-step');
  const existing = await steps.count();
  await player.getByRole('button', { name: 'Next' }).click();

  const step = steps.nth(existing);
  const body = step.locator('.thread-step-body');
  await expect(step).toHaveCSS('pointer-events', 'none');
  await expect(body).toHaveCSS('pointer-events', 'none');
  const opacityWhenInteractive = await body.evaluate(async (element) => {
    const style = getComputedStyle(element);
    while (style.pointerEvents === 'none')
      await new Promise(requestAnimationFrame);
    return style.opacity;
  });
  expect(opacityWhenInteractive).toBe('1');
});

test('long thread folds and open-body resizes have bounded motion', async ({
  page,
}) => {
  await page.goto('/workbench/run');
  // The run workbench's stages, held still: the player and the draft above
  // them can run slowed.
  const step = page
    .locator('section[aria-labelledby="every-stage"] .thread-step')
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
  await expect(fold).toHaveCSS('transition-duration', '0.4375s');
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

  // An open-body resize keeps the cap and reads the fold's current curve.
  await fold.evaluate((element) =>
    element.style.setProperty(
      '--ease-fold',
      'cubic-bezier(0.25, 0.1, 0.25, 1)',
    ),
  );
  const resizeTiming = await body.evaluate(async (element) => {
    const content = document.createElement('div');
    content.style.height = '2000px';
    element.append(content);
    for (let frame = 0; frame < 20; frame++) {
      await new Promise(requestAnimationFrame);
      const animation = element.parentElement?.getAnimations()[0];
      if (animation) {
        const timing = animation.effect?.getTiming();
        return { duration: timing?.duration, easing: timing?.easing };
      }
    }
    return null;
  });
  expect(resizeTiming).toEqual({
    duration: 350,
    easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  });
  await fold.evaluate((element) => element.style.removeProperty('--ease-fold'));
  await expect
    .poll(() => clip.evaluate((element) => element.getAnimations().length))
    .toBe(0);

  await fold.evaluate((element) =>
    element.removeAttribute('data-measured-duration'),
  );
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(fold).toHaveAttribute('data-measured-duration', '438');
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
