import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import type { Calculation } from '@/lib/definitions/calculate';
import type { Proposal } from '@/lib/definitions/types';

// Brunch orders, Propose and Apply (docs/processes/brunch-orders/PLAN.md):
// with every rule accepted and the values worked out, the model proposes for
// every record and a person decides each; Apply shows what would be written.
// Replies are frozen copies (e2e/fixtures/), held to the engine by
// lib/definitions/e2e-fixtures.test.ts; no model is called.

const fixture = (name: string) =>
  JSON.parse(readFileSync(`e2e/fixtures/${name}`, 'utf8')) as unknown;
const accepted = fixture('brunch-orders-accepted.json');
const calculation = fixture('brunch-orders-calculation.json') as Calculation;
const frozen = fixture('brunch-orders-proposal.json') as {
  names: Record<string, string>;
  calculated: unknown;
  proposal: Proposal;
  trials: Record<string, Record<string, unknown>>;
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/dev/brunch-orders/rules', async (route) => {
    const body = route.request().postDataJSON() as { action: string };
    if (body.action !== 'get') return route.continue();
    await route.fulfill({ json: { kind: 'rules', set: accepted, names: {} } });
  });
  await page.route('**/api/dev/brunch-orders/calculate', (route) =>
    route.fulfill({
      json: {
        kind: 'calculation',
        calculation,
        check: null,
        current: calculation.fingerprint,
      },
    }),
  );
  await page.route('**/api/dev/brunch-orders/propose', (route) => {
    const body = route.request().postDataJSON() as {
      action: string;
      key?: string;
      values?: { order: number };
    };
    if (body.action === 'check')
      return route.fulfill({
        json: {
          kind: 'check',
          ...(frozen.trials[body.key!]?.[String(body.values!.order)] as object),
        },
      });
    return route.fulfill({
      json: {
        kind: 'proposal',
        fingerprint: frozen.proposal.fingerprint,
        names: frozen.names,
        calculated: frozen.calculated,
        proposal: frozen.proposal,
        progress: null,
      },
    });
  });
});

async function propose(page: Page) {
  await page.goto('/examples/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await expect(page.getByText('Waiting for you to read.')).toBeVisible();
  await page
    .getByRole('button', { name: 'Read the sheet', exact: true })
    .last()
    .click();
  const table = page.getByRole('table', {
    name: 'What is proposed for every record',
  });
  await expect(table).toBeVisible({ timeout: 30_000 });
  return table;
}
const thread = (page: Page) => page.locator('ol.thread');

test('a person decides every record, and Apply shows what would be written', async ({
  page,
}) => {
  const table = await propose(page);
  // The rules collapse to one line: the Rules tab shows them.
  await expect(
    page.getByText(/Using the accepted rules: 2 calculations, 5 checks/),
  ).toBeVisible();
  await expect(
    thread(page).getByText('11 proposed · 3 need you').first(),
  ).toBeAttached();
  await expect(table.getByRole('rowheader')).toHaveCount(11);

  // What a record that blocks cannot do, and what it can.
  const chilli = table.getByRole('row', { name: /^CF-40/ });
  await expect(chilli.getByText('Blocked', { exact: true })).toBeVisible();
  await expect(chilli.getByRole('button', { name: /^Approve/ })).toBeDisabled();

  // Approve every ready one at once.
  await page.getByRole('button', { name: /^Approve all 8 ready/ }).click();
  await expect(
    thread(page).getByText('8 of 11 decided').first(),
  ).toBeAttached();

  // Change the blocked one to a whole case, from the keyboard.
  await chilli.getByRole('button', { name: 'Change' }).click();
  const order = table.getByRole('spinbutton', { name: /for CF-40/ });
  await expect(order).toBeFocused();
  await order.fill('6');
  const save = chilli.getByRole('button', { name: /Save/ });
  await expect(save).toBeEnabled();
  await save.press('Enter');
  await expect(
    chilli.getByText('Changed to order 6', { exact: true }),
  ).toBeVisible();

  // The two a person must decide: one approved, one rejected.
  await table
    .getByRole('row', { name: /^AV-RR/ })
    .getByRole('button', { name: /^Approve$/ })
    .click();
  await table
    .getByRole('row', { name: /^SD-01/ })
    .getByRole('button', { name: /^Reject$/ })
    .click();
  await expect(thread(page).getByText('All decided').first()).toBeAttached();
  await expect(
    page.getByRole('status').filter({ hasText: 'SD-01 rejected' }),
  ).toBeAttached();

  // Only what is decided to change is written: approved values, and the
  // change; leaving a record as it is writes nothing.
  const preview = page.getByRole('table', {
    name: 'What would be written, before and after',
  });
  await expect(preview).toBeVisible();
  await expect(
    page.getByText(/Approved 9, changed 1, rejected 1\./),
  ).toBeVisible();
  await expect(preview.getByRole('rowheader')).toHaveText([
    /AV-RR/,
    /FT-200/,
    /CT-250/,
    /RK-60/,
    /CF-40/,
  ]);
  await expect(
    page.getByText('Nothing is written to the sheet yet.'),
  ).toBeVisible();

  const violations = (
    await new AxeBuilder({ page }).include('ol.thread').analyze()
  ).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(violations.map((v) => v.id)).toEqual([]);
});

test('a record opens to the model’s reason and the checks’ working', async ({
  page,
}) => {
  const table = await propose(page);
  const avocados = table.getByRole('button', { name: /^AV-RR/ });
  await avocados.focus();
  await page.keyboard.press('Enter');
  await expect(avocados).toHaveAttribute('aria-expanded', 'true');
  await expect(
    table.getByText(/Unsure: Covering the target needs more/).last(),
  ).toBeVisible();
  await expect(table.getByRole('button', { name: 'Stock!B3' })).toBeVisible();
  const checks = table.getByRole('list', { name: 'Checks on AV-RR' });
  await expect(checks.getByRole('listitem')).toHaveCount(5);
  await expect(checks.getByText('62.0 >= 71.5')).toBeVisible();
});

test('the filter shows only what needs a person', async ({ page }) => {
  const table = await propose(page);
  await page
    .getByRole('radiogroup', { name: 'Records to show' })
    .getByRole('radio', { name: /^Records that need you/ })
    .click();
  await expect(table.getByRole('rowheader')).toHaveText([
    /SD-01/,
    /AV-RR/,
    /CF-40/,
  ]);
});
