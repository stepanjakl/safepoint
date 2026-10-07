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
  'decimal',
  'percent',
  'money',
  'date',
  'datetime',
  'weekday',
  'time_of_day',
  'yes_no',
  'one_of',
] as const;

// What a proposal may change: a number of some kind.
const EDITABLE_KINDS = ['whole_number', 'money', 'decimal', 'percent'] as const;

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

const statementId = z
  .string()
  .regex(/^[A-Za-z0-9_.-]{1,24}$/)
  .describe(
    "The sheet's own id for the statement when it has one (a rule number, say); otherwise S1, S2, …",
  );

/*
  The inventory is drafted first: what the policy says, before any of it is
  bound or written as a formula. The later stages are checked against it, so
  a statement or a kind of item cannot drop out unnoticed.
*/
export const inventorySchema = z.strictObject({
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
  kinds: z
    .array(
      z.strictObject({
        kind: ident.describe('Name for this kind of item'),
        label: z.string().min(1).max(60),
        tab: z
          .string()
          .describe('The tab with one row, or one group of rows, per item'),
        key_header: z
          .string()
          .describe('Header of the column that identifies an item'),
        why: z.string().min(1).max(300),
      }),
    )
    .min(1)
    .describe(
      'Every kind of thing a person will review: each kind the policy sets rules for or lets a proposal change',
    ),
  changeable: z
    .array(
      z.strictObject({
        name: ident,
        kind: ident.describe('The kind of item it belongs to, from kinds'),
        meaning: z.string().min(1).max(300),
        source,
      }),
    )
    .describe('Every value the policy says a proposal may change'),
  statements: z
    .array(
      z.strictObject({
        id: statementId,
        source,
        kind: ident
          .nullable()
          .describe(
            'The kind of item it applies to, from kinds; null when it applies to no single kind (a timetable, say)',
          ),
        needs: z
          .array(
            z.strictObject({
              tab: z.string(),
              header: z
                .string()
                .describe(
                  'A header in the first row, or a key in the first column of a two-column key/value tab, exactly as written',
                ),
            }),
          )
          .describe(
            'Every sheet value that checking it needs, apart from the changeable values',
          ),
        changes: z
          .array(ident)
          .describe('Names of the changeable values it constrains'),
        checkable: z
          .boolean()
          .describe(
            "true when a formula over the sheet's values could decide it",
          ),
        why_not: z
          .string()
          .max(300)
          .nullable()
          .describe('When not checkable: why no formula could decide it'),
      }),
    )
    .min(1)
    .describe(
      'Every statement of policy, wherever it is written: rules, limits, timetables, what may change. One entry per statement',
    ),
});

export const dataModelSchema = z.strictObject({
  currency: z
    .strictObject({
      code: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .describe(
          'ISO 4217 code of the money columns, such as GBP, EUR, USD, JPY',
        ),
      minor_units: z
        .number()
        .int()
        .min(0)
        .max(4)
        .describe(
          'Decimal places of the currency: 2 for GBP, EUR and USD, 0 for JPY',
        ),
    })
    .nullable()
    .describe('The currency of every money column; null when there is none'),
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
              type: z
                .enum(FIELD_KINDS)
                .describe(
                  'decimal: any number; percent: a percentage-formatted cell, whose value arrives as a fraction (0.25 is 25%); numbers like 30 meaning 30% are whole_number; money: an amount in the currency, read as whole minor units; date: a calendar date, read as midnight in the time zone; datetime: a date and time; weekday: Mon to Sun; time_of_day: read as minutes after midnight',
                ),
              allowed: z
                .array(z.string())
                .nullable()
                .describe('one_of only: the allowed values'),
              required: z
                .boolean()
                .describe(
                  'true only when every data row has a value in this column; one blank anywhere means false',
                ),
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
        "Points at one entry of times by that entry's table and name (the name you gave the time, not a column). It must be a deadline from a single table, and its passing moves planning to the next period. Declare it in times first. Null when period is none",
      ),
    times: z
      .array(
        z.strictObject({
          table: ident.describe(
            'The name you gave the table in tables, never the tab',
          ),
          name: ident.describe(
            'Name of the resolved timestamp added to each row',
          ),
          day: ident.describe(
            "The name you gave (in that table's columns) to its weekday column; never the header",
          ),
          time: ident.describe(
            "The name you gave (in that table's columns) to its time_of_day column; never the header",
          ),
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
        table: ident.describe(
          'The name you gave the table in tables, never the tab',
        ),
        key: ident.describe(
          "The name you gave (in that table's columns) to the column holding the item key",
        ),
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
        type: z.enum(EDITABLE_KINDS),
        applies_when: z
          .string()
          .nullable()
          .describe('CEL bool; null when it always applies'),
        default: z
          .string()
          .describe(
            'CEL: the value before anyone proposes a change; int for whole_number and money, double for decimal and percent',
          ),
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
      statement: z
        .string()
        .nullable()
        .describe(
          'Id of the inventory statement this rule checks; null for a rule of your own',
        ),
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
        statement: z.string().describe('Id of the inventory statement'),
        reason: z.string().min(1).max(300),
      }),
    )
    .describe(
      'Inventory statements no formula could check (too vague, or about something outside the data), or that the timing already enforces, and why',
    ),
  data_model_requests: z
    .array(
      z.strictObject({
        statement: z.string().describe('Id of the inventory statement'),
        request: z
          .string()
          .min(1)
          .max(400)
          .describe(
            'Exactly what to add or change in the data model: a kind of item, a bound column, a time',
          ),
      }),
    )
    .describe(
      'Statements you cannot write because the data model lacks something. The data model is then revised once and you write the rules again. Empty when nothing is missing',
    ),
  notes: z.array(z.string().max(400)).max(10),
});

export const rulebookSchema = z.strictObject({
  schema_version: z.literal(1),
  ...inventorySchema.shape,
  ...dataModelSchema.shape,
  ...logicSchema.shape,
});

export type Inventory = z.infer<typeof inventorySchema>;
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
