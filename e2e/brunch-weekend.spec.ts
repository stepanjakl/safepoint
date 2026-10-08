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

// Before any proposal every order is 0, so a rule guarded by "nothing ordered"
// never tests anything; a what-if order shows it at work, from the keyboard.
test('a what-if order reruns the rules with it, and clears', async ({
  page,
}) => {
  await page.goto('/examples/avocado-toast');
  const calculate = page.getByRole('button', {
    name: 'Calculate',
    exact: true,
  });
  await expect(calculate.last()).toBeEnabled();
  await calculate.last().click();
  const rules = page.locator('summary', { hasText: 'Every rule for SD-01,' });
  await rules.first().click();
  const form = page.getByRole('form', { name: 'What if, for SD-01 (product)' });
  const order = form.getByRole('textbox').nth(1);
  await order.fill('12');
  await order.press('Enter');
  const banner = page.getByRole('status').filter({ hasText: 'What-if:' });
  await expect(banner).toContainText('SD-01');
  await expect(order).toBeFocused();
  await expect(form.getByRole('button', { name: 'Try' })).toBeEnabled();
  // The delivery condition is now reached, and holds.
  await expect(
    page
      .getByRole('list', { name: 'Conditions of rule R5' })
      .first()
      .getByRole('listitem')
      .filter({ hasText: 'delivered_at < promotion.starts_at' }),
  ).toContainText('holds:');
  await order.fill('lots');
  await order.press('Enter');
  await expect(form).toContainText('"lots" is not a number.');
  await expect(form.getByRole('button', { name: 'Try' })).toBeEnabled();
  await banner.getByRole('button', { name: 'Clear all' }).click();
  await expect(banner).toHaveCount(0);
  await expect(order).toHaveValue('');
});
