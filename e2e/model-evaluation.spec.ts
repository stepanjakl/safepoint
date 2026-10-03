import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { evaluationReportSchema } from '../lib/model-workbench/evaluation';
import type { LineSuggestion } from '../lib/model-workbench/line';
import { labRequestSchema } from '../lib/model-workbench/review-lab-contract';
import { scenarioEvidencePackSchema } from '../lib/promotion-release/schemas';
import { shiftScenarioToReviewAt } from '../lib/promotion-release/scenario-clock';
import {
  captureLocalReview,
  evaluateLabLine,
} from '../lib/promotion-release/review-lab';

const fixtureRoot = new URL(
  '../fixtures/promotion-release/aldertons-promotion-release-v1/',
  import.meta.url,
);
const files = {
  promotionBrief: 'promotion-brief',
  shortlistProvenance: 'shortlist-provenance',
  cataloguePricebook: 'catalogue-pricebook',
  demandEvidence: 'demand-evidence',
  supplyPosition: 'supply-position',
  supplierTerms: 'supplier-terms',
  operationalNotes: 'operational-notes',
  channelState: 'channel-state',
  policyRules: 'policy-rules',
};
const scenario = scenarioEvidencePackSchema.parse(
  Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([key, name]) => [
        key,
        JSON.parse(
          await readFile(new URL(`${name}.json`, fixtureRoot), 'utf8'),
        ),
      ]),
    ),
  ),
);

test.beforeEach(async ({ page, colorScheme }) => {
  await page.addInitScript(
    (theme) => localStorage.setItem('safepoint:theme', theme),
    colorScheme === 'dark' ? 'dark' : 'light',
  );
});

test('runs contrasting examples, records failures, exports and reloads without activating anything', async ({
  page,
}) => {
  const requests: unknown[] = [];
  await page.route('**/api/dev/review-lab', async (route) => {
    const raw = route.request().postDataJSON();
    requests.push(raw);
    expect(raw).not.toHaveProperty('expected');
    const request = labRequestSchema.parse(raw);
    if (requests.length === 2)
      return route.fulfill({
        status: 502,
        json: {
          kind: 'error',
          runId: 'quota-case',
          message: 'Synthetic provider quota error.',
        },
      });
    let output: unknown;
    let suggestion: LineSuggestion | null = null;
    let review = null;
    let snapshot = null;
    if (request.stage === 'extract') {
      output = {
        claims:
          requests.length === 1
            ? [
                {
                  field: 'fundingStatus',
                  value: 'confirmed',
                  quote: 'Supplier funding is confirmed',
                },
                {
                  field: 'fundingPencePerUnit',
                  value: 10,
                  quote: '10 pence per unit',
                },
                {
                  field: 'confirmedAdditionalAllocationUnits',
                  value: 120,
                  quote: 'additional allocation of 120 units',
                },
              ]
            : [
                {
                  field: 'fundingPencePerUnit',
                  value: 99,
                  quote: '99 pence per unit',
                },
              ],
        uncertainties: [],
      };
    } else if (request.stage === 'draft_rule') {
      output = {
        ruleJson: JSON.stringify({
          code: 'custom_margin_floor',
          title: 'Minimum funded margin',
          source: 'Local excerpt',
          failure: 'block',
          emitPass: true,
          assert: {
            mode: 'all',
            clauses: [
              { left: 'marginPercent', operator: 'gte', right: { value: 30 } },
            ],
          },
        }),
        reason: 'Follow the margin floor.',
        sourceQuote: request.input.text,
      };
    } else {
      const ready = request.sku === 'ALD-0004';
      suggestion = {
        sku: request.sku,
        recommendation: ready ? 'release' : 'exclude',
        proposedPricePence: ready ? 200 : null,
        proposedTopUpUnits: ready ? 0 : null,
        rationale: 'Synthetic test recommendation.',
        uncertainties:
          ready || request.sku === 'ALD-0027' ? [] : ['Stock is unavailable.'],
        evidenceRefs: [
          ready
            ? 'ev-supply-0004'
            : request.sku === 'ALD-0009'
              ? 'ev-supply-0009'
              : 'ev-brief',
        ],
        selfReportedCertainty: 'medium',
      };
      output = suggestion;
      const anchored = shiftScenarioToReviewAt(scenario, request.reviewAt);
      const checked = evaluateLabLine({
        scenario: anchored,
        proposal: suggestion,
        rules: request.rules,
      });
      review = {
        ...checked,
        treatment: ready ? 'passes_checks' : 'no_release_proposal',
      };
      snapshot = captureLocalReview({
        scenario: anchored,
        proposal: suggestion,
        rules: request.rules,
        input: request.input,
      });
    }
    await route.fulfill({
      json: {
        kind: 'result',
        stage: request.stage,
        runId: `example-${requests.length}`,
        model: request.model,
        durationMs: 3,
        systemInstructions: 'Fixed test instructions',
        modelInput: request.input,
        output,
        suggestion,
        review,
        snapshot,
        issues: [],
        usage: { inputTokens: 10, outputTokens: 20 },
      },
    });
  });
  await page.goto('/workbench/explore?sku=ALD-0004');
  await page
    .getByRole('textbox', { name: 'Editable process instructions' })
    .fill('Keep my existing editor draft.');
  const editorBefore = await page
    .getByRole('textbox', { name: 'Draft rule JSON' })
    .inputValue();
  const disclosure = page.getByText('Seven example cases and latest report', {
    exact: true,
  });
  await disclosure.focus();
  await page.keyboard.press('Enter');
  const run = page.getByRole('button', { name: 'Run seven test cases' });
  await run.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-evaluation-summary]')).toContainText(
    '5 passed · 1 need inspection · 1 calls failed · 0 not run',
  );
  await expect(page.getByRole('status').first()).toContainText(
    'Evaluation finished: 5 of 7 completed cases passed synthetic checks',
  );
  expect(requests).toHaveLength(7);
  await expect(
    page.getByRole('textbox', { name: 'Editable process instructions' }),
  ).toHaveValue('Keep my existing editor draft.');
  await expect(
    page.getByRole('textbox', { name: 'Draft rule JSON' }),
  ).toHaveValue(editorBefore);
  await expect(page.getByText('Confirmed facts · ALD-0004 only')).toHaveCount(
    0,
  );
  const savedLab = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('safepoint.review-lab.v1') ?? '{}'),
  );
  expect(savedLab.confirmedFacts).toEqual({});
  expect(savedLab.latestTrial).toBeNull();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export evaluation report' }).click();
  const download = await downloadEvent;
  const path = await download.path();
  if (!path) throw new Error('Missing evaluation export.');
  const report = evaluationReportSchema.parse(
    JSON.parse(await readFile(path, 'utf8')),
  );
  expect(report.records[1]?.outcome).toBe('call_failed');
  expect(report.records[2]?.outcome).toBe('failed');
  expect(report.records[4]?.response.kind).toBe('result');
  await page.reload();
  await disclosure.click();
  await expect(page.locator('[data-evaluation-summary]')).toContainText(
    '5 passed',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const accessibility = await new AxeBuilder({ page })
    .include('section[aria-labelledby="evaluation-heading"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'Clear evaluation report' }).click();
  await expect(page.locator('[data-evaluation-summary]')).toHaveCount(0);
});

test('stops after the pending case and returns keyboard focus to the run control', async ({
  page,
}) => {
  let finishRequest: (() => void) | undefined;
  let startedRequest: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    startedRequest = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    finishRequest = resolve;
  });
  let calls = 0;
  await page.route('**/api/dev/review-lab', async (route) => {
    calls += 1;
    startedRequest?.();
    await pending;
    await route.fulfill({
      json: {
        kind: 'error',
        message: 'Synthetic failure.',
        runId: 'stopped-case',
      },
    });
  });
  await page.goto('/workbench/explore');
  await page
    .getByText('Seven example cases and latest report', { exact: true })
    .click();
  const run = page.getByRole('button', { name: 'Run seven test cases' });
  await run.click();
  await started;
  await expect(
    page.getByRole('combobox', { name: 'Model for all experiment stages' }),
  ).toBeDisabled();
  const stop = page.getByRole('button', { name: 'Stop after current call' });
  await stop.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').first()).toContainText(
    'will stop after the current model call',
  );
  finishRequest?.();
  await expect(page.locator('[data-evaluation-summary]')).toContainText(
    'stopped',
  );
  await expect(run).toBeFocused();
  expect(calls).toBe(1);
  const report = evaluationReportSchema.parse(
    await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem('safepoint.model-evaluation.v1') ?? 'null',
      ),
    ),
  );
  expect(report.records).toHaveLength(1);
});
