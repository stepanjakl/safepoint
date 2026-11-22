import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import type { Calculation, CrossCheck } from '@/lib/engine/calculate';
import { definitionSetSchema } from '@/lib/engine/types';

import {
  asKeptRulebook,
  call,
  seedKeptRulebooks,
  startKeptRun,
} from '../support/kept-runs';
import { rulesReply, type RulesKept } from '../support/rules';
import { mockProcedure } from '../support/trpc';

// Brunch orders, phase 3 (docs/processes/brunch-orders/PLAN.md): with every
// rule accepted, Calculate works each value out for every record, and the
// model can cross-check them; the Rules and Inputs tabs show the rulebook and
// the sheet's tabs. Replies are frozen copies (e2e/fixtures/): the accepted
// rulebook, and the engine's calculation on the captured read. The
// cross-check is served in memory, so no model is called.

const accepted = definitionSetSchema.parse(
  JSON.parse(readFileSync('e2e/fixtures/brunch-orders-accepted.json', 'utf8')),
);
const frozen = JSON.parse(
  readFileSync('e2e/fixtures/brunch-orders-calculation.json', 'utf8'),
) as Calculation;
// The screen pins the rulebook a calculation is on, and the server keeps a
// pin only for a revision kept for the run's instructions.
const calculation = asKeptRulebook(frozen, frozen.fingerprint);

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

// Two revisions: the first accepted, then migrated when a column's type
// changed.
const history: RulesKept['history'] = {
  head: calculation.fingerprint,
  revisions: [
    {
      id: calculation.fingerprint,
      parent: 'd23a4c56d75b',
      reason: 'migrated',
      at: '2026-10-12T16:19:54.000Z',
      schemaVersion: 1,
      note: 'ripe read as a yes/no column',
      changes: null,
    },
    {
      id: 'd23a4c56d75b',
      parent: null,
      reason: 'accepted',
      at: '2026-10-12T00:30:27.000Z',
      schemaVersion: 1,
      note: null,
      changes: null,
    },
  ],
};

type Pinned = { rulebook?: string };

// Set by a test: the rulebook a run pinned no longer fits its read.
let stale = false;
// Set by a test: the accepted rulebook has moved on from the run's.
let current = calculation.fingerprint;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('safepoint.dev.run-debug', 'on');
  });
  await seedKeptRulebooks(page);
  stale = false;
  current = calculation.fingerprint;
  await mockProcedure(page, 'rules.get', {
    data: rulesReply(accepted, { history }),
  });
  // Propose is its own spec's: here it has simply not been asked for.
  await mockProcedure(page, 'propose.get', {
    data: {
      kind: 'proposal',
      fingerprint: calculation.fingerprint,
      names: {},
      calculated: { calculations: [], rows: {} },
      proposal: null,
      progress: null,
    },
  });
  const answer =
    <C extends CrossCheck | null>(withCheck: C) =>
    (input: Pinned) =>
      stale && input.rulebook
        ? {
            data: {
              kind: 'stale' as const,
              rulebook: input.rulebook,
              problems: [
                {
                  id: 'order_ripe_avocados_limit',
                  name: 'Ripe avocados limit',
                  problem: 'no such overload: bool == string',
                },
              ],
              current: calculation.fingerprint,
            },
          }
        : {
            data: {
              kind: 'calculation' as const,
              calculation,
              check: withCheck,
              current,
            },
          };
  await mockProcedure(page, 'calculate.get', answer(null));
  await mockProcedure(page, 'calculate.crossCheck', answer(check));
});

async function readTheSheet(page: Page) {
  await page.goto('/processes/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await expect(page.getByText('Waiting for you to read.')).toBeVisible();
  await page
    .getByRole('button', { name: 'Read the sheet', exact: true })
    .last()
    .click();
}

test('a saved run opens with its completed steps already settled', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const process = 'brunch-orders';
  const run = await startKeptRun(page, process);
  const read = await call<{ id: string }>(page, 'read.keep', {
    source: 'captured',
  });
  await call(page, 'runs.record', {
    process,
    runId: run.id,
    readId: read.id,
    rulebook: calculation.fingerprint,
  });
  const { promise, resolve } = Promise.withResolvers<void>();
  const rules = await mockProcedure(page, 'rules.get', async () => {
    await promise;
    return { data: rulesReply(accepted, { history }) };
  });
  await mockProcedure(page, 'calculate.get', {
    data: { kind: 'calculation', calculation, check, current },
  });

  await page.goto(`/processes/${process}?run=${run.id}`);
  const thread = page.locator('ol.thread');
  try {
    await expect.poll(() => rules.inputs.length).toBeGreaterThan(0);
    await expect(thread).toBeHidden();
  } finally {
    resolve();
  }
  const firstVisible = await page.waitForFunction(() => {
    const thread = document.querySelector('ol.thread');
    if (!thread?.getClientRects().length) return;
    return Array.from(thread.querySelectorAll('.thread-step'), (step) => ({
      latest: step.hasAttribute('data-latest')
        ? step.querySelector('.thread-step-toggle')?.textContent
        : null,
      foldMoving: Boolean(
        step.querySelector('.thread-step-fold')?.getAnimations().length,
      ),
    }));
  });
  const steps = await firstVisible.jsonValue();
  expect(steps?.flatMap((step) => step.latest ?? [])).toEqual(['Propose']);
  expect(steps?.some((step) => step.foldMoving)).toBe(false);
  await expect(
    thread.getByRole('img', { name: 'Rules. Complete.' }),
  ).toBeVisible();
  await expect(
    thread.getByRole('button', { name: 'Rules', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await expect(
    thread.getByRole('button', { name: 'Propose', exact: true }).first(),
  ).toHaveAttribute('aria-expanded', 'true');
  await thread.getByRole('button', { name: 'Calculate', exact: true }).click();
  const match = thread.locator('.calc-value', {
    hasText: ', the model gives 64.2',
  });
  await expect(match).toBeAttached();
  await expect(match).toHaveCSS('animation-name', 'none');
});

test('every value worked out for every record, cross-checked by the model', async ({
  page,
}) => {
  await readTheSheet(page);
  await expect(page.getByText('All rules accepted').first()).toBeVisible();
  // Once the values are worked out the run moves on to Propose; reopen them.
  await expect(page.getByText('Not proposed').first()).toBeVisible();
  await page
    .locator('button.thread-step-toggle', { hasText: /^Calculate/ })
    .click();
  const table = page.getByRole('table', {
    name: 'Values worked out for every record',
  });
  // A header row, then a row per record, each with its folded working.
  await expect(table.locator('tbody > tr')).toHaveCount(
    calculation.rows.length * 2,
  );
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

  // Only the records that differ, on asking.
  await page
    .getByRole('radiogroup', { name: 'Records to show' })
    .getByRole('radio', { name: /^Records that don’t match the model/ })
    .click();
  await expect(table.getByRole('rowheader')).toHaveCount(1);
  await expect(table.getByRole('rowheader', { name: /^AV-RR/ })).toBeVisible();

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
  // The revisions are in a drawer, newest first, the current one marked.
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const revisions = page.getByRole('list', {
    name: 'Rulebook revisions, newest first',
  });
  const migrated = revisions.getByRole('button', { name: /^Migrated/ });
  await expect(migrated).toHaveCount(2);
  await expect(migrated.first()).toContainText('Current');
});

test('a run whose rules no longer fit its read can move to the current ones', async ({
  page,
}) => {
  await readTheSheet(page);
  await expect(page.getByText('Not proposed').first()).toBeVisible();
  // The run has pinned the rulebook it calculated on; that one now fails.
  stale = true;
  await page.reload();
  await page
    .locator('button.thread-step-toggle', { hasText: /^Calculate/ })
    .click();
  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'no longer fit the data it read' });
  await expect(alert).toContainText('Ripe avocados limit');
  await alert.getByRole('button', { name: 'Use the current rules' }).click();
  await expect(
    page.getByRole('table', { name: 'Values worked out for every record' }),
  ).toBeVisible();
});

test('a run calculated on earlier rules says so, and can move to the current ones', async ({
  page,
}) => {
  await readTheSheet(page);
  await expect(page.getByText('Not proposed').first()).toBeVisible();
  // The accepted rules are no longer the ones the values come from.
  current = 'ffffffffffff';
  await page.reload();
  await page
    .locator('button.thread-step-toggle', { hasText: /^Calculate/ })
    .click();
  const note = page.getByRole('note').filter({
    hasText: 'rules accepted for these instructions have changed',
  });
  await expect(note).toBeVisible();
  current = calculation.fingerprint;
  await note
    .getByRole('button', { name: 'Calculate on the current rules' })
    .click();
  await expect(note).toHaveCount(0);
});

test('the Inputs tab lists the sheet’s tabs and opens what was read', async ({
  page,
}) => {
  await page.goto('/processes/brunch-orders');
  await page
    .locator('header.process-header')
    .getByRole('button', { name: /^Inputs/ })
    .click();
  const tabs = page.getByRole('list', { name: /: tabs$/ }).first();
  await expect(tabs.locator('> li')).toHaveCount(5);
  await tabs.getByRole('button', { name: /^Stock,/ }).click();
  const drawer = page.getByRole('dialog');
  await expect(
    drawer.getByRole('region', { name: 'Stock, as read' }),
  ).toBeVisible();
  await expect(drawer.getByRole('columnheader', { name: 'sku' })).toBeVisible();
});
