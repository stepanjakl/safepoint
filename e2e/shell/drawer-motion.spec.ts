import { expect, test } from '@playwright/test';

test('the mobile menu finishes fading its scrim on open and dismiss', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workspace');
  await page.evaluate(() => {
    document.addEventListener('transitionrun', (event) => {
      const overlay = event.target;
      if (
        !(overlay instanceof HTMLElement) ||
        !overlay.classList.contains('drawer-overlay') ||
        event.propertyName !== 'background-color'
      ) {
        return;
      }
      const fade = overlay
        .getAnimations()
        .find(
          (animation) =>
            animation instanceof CSSTransition &&
            animation.transitionProperty === event.propertyName,
        );
      const phase = overlay.hasAttribute('data-exiting') ? 'exit' : 'enter';
      void fade?.finished.then(
        () => {
          document.documentElement.dataset.scrimFinished = phase;
        },
        () => {},
      );
    });
  });

  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  const overlay = page.locator('.drawer-overlay');
  const root = page.locator('html');

  await menu.click();
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
  await expect(root).toHaveAttribute('data-scrim-finished', 'enter');

  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);
  await expect(root).toHaveAttribute('data-scrim-finished', 'exit');
  await expect(menu).toBeFocused();

  await menu.click();
  await expect(root).toHaveAttribute('data-scrim-finished', 'enter');
  await overlay.click({ position: { x: 380, y: 400 } });
  await expect(overlay).toHaveCount(0);
  await expect(menu).toBeFocused();
});
