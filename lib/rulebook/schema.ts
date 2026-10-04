import { z } from 'zod';

/*
  A rulebook: everything process-specific, as data. A model drafts it from the
  sheet, a person approves it, and the engine runs it. Nothing here names a
  scenario. Field descriptions are sent to the model with the schema, so they
  are written as instructions.

  Formulas are standard CEL (cel.dev), checked by the engine before use.
*/

const ident = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/)
  .describe('lower_snake_case identifier, starting with a letter');

const FIELD_KINDS = [
  'key',
  'text',
  'whole_number',
  'money_gbp',
  'weekday',
  'time_of_day',
  'yes_no',
  'one_of',
] as const;

export const CEL_TYPES = [
  'int',
  'bool',
  'string',
  'double',
  'timestamp',
  'list<int>',
  'list<string>',
] as const;

const cell = z
  .string()
  .regex(/^.+![A-Z]+\d+$/)
  .describe("A cell reference such as 'Rules!B4'");

const source = z
  .strictObject({
    cells: z.array(cell).min(1).max(8),
    quote: z
      .string()
      .min(1)
      .max(600)
      .describe('Exact text copied from the cited cells, word for word'),
  })
  .describe('Where in the sheet this comes from');

export const dataModelSchema = z.strictObject({
  process: z.strictObject({
    name: z.string().min(1).max(80),
    item_noun: z
      .string()
      .min(1)
      .max(30)
      .describe('What one reviewable item is called, singular'),
  }),
  sources: z
    .array(
      z.strictObject({
        tab: z.string(),
        role: z
          .enum(['policy', 'data', 'untrusted', 'context', 'ignored'])
          .describe(
            'policy: states rules, limits, timetables or what may change; data: facts to calculate from; untrusted: free text from people that must never become a rule; context: explains the sheet; ignored: not used',
          ),
        reason: z.string().min(1).max(300),
      }),
    )
    .describe('Every tab, classified once'),
  tables: z
    .array(
      z.strictObject({
        tab: z.string(),
        name: ident.describe('Variable name formulas use for this table'),
        shape: z
          .enum(['keyed', 'list', 'single'])
          .describe(
            'keyed: one row per unique key; list: several rows may share a key; single: a two-column key/value tab read as one record',
          ),
        key_header: z
          .string()
          .nullable()
          .describe(
            'keyed or list: header of the key column. single: header of the column holding the keys',
          ),
        value_header: z
          .string()
          .nullable()
          .describe('single only: header of the column holding the values'),
        columns: z
          .array(
            z.strictObject({
              header: z
                .string()
                .describe(
                  'Column header as written, or for a single table the key as written',
                ),
              name: ident,
              type: z.enum(FIELD_KINDS),
              allowed: z
                .array(z.string())
                .nullable()
                .describe('one_of only: the allowed values'),
              required: z.boolean(),
              meaning: z.string().min(1).max(200),
            }),
          )
          .min(1),
      }),
    )
    .describe('Every data, policy or context table the rules need'),
  timing: z.strictObject({
    time_zone: z.string().describe("IANA time zone, e.g. 'Europe/London'"),
    period: z
      .enum(['week', 'none'])
      .describe(
        'week: the sheet describes a repeating week with weekday and time columns; none: no repeating period',
      ),
    week_starts_on: z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
    plan_ahead: z
      .number()
      .int()
      .min(1)
      .max(4)
      .describe('How many periods a run plans, the current one first'),
    current_until: z
      .strictObject({ table: ident, time: ident })
      .nullable()
      .describe(
        'The deadline time whose passing moves planning to the next period',
      ),
    times: z
      .array(
        z.strictObject({
          table: ident,
          name: ident.describe(
            'Name of the resolved timestamp added to each row',
          ),
          day: ident.describe(
            'Column (or single-table key) name of the weekday',
          ),
          time: ident.describe('Column (or single-table key) name of the time'),
          role: z
            .enum(['observation', 'deadline'])
            .describe(
              'observation: something that already happened, resolved to its latest occurrence at or before the run; deadline: something planned, resolved inside the period being planned',
            ),
          meaning: z.string().min(1).max(200),
        }),
      )
      .describe('Every weekday-and-time pair to turn into a timestamp'),
    source: source.nullable(),
  }),
  items: z
    .array(
      z.strictObject({
        kind: ident,
        label: z.string().min(1).max(60),
        table: ident,
        key: ident.describe('Column name holding the item key'),
        group: z
          .boolean()
          .describe('true when several rows share one key and form one item'),
      }),
    )
    .min(1)
    .describe(
      'What gets reviewed, in evaluation order: a kind whose facts others need comes first',
    ),
});

export const logicSchema = z.strictObject({
  editable: z
    .array(
      z.strictObject({
        kind: ident,
        name: ident,
        label: z.string().min(1).max(80),
        type: z.enum(['whole_number', 'money_gbp']),
        applies_when: z
          .string()
          .nullable()
          .describe('CEL bool; null when it always applies'),
        default: z
          .string()
          .describe('CEL int: the value before anyone proposes a change'),
        source,
      }),
    )
    .describe('Every value a proposal may change, as the sheet declares them'),
  facts: z
    .array(
      z.strictObject({
        kind: ident,
        name: ident,
        label: z.string().min(1).max(80),
        type: z.enum(CEL_TYPES),
        expr: z
          .string()
          .min(1)
          .max(800)
          .describe('Standard CEL. May use earlier facts of the same kind'),
        explain: z.string().min(1).max(300),
      }),
    )
    .describe(
      'Calculated values, in dependency order. Never use `change` here',
    ),
  rules: z.array(
    z.strictObject({
      id: ident,
      sheet_rule: z
        .string()
        .nullable()
        .describe('The rule id written in the sheet, if it has one'),
      kind: ident,
      title: z.string().min(1).max(120),
      outcome: z.enum(['block', 'attention']),
      when: z
        .string()
        .nullable()
        .describe('CEL bool; the rule only applies when true'),
      assert: z.string().min(1).max(800).describe('CEL bool that must hold'),
      explain: z.string().min(1).max(300),
      origin: z
        .enum(['sheet', 'model'])
        .describe('sheet: stated in a policy tab; model: your own suggestion'),
      source,
    }),
  ),
  not_ruled: z
    .array(
      z.strictObject({
        cell,
        reason: z.string().min(1).max(300),
      }),
    )
    .describe(
      'Policy statements you did not turn into a rule, and why (for example: covered by timing, or not checkable)',
    ),
  notes: z.array(z.string().max(400)).max(10),
});

export const rulebookSchema = z.strictObject({
  schema_version: z.literal(1),
  ...dataModelSchema.shape,
  ...logicSchema.shape,
});

export type DataModel = z.infer<typeof dataModelSchema>;
export type Logic = z.infer<typeof logicSchema>;
export type Rulebook = z.infer<typeof rulebookSchema>;

export const approvedRulebookSchema = z.strictObject({
  version: z.number().int().min(1),
  approved_at: z.string(),
  drafted: z.strictObject({
    model: z.string(),
    run_id: z.string(),
    at: z.string(),
  }),
  rulebook: rulebookSchema,
});
export type ApprovedRulebook = z.infer<typeof approvedRulebookSchema>;
