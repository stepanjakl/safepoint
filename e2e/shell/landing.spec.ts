import { expect, test } from '@playwright/test';

/*
  The root is not a page: a first visit opens the workspace, a return opens
  the process last open, and a query opens a process, carried with it.
*/
test('a first visit to the root opens the workspace', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/workspace$/);
});

test('a query opens a process, with the query carried', async ({ page }) => {
  await page.goto('/?run=run-104');
  await expect(page).toHaveURL(/\/processes\/[a-z-]+\?run=run-104$/);
});

test('the root opens the process last open', async ({ page }) => {
  for (const process of ['brunch-orders', 'brunch-orders-direct']) {
    await page.goto(`/processes/${process}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'No run selected' }),
    ).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(new RegExp(`/processes/${process}$`));
  }
});
