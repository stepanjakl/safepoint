import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { definitionSetSchema } from '@/lib/definitions/types';

// Brunch orders, phase 2 (docs/processes/brunch-orders/PLAN.md): after the read, the
// run shows the rules found in its instructions, each with a formula and
// examples on real products. The rules are a frozen copy of those found for
// instructions v2 (e2e/fixtures/), served in place of the kept file, which a
// new draft replaces; no model is called and the decision test serves replies
// in memory.

const frozen = JSON.parse(
  readFileSync('e2e/fixtures/brunch-orders-rules.json', 'utf8'),
) as unknown;
const snapshot = JSON.parse(
  readFileSync('fixtures/brunch-orders/sheet-snapshot.json', 'utf8'),
) as { valueRanges: { range: string; values: string[][] }[] };
const [, ...products] = snapshot.valueRanges[0]!.values;
const names = Object.fromEntries(products.map((row) => [row[0], row[1]]));

test.beforeEach(async ({ page }) => {
  await page.route('**/api/dev/brunch-orders/rules', async (route) => {
    const body = route.request().postDataJSON() as { action: string };
    if (body.action !== 'get') return route.continue();
    await route.fulfill({ json: { kind: 'rules', set: frozen, names } });
  });
});

test('the calculations and checks of the instructions, with examples to confirm', async ({
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

  // One calculation and four checks, in the order they read each other,
  // none approved yet.
  const definitions = page.getByRole('list', {
    name: 'Calculations and checks',
  });
  const calculations = definitions;
  const checks = definitions;
  await expect(definitions.locator('> li')).toHaveCount(5);
  await expect(page.getByText(/^0 of 5 accepted$/)).toBeVisible();
  await expect(page.getByText('1 calculation, 4 checks')).toBeVisible();

  // A calculation says what it gives, with a number per example product.
  const expected = calculations.getByRole('listitem', {
    name: 'Expected sales',
  });
  // What each kind is, in words for any process, on its pill.
  const kind = expected.getByText('Calculation', { exact: true });
  await kind.hover();
  await expect(page.locator('.app-tooltip')).toContainText(
    'A number the app works out for every record',
  );
  await expect(
    expected.getByRole('list', { name: 'Examples for Expected sales' }),
  ).toContainText('SD-01 [Sourdough loaf 800g]');

  // A check says what failing it does, in the instructions' words where it
  // can; its examples are grouped by named product, and only a disagreement
  // with the app's own run is shown.
  const cases = checks.getByRole('listitem', { name: 'Rule 1' });
  await expect(cases.getByText('Blocks the proposal')).toBeVisible();
  const rule = cases.getByRole('region', { name: 'Definition' });
  await expect(rule.getByText("The model's reading")).toBeVisible();
  await expect(rule.getByText("The model's formula")).toBeVisible();
  await expect(cases.getByRole('region', { name: 'Examples' })).toBeVisible();
  await expect(cases.getByText('“Order in whole cases.”')).toBeVisible();
  const examples = cases.getByRole('list', { name: 'Examples for Rule 1' });
  await expect(examples.locator('> li').first()).toContainText(
    'SD-01 [Sourdough loaf 800g]',
  );
  await expect(examples.getByText('Doesn’t match the model')).toHaveCount(0);
  await expect(examples.getByText('Matches the model').first()).toBeVisible();

  // A check whose formula reads a calculation links to it, and says on
  // hover what it gives.
  const reads = checks
    .getByRole('listitem', { name: 'Rule 4' })
    .getByRole('link', { name: 'values.expected_sales' });
  await expect(reads).toHaveAttribute('href', '#definition-expected_sales');
  await reads.hover();
  await expect(page.locator('.app-tooltip')).toContainText(
    'A calculation this formula reads: Expected sales. On its examples, SD-01 gives 73',
  );

  await expect(cases.getByRole('button', { name: 'Accept' })).toBeEnabled();
  await cases.getByRole('button', { name: 'Deny' }).click();
  await expect(
    cases.getByRole('textbox', { name: 'What is wrong with Rule 1' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(cases.getByRole('button', { name: 'Deny' })).toBeFocused();
  // The formula is shown as the app runs it, one condition to a line.
  await expect(
    cases.getByRole('group', { name: 'Formula of Rule 1' }),
  ).toHaveText('order % record.case_size == 0');
  const rule2 = checks.getByRole('listitem', { name: 'Rule 2' });
  const rule2Lines = rule2
    .getByRole('group', { name: 'Formula of Rule 2' })
    .locator('> div');
  await expect(rule2Lines).toHaveCount(2);
  await expect(rule2Lines.nth(1)).toHaveText(
    '|| order <= record.max_order_units',
  );

  // A new draft, by a chosen model, asks before replacing what is kept.
  await expect(page.getByLabel('Model')).toHaveValue('gemini-3.8-flash');
  const redraft = page.getByRole('button', { name: 'Draft a new rulebook' });
  await redraft.click();
  await expect(
    page.getByText(/^This replaces the 5 definitions kept/),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Replace the rulebook' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(redraft).toBeFocused();

  const violations = (
    await new AxeBuilder({ page }).include('ol.thread').analyze()
  ).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(violations.map((v) => v.id)).toEqual([]);
});

test('accepted intent and rule keep the pressed button in place', async ({
  page,
}) => {
  let current = definitionSetSchema.parse(frozen);
  await page.route('**/api/dev/brunch-orders/rules', async (route) => {
    const body = route.request().postDataJSON() as {
      action: string;
      decision?: string;
      id?: string;
    };
    if (body.action === 'intent' || body.action === 'decide')
      await new Promise((resolve) => setTimeout(resolve, 250));
    if (body.action === 'intent')
      current = { ...current, intentConfirmedAt: new Date().toISOString() };
    if (body.action === 'decide' && body.decision === 'accept')
      current = {
        ...current,
        definitions: current.definitions.map((definition) =>
          definition.id === body.id
            ? { ...definition, approvedAt: new Date().toISOString() }
            : definition,
        ),
      };
    await route.fulfill({ json: { kind: 'rules', set: current, names } });
  });

  await page.goto('/examples/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await page.getByRole('button', { name: 'Read the sheet' }).last().click();

  const intent = page
    .getByRole('button', { name: 'Accept', exact: true })
    .first();
  const intentElement = await intent.elementHandle();
  await intent.click();
  await expect(
    page.getByText('Working… writing one can take a minute.'),
  ).toHaveCount(0);
  const acceptedIntent = page.getByRole('button', { name: 'Accepted' }).first();
  await expect(acceptedIntent).toHaveAttribute('data-phase', 'done');
  await expect(acceptedIntent).toBeFocused();
  expect(
    await page.evaluate(
      ([before, after]) => before === after,
      [intentElement, await acceptedIntent.elementHandle()],
    ),
  ).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Deny: edit the instructions' }),
  ).toHaveCount(0);

  const rule = page
    .getByRole('list', { name: 'Calculations and checks' })
    .getByRole('listitem', { name: 'Rule 1' });
  const waiting = rule.locator('.rules-status-out');
  await expect(waiting).toContainText('Waiting for you');
  const waitingElement = await waiting.elementHandle();
  const acceptRule = rule.getByRole('button', { name: 'Accept', exact: true });
  await acceptRule.scrollIntoViewIfNeeded();
  const beforeAccept = await rule.boundingBox();
  const ruleElement = await acceptRule.elementHandle();
  await acceptRule.click();
  await expect(acceptRule).toHaveAttribute('aria-disabled', 'true');
  const duringAccept = await rule.boundingBox();
  expect(beforeAccept).not.toBeNull();
  expect(duringAccept).not.toBeNull();
  if (beforeAccept && duringAccept)
    expect(duringAccept.y).toBeCloseTo(beforeAccept.y, 0);
  await expect(
    page.getByText('Working… writing one can take a minute.'),
  ).toHaveCount(0);
  const acceptedRule = rule.getByRole('button', { name: 'Accepted' });
  await expect(acceptedRule).toHaveAttribute('data-phase', 'done');
  await expect(acceptedRule).toBeFocused();
  await expect(waiting).toHaveAttribute('data-accepted', '');
  await expect(waiting).toHaveAttribute('aria-hidden', 'true');
  await expect(waiting).toHaveCSS('opacity', '0');
  expect(
    await page.evaluate(
      ([before, after]) => before === after,
      [waitingElement, await waiting.elementHandle()],
    ),
  ).toBe(true);
  const afterAccept = await rule.boundingBox();
  expect(afterAccept).not.toBeNull();
  if (beforeAccept && afterAccept) {
    expect(afterAccept.y).toBeCloseTo(beforeAccept.y, 0);
    expect(afterAccept.height).toBeCloseTo(beforeAccept.height, 0);
  }
  expect(
    await page.evaluate(
      ([before, after]) => before === after,
      [ruleElement, await acceptedRule.elementHandle()],
    ),
  ).toBe(true);
  await expect(rule.getByRole('button', { name: 'Deny' })).toHaveCount(0);
  await expect(rule.getByRole('button', { name: 'Write again' })).toHaveCount(
    0,
  );
  await expect(page.getByText(/^1 of 5 accepted$/)).toBeVisible();
});
