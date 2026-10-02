import { z } from 'zod';

import {
  gateSchema,
  policyFindingCodeSchema,
  skuSchema,
} from '@/lib/promotion-release/schemas';

export const modelWorkbenchResponseSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('result'),
    result: z.strictObject({
      runId: z.string(),
      model: z.string(),
      sku: skuSchema,
      instructionVersion: z.string(),
      durationMs: z.number(),
      input: z.unknown(),
      output: z.unknown(),
      suggestion: z
        .strictObject({
          sku: skuSchema,
          recommendation: z.enum(['release', 'adjust', 'hold', 'exclude']),
          proposedPricePence: z.number().nullable(),
          proposedTopUpUnits: z.number().nullable(),
          rationale: z.string(),
          uncertainties: z.array(z.string()),
          evidenceRefs: z.array(z.string()),
          selfReportedCertainty: z.enum(['low', 'medium', 'high']),
        })
        .nullable(),
      issues: z.array(z.string()),
      review: z
        .strictObject({
          policy: z.strictObject({
            basis: z.enum(['brief_baseline', 'model_proposal']),
            pricePence: z.number(),
            topUpUnits: z.number(),
            marginPercent: z.number(),
            verdict: z.enum(['blocked', 'review_required', 'passes_checks']),
            checks: z.array(
              z.strictObject({
                code: z.string(),
                status: z.enum(['pass', 'attention', 'block']),
                message: z.string(),
                evidenceRefs: z.array(z.string()),
              }),
            ),
          }),
          findingCodes: z.array(policyFindingCodeSchema),
          gateObligations: z.array(
            z.strictObject({
              gate: gateSchema,
              obligation: z.enum(['required', 'advisory', 'not_applicable']),
              reason: z.string(),
            }),
          ),
          treatment: z.enum([
            'no_release_proposal',
            'blocked',
            'individual_approval',
            'review_required',
            'passes_checks',
          ]),
        })
        .nullable(),
      usage: z.nullable(
        z.strictObject({
          inputTokens: z.number().optional(),
          outputTokens: z.number().optional(),
        }),
      ),
      finishReason: z.string().nullable(),
    }),
  }),
  z.strictObject({
    kind: z.literal('error'),
    message: z.string(),
    runId: z.string().optional(),
    stage: z.string().optional(),
  }),
]);

export type ModelWorkbenchResponse = z.infer<
  typeof modelWorkbenchResponseSchema
>;
