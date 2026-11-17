import { expect, test } from '@playwright/test';

test('controls workbench renders the process header examples', async ({
  page,
}) => {
  const response = await page.goto('/workbench/controls');

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'Control states' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Process header' }),
  ).toBeVisible();
});
