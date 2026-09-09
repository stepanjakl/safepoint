import { z } from 'zod';

// A presentation boundary, not an execution authorisation or a policy engine.
// Process adapters own domain validation, calculations and source mapping.
// Every count in this module is derived from `effects`; nothing is stored twice,
// so the verdict line and the pills beneath it cannot disagree.

// An ordered severity scale, not a fixed set. Index is the severity rank, and
// colour is bound to position rather than label, so adding a bucket is a
// config change. Cap the scale at four: a fifth pill wraps the row and breaks
// the ordinal read.
export const DISPOSITIONS = [
  'blocked',
  'needs_decision',
  'deferred',
  'will_apply',
] as const;

export const dispositionSchema = z.enum(DISPOSITIONS);
export type Disposition = (typeof DISPOSITIONS)[number];

// One frame, held across the whole scale: where the item sits in the plan.
// The brief asks for a verb the user can perform, which `will_apply` cannot
// satisfy; consistency is the more important half of that rule.
export const DISPOSITION_LABELS: Record<Disposition, string> = {
  blocked: 'Blocked',
  needs_decision: 'Awaiting a decision',
  deferred: 'Deferred',
  will_apply: 'Will apply',
};

export function severityRank(disposition: Disposition): number {
  return DISPOSITIONS.indexOf(disposition);
}

// Presentation hints for a numeric delta. Domain-neutral on purpose: the
// contract carries the numbers so direction and derived values are computed
// rather than parsed back out of display text.
const displayHintSchema = z.strictObject({
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  scale: z.number().positive().optional(),
  precision: z.number().int().min(0).max(6).optional(),
});

export type DisplayHint = z.infer<typeof displayHintSchema>;

// `before: null` means the prior value was not observed. `create` means there
// is no prior value. Collapsing those is how invented before-values get in.
const scalarDeltaSchema = z.strictObject({
  kind: z.literal('scalar'),
  before: z.number().nullable(),
  after: z.number(),
  display: displayHintSchema.optional(),
  derived: z.string().optional(),
  derivedDirection: z.enum(['up', 'down', 'none']).optional(),
});

const categoricalDeltaSchema = z.strictObject({
  kind: z.literal('categorical'),
  before: z.string().nullable(),
  after: z.string(),
});

const createDeltaSchema = z.strictObject({
  kind: z.literal('create'),
  after: z.string(),
});

const destroyDeltaSchema = z.strictObject({
  kind: z.literal('destroy'),
  before: z.string(),
});

const setDeltaSchema = z.strictObject({
  kind: z.literal('set'),
  added: z.array(z.string()),
  removed: z.array(z.string()),
});

// Required, not optional. It is the fallback that keeps the card legible the
// first time the engine emits a change shape nobody anticipated.
const opaqueDeltaSchema = z.strictObject({
  kind: z.literal('opaque'),
  summary: z.string().min(1),
});

const DELTA_KINDS: ReadonlySet<string> = new Set([
  'scalar',
  'categorical',
  'create',
  'destroy',
  'set',
  'opaque',
]);

function describeUnknownDelta(kind: string, value: object): string {
  const supplied = (value as { summary?: unknown }).summary;
  return typeof supplied === 'string' && supplied.length > 0
    ? supplied
    : `Unsupported change type "${kind}"`;
}

// Narrow by design. An unrecognised discriminant degrades to `opaque`; a
// malformed *known* kind still fails validation, because silently swallowing
// it would hide a real adapter bug behind a plausible-looking row.
function coerceUnknownKind(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const kind = (value as { kind?: unknown }).kind;
  if (typeof kind !== 'string' || DELTA_KINDS.has(kind)) return value;
  const label = (value as { label?: unknown }).label;
  return {
    ...(typeof label === 'string' ? { label } : {}),
    kind: 'opaque',
    summary: describeUnknownDelta(kind, value),
  };
}

const labelShape = { label: z.string().min(1) };

export const deltaSchema = z.preprocess(
  coerceUnknownKind,
  z.discriminatedUnion('kind', [
    scalarDeltaSchema,
    categoricalDeltaSchema,
    createDeltaSchema,
    destroyDeltaSchema,
    setDeltaSchema,
    opaqueDeltaSchema,
  ]),
);

export const labelledDeltaSchema = z.preprocess(
  coerceUnknownKind,
  z.discriminatedUnion('kind', [
    scalarDeltaSchema.extend(labelShape),
    categoricalDeltaSchema.extend(labelShape),
    createDeltaSchema.extend(labelShape),
    destroyDeltaSchema.extend(labelShape),
    setDeltaSchema.extend(labelShape),
    opaqueDeltaSchema.extend(labelShape),
  ]),
);

export type Delta = z.infer<typeof deltaSchema>;
export type LabelledDelta = z.infer<typeof labelledDeltaSchema>;

// The reviewable unit is the item, not the individual change: an item is what
// gets excluded, decided on and approved. `deltas` is ordered by the engine;
// the card shows the first and says how many it is not showing.
export const effectSchema = z.strictObject({
  id: z.string().min(1),
  subject: z.string().min(1),
  subtitle: z.string(),
  deltas: z.array(labelledDeltaSchema),
  // A display grouping key only. Evidence is never pooled across items.
  reasonKey: z.string().min(1).nullable(),
  findingIds: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  disposition: dispositionSchema,
  // Approval is a property on the row, rendered as a chip. Modelling it as a
  // fifth bucket would break the ordinal read of the colour scale.
  requiresApproval: z.boolean().optional(),
});

export type Effect = z.infer<typeof effectSchema>;

export const reasonSchema = z.strictObject({
  key: z.string().min(1),
  label: z.string().min(1),
});

export type Reason = z.infer<typeof reasonSchema>;

// Each variant carries what its UI actually needs. An aggregate failure count
// cannot identify rows, so the failures filter would have nothing to filter.
export const planStatusSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('preview') }),
  z.strictObject({
    kind: z.literal('applied'),
    at: z.string().min(1),
    appliedIds: z.array(z.string()),
    undoAvailableUntil: z.string().nullable(),
  }),
  z.strictObject({
    kind: z.literal('partially_applied'),
    at: z.string().min(1),
    appliedIds: z.array(z.string()),
    failures: z
      .array(
        z.strictObject({
          effectId: z.string().min(1),
          reason: z.string().min(1),
        }),
      )
      .min(1),
  }),
  z.strictObject({
    kind: z.literal('stale'),
    changedEffectIds: z.array(z.string()).min(1),
  }),
  z.strictObject({
    kind: z.literal('incomplete'),
    step: z.number().int().min(0),
    of: z.number().int().min(1),
  }),
]);

export type PlanStatus = z.infer<typeof planStatusSchema>;

// The engine supplies exactly one domain word. Everything else in the chrome
// is fixed, so swapping the payload for another domain changes no strings here.
export const nounSchema = z.strictObject({
  one: z.string().min(1),
  other: z.string().min(1),
});

export type Noun = z.infer<typeof nounSchema>;

export const releasePlanSchema = z
  .strictObject({
    id: z.string().min(1),
    revision: z.string().min(1),
    title: z.string().min(1),
    source: z.string().min(1),
    context: z.string(),
    evaluatedAt: z.string().min(1),
    // Under `replay` no control may promise an operation this slice cannot
    // perform: apply, retry, undo and re-run render as receipt text, not buttons.
    mode: z.enum(['replay', 'live']),
    noun: nounSchema,
    reviewLabel: z.string().min(1),
    reasons: z.array(reasonSchema),
    effects: z.array(effectSchema),
    status: planStatusSchema,
  })
  .superRefine((plan, ctx) => {
    const ids = new Set(plan.effects.map((effect) => effect.id));
    if (ids.size !== plan.effects.length) {
      ctx.addIssue({ code: 'custom', message: 'Duplicate effect identifiers' });
    }
    const reasonKeys = new Set(plan.reasons.map((reason) => reason.key));
    if (reasonKeys.size !== plan.reasons.length) {
      ctx.addIssue({ code: 'custom', message: 'Duplicate reason keys' });
    }
    for (const effect of plan.effects) {
      if (effect.reasonKey !== null && !reasonKeys.has(effect.reasonKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['effects'],
          message: `Effect ${effect.id} references unknown reason ${effect.reasonKey}`,
        });
      }
    }
    const referenced =
      plan.status.kind === 'applied' || plan.status.kind === 'partially_applied'
        ? plan.status.appliedIds
        : plan.status.kind === 'stale'
          ? plan.status.changedEffectIds
          : [];
    if (new Set(referenced).size !== referenced.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Duplicate status effect identifiers',
      });
    }
    if (
      plan.status.kind === 'incomplete' &&
      plan.status.step > plan.status.of
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Evaluation step exceeds total steps',
      });
    }
    for (const id of referenced) {
      if (!ids.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['status'],
          message: `Status references unknown effect ${id}`,
        });
      }
    }
    if (plan.status.kind === 'partially_applied') {
      const appliedIds = new Set(plan.status.appliedIds);
      const failedIds = new Set<string>();
      for (const failure of plan.status.failures) {
        if (
          failedIds.has(failure.effectId) ||
          appliedIds.has(failure.effectId)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['status'],
            message: 'Each effect must have one execution outcome',
          });
        }
        failedIds.add(failure.effectId);
        if (!ids.has(failure.effectId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['status'],
            message: `Failure references unknown effect ${failure.effectId}`,
          });
        }
      }
    }
  });

export type ReleasePlan = z.infer<typeof releasePlanSchema>;
