import { expect, test } from '@playwright/test';
import { z } from 'zod';

import { gateSchema } from '../lib/promotion-release/schemas';
import type { LineSuggestion } from '../lib/model-workbench/line';

test('shows model judgement, independent treatment, and replay reference together', async ({
  page,
}) => {
  let requestedPrice = 130;
  await page.route('**/api/dev/model', async (route) => {
    const request = z
      .strictObject({
        model: z.string(),
        sku: z.literal('ALD-0010'),
        reviewAt: z.iso.datetime({ offset: false }),
      })
      .parse(route.request().postDataJSON());
    const suggestion: LineSuggestion = {
      sku: 'ALD-0010',
      recommendation: 'release',
      proposedPricePence: requestedPrice,
      proposedTopUpUnits: 200,
      rationale: 'The forecast is covered by available stock.',
      uncertainties: [],
      evidenceRefs: ['ev-catalogue-0010'],
      selfReportedCertainty: 'medium',
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
    const blocked = requestedPrice === 60;
    await route.fulfill({
      json: {
        kind: 'result',
        result: {
          runId: 'local-review-test',
          model: request.model,
          sku: suggestion.sku,
          instructionVersion: 'promotion-line-instruction-v2',
          durationMs: 12,
          input: { sku: suggestion.sku },
          output: suggestion,
          suggestion,
          issues: [],
          review: {
            policy: {
              basis: 'model_proposal',
              pricePence: requestedPrice,
              topUpUnits: 200,
              marginPercent: blocked ? 8.3 : 57.7,
              verdict: blocked ? 'blocked' : 'review_required',
              checks: [
                {
                  code: blocked ? 'minimum_margin' : 'large_price_change',
                  status: blocked ? 'block' : 'attention',
                  message: blocked
                    ? 'Confirmed-funding margin is below the floor.'
                    : 'Price change exceeds the individual-review threshold.',
                  evidenceRefs: ['ev-catalogue-0010', 'ev-policy'],
                },
              ],
            },
            findings: [],
            gateReviews: [],
            findingCodes: blocked
              ? ['margin_below_floor', 'large_price_change']
              : ['large_price_change'],
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
            treatment: blocked ? 'blocked' : 'individual_approval',
          },
          usage: { inputTokens: 100, outputTokens: 50 },
          finishReason: 'stop',
        },
      },
    });
  });

  await page.goto('/workbench/model');
  await page
    .getByRole('combobox', { name: 'Product' })
    .selectOption('ALD-0010');
  await page.getByRole('button', { name: 'Run model review' }).click();
  await expect(
    page.getByRole('heading', { name: 'Individual approval required' }),
  ).toBeVisible();
  await expect(
    page.getByText(/Calculated finding codes: large price change/),
  ).toBeVisible();
  await expect(page.getByText(/Recorded AI: release at £1.30/)).toBeVisible();
  await expect(
    page.getByText(
      /Reviewed policy: eligible; treatment: individual approval required/,
    ),
  ).toBeVisible();
  await expect(page.getByText(/Proposed price and top-up match/)).toBeVisible();

  requestedPrice = 60;
  await page.getByRole('button', { name: 'Run model review' }).click();
  await expect(
    page.getByRole('heading', { name: 'Cannot release this proposal' }),
  ).toBeVisible();
  await expect(
    page.getByText(/Proposed price and top-up differ/),
  ).toBeVisible();
  await expect(
    page.getByText(/A blocking check overrides the model recommendation/),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});

test('does not show a release treatment for invalid model output', async ({
  page,
}) => {
  await page.route('**/api/dev/model', async (route) => {
    await route.fulfill({
      json: {
        kind: 'result',
        result: {
          runId: 'invalid-output-test',
          model: 'gemini-3.7-flash',
          sku: 'ALD-0001',
          instructionVersion: 'promotion-line-instruction-v2',
          durationMs: 8,
          input: {},
          output: { recommendation: 'release' },
          suggestion: null,
          issues: ['proposedPricePence: Required'],
          review: null,
          usage: null,
          finishReason: 'invalid_output',
        },
      },
    });
  });

  await page.goto('/workbench/model');
  await page.getByRole('button', { name: 'Run model review' }).click();
  await expect(
    page.getByRole('heading', { name: 'No valid suggestion' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Waiting for a valid suggestion' }),
  ).toHaveCount(2);
  await expect(page.getByText('proposedPricePence: Required')).toBeVisible();
});
