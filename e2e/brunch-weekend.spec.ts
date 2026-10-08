import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The build-in-the-open page. The draft and live reads need credentials, so
// they are not run here; the captured read and the approved rulebook are.

const action = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).last();

// A run reads the sheet once and calculates on that read, with the rulebook
// in force; the rulebook itself is drafted and approved in its own tab.
test('a run reads, calculates on its read, and points to the Rulebook tab', async ({
  page,
}) => {
  await page.goto('/examples/avocado-toast');
  const calculate = action(page, 'Calculate');
  await expect(calculate).toBeDisabled();
  await expect(
    page.getByText('Read the sheet first: a run calculates on its own read.'),
  ).toBeVisible();

  await action(page, 'Read the sheet').click();
  await expect(page.getByText(/^\d+ tabs, read /)).toBeVisible();
  await expect(calculate).toBeEnabled();
  await calculate.click();
  await expect(page.getByText(/on the captured read of/)).toBeVisible();
  await expect(page.getByText(/^of \d+ items$/)).toBeVisible();

  // From the keyboard, the run's Rulebook step opens the tab where it lives.
  const open = page.getByRole('button', { name: 'Open the Rulebook tab' });
  await open.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('region', { name: 'Rulebook', exact: true });
  await expect(panel.getByRole('heading', { name: /In force/ })).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Draft a rulebook' }),
  ).toBeVisible();
});

// Before any proposal every order is 0, so a rule guarded by "nothing ordered"
// never tests anything; a what-if order shows it at work, from the keyboard.
test('a what-if order reruns the rules with it, and clears', async ({
  page,
}) => {
  await page.goto('/examples/avocado-toast');
  await action(page, 'Read the sheet').click();
  await expect(action(page, 'Calculate')).toBeEnabled();
  await action(page, 'Calculate').click();
  await page
    .getByRole('list', { name: 'Items and their rules' })
    .locator('summary', { hasText: 'SD-01' })
    .first()
    .click();
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

// Nothing serious or critical for assistive technology, in the run with an
// item open and in the Rulebook tab; both themes run as separate projects.
test('the run and the Rulebook tab pass an accessibility scan', async ({
  page,
}) => {
  const serious = async (include: string) =>
    (await new AxeBuilder({ page }).include(include).analyze()).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);

  await page.goto('/examples/avocado-toast');
  await action(page, 'Read the sheet').click();
  await expect(action(page, 'Calculate')).toBeEnabled();
  await action(page, 'Calculate').click();
  await page
    .getByRole('list', { name: 'Items and their rules' })
    .locator('summary')
    .first()
    .click();
  expect(await serious('ol.thread')).toEqual([]);

  await page.getByRole('button', { name: 'Open the Rulebook tab' }).click();
  await expect(
    page.getByRole('region', { name: 'Rulebook', exact: true }),
  ).toBeVisible();
  expect(await serious('section[aria-labelledby="policy-heading"]')).toEqual(
    [],
  );
});
