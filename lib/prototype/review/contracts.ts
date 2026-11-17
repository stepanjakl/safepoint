import { z } from 'zod';

import { dispositionSchema, labelledDeltaSchema } from './plan-contract';

// A presentation boundary, not an execution authorisation or a policy engine.
// Process adapters own domain validation, calculations and source mapping.
// The plan contract owns the card; this owns the detail pane behind it.

const itemSummarySchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string(),
  disposition: dispositionSchema,
  outcome: z.string().min(1),
  reason: z.string().min(1),
});

export const reviewDetailSchema = itemSummarySchema.extend({
  revision: z.string().min(1),
  conclusion: z.string().min(1),
  explanation: z.string().min(1),
  nextAction: z.string().min(1),
  deltas: z.array(labelledDeltaSchema),
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

export type ReviewDetail = z.infer<typeof reviewDetailSchema>;
export type LoadReviewDetail = (
  id: string,
  signal: AbortSignal,
) => Promise<ReviewDetail>;
