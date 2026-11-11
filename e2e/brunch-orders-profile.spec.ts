import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { capturedRead } from '@/lib/definitions/captured.fixture';
import {
  confirmProfile,
  profileOf,
  setColumnBlank,
  setColumnLabel,
  setColumnType,
} from '@/lib/definitions/profile';
import {
  BLANKS_UNANSWERED,
  CONFIRM_FIRST,
  definitionSetSchema,
  type DataProfile,
  type ProfileState,
} from '@/lib/definitions/types';
import { SUBJECT } from '@/lib/processes/brunch-orders/process';

// The data's columns, confirmed by a person before the rules are drafted:
// what each column holds, and what a blank cell means. The rules route is
// served from memory, changed as the route would change it, so nothing is
// kept and no model is asked.

const proposed = profileOf(capturedRead(), SUBJECT.data);

type Change = {
  action: string;
  column?: string;
  label?: string;
  type?: 'whole_number' | 'decimal' | 'yes_no' | 'text';
  blank?: 'skip' | 'fail' | null;
};

// The route's profile actions, on a profile held here.
async function serveProfile(page: Page, start: DataProfile | null = null) {
  let kept = start;
  const drafts: unknown[] = [];
  const state = (): ProfileState =>
    kept
      ? { state: kept.confirmedAt ? 'confirmed' : 'review', profile: kept }
      : { state: 'none', proposed };
  await page.route('**/api/dev/brunch-orders/rules', async (route) => {
    const body = route.request().postDataJSON() as Change;
    // The real route refuses a key an action does not take: an edit or a
    // confirmation sent with the read came back 400, and nothing changed.
    if (
      (body.action === 'profileColumn' || body.action === 'confirmProfile') &&
      'readId' in body
    )
      return route.fulfill({
        status: 400,
        json: { kind: 'error', message: 'Invalid request.' },
      });
    if (body.action === 'profile') kept = proposed;
    if (body.action === 'profileColumn' && kept) {
      if (body.label) kept = setColumnLabel(kept, body.column!, body.label);
      if (body.type)
        kept = setColumnType(kept, body.column!, { kind: body.type });
      if (body.blank !== undefined)
        kept = setColumnBlank(kept, body.column!, body.blank);
    }
    if (body.action === 'confirmProfile' && kept && !kept.confirmedAt)
      kept = confirmProfile(kept);
    if (body.action === 'draft') {
      if (!kept?.confirmedAt)
        return route.fulfill({
          status: 502,
          json: { kind: 'error', message: CONFIRM_FIRST, profile: state() },
        });
      drafts.push(body);
      return route.fulfill({
        json: {
          kind: 'none',
          drafting: {
            step: 'Drafted 0 definitions.',
            error: null,
            running: false,
          },
          profile: state(),
        },
      });
    }
    await route.fulfill({ json: { kind: 'none', profile: state() } });
  });
  return { drafts };
}

const openRules = async (page: Page) => {
  await page.goto('/examples/brunch-orders');
  await page.getByRole('button', { name: 'Start run' }).first().click();
  await page
    .getByRole('button', { name: 'Read the sheet', exact: true })
    .last()
    .click();
  return page.getByRole('region', { name: 'The data’s columns' });
};

const serious = async (page: Page, include: string) =>
  (await new AxeBuilder({ page }).include(include).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);

test('the columns that need an answer come first, and drafting waits for a confirmed profile', async ({
  page,
}) => {
  await serveProfile(page);
  const panel = await openRules(page);
  const draft = page.getByRole('button', { name: 'Draft the rulebook' });
  await expect(draft).toBeDisabled();
  await expect(page.getByText(CONFIRM_FIRST)).toBeVisible();
  await expect(
    panel.getByText(
      '30 columns in this read, 2 columns with blank cells to say the meaning of.',
    ),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Review the columns' }).click();

  await expect(panel.locator('.pill-shape')).toHaveText(/^(Not confirmed)+$/);
  await expect(
    panel
      .getByText(
        '2 columns have blank cells with no meaning yet. Not confirmed.',
      )
      .first(),
  ).toBeVisible();
  const questions = panel.getByRole('list', {
    name: 'Columns that need an answer',
  });
  await expect(questions.locator('> li')).toHaveCount(2);
  await expect(
    questions.getByRole('textbox', { name: /Called max_order_units/ }),
  ).toHaveValue('max order units');
  // The rest wait behind a button, each with its type.
  await panel
    .getByRole('button', { name: 'Show the other 28 columns' })
    .click();
  const others = panel.getByRole('list', { name: 'Other columns' });
  await expect(others.locator('> li')).toHaveCount(28);
  await expect(others.getByText('Yes or no, set by the process')).toBeVisible();
  await expect(
    others.getByRole('combobox', { name: 'Type' }).first(),
  ).toBeVisible();
  expect(await serious(page, 'section[aria-labelledby]')).toEqual([]);

  // Answered and confirmed by keyboard alone: focus moves on to the next
  // question, then to Confirm.
  const doesNotApply = questions
    .getByRole('group', { name: 'Where max order units is blank' })
    .getByRole('button', { name: 'The rule doesn’t apply' });
  await doesNotApply.focus();
  await page.keyboard.press('Enter');
  const fails = panel
    .getByRole('group', { name: 'Where category ripe cover days is blank' })
    .getByRole('button', { name: 'The rule fails' });
  const firstOfNext = panel
    .getByRole('group', { name: 'Where category ripe cover days is blank' })
    .getByRole('button', { name: 'The rule doesn’t apply' });
  await expect(firstOfNext).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(fails).toBeFocused();
  await page.keyboard.press('Space');
  const confirm = panel.getByRole('button', { name: 'Confirm the data' });
  await expect(confirm).toBeFocused();
  await expect(
    panel
      .getByText(
        'Every blank has a meaning. Not confirmed: confirm it to draft the rules.',
      )
      .first(),
  ).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(panel.locator('.pill-shape')).toHaveText(/^(Confirmed)+$/);
  await expect(
    panel
      .getByText(
        /^Confirmed \d+ \w+ \d{4}, \d\d:\d\d\. The rules can be drafted\.$/,
      )
      .first(),
  ).toBeVisible();
  await expect(panel.getByRole('status')).toHaveText('The data is confirmed.');
  await expect(draft).toBeEnabled();
  await expect(page.getByText(CONFIRM_FIRST)).toHaveCount(0);
});

test('an edit after confirming puts it back under review, and drafting waits again', async ({
  page,
}) => {
  const confirmed = confirmProfile(
    setColumnBlank(
      setColumnBlank(proposed, 'max_order_units', 'skip'),
      'category.ripe_cover_days',
      'fail',
    ),
  );
  const { drafts } = await serveProfile(page, confirmed);
  const panel = await openRules(page);
  const draft = page.getByRole('button', { name: 'Draft the rulebook' });
  await expect(draft).toBeEnabled();
  await panel.getByRole('button', { name: 'Show the 30 columns' }).click();
  const words = panel.getByRole('textbox', { name: /Called max_order_units/ });
  await words.fill('supplier’s maximum');
  await words.press('Enter');
  await expect(panel.locator('.pill-shape')).toHaveText(/^(Not confirmed)+$/);
  await expect(panel.getByRole('status')).toHaveText(
    'Changed: confirm the data again before it is used.',
  );
  await expect(words).toHaveValue('supplier’s maximum');
  await expect(draft).toBeDisabled();
  await expect(page.getByText(CONFIRM_FIRST)).toBeVisible();
  expect(drafts).toEqual([]);
});

test('a rule Accept refused for an unanswered blank leads to the question', async ({
  page,
}) => {
  const frozen = definitionSetSchema.parse(
    JSON.parse(readFileSync('e2e/fixtures/brunch-orders-rules.json', 'utf8')),
  );
  const refused = `${BLANKS_UNANSWERED}: the max order units. Does a rule reading one not apply, or fail?`;
  const set = {
    ...frozen,
    definitions: frozen.definitions.map((d, i) =>
      i === 2 ? { ...d, problem: refused } : d,
    ),
  };
  const kept = confirmProfile(proposed);
  await page.route('**/api/dev/brunch-orders/rules', (route) =>
    route.fulfill({
      json: {
        kind: 'rules',
        set,
        names: {},
        history: { head: null, revisions: [] },
        profile: { state: 'confirmed', profile: kept },
      },
    }),
  );
  await openRules(page);
  const card = page
    .getByRole('list', { name: 'Calculations and checks' })
    .locator('> li')
    .nth(2);
  await expect(card.getByText(refused)).toBeVisible();
  await expect(
    page.getByText('The data’s columns are confirmed.'),
  ).toBeVisible();
  await card
    .getByRole('button', { name: 'Answer it in the data’s columns' })
    .click();
  const heading = page.getByRole('heading', { name: 'The data’s columns' });
  await expect(heading).toBeFocused();
  await expect(
    page
      .getByRole('list', { name: 'Columns that need an answer' })
      .getByRole('group', { name: 'Where max order units is blank' }),
  ).toBeVisible();
});
