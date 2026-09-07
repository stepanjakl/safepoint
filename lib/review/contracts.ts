import { z } from 'zod';

// A presentation boundary, not an execution authorisation or a policy engine.
// Process adapters own domain validation, calculations and source mapping.
export const reviewGroupSchema = z.enum(['attention', 'blocked', 'ready']);
export type ReviewGroup = z.infer<typeof reviewGroupSchema>;

export const GROUP_LABELS: Record<ReviewGroup, string> = {
  attention: 'Needs attention',
  blocked: 'Cannot proceed',
  ready: 'Ready for review',
};

const itemSummarySchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string(),
  group: reviewGroupSchema,
  outcome: z.string().min(1),
  reason: z.string().min(1),
});

export const reviewBatchSchema = z
  .strictObject({
    id: z.string().min(1),
    revision: z.string().min(1),
    title: z.string().min(1),
    processLabel: z.string().min(1),
    mode: z.literal('replay'),
    evaluatedAt: z.string().min(1),
    context: z.string(),
    reviewLabel: z.string().min(1),
    initialItemId: z.string().min(1),
    items: z.array(itemSummarySchema).min(1),
  })
  .superRefine((batch, ctx) => {
    const ids = new Set(batch.items.map((item) => item.id));
    if (ids.size !== batch.items.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate review item identifiers',
      });
    }
    if (!ids.has(batch.initialItemId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Initial item is missing from the batch',
      });
    }
  });

const changeSchema = z.strictObject({
  label: z.string(),
  before: z.string().nullable(),
  after: z.string(),
  note: z.string().nullable(),
});

export const reviewDetailSchema = itemSummarySchema.extend({
  revision: z.string().min(1),
  conclusion: z.string().min(1),
  explanation: z.string().min(1),
  nextAction: z.string().min(1),
  changes: z.array(changeSchema),
  facts: z.array(
    z.strictObject({
      label: z.string(),
      value: z.string(),
      note: z.string().nullable(),
    }),
  ),
  findings: z.array(
    z.strictObject({
      id: z.string(),
      title: z.string(),
      explanation: z.string(),
      evidenceIds: z.array(z.string()),
    }),
  ),
  checks: z.array(
    z.strictObject({
      id: z.string(),
      label: z.string(),
      result: z.enum([
        'passed',
        'failed',
        'not_checked',
        'not_applicable',
        'evidence_unavailable',
      ]),
      resultLabel: z.string(),
      obligation: z.string(),
      explanation: z.string(),
      evidenceIds: z.array(z.string()),
    }),
  ),
  checkSummary: z.string(),
  agent: z.strictObject({
    recommendation: z.string(),
    rationale: z.string(),
    uncertainties: z.array(z.string()),
  }),
  sources: z.array(
    z.strictObject({
      id: z.string(),
      label: z.string(),
      observedAt: z.string(),
      facts: z.array(z.string()),
    }),
  ),
  narrative: z
    .strictObject({ text: z.string(), source: z.string() })
    .nullable(),
  effects: z.array(
    z.strictObject({
      id: z.string(),
      destination: z.string(),
      mode: z.enum(['live_sandbox', 'simulated', 'preview_only']),
      modeLabel: z.string(),
      recovery: z.string(),
    }),
  ),
});

export type ReviewBatch = z.infer<typeof reviewBatchSchema>;
export type ReviewItem = ReviewBatch['items'][number];
export type ReviewDetail = z.infer<typeof reviewDetailSchema>;
export type LoadReviewDetail = (
  id: string,
  signal: AbortSignal,
) => Promise<ReviewDetail>;

export function countReviewGroups(
  items: ReviewItem[],
): Record<ReviewGroup, number> {
  const counts = { attention: 0, blocked: 0, ready: 0 };
  for (const item of items) counts[item.group] += 1;
  return counts;
}
