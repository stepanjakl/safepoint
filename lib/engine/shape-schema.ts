import { z } from 'zod';

/*
  The shapes a check can take, as a schema: what a model fills in and what a
  rulebook stores. One flat object, each name a short reference in text, since
  a model fills a flat form far more reliably than nested choices; what each
  means, and its formula and sentence, is shapes.ts. Safe for the browser.
*/

const reference = z
  .string()
  .describe(
    'column:<column>, column:<lookup>.<column>, value:<earlier definition>, constant:<id>, proposed:<field>, hours_since:<moment> or moment:<moment>',
  );

const conditionSchema = z.object({
  left: reference,
  op: z
    .enum([
      '<',
      '<=',
      '>',
      '>=',
      '==',
      '!=',
      'is_yes',
      'is_no',
      'before',
      'after',
    ])
    .describe(
      'Comparing two numbers; is_yes or is_no on a yes/no column; before or after between two moments',
    ),
  right: reference.nullable().describe('Null for is_yes and is_no'),
});

export const shapeSchema = z.object({
  kind: z.enum(['limit', 'step', 'only_when', 'target', 'flag']),
  field: z
    .string()
    .nullable()
    .describe('The proposal field the rule is about; null for flag'),
  at: z
    .enum(['most', 'least'])
    .nullable()
    .describe('limit: the proposed field is at most, or at least, amount'),
  amount: reference
    .nullable()
    .describe('limit: the bound; step: the size of one step'),
  base: reference
    .nullable()
    .describe('target: what there already is, before the proposal'),
  compare: z
    .enum(['reach', 'not_exceed'])
    .nullable()
    .describe(
      'target: base plus the proposed field reaches, or does not exceed, target',
    ),
  target: reference.nullable(),
  margin_pct: reference
    .nullable()
    .describe('target: a margin in percent on top of target; null for none'),
  when: z
    .array(conditionSchema)
    .describe(
      'only_when: what must hold; flag: what flags the record. All must hold',
    ),
  only_for_group: z
    .string()
    .nullable()
    .describe('The group the rule is limited to; null when not'),
  only_for_when: z
    .array(conditionSchema)
    .describe('Conditions the rule is limited to; empty when not'),
  // Kept only on shapes stored before blanks were the data profile's to say;
  // a shape without it takes each column's meaning from the profile.
  if_blank: z.enum(['skip', 'fail']).optional(),
});

// What a model fills: what a blank cell means is a fact about the data, the
// same for every rule, so a person answers it once on the profile.
export const modelShapeSchema = shapeSchema.omit({ if_blank: true });

export type Shape = z.infer<typeof shapeSchema>;
export type ShapeCondition = z.infer<typeof conditionSchema>;
