import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import type { Calculation } from '@/lib/engine/calculate';
import {
  definitionSetSchema,
  type Application,
  type CellChange,
  type CheckVerdict,
  type Proposal,
  type Verdict,
} from '@/lib/engine/types';

import { mockDecisions } from '../support/kept-decisions';
import { asKeptRulebook, seedKeptRulebooks } from '../support/kept-runs';
import { rulesReply } from '../support/rules';
import { mockProcedure } from '../support/trpc';

// Brunch orders, Propose and Apply (docs/processes/brunch-orders/PLAN.md):
// with every rule accepted and the values worked out, the model proposes for
// every record and a person decides each; Apply shows what it writes, writes
// on confirmation and can undo. The sheet is a stand-in served here.
// Replies are frozen copies (e2e/fixtures/), held to the engine by
// lib/engine/e2e-fixtures.test.ts; no model is called.

const fixture = (name: string) =>
  JSON.parse(readFileSync(`e2e/fixtures/${name}`, 'utf8')) as unknown;
const accepted = definitionSetSchema.parse(
  fixture('brunch-orders-accepted.json'),
);
// The screen pins the rulebook a calculation is on, and the server keeps a
// pin only for a revision kept for the run's instructions.
const frozenCalculation = fixture(
  'brunch-orders-calculation.json',
) as Calculation;
const calculation = asKeptRulebook(
  frozenCalculation,
  frozenCalculation.fingerprint,
);
const frozen = asKeptRulebook(
  fixture('brunch-orders-proposal.json') as {
    names: Record<string, string>;
    calculated: {
      calculations: { id: string; name: string }[];
      rows: Record<string, Record<string, number | null>>;
    };
    proposal: Proposal;
    trials: Record<string, Record<string, unknown>>;
  },
  frozenCalculation.fingerprint,
);

let decisions: Awaited<ReturnType<typeof mockDecisions>>;
let lastChanges: CellChange[] = [];
// What the screen asked of the write: the run by its id, never decisions.
let sent: { path: string; input: object }[] = [];
let written: Application | null = null;
const applicationOf = (changes: CellChange[]): Application => ({
  proposedAt: frozen.proposal.at,
  tab: 'Orders',
  at: '2026-10-29T09:00:00.000Z',
  status: 'verified',
  error: null,
  undoneAt: null,
  range: 'A1:B6',
  before: [],
  after: [],
  changes,
  decisions: {},
});

test.beforeEach(async ({ page }) => {
  await seedKeptRulebooks(page);
  written = null;
  lastChanges = [];
  sent = [];
  await mockProcedure(page, 'rules.get', { data: rulesReply(accepted) });
  await mockProcedure(page, 'calculate.get', {
    data: {
      kind: 'calculation',
      calculation,
      check: null,
      current: calculation.fingerprint,
    },
  });
  await mockProcedure(page, 'application.write', (input) => {
    sent.push({ path: 'write', input });
    written = applicationOf(lastChanges);
    return { data: { kind: 'applied', application: written } };
  });
  await mockProcedure(page, 'application.undo', (input) => {
    sent.push({ path: 'undo', input });
    written = { ...written!, status: 'undone' };
    return { data: { kind: 'applied', application: written } };
  });
  await mockProcedure(page, 'application.preview', (body) => {
    sent.push({ path: 'preview', input: body });
    lastChanges = Object.entries(frozen.proposal.records).flatMap(
      ([key, record], index) => {
        // The server takes the decisions from its own database: the stand-in
        // reads those it holds.
        const decision = decisions.kept[key];
        const values = decision?.values ?? record.values;
        return decision && decision.kind !== 'reject' && values
          ? [
              {
                key,
                field: 'order',
                cell: `Orders!B${index + 2}`,
                before: key === 'FT-200' ? 24 : null,
                after: values.order!,
              },
            ]
          : [];
      },
    );
    return {
      data: {
        kind: 'preview',
        tab: 'Orders',
        names: frozen.names,
        notWritable: null,
        tabExists: false,
        changes: lastChanges,
        problems: [],
        newlyFailing: [],
        application: written,
      },
    };
  });
  const proposed = {
    data: {
      kind: 'proposal' as const,
      fingerprint: frozen.proposal.fingerprint,
      names: frozen.names,
      calculated: frozen.calculated,
      proposal: frozen.proposal,
      progress: null,
    },
  };
  await mockProcedure(page, 'propose.get', proposed);
  await mockProcedure(page, 'propose.start', proposed);
  // The decisions are the server's: served here as it answers them.
  decisions = await mockDecisions(
    page,
    frozen.proposal,
    (key, values) =>
      frozen.trials[key]?.[String(values.order)] as
        { verdict: Verdict; checks: CheckVerdict[] } | undefined,
  );
  await mockProcedure(page, 'propose.check', ({ key, values }) => ({
    data: {
      kind: 'check',
      ...(frozen.trials[key]?.[String(values.order)] as {
        verdict: Verdict;
        checks: CheckVerdict[];
      }),
    },
  }));
});

async function propose(page: Page) {
  await page.goto('/processes/brunch-orders');
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

for (const width of [1440, 390]) {
  test(`bulk approval stays at the bottom while reviewing at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    const table = await propose(page);
    const approve = page.getByRole('button', { name: /^Approve all 8 ready/ });
    const bar = page.getByRole('group', { name: 'Proposal summary' });
    await expect(bar).toHaveCSS('position', 'sticky');
    await table.getByRole('rowheader').first().getByRole('button').click();
    await table.evaluate((element) => {
      let scroller: Element | null = element.parentElement;
      while (
        scroller &&
        !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
      ) {
        scroller = scroller.parentElement;
      }
      scroller ??= document.scrollingElement;
      if (!scroller) throw new Error('No review scroller');
      const top =
        element.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top;
      scroller.scrollTop += top + 80;
    });
    await expect(approve).toBeInViewport();
    await approve.focus();
    await expect(approve).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    const focus = await page.locator(':focus').boundingBox();
    const bounds = await bar.boundingBox();
    expect(focus).not.toBeNull();
    expect(bounds).not.toBeNull();
    expect(focus!.y + focus!.height).toBeLessThanOrEqual(bounds!.y);
    await approve.focus();
    await page.keyboard.press('Enter');
    await expect(approve).toHaveCount(0);
    await expect(bar).toBeVisible();
    await expect(
      thread(page).getByText('8 of 11 decided').first(),
    ).toBeAttached();
  });
}

test('a person decides every record, then writes what Apply shows and can undo it', async ({
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
  // A cell that holds something says so; a new one shows a dash.
  await expect(
    preview
      .getByRole('row', { name: /^FT-200/ })
      .getByRole('cell')
      .last(),
  ).toContainText('24');
  await expect(
    preview
      .getByRole('row', { name: /^CF-40/ })
      .getByRole('cell')
      .last(),
  ).toContainText('—');

  // Writing is asked for, then confirmed, with focus on the confirmation.
  await page.getByRole('button', { name: 'Write 5 rows' }).click();
  await expect(
    page.getByText('Adds the Orders tab, with 5 rows.'),
  ).toBeVisible();
  const confirm = page.getByRole('button', { name: 'Write to the sheet' });
  await expect(confirm).toBeFocused();
  await confirm.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'read back from the sheet' }),
  ).toBeAttached();
  await expect(
    page.getByRole('table', { name: 'What was written, before and after' }),
  ).toBeVisible();
  await expect(
    thread(page).getByText('Written and read back').first(),
  ).toBeAttached();

  const undo = page.getByRole('button', { name: 'Undo the write' });
  await expect(undo).toBeFocused();
  await undo.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'back as they were' }),
  ).toBeAttached();
  await expect(
    page.getByRole('button', { name: 'Write 5 rows' }),
  ).toBeFocused();

  // The screen names the run by the id the server gave it, and sends no
  // decisions, rulebook or text of its own.
  const run = {
    process: 'brunch-orders',
    runId: expect.stringMatching(/^run-/),
  };
  expect(sent.find((one) => one.path === 'write')?.input).toEqual({
    ...run,
    acknowledged: [],
  });
  expect(sent.find((one) => one.path === 'undo')?.input).toEqual(run);
  for (const one of sent.filter((one) => one.path === 'preview'))
    expect(one.input).toEqual(run);

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
  // AV-RR has no supplier maximum: that check does not apply, and comes last.
  await expect(checks.getByRole('listitem').last()).toContainText(
    /Supplier delivery limit\s*Doesn’t apply/,
  );
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

const approveRow = (table: Locator, key: RegExp) =>
  table
    .getByRole('row', { name: key })
    .getByRole('button', { name: /^Approve$/ });

test('a decision shows at once, and counts as decided once the server has kept it', async ({
  page,
}) => {
  const table = await propose(page);
  // The server is slow to answer the next decision.
  const release = decisions.hold();
  const row = table.getByRole('row', { name: /^AV-RR/ });
  await approveRow(table, /^AV-RR/).click();
  // The row shows it at once; the step's count waits for the server.
  await expect(row.getByText('Approved', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(thread(page).getByText('1 of 11 decided')).toHaveCount(0);
  release();
  await expect(
    thread(page).getByText('1 of 11 decided').first(),
  ).toBeAttached();
});

test('a decision the server refuses is taken back and said where the step speaks', async ({
  page,
}) => {
  const table = await propose(page);
  decisions.refuseWith(
    'These decisions were made on an earlier proposal. Decide on the current one.',
  );
  const row = table.getByRole('row', { name: /^AV-RR/ });
  await approveRow(table, /^AV-RR/).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'made on an earlier proposal' }),
  ).toBeVisible();
  // Not shown as decided: the record is as the server holds it.
  await expect(row.getByRole('button', { name: /^Approve$/ })).toBeVisible();
  await expect(row.getByText('Approved', { exact: true })).toHaveCount(0);
  await expect(
    thread(page).getByText('11 proposed · 3 need you').first(),
  ).toBeAttached();
});

test('decisions are kept: a reload finds them, and undoing one takes it back', async ({
  page,
}) => {
  const table = await propose(page);
  await page.getByRole('button', { name: /^Approve all 8 ready/ }).click();
  await expect(
    thread(page).getByText('8 of 11 decided').first(),
  ).toBeAttached();
  await page.reload();
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(
    thread(page).getByText('8 of 11 decided').first(),
  ).toBeAttached();
  const first = table.getByRole('row', { name: /^FT-200/ });
  await first.getByRole('button', { name: 'Undo' }).click();
  await expect(
    thread(page).getByText('7 of 11 decided').first(),
  ).toBeAttached();
  expect(decisions.requests.map((r) => r.path)).toEqual([
    'recordMany',
    'withdraw',
  ]);
});

// A person changes CF-40 to a whole case, which the step checks after a
// short pause; what the check answers is each test's own.
async function changeChilli(page: Page) {
  const table = await propose(page);
  const chilli = table.getByRole('row', { name: /^CF-40/ });
  await chilli.getByRole('button', { name: 'Change' }).click();
  await table.getByRole('spinbutton', { name: /for CF-40/ }).fill('6');
}
const proposeAgain = (page: Page) =>
  page
    .getByRole('region', { name: 'Propose setup' })
    .getByRole('button', { name: 'Propose again' });

test('Propose waits while a check on changed values is still being answered', async ({
  page,
}) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const asked = await mockProcedure(page, 'propose.check', async () => {
    await held;
    return {
      data: {
        kind: 'check',
        ...(frozen.trials['CF-40']!['6'] as {
          verdict: Verdict;
          checks: CheckVerdict[];
        }),
      },
    };
  });
  await changeChilli(page);
  await expect.poll(() => asked.inputs.length).toBeGreaterThan(0);
  await expect(proposeAgain(page)).toBeDisabled();
  release();
  await expect(proposeAgain(page)).toBeEnabled();
});

test('a check that is refused is said where the step speaks', async ({
  page,
}) => {
  await mockProcedure(page, 'propose.check', {
    error: { code: 'BAD_GATEWAY', message: 'The rules could not be read.' },
  });
  await changeChilli(page);
  await expect(
    page.getByRole('alert').filter({ hasText: 'The rules could not be read.' }),
  ).toBeVisible();
});

test('a check that finds the rules stale offers the current ones', async ({
  page,
}) => {
  await mockProcedure(page, 'propose.check', {
    data: {
      kind: 'stale',
      rulebook: 'ab12cd34ef56',
      problems: [
        {
          id: 'order_ripe_avocados_limit',
          name: 'Ripe avocados limit',
          problem: 'no such overload: bool == string',
        },
      ],
      current: frozen.proposal.fingerprint,
    },
  });
  await changeChilli(page);
  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'no longer fit the data it read' });
  await expect(alert).toContainText('Ripe avocados limit');
  await expect(
    alert.getByRole('button', { name: 'Use the current rules' }),
  ).toBeVisible();
});
