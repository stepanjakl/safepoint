import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import type { Calculation, CrossCheck } from '@/lib/definitions/calculate';

// Brunch orders, phase 3 (docs/processes/brunch-orders/PLAN.md): with every
// rule accepted, Calculate works each value out for every record, and the
// model can cross-check them; the Rules and Inputs tabs show the rulebook and
// the sheet's tabs. Replies are frozen copies (e2e/fixtures/): the accepted
// rulebook, and the engine's calculation on the captured read. The
// cross-check is served in memory, so no model is called.

const accepted = JSON.parse(
  readFileSync('e2e/fixtures/brunch-orders-accepted.json', 'utf8'),
) as unknown;
const calculation = JSON.parse(
  readFileSync('e2e/fixtures/brunch-orders-calculation.json', 'utf8'),
) as Calculation;

// The model agrees everywhere but one value: it did not round up.
const check: CrossCheck = {
  fingerprint: calculation.fingerprint,
  readId: 'test',
  model: 'stand-in',
  at: '2026-10-09T12:00:00.000Z',
  cells: Object.fromEntries(
    calculation.rows.map((row) => [
      row.key,
      Object.fromEntries(
        calculation.calculations.map((c) => {
          const engine = row.values[c.id]!.value!;
          const differs = row.key === 'AV-RR' && c.id === 'expected_sales';
          return [
            c.id,
            {
              model: differs ? 64.2 : engine,
              working: differs ? 'Not rounded up.' : 'By hand.',
              agrees: !differs,
            },
          ];
        }),
      ),
    ]),
  ),
  agreed: calculation.rows.length * calculation.calculations.length - 1,
  total: calculation.rows.length * calculation.calculations.length,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/dev/brunch-orders/rules', async (route) => {
    const body = route.request().postDataJSON() as { action: string };
    if (body.action !== 'get') return route.continue();
    await route.fulfill({ json: { kind: 'rules', set: accepted, names: {} } });
  });
  await page.route('**/api/dev/brunch-orders/calculate', async (route) => {
    const body = route.request().postDataJSON() as { action: string };
    await route.fulfill({
      json: {
        kind: 'calculation',
        calculation,
        check: body.action === 'crossCheck' ? check : null,
      },
    });
  });
});

async function readTheSheet(page: Page) {
  await page.goto('/examples/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await expect(page.getByText('Waiting for you to read.')).toBeVisible();
  await page
    .getByRole('button', { name: 'Read the sheet', exact: true })
    .last()
    .click();
}

test('every value worked out for every record, cross-checked by the model', async ({
  page,
}) => {
  await readTheSheet(page);
  await expect(page.getByText('All rules accepted').first()).toBeVisible();
  const table = page.getByRole('table', {
    name: 'Values worked out for every record',
  });
  // One row per record (and, while PREVIEW_STATES is on, its preview rows).
  for (const row of calculation.rows)
    await expect(
      table.getByRole('rowheader', { name: new RegExp(`^${row.key}`) }),
    ).toBeVisible();
  await expect(
    table.getByRole('columnheader', { name: 'Expected sales' }),
  ).toBeVisible();

  // A record opens, from the keyboard, to how each of its values was worked out.
  const record = table.getByRole('button', { name: /^AV-RR/ });
  await record.focus();
  await page.keyboard.press('Enter');
  await expect(record).toHaveAttribute('aria-expanded', 'true');
  await expect(table.getByText('ceil(64.2)')).toBeVisible();

  // The model's cross-check: one value differs, said in the status and
  // marked where it is.
  await page
    .getByRole('button', { name: 'Cross-check with the model' })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'match the model' }),
  ).toContainText(`1 of ${check.total} don’t match the model`);
  await expect(table.getByText(', the model gives 64.2')).toBeAttached();
  await expect(table.getByText(', matches the model').first()).toBeAttached();
  // The step's heading says it too, where it shows with the step folded.
  await expect(
    page.locator('ol.thread').getByText('1 don’t match the model').first(),
  ).toBeVisible();
  await expect(
    table.getByRole('button', { name: /^AV-RR.*differs from the model$/ }),
  ).toBeVisible();
  await expect(table.getByText('Not rounded up.')).toBeVisible();

  const violations = (
    await new AxeBuilder({ page }).include('ol.thread').analyze()
  ).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(violations.map((v) => v.id)).toEqual([]);
});

test('the Rules tab shows the accepted rulebook, read-only', async ({
  page,
}) => {
  await readTheSheet(page);
  await page
    .locator('header.process-header')
    .getByRole('button', { name: 'Rules', exact: true })
    .click();
  const rules = page.getByRole('list', { name: 'Accepted rules' });
  await expect(rules.locator('> li')).toHaveCount(7);
  await expect(
    rules.getByRole('group', { name: 'Formula of Expected sales' }),
  ).toBeVisible();
  await expect(rules.getByRole('button', { name: /^Accept/ })).toHaveCount(0);
});

test('the Inputs tab lists the sheet’s tabs as the run read them', async ({
  page,
}) => {
  await readTheSheet(page);
  await page
    .locator('header.process-header')
    .getByRole('button', { name: /^Inputs/ })
    .click();
  const tabs = page.getByRole('list', { name: 'Sheet tabs' });
  await expect(tabs.locator('> li')).toHaveCount(5);
  await tabs.getByRole('button', { name: /^Stock/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Sheet data');
});
