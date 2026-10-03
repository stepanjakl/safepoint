import { z } from 'zod';

import { lineSuggestionSchema } from './line';
import { modelWorkbenchResponseSchema } from './response';
import { modelIdSchema } from './models';
import {
  confirmedFactsSchema,
  localInputSchema,
  supplierFactSchema,
  localReviewSnapshotSchema,
} from '@/lib/promotion-release/review-lab';
import {
  reviewRuleSchema,
  reviewRuleSetSchema,
} from '@/lib/promotion-release/review-rules';
import { skuSchema } from '@/lib/promotion-release/schemas';

export const labRequestSchema = z.strictObject({
  stage: z.enum(['extract', 'draft_rule', 'propose']),
  model: modelIdSchema,
  sku: skuSchema,
  reviewAt: z.iso.datetime({ offset: false }),
  input: localInputSchema,
  rules: reviewRuleSetSchema,
  confirmedFacts: confirmedFactsSchema,
  confirmedClaims: z.array(supplierFactSchema).max(3).default([]),
});
export type LabRequest = z.infer<typeof labRequestSchema>;

export const ruleDraftSchema = z.strictObject({
  ruleJson: z.string().trim().min(1).max(8_000),
  reason: z.string().trim().min(1).max(600),
  sourceQuote: z.string().trim().max(500),
});

export function inspectRuleDraft(output: unknown) {
  const wire = ruleDraftSchema.safeParse(output);
  if (!wire.success)
    return {
      draft: null,
      issues: ['Model rule response has an invalid shape.'],
    };
  let raw: unknown;
  try {
    raw = JSON.parse(wire.data.ruleJson);
  } catch {
    return { draft: null, issues: ['Suggested rule JSON has invalid syntax.'] };
  }
  const parsed = reviewRuleSchema.safeParse(raw);
  if (!parsed.success)
    return {
      draft: null,
      issues: parsed.error.issues.map(
        ({ path, message }) => `${path.join('.')}: ${message}`,
      ),
    };
  return {
    draft: {
      rule: parsed.data,
      reason: wire.data.reason,
      sourceQuote: wire.data.sourceQuote,
    },
    issues: [],
  };
}

const resultShape = modelWorkbenchResponseSchema.options[0].shape.result.shape;
export const labResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('error'),
    message: z.string(),
    runId: z.string().optional(),
  }),
  z.object({
    kind: z.literal('result'),
    stage: labRequestSchema.shape.stage,
    runId: z.string(),
    model: modelIdSchema,
    durationMs: z.number(),
    systemInstructions: z.string(),
    modelInput: z.unknown(),
    output: z.unknown(),
    suggestion: lineSuggestionSchema.nullable(),
    review: resultShape.review,
    snapshot: localReviewSnapshotSchema.nullable(),
    issues: z.array(z.string()),
    usage: resultShape.usage,
  }),
]);
