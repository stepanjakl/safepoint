import { expect, test } from '@playwright/test';

/*
  The root is not a page: it opens the process last open, or else the first
  one waiting on a review, carrying any query with it.
*/
test('the root opens the process last open', async ({ page }) => {
  await page.goto('/?run=run-104');
  await expect(page).toHaveURL(/\/examples\/promotion\?run=run-104$/);

  await page.goto('/examples/support');
  await expect(
    page.getByRole('heading', { level: 1, name: 'No run selected' }),
  ).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL(/\/examples\/support$/);
});
