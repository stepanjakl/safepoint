import { expect, test } from '@playwright/test';

// The build-in-the-open page: every step renders and the buttons are there to
// press. The draft and live reads need credentials, so they are not run here.
test('Brunch weekend shows the read and rulebook steps', async ({ page }) => {
  await page.goto('/examples/avocado-toast');
  await expect(page.getByRole('button', { name: 'Read sheet' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Draft rulebook' }),
  ).toBeVisible();
});
