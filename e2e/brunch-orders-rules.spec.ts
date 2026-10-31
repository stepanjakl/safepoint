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
    await route.fulfill({
      json: {
        kind: 'rules',
        set: frozen,
        names,
        history: { head: null, revisions: [] },
      },
    });
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
  await expect(page.getByText(/^0 of 5 accepted$/).first()).toBeVisible();

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
  await expect(page.getByLabel('Model')).toHaveValue('');
  // How its quota stands, before anything spends it.
  await expect(
    page.getByText(/requests today, \d+ a minute/).first(),
  ).toBeVisible();
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
    await route.fulfill({
      json: {
        kind: 'rules',
        set: current,
        names,
        history: { head: null, revisions: [] },
      },
    });
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
  await expect(page.getByText(/^1 of 5 accepted$/).first()).toBeVisible();
});

test('a draft under way shows its last rule when it ends, through a failed request', async ({
  page,
}) => {
  const set = frozen as { definitions: Record<string, unknown>[] };
  const partial = {
    ...set,
    definitions: set.definitions.map((definition, index, all) =>
      index === all.length - 1
        ? { ...definition, formula: null, examples: [] }
        : definition,
    ),
  };
  const rules = (replied: unknown, running: boolean) => ({
    json: {
      kind: 'rules',
      set: replied,
      names,
      history: { head: null, revisions: [] },
      drafting: { step: 'Writing 5 of 5: Rule 4…', error: null, running },
    },
  });
  let asked = 0;
  await page.route('**/api/dev/brunch-orders/rules', async (route) => {
    asked += 1;
    // The page asks twice on arrival in development. Then a request fails, as
    // one does while the server recompiles, and the draft ends behind it.
    if (asked <= 2) return route.fulfill(rules(partial, true));
    if (asked === 3)
      return route.fulfill({ status: 500, body: '<!DOCTYPE html>' });
    return route.fulfill(rules(frozen, false));
  });

  await page.goto('/examples/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await page
    .getByRole('button', { name: 'Read the sheet', exact: true })
    .last()
    .click();
  await expect(page.getByText('Not written').first()).toBeVisible();
  await expect(page.getByText('Not written')).toHaveCount(0, {
    timeout: 15_000,
  });
  expect(asked).toBeGreaterThan(3);
});

test('what the model read as context is there to question', async ({
  page,
}) => {
  const set = frozen as Record<string, unknown>;
  await page.route('**/api/dev/brunch-orders/rules', (route) =>
    route.fulfill({
      json: {
        kind: 'rules',
        set: {
          ...set,
          accounting: [
            { sentence: 'We sell brunch.', kind: 'context', definitions: [] },
            {
              sentence: 'Order in whole cases.',
              kind: 'check',
              definitions: ['rule_1'],
            },
          ],
        },
        names,
        history: { head: null, revisions: [] },
      },
    }),
  );
  await page.goto('/examples/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await page
    .getByRole('button', { name: 'Read the sheet', exact: true })
    .last()
    .click();
  const aside = page.getByRole('region', { name: 'Set aside as context' });
  await expect(aside.getByRole('listitem')).toHaveText(['We sell brunch.']);
});

test('a rule’s debug drawer opens from its card and gives focus back', async ({
  page,
}) => {
  const set = frozen as { definitions: { id: string; name: string }[] };
  const rule = set.definitions[1]!;
  await page.route('**/api/dev/brunch-orders/rules', (route) => {
    const body = route.request().postDataJSON() as {
      action: string;
      inputs?: { order?: number };
    };
    if (body.action === 'debug')
      return route.fulfill({
        json: {
          kind: 'debug',
          debug: {
            summary: {
              id: rule.id,
              name: rule.name,
              result: 'check',
              consequence: 'block',
              model: 'test-model',
              written: true,
              examplesAgree: true,
              approvedAt: null,
              deniedAt: null,
              denial: null,
              problem: null,
              worksOutItself: true,
              reads: [],
              readBy: [],
            },
            source: {
              text: 'Order in whole cases.',
              sentences: [
                {
                  sentence: 'Order in whole cases.',
                  kind: 'check',
                  how: 'states',
                },
                {
                  sentence: 'We open from 07:00.',
                  kind: 'context',
                  how: 'quotes',
                },
              ],
              constants: [],
              groups: [],
              formula: 'order % record.case_size == 0',
              columns: { own: ['case_size'], through: [] },
            },
            checks: [
              {
                id: 'both-ways',
                label: 'Examples show it holding and failing',
                problems: ['No example where it fails.'],
                note: null,
              },
            ],
            read: { id: 'r', readAt: '', source: 'Captured read' },
            about: { record: 'product', key: 'sku' },
            fields: [{ id: 'order', label: 'order' }],
            inputs: { order: body.inputs?.order ?? 0 },
            records: [
              {
                key: 'SD-01',
                name: 'Sourdough',
                result: (body.inputs?.order ?? 0) === 8,
                applies: true,
                steps: [`${body.inputs?.order ?? 0} % 8 == 0`],
                error: null,
              },
            ],
          },
        },
      });
    if (body.action === 'debugDraft')
      return route.fulfill({
        json: {
          kind: 'debugDraft',
          debug: {
            version: 'v1',
            intent: 'Order enough.',
            intentConfirmedAt: null,
            model: 'test-model',
            foundAt: '',
            readId: 'r',
            accounting: [
              {
                sentence: 'We open from 07:00.',
                kind: 'context',
                definitions: [],
                quotedBy: ['rule_2'],
              },
              {
                sentence: 'Order in whole cases.',
                kind: 'check',
                definitions: ['rule_1'],
                quotedBy: [],
              },
            ],
            accountProblems: [],
            refused: ['Not accounted for: sentence 2.'],
            definitions: [],
            models: [],
            columns: {
              rules: [
                {
                  id: 'rule_1',
                  name: 'Rule 1',
                  written: true,
                  own: ['case_size'],
                  through: ['weekend_1'],
                },
              ],
              unread: ['cost_price'],
            },
          },
        },
      });
    return route.fulfill({
      json: {
        kind: 'rules',
        set: frozen,
        names,
        history: { head: null, revisions: [] },
      },
    });
  });
  await page.goto('/examples/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await page
    .getByRole('button', { name: 'Read the sheet', exact: true })
    .last()
    .click();

  const open = page.getByRole('button', { name: `Debug ${rule.name}` });
  // React Aria moves focus to another button as the read's goes, and focusing
  // here can land first: wait until it stays.
  await expect(async () => {
    await open.focus();
    await page.waitForTimeout(300);
    await expect(open).toBeFocused({ timeout: 100 });
  }).toPass();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: `Debug: ${rule.name}` });
  await expect(drawer.getByText('Written by')).toBeVisible();
  await expect(drawer.getByText('works a quantity out itself')).toBeVisible();

  // Each sentence it came from, with what it was read as.
  await drawer.getByRole('radio', { name: 'Source' }).click();
  await expect(drawer.getByText('Check', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Context', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Gives this rule a number')).toBeVisible();
  await expect(drawer.getByText('case_size', { exact: true })).toBeVisible();

  await drawer.getByRole('radio', { name: /^Checks/ }).click();
  await expect(drawer.getByText('No example where it fails.')).toBeVisible();

  await drawer.getByRole('radio', { name: 'Values' }).click();
  await expect(drawer.getByText('0 % 8 == 0')).toBeVisible();
  await drawer.getByLabel('Try order').fill('8');
  await expect(drawer.getByText('8 % 8 == 0')).toBeVisible();
  await expect(drawer.getByText('Holds', { exact: true })).toBeVisible();

  const violations = (
    await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
  ).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(violations.map((v) => v.id)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(open).toBeFocused();

  // The draft's own: every sentence, what it was read as, and what was refused.
  await page.getByRole('button', { name: 'Debug the draft' }).click();
  const draft = page.getByRole('dialog', { name: 'Debug: the draft' });
  const sentences = draft.getByRole('table', {
    name: 'What each sentence of the instructions was read as',
  });
  await expect(
    sentences.getByRole('row', { name: /Order in whole cases.*Check.*rule_1/ }),
  ).toBeVisible();
  await expect(sentences.getByRole('rowheader')).toHaveCount(2);
  await expect(
    sentences.getByRole('row', {
      name: /We open from 07:00.*Context.*quoted by rule_2/,
    }),
  ).toBeVisible();
  await expect(draft.getByText('Not accounted for: sentence 2.')).toBeVisible();

  await draft.getByRole('radio', { name: 'Columns' }).click();
  await expect(
    draft.getByRole('row', { name: /Rule 1.*case_size.*weekend_1/ }),
  ).toBeVisible();
  await expect(draft.getByText('cost_price')).toBeVisible();
});

test('a rule being written again says so, through a reload, then shows the new one', async ({
  page,
}) => {
  const set = frozen as {
    definitions: { id: string; name: string; formula: string }[];
  };
  const rule = set.definitions[1]!;
  const rewritten = {
    ...set,
    definitions: set.definitions.map((definition) =>
      definition.id === rule.id
        ? { ...definition, text: 'The new version of it.' }
        : definition,
    ),
  };
  let writing = false;
  let done = false;
  await page.route('**/api/dev/brunch-orders/rules', (route) => {
    const body = route.request().postDataJSON() as { action: string };
    if (body.action === 'write') writing = true;
    return route.fulfill({
      json: {
        kind: 'rules',
        set: done ? rewritten : frozen,
        names,
        history: { head: null, revisions: [] },
        drafting: writing
          ? {
              step: 'Writing it again…',
              error: null,
              running: !done,
              writing: done ? null : rule.id,
            }
          : null,
      },
    });
  });
  await page.goto('/examples/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await page
    .getByRole('button', { name: 'Read the sheet', exact: true })
    .last()
    .click();
  // The rule's own card, inside the thread's step, which also contains it.
  const card = page
    .getByRole('listitem')
    .filter({
      has: page.getByRole('heading', { name: rule.name, exact: true }),
    })
    .last();
  await card.getByRole('button', { name: 'Write again' }).click();
  await expect(card.getByText('Writing…')).toBeVisible();
  await expect(card.getByText('Being written again')).toBeVisible();

  // The point of it: nothing is lost on a reload.
  await page.reload();
  await expect(card.getByText('Writing…')).toBeVisible();
  await expect(card.getByText('Being written again')).toBeVisible();
  await expect(
    card.getByRole('button', { name: 'Write again' }),
  ).toBeDisabled();

  done = true;
  await expect(card.getByText('The new version of it.')).toBeVisible({
    timeout: 10_000,
  });
  await expect(card.getByText('Writing…')).toHaveCount(0);
  await expect(card.getByText('Being written again')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Write again' })).toBeEnabled();
});

test('versions that disagree are shown with where they differ, for a person to choose', async ({
  page,
}) => {
  const set = frozen as { definitions: { id: string; name: string }[] };
  const rule = set.definitions[1]!;
  const version = (formula: string) => ({
    formula,
    constants: [],
    groups: [],
    uses: [],
    examples: [],
    model: 'test-model',
  });
  const split = {
    ...set,
    definitions: set.definitions.map((definition) =>
      definition.id === rule.id
        ? {
            ...definition,
            agreement: {
              status: 'split',
              runs: 2,
              versions: [
                version('record.hours_until_cutoff >= 0.0'),
                version('record.hours_until_cutoff <= 0.0'),
              ],
              differences: [
                {
                  key: 'SD-01',
                  inputs: { order: 8 },
                  results: ['true', 'false'],
                },
              ],
            },
          }
        : definition,
    ),
  };
  let chosen: unknown = null;
  await page.route('**/api/dev/brunch-orders/rules', (route) => {
    const body = route.request().postDataJSON() as {
      action: string;
      index?: number;
    };
    if (body.action === 'choose') chosen = body.index;
    return route.fulfill({
      json: {
        kind: 'rules',
        set: chosen === null ? split : frozen,
        names,
        history: { head: null, revisions: [] },
      },
    });
  });
  await page.goto('/examples/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await page
    .getByRole('button', { name: 'Read the sheet', exact: true })
    .last()
    .click();
  const versions = page.getByRole('region', {
    name: 'Versions to choose between',
  });
  await expect(versions.getByText(/SD-01, order 8/)).toBeVisible();
  await expect(versions.getByText(/version 2 gives false/)).toBeVisible();
  const card = page
    .getByRole('listitem')
    .filter({
      has: page.getByRole('heading', { name: rule.name, exact: true }),
    })
    .last();
  await expect(card.getByText('Versions differ')).toBeVisible();
  await expect(card.getByRole('button', { name: /^Accept/ })).toBeDisabled();

  await versions.getByRole('button', { name: 'Use version 2' }).click();
  await expect(versions).toHaveCount(0);
  expect(chosen).toBe(1);
});
