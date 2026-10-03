import { expect, test } from '@playwright/test';
import { z } from 'zod';

import { gateSchema } from '../lib/promotion-release/schemas';
import type { LineSuggestion } from '../lib/model-workbench/line';

test.beforeEach(async ({ page, colorScheme }) => {
  await page.addInitScript(
    (theme) => localStorage.setItem('safepoint:theme', theme),
    colorScheme === 'dark' ? 'dark' : 'light',
  );
});

test('links a product, its checks, a local trial, and exact source evidence', async ({
  page,
}) => {
  await page.goto('/workbench/explore?sku=ALD-0001');
  await expect(
    page.getByRole('heading', { name: 'Release review explorer' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Products' }).getByRole('button'),
  ).toHaveCount(27);

  await page
    .getByRole('button', { name: /Show source Catalogue and pricebook/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Source evidence' }),
  ).toBeFocused();
  await expect(
    page.getByText(/Opened source · Catalogue and pricebook/),
  ).toBeVisible();
  await expect(page.locator('#source-evidence pre').first()).toContainText(
    '"evidenceId": "ev-catalogue-0001"',
  );

  await page
    .getByRole('spinbutton', { name: 'Proposed price, pence' })
    .fill('190');
  await page.getByRole('button', { name: 'Evaluate trial' }).click();
  await expect(page.getByRole('radio', { name: /Your trial/ })).toBeChecked();
  await expect(
    page.getByText(/Confirmed-funding margin 5.3% = \(190p price/).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Restore replay values' }).click();
  await expect(
    page.getByRole('radio', { name: /Recorded replay/ }),
  ).toBeChecked();

  const needsReview = page.getByRole('button', { name: /^Needs review/ });
  const count = Number((await needsReview.innerText()).match(/\d+/)?.[0]);
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(27);
  await needsReview.click();
  await expect(needsReview).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('status').getByText(`Showing ${count} of 27`),
  ).toBeVisible();
  await page.getByRole('button', { name: 'All 27' }).click();
  await page
    .getByRole('searchbox', { name: 'Find a product' })
    .fill('ALD-0010');
  await expect(
    page.getByRole('status').getByText('Showing 1 of 27'),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Products' })
    .getByRole('button')
    .click();
  await expect(
    page.getByRole('heading', { name: 'Source evidence' }),
  ).not.toBeFocused();
  await expect(page).toHaveURL(/sku=ALD-0010/);
  await expect(page.getByText('Selected product · ALD-0010')).toBeVisible();
  await page.getByRole('link', { name: 'Detailed policy workbench' }).click();
  await expect(page.getByRole('combobox', { name: 'Product' })).toHaveValue(
    'ALD-0010',
  );
  await page
    .getByRole('link', { name: 'Open this product in the review explorer' })
    .click();
  await page.getByRole('link', { name: 'Model diagnostics workbench' }).click();
  await expect(page.getByRole('combobox', { name: 'Product' })).toHaveValue(
    'ALD-0010',
  );
});

test('keeps a live model result separate from the replay and trial', async ({
  page,
}) => {
  await page.route('**/api/dev/review-lab', async (route) => {
    const request = z
      .strictObject({
        stage: z.literal('propose'),
        model: z.string(),
        sku: z.literal('ALD-0010'),
        reviewAt: z.iso.datetime({ offset: false }),
        input: z.unknown(),
        rules: z.unknown(),
        confirmedFacts: z.unknown(),
        confirmedClaims: z.unknown(),
      })
      .parse(route.request().postDataJSON());
    const suggestion: LineSuggestion = {
      sku: 'ALD-0010',
      recommendation: 'adjust',
      proposedPricePence: 60,
      proposedTopUpUnits: 200,
      rationale: 'Try a lower price for this synthetic candidate.',
      uncertainties: ['Supplier allocation still needs confirmation.'],
      evidenceRefs: ['ev-catalogue-0010'],
      selfReportedCertainty: 'low',
      gateAssessments: gateSchema.options.map((gate) => ({
        gate,
        result: 'passed',
        explanation: 'Synthetic assessed gate.',
        evidenceRefs: ['ev-catalogue-0010'],
      })),
      semanticActions: [
        'update_promotion_record',
        'record_top_up_recommendation',
        'schedule_storefront_promotion',
        'queue_labels',
      ],
    };
    await route.fulfill({
      json: {
        kind: 'result',
        stage: 'propose',
        runId: 'explorer-live-test',
        model: request.model,
        durationMs: 12,
        systemInstructions: 'Fixed server instructions and local draft.',
        modelInput: { sku: suggestion.sku },
        output: suggestion,
        suggestion,
        snapshot: null,
        issues: [],
        review: {
          treatment: 'blocked',
          policy: {
            basis: 'model_proposal',
            pricePence: 60,
            topUpUnits: 200,
            marginPercent: 8.3,
            verdict: 'blocked',
            checks: [
              {
                code: 'minimum_margin',
                status: 'block',
                message: 'Confirmed-funding margin is below the floor.',
                evidenceRefs: ['ev-catalogue-0010', 'ev-policy'],
              },
            ],
          },
          findings: [],
          gateReviews: [],
          findingCodes: ['margin_below_floor'],
          gateObligations: [
            'forecast',
            'inventory',
            'supplier',
            'financial',
            'logistics',
            'business_rules',
            'external_signals',
          ].map((gate) => ({
            gate,
            obligation: gate === 'external_signals' ? 'advisory' : 'required',
            reason: 'Local browser test.',
          })),
        },
        usage: { inputTokens: 100, outputTokens: 50 },
      },
    });
  });

  await page.goto('/workbench/explore?sku=ALD-0010');
  await page.getByRole('button', { name: 'Run live model' }).click();
  await expect(
    page.getByText('Try a lower price for this synthetic candidate.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('radio', { name: /Live model/ })).toBeChecked();
  await expect(
    page.getByRole('heading', { name: 'Cannot release these values' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: /Recorded replay/ }).check();
  await expect(
    page.getByRole('radio', { name: /Recorded replay/ }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Try these values locally' }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Proposed price, pence' }),
  ).toHaveValue('60');
  await page.getByRole('button', { name: 'Evaluate trial' }).click();
  await expect(page.getByRole('radio', { name: /Your trial/ })).toBeChecked();
});

test('uses a compact product selector without horizontal overflow on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workbench/explore');
  await page
    .getByRole('combobox', { name: 'Product' })
    .selectOption('ALD-0023');
  await expect(page.getByText('Selected product · ALD-0023')).toBeVisible();
  await expect(page).toHaveURL(/sku=ALD-0023/);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});
