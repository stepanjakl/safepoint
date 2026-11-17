import { expect, test } from '@playwright/test';

test('only titles animate, with shared playback and independent replay', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/workbench/section-transitions');
  await page.getByRole('button', { name: '0.25×', exact: true }).click();
  const next = page.getByRole('button', { name: 'Next section', exact: true });
  await next.focus();
  await next.press('Enter');
  await expect(next).toBeFocused();
  await expect(
    page.getByRole('heading', { name: 'Instructions', exact: true }),
  ).toHaveCount(9);
  const samples = await page
    .locator('.section-motion-preview')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const title = element.querySelector('[data-part="title"]');
        const animations = element.getAnimations({ subtree: true });
        const animation = animations.find(
          (entry) =>
            entry.effect instanceof KeyframeEffect &&
            entry.effect.target === title,
        );
        return {
          start: animation?.startTime,
          duration: animation?.effect?.getTiming().duration,
          onlyTitle: animations.every(
            (entry) =>
              entry.effect instanceof KeyframeEffect &&
              entry.effect.target instanceof Element &&
              entry.effect.target.closest(
                '[data-part="title"], [data-part="old"]',
              ) !== null,
          ),
        };
      }),
    );
  expect(samples.every((sample) => sample.onlyTitle)).toBe(true);
  expect(samples[1]?.duration).toBeGreaterThan(0);
  expect(samples[1]?.start).toBe(samples[6]?.start);

  await page.getByRole('button', { name: '0.5×', exact: true }).click();
  await page
    .getByRole('button', { name: 'Replay Vertical exchange', exact: true })
    .click();
  const duration = await page
    .locator('[data-option="window"] [data-part="title"]')
    .evaluate(
      (element) => element.getAnimations()[0]?.effect?.getTiming().duration,
    );
  expect(duration).toBe(Number(samples[1]?.duration) / 2);

  await page
    .getByRole('button', { name: 'Settings', exact: true })
    .press('Space');
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toHaveCount(9);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test('reduced motion changes titles immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/workbench/section-transitions');
  await page.getByRole('button', { name: 'Inputs', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Inputs', exact: true }),
  ).toHaveCount(9);
  const running = await page
    .locator('.section-motion-preview')
    .evaluateAll(
      (elements) =>
        elements
          .flatMap((element) => element.getAnimations({ subtree: true }))
          .filter((animation) => animation.playState === 'running').length,
    );
  expect(running).toBe(0);
});

test('bands align and each title animation has a distinct signature', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/workbench/section-transitions');
  await page.getByRole('button', { name: '0.25×', exact: true }).click();
  await page.getByRole('button', { name: 'Instructions', exact: true }).click();
  const signatures = await page
    .locator('.section-motion-preview')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const title = element.querySelector('[data-part="title"]');
        const animation = title
          ?.getAnimations()
          .find(
            (entry) =>
              entry.effect instanceof KeyframeEffect &&
              entry.effect.target === title,
          );
        if (animation) animation.pause();
        return animation?.effect instanceof KeyframeEffect
          ? JSON.stringify(animation.effect.getKeyframes())
          : 'letter-morph';
      }),
    );
  expect(new Set(signatures).size).toBe(9);
  const tracking = await page
    .locator('[data-option="tracking"] [data-part="title"]')
    .evaluate((element) => {
      const animation = element.getAnimations()[0]!;
      const duration = Number(animation.effect!.getTiming().duration);
      animation.effect!.updateTiming({ fill: 'both' });
      animation.currentTime = 0;
      const start = parseFloat(getComputedStyle(element).letterSpacing);
      animation.currentTime = duration;
      const end = getComputedStyle(element).letterSpacing;
      animation.cancel();
      return { start, end, resting: getComputedStyle(element).letterSpacing };
    });
  expect(tracking.start).toBeGreaterThan(parseFloat(tracking.resting));
  expect(tracking.end).toBe(tracking.resting);

  for (const title of ['Instructions', 'Runs']) {
    await page.getByRole('button', { name: title, exact: true }).click();
    await page.evaluate(() =>
      document.getAnimations().forEach((animation) => animation.finish()),
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const geometry = await page
        .locator('.section-motion-preview')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const band = element
              .querySelector('.sheet-head')!
              .getBoundingClientRect();
            const title = element
              .querySelector('[data-part="title"]')!
              .getBoundingClientRect();
            const old = element
              .querySelector('[data-part="old"]')!
              .getBoundingClientRect();
            return {
              inset: title.left - band.left,
              centre: (title.top + title.bottom - band.top - band.bottom) / 2,
              oldCentre: (old.top + old.bottom - band.top - band.bottom) / 2,
              height: band.height,
            };
          }),
        );
      for (const item of geometry) {
        expect(item.inset).toBe(geometry[0]?.inset);
        expect(Math.abs(item.centre)).toBeLessThanOrEqual(0.5);
        expect(item.oldCentre).toBeCloseTo(item.centre, 1);
        expect(item.height).toBe(geometry[0]?.height);
      }
    }
  }
});
