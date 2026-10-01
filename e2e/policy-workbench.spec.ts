import { expect, test } from '@playwright/test';

test('policy workbench compares all lines and evaluates a keyboard trial', async ({
  page,
}) => {
  await page.goto('/workbench/policy');
  await expect(
    page.getByRole('heading', { name: 'Release checks, in the open' }),
  ).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(28);
  await expect(
    page.getByText(
      'The current blocking checks agree with every reviewed replay eligibility.',
    ),
  ).toBeVisible();
  await expect(page.getByText(/Gate obligations: all 27 agree/)).toBeVisible();
  await expect(page.getByText(/Finding codes: all 27 agree/)).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Product' })
    .selectOption('ALD-0008');
  await expect(
    page.getByText('Earlier requested top-up: 430 units.'),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Product' })
    .selectOption('ALD-0001');

  const reviewText = await page.getByText(/^Review: /).textContent();
  const reviewAt = Date.parse(reviewText?.replace('Review: ', '') ?? '');
  expect(Math.abs(Date.now() - reviewAt)).toBeLessThan(120_000);

  await expect(page.getByText('£0.10 per unit · confirmed')).toBeVisible();
  await page
    .getByRole('spinbutton', { name: 'Proposed price, pence' })
    .fill('190');
  await page.getByRole('button', { name: 'Evaluate trial' }).click();
  await expect(
    page.getByText(
      'Confirmed-funding margin 5.3% = (190p price − 190p cost + 10p confirmed funding) ÷ 190p; floor 15%.',
      { exact: true },
    ),
  ).toBeVisible();

  await page
    .getByRole('combobox', { name: 'Product' })
    .selectOption('ALD-0010');
  await expect(page.getByText('Recorded AI judgement · replay')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'release', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Treatment: individual approval required/),
  ).toBeVisible();
  await page.getByText('Seven gate obligations').click();
  await expect(
    page.getByRole('columnheader', { name: 'Agent assessment' }),
  ).toBeVisible();

  await page
    .getByRole('combobox', { name: 'Product' })
    .selectOption('ALD-0023');
  await expect(page.getByRole('heading', { name: 'Mozzarella' })).toBeVisible();
  await expect(
    page.getByText(/Considered plans: £2.25 and 240 top-up units/),
  ).toBeVisible();
  const topUp = page.getByRole('spinbutton', { name: 'Top-up, units' });
  await expect(topUp).toHaveValue('240');
  await topUp.fill('160');
  await topUp.press('Enter');
  await expect(
    page.getByRole('status').getByText('ALD-0023 trial evaluated: blocked.'),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Forecast plus safety stock needs 660 units; 420 are covered before top-up. Shortfall 240, proposed top-up 160.',
      { exact: true },
    ),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Restore reviewed values' }).click();
  await expect(topUp).toHaveValue('240');
  await page.getByRole('combobox', { name: 'Clock' }).selectOption('fixture');
  await expect(page.getByText('Review: 2026-09-03T07:45:00Z')).toBeVisible();
});

test('policy workbench keeps the table within the mobile viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workbench/policy');
  await expect(
    page.getByRole('heading', { name: 'All 27 candidates' }),
  ).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});
