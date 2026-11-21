import { expect, test } from '@playwright/test';

const REPLAY = '/workbench/history/promotion';

for (const edges of ['default', 'retina']) {
  test(`the promotion replay exposes its original inputs and outputs in ${edges}`, async ({
    page,
  }) => {
    await page.goto(`${REPLAY}?edges=${edges}`);
    await expect
      .poll(() => page.locator('html').getAttribute('data-edges'))
      .toBe(edges === 'retina' ? 'retina' : null);

    await page
      .getByRole('button', { name: /^Inputs/ })
      .first()
      .click();
    const inputs = page.getByRole('list', { name: /^Inputs/ });
    await expect(inputs.getByRole('button')).toHaveCount(9);
    const policy = inputs.getByRole('button', { name: /^Policy rules/ });
    await expect(policy).toContainText('policy-rules.json');
    await policy.press('Enter');
    const policyTitle = page.getByRole('heading', { name: 'Policy rules' });
    await expect(policyTitle).toBeFocused();
    await policyTitle.press('Escape');
    await expect(policy).toBeFocused();

    await page
      .getByRole('button', { name: /^Outputs/ })
      .first()
      .click();
    const outputs = page.getByRole('region', { name: /^Outputs/ });
    await expect(outputs.getByRole('listitem')).toHaveCount(4);
    await expect(outputs.getByText('Storefront sandbox API')).toBeVisible();
    await expect(
      outputs.getByText(
        'Simulation only. No external change would need recovery.',
      ),
    ).toBeVisible();
  });
}

test('the replay flag opens its recorded input on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 620, height: 850 });
  await page.goto(`${REPLAY}?edges=retina`);
  const flag = page.getByRole('button', { name: /open Supply position/i });
  await flag.press('Enter');

  const detail = page.getByRole('region', { name: 'Supply position' });
  await expect(
    detail.getByRole('heading', { name: 'Supply position' }),
  ).toBeFocused();
  await expect(detail.getByText('supply-position.json')).toBeVisible();
  await detail
    .getByRole('searchbox', { name: 'Filter records' })
    .fill('ALD-0009');
  await detail.locator('summary').filter({ hasText: 'ALD-0009' }).click();
  await expect(
    detail.getByText(
      'Unavailable. The latest warehouse feed did not return a trustworthy stock position for this SKU.',
      { exact: true },
    ),
  ).toBeVisible();

  await detail.getByRole('button', { name: 'Back to inputs' }).click();
  const inputs = page.getByRole('list', { name: /^Inputs/ });
  await expect(
    inputs.getByRole('button', { name: /^Supply position/ }),
  ).toBeFocused();
});
