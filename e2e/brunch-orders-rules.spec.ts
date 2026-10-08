import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Brunch orders, phase 2 (docs/BRUNCH-ORDERS-PLAN.md): after the read, the
// run shows the rules found in its instructions, each with a formula and
// examples on real products. Read-only: it loads the rules already found for
// instructions v2 (fixtures/brunch-orders/rules/), so no model is called and
// nothing is accepted or denied.

test('the rules of the instructions, with examples to confirm', async ({
  page,
}) => {
  await page.goto('/examples/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await expect(page.getByText('Waiting for you to read.')).toBeVisible();
  await page
    .getByRole('button', { name: 'Read the sheet', exact: true })
    .last()
    .click();

  // The model's reading of the intent, for the person to confirm.
  await expect(
    page.getByText('The intent, as the model reads it'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Deny: edit the instructions' }),
  ).toBeVisible();

  // One value and four rules, none approved yet.
  const items = page.getByRole('list', { name: 'Values and rules' });
  await expect(items.locator('> li')).toHaveCount(5);
  await expect(page.getByText(/^0 of 5 accepted$/)).toBeVisible();
  await expect(page.getByText('1 value, 4 rules')).toBeVisible();

  // A rule says what it is, in the instructions' words, and what happens to
  // an order that breaks it; its examples are grouped by named product, and
  // only a disagreement with the app's check is shown.
  const cases = items.getByRole('listitem', { name: 'Rule 1' });
  await expect(
    cases.getByText('From the instructions, word for word'),
  ).toBeVisible();
  await expect(cases.getByText('“Order in whole cases.”')).toBeVisible();
  await expect(cases.getByText('the order is blocked')).toBeVisible();
  await expect(cases.getByText("Check the model's verdicts")).toBeVisible();
  const examples = cases.getByRole('list', { name: 'Examples for Rule 1' });
  await expect(examples.locator('> li').first()).toContainText(
    'SD-01 [Sourdough loaf 800g]tried on both sides of the rule',
  );
  await expect(examples.getByText(/^The app’s check says/)).toHaveCount(0);
  await expect(cases.getByRole('button', { name: 'Accept' })).toBeEnabled();
  await cases.getByRole('button', { name: 'Deny' }).click();
  await expect(
    cases.getByRole('textbox', { name: 'What is wrong with Rule 1' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(cases.getByRole('button', { name: 'Deny' })).toBeFocused();
  await cases.getByText('The formula', { exact: true }).click();
  await expect(cases.getByText('order % product.case_size == 0')).toBeVisible();

  const violations = (
    await new AxeBuilder({ page }).include('ol.thread').analyze()
  ).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(violations.map((v) => v.id)).toEqual([]);
});
