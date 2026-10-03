import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { labRequestSchema } from '../lib/model-workbench/review-lab-contract';
import { localTrialSchema } from '../lib/promotion-release/review-lab';
import { seedReviewRules } from '../lib/promotion-release/review-rules';

test.beforeEach(async ({ page, colorScheme }) => {
  await page.addInitScript(
    (theme) => localStorage.setItem('safepoint:theme', theme),
    colorScheme === 'dark' ? 'dark' : 'light',
  );
});

test('reports unavailable browser storage while allowing an in-memory experiment', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage disabled', 'SecurityError');
      },
    }),
  );
  await page.goto('/workbench/explore?sku=ALD-0004');
  await expect(page.locator('#main').getByRole('alert')).toContainText(
    'Browser storage is unavailable',
  );
  const instructions = page.getByRole('textbox', {
    name: 'Editable process instructions',
  });
  await instructions.fill('Use in-memory inputs.');
  await expect(instructions).toHaveValue('Use in-memory inputs.');
  await page.getByRole('button', { name: 'Simulate approval' }).click();
  await expect(
    page.getByText(/Latest local simulation · ALD-0004/),
  ).toBeVisible();
});

test('conflicting extracted facts require confirmation and retain original evidence after reload', async ({
  page,
}) => {
  await page.route('**/api/dev/review-lab', async (route) => {
    const request = labRequestSchema.parse(route.request().postDataJSON());
    expect(request.stage).toBe('extract');
    await route.fulfill({
      json: {
        kind: 'result',
        stage: request.stage,
        model: request.model,
        runId: 'extraction-test',
        durationMs: 4,
        systemInstructions: 'Fixed extraction constraints',
        modelInput: request.input,
        output: {
          claims: [
            {
              field: 'fundingStatus',
              value: 'unverified',
              quote: 'Funding is not yet confirmed.',
            },
          ],
          uncertainties: [],
        },
        suggestion: null,
        review: null,
        snapshot: null,
        issues: [],
        usage: { inputTokens: 10, outputTokens: 10 },
      },
    });
  });
  await page.goto('/workbench/explore?sku=ALD-0001');
  await page
    .getByRole('textbox', { name: 'Optional text', exact: true })
    .fill('Funding is not yet confirmed.');
  const newFinding = page.getByText('attention · funding unverified', {
    exact: true,
  });
  await expect(newFinding).toHaveCount(0);
  await page.getByRole('button', { name: 'Extract supplier facts' }).click();
  await expect(
    page.getByText('fundingStatus · source value confirmed'),
  ).toBeVisible();
  await expect(newFinding).toHaveCount(0);
  const confirmation = page.getByRole('button', {
    name: 'Confirm for local trial',
  });
  await confirmation.focus();
  await page.keyboard.press('Enter');
  await expect(confirmation).toBeFocused();
  await expect(newFinding).toBeVisible();
  await expect(page.getByRole('status').first()).toContainText(
    'confirmed for the local ALD-0001 trial',
  );
  await page
    .getByRole('button', { name: /Show source Supplier terms/ })
    .first()
    .click();
  await expect(page.locator('#source-evidence pre').first()).toContainText(
    '"fundingStatus": "confirmed"',
  );
  await page.reload();
  await expect(page.getByText('Confirmed facts · ALD-0001 only')).toBeVisible();
  await expect(
    page.getByText(/original confirmed → accepted unverified/),
  ).toBeVisible();
  await expect(newFinding).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Optional text', exact: true })
    .fill('Replacement evidence');
  await expect(newFinding).toHaveCount(0);
});

test('model rule suggestions stay drafts; validation, impact reasons and keyboard activation are visible', async ({
  page,
}) => {
  const proposed = structuredClone(seedReviewRules.rules[0]);
  if (!proposed) throw new Error('Missing seed rule.');
  proposed.assert.clauses = [
    { left: 'marginPercent', operator: 'gte', right: { value: 30 } },
  ];
  await page.route('**/api/dev/review-lab', async (route) => {
    const request = labRequestSchema.parse(route.request().postDataJSON());
    expect(request.stage).toBe('draft_rule');
    await route.fulfill({
      json: {
        kind: 'result',
        stage: request.stage,
        model: request.model,
        runId: 'rule-test',
        durationMs: 4,
        systemInstructions: 'Fixed rule constraints',
        modelInput: request,
        output: {
          ruleJson: JSON.stringify(proposed),
          reason: 'Use the supplied policy floor.',
          sourceQuote: 'Minimum funded margin is 30%.',
        },
        suggestion: null,
        review: null,
        snapshot: null,
        issues: [],
        usage: { inputTokens: 10, outputTokens: 10 },
      },
    });
  });
  await page.goto('/workbench/explore?sku=ALD-0004');
  await page
    .getByRole('combobox', { name: 'Optional text role' })
    .selectOption('policy_excerpt');
  await page
    .getByRole('textbox', { name: 'Optional text', exact: true })
    .fill('Minimum funded margin is 30%.');
  await page.getByRole('button', { name: 'Suggest one rule change' }).click();
  await expect(
    page.getByText(/Model reason: Use the supplied policy floor/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('safepoint.review-lab.v1') ?? '{}')
          .activeRules.rules[0].assert.clauses[0].right,
    ),
  ).toEqual({ field: 'minimumMarginPercent' });
  await page.getByText('Show affected candidates', { exact: true }).click();
  await expect(
    page.getByText(/minimum_margin: pass → block/).first(),
  ).toBeVisible();
  const editor = page.getByRole('textbox', { name: 'Draft rule JSON' });
  const valid = await editor.inputValue();
  await editor.fill('{');
  const activate = page.getByRole('button', {
    name: 'Activate reviewed rules locally',
  });
  await expect(activate).toBeDisabled();
  await expect(page.getByText('JSON syntax is invalid.')).toBeVisible();
  await editor.fill(valid.replace('"marginPercent"', '"unknownFact"'));
  await expect(activate).toBeDisabled();
  await expect(page.getByText(/Invalid rule:/)).toBeVisible();
  await editor.fill(valid);
  await activate.focus();
  await page.keyboard.press('Enter');
  await expect(activate).toBeFocused();
  await expect(page.getByRole('status').first()).toContainText(
    'activated locally for all 27',
  );
  await page.reload();
  await expect(
    page.getByText('Require funded margin (%) is at least 30.'),
  ).toBeVisible();
  await expect(
    page.getByText('“Minimum funded margin is 30%.”', { exact: true }),
  ).toBeVisible();
});

test('previews and exports only simulated effects and persists the latest trial on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workbench/explore?sku=ALD-0004');
  await expect(
    page.getByText('Permitted changes · simulation preview'),
  ).toBeVisible();
  await expect(
    page.getByText('Latest local simulation', { exact: false }),
  ).toHaveCount(0);
  const approve = page.getByRole('button', { name: 'Simulate approval' });
  await approve.focus();
  await page.keyboard.press('Enter');
  await expect(approve).toBeFocused();
  await expect(page.getByRole('status').first()).toContainText(
    'approval simulated in memory',
  );
  await expect(
    page.getByText(/Latest local simulation · ALD-0004/),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export trial snapshot' }).click();
  const download = await downloadEvent;
  const path = await download.path();
  if (!path) throw new Error('Missing exported trial.');
  const snapshot = localTrialSchema.parse(
    JSON.parse(await readFile(path, 'utf8')),
  );
  expect(snapshot.kind).toBe('simulation');
  if (snapshot.kind !== 'simulation') throw new Error('Expected simulation.');
  expect(snapshot.preflight).toBe('passed_in_memory');
  expect(snapshot.effects).toHaveLength(4);
  expect(snapshot.effects.every((effect) => effect.verifiedInMemory)).toBe(
    true,
  );
  expect(
    snapshot.sourceSnapshot.channelState.records.find(
      (record) => record.sku === 'ALD-0004',
    )?.channels,
  ).toEqual(snapshot.effects.slice(0, 3).map((effect) => effect.before));
  await page.reload();
  await expect(
    page.getByText(/Latest local simulation · ALD-0004/),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const accessibility = await new AxeBuilder({ page })
    .include('#main')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'Reset local experiment' }).click();
  await expect(
    page.getByText(/Latest local simulation · ALD-0004/),
  ).toHaveCount(0);
});
