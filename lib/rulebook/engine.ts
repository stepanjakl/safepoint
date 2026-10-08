import { Environment } from '@marcbachmann/cel-js';

import {
  addDays,
  describeInstant,
  inWeek,
  latestAtOrBefore,
  mondayOf,
  type LocalDate,
} from './cycle';
import {
  formatMoney,
  interpretCell,
  type FieldType,
  type Weekday,
} from './field-types';
import type { Rulebook } from './schema';
import { bindTab, type BoundTab, type TabSpec } from './sheet-binding';
import { registerKubernetesSum } from './kubernetes-lists';
import {
  conditionsOf,
  type Condition,
  type Path,
  type TermInfo,
  type WorkingTools,
} from './working';

/*
  The rule engine. It knows nothing about any scenario: it reads a rulebook
  (data, drafted by a model and approved by a person) and a snapshot of the
  sheet, and evaluates standard CEL formulas item by item. Every result carries
  enough to explain itself.
*/

export type Snapshot = {
  tabs: string[];
  valueRanges: { range: string; values?: unknown[][] }[];
};

type TableDef = Rulebook['tables'][number];

const MAX_AST_NODES = 500;

// ── binding ────────────────────────────────────────────────────────────────

export function tabValues(snapshot: Snapshot, tab: string) {
  return snapshot.valueRanges.find((vr) => {
    const name = vr.range.slice(0, vr.range.lastIndexOf('!'));
    return name.replace(/^'(.*)'$/, '$1').replaceAll("''", "'") === tab;
  });
}

// A column's type, with the currency and time zone it is read in.
export function fieldType(
  rulebook: Pick<Rulebook, 'currency' | 'timing'>,
  type: TableDef['columns'][number]['type'],
  allowed: string[] | null = null,
): FieldType {
  switch (type) {
    case 'one_of':
      return { kind: 'one_of', values: allowed ?? [] };
    case 'money':
      // Validation insists on a currency; this only keeps reading possible.
      return {
        kind: 'money',
        currency: rulebook.currency ?? { code: 'XXX', minor_units: 2 },
      };
    case 'date':
    case 'datetime':
      return { kind: type, timeZone: rulebook.timing.time_zone };
    default:
      return { kind: type };
  }
}

function tabSpec(rulebook: Rulebook, table: TableDef): TabSpec {
  const columns = table.columns.map((c) => ({
    header: c.header,
    label: c.meaning,
    type: fieldType(rulebook, c.type, c.allowed),
    required: c.required,
  }));
  return table.shape === 'single'
    ? {
        kind: 'key_value',
        tab: table.tab,
        purpose: table.name,
        keyHeader: table.key_header ?? 'key',
        valueHeader: table.value_header ?? 'value',
        rows: table.columns.map((c, i) => ({ ...columns[i]!, key: c.header })),
      }
    : {
        kind: 'table',
        tab: table.tab,
        purpose: table.name,
        key: table.key_header ?? table.columns[0]!.header,
        unique: table.shape === 'keyed',
        columns,
      };
}

export type BoundRow = {
  key: string;
  values: Record<string, unknown>;
  refs: Record<string, string>;
};

export type Bound = {
  table: TableDef;
  bound: BoundTab;
  rows: BoundRow[];
};

const toCel = (value: unknown, kind: string): unknown =>
  value === null
    ? undefined
    : CEL_OF[kind] === 'int'
      ? BigInt(value as number)
      : CEL_OF[kind] === 'google.protobuf.Timestamp'
        ? new Date(value as number)
        : value;

export function bindTables(rulebook: Rulebook, snapshot: Snapshot): Bound[] {
  return rulebook.tables.map((table) => {
    const range = tabValues(snapshot, table.tab) ?? {
      range: `${table.tab}!A1`,
      values: [],
    };
    const bound = bindTab(tabSpec(rulebook, table), range);
    const byHeader = new Map(table.columns.map((c) => [c.header, c]));
    if (table.shape === 'single') {
      const values: Record<string, unknown> = {};
      const refs: Record<string, string> = {};
      for (const row of bound.rows)
        for (const cell of row.cells) {
          const column = byHeader.get(row.key)!;
          const value = toCel(cell.value, column.type);
          if (value !== undefined) values[column.name] = value;
          refs[column.name] = cell.ref;
        }
      return { table, bound, rows: [{ key: table.name, values, refs }] };
    }
    const rows = bound.rows.map((row) => {
      const values: Record<string, unknown> = {};
      const refs: Record<string, string> = {};
      for (const cell of row.cells) {
        const column = byHeader.get(cell.header)!;
        const value = toCel(cell.value, column.type);
        if (value !== undefined) values[column.name] = value;
        refs[column.name] = cell.ref;
      }
      return { key: row.key, values, refs };
    });
    return { table, bound, rows };
  });
}

// ── timing ─────────────────────────────────────────────────────────────────

export type Period = { index: number; monday: LocalDate | null; label: string };

export type TimeResolution = {
  table: string;
  row: string;
  name: string;
  role: 'observation' | 'deadline';
  sheet: string;
  refs: string[];
  resolved: string;
  iso: string;
};

const minutesText = (minutes: bigint) =>
  `${String(minutes / 60n).padStart(2, '0')}:${String(minutes % 60n).padStart(2, '0')}`;

function resolveTimes(
  rulebook: Rulebook,
  tables: Bound[],
  runAt: number,
  monday: LocalDate | null,
) {
  const tz = rulebook.timing.time_zone;
  const resolutions: TimeResolution[] = [];
  const withTimes = new Map<string, BoundRow[]>();
  for (const bound of tables) {
    const defs = rulebook.timing.times.filter(
      (t) => t.table === bound.table.name,
    );
    withTimes.set(
      bound.table.name,
      bound.rows.map((row) => {
        const values = { ...row.values };
        for (const def of defs) {
          const day = row.values[def.day] as Weekday | undefined;
          const minutes = row.values[def.time] as bigint | undefined;
          if (day === undefined || minutes === undefined) continue;
          const at = { day, minutes: Number(minutes) };
          const instant =
            def.role === 'observation' || monday === null
              ? latestAtOrBefore(at, runAt, tz)
              : inWeek(monday, at, tz);
          values[def.name] = new Date(instant);
          resolutions.push({
            table: bound.table.name,
            row: row.key,
            name: def.name,
            role: def.role,
            sheet: `${day} ${minutesText(minutes)}`,
            refs: [row.refs[def.day], row.refs[def.time]].filter(
              (r): r is string => Boolean(r),
            ),
            resolved: describeInstant(instant, tz),
            iso: new Date(instant).toISOString(),
          });
        }
        return { ...row, values };
      }),
    );
  }
  return { withTimes, resolutions };
}

// The periods a run plans, the current one first.
function planPeriods(
  rulebook: Rulebook,
  tables: Bound[],
  runAt: number,
): Period[] {
  const { timing } = rulebook;
  if (timing.period === 'none' || !timing.current_until)
    return [{ index: 0, monday: null, label: 'No repeating period' }];
  const startDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(
    timing.week_starts_on,
  );
  let monday = addDays(mondayOf(runAt, timing.time_zone), startDay);
  const until = timing.current_until;
  for (let step = 0; step < 3; step += 1) {
    const { withTimes } = resolveTimes(rulebook, tables, runAt, monday);
    const end = withTimes.get(until.table)?.[0]?.values[until.time];
    if (end instanceof Date && runAt < end.getTime()) break;
    monday = addDays(monday, 7);
  }
  return Array.from({ length: timing.plan_ahead }, (_, index) => {
    const start = addDays(monday, 7 * index);
    return {
      index,
      monday: start,
      label: `Week of ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(start.year, start.month - 1, start.day)))}`,
    };
  });
}

// ── CEL environment ────────────────────────────────────────────────────────

// The CEL type each column or editable type is read as.
export const CEL_OF: Record<string, string> = {
  key: 'string',
  text: 'string',
  weekday: 'string',
  one_of: 'string',
  whole_number: 'int',
  money: 'int',
  time_of_day: 'int',
  decimal: 'double',
  percent: 'double',
  date: 'google.protobuf.Timestamp',
  datetime: 'google.protobuf.Timestamp',
  yes_no: 'bool',
};
const celName = (type: string) =>
  type === 'timestamp' ? 'google.protobuf.Timestamp' : type;

const ctorCache = new Map<string, new (fields: object) => object>();
function ctorFor(typeName: string) {
  let ctor = ctorCache.get(typeName);
  if (!ctor) {
    ctor = class {
      constructor(fields: object) {
        Object.assign(this, fields);
      }
    };
    Object.defineProperty(ctor, 'name', { value: typeName });
    ctorCache.set(typeName, ctor);
  }
  return ctor;
}

export type ScopeFacts = { name: string; type: string }[];

export type EnvironmentSpec = {
  kind: string;
  facts: ScopeFacts;
  change: string[];
};

// What a formula for one kind of item can see, as a person reads it.
export function describeEnvironment(rulebook: Rulebook, spec: EnvironmentSpec) {
  const kind = rulebook.items.find((k) => k.kind === spec.kind);
  const vars: { name: string; type: string; meaning: string }[] = [
    { name: 'run_at', type: 'timestamp', meaning: 'When the run happens' },
    {
      name: 'key',
      type: 'string',
      meaning: `The ${kind?.label ?? 'item'}'s key`,
    },
    kind?.group
      ? {
          name: 'rows',
          type: `list<${kind.table}>`,
          meaning: `Every ${kind.table} row with this key`,
        }
      : {
          name: 'row',
          type: kind?.table ?? '?',
          meaning: `This item's ${kind?.table ?? ''} row`,
        },
  ];
  for (const table of rulebook.tables)
    vars.push({
      name: table.name,
      type:
        table.shape === 'keyed'
          ? `map<string, ${table.name}>`
          : table.shape === 'list'
            ? `list<${table.name}>`
            : table.name,
      meaning: `${table.tab} tab`,
    });
  vars.push({
    name: 'facts',
    type: '{…}',
    meaning: `Facts of this ${kind?.label ?? 'item'}: ${spec.facts.map((f) => f.name).join(', ') || 'none yet'}`,
  });
  vars.push({
    name: 'change',
    type: '{…}',
    meaning: `Proposed values: ${spec.change.join(', ') || 'none'}`,
  });
  const earlier = earlierKinds(rulebook, spec.kind);
  for (const other of rulebook.items)
    if (other.kind !== spec.kind)
      vars.push(
        earlier.includes(other)
          ? {
              name: `${other.kind}_facts`,
              type: `map<string, …>`,
              meaning: `Facts of every ${other.label}, by key: the facts you write for ${other.kind}`,
            }
          : {
              name: `${other.kind}_facts`,
              type: 'not available',
              meaning: `${other.kind} is evaluated after ${spec.kind}, so its facts do not exist yet. If ${spec.kind} needs them, ask in data_model_requests for items to list ${other.kind} first.`,
            },
      );
  return vars;
}

// The kinds listed before this one in items: evaluated, with their facts, first.
function earlierKinds(rulebook: Rulebook, kind: string) {
  const at = rulebook.items.findIndex((k) => k.kind === kind);
  return rulebook.items.slice(0, Math.max(0, at));
}

function rowSchema(rulebook: Rulebook, table: TableDef) {
  const schema: Record<string, string> = {};
  for (const c of table.columns) schema[c.name] = CEL_OF[c.type] ?? 'dyn';
  for (const t of rulebook.timing.times.filter((t) => t.table === table.name))
    schema[t.name] = 'google.protobuf.Timestamp';
  return schema;
}

export function buildEnvironment(
  rulebook: Rulebook,
  spec: EnvironmentSpec,
  allFacts: Record<string, ScopeFacts>,
) {
  const env = registerKubernetesSum(
    new Environment({
      unlistedVariablesAreDyn: false,
      enableOptionalTypes: true,
      limits: { maxAstNodes: MAX_AST_NODES },
    }),
  );
  for (const table of rulebook.tables) {
    const typeName = `T_${table.name}`;
    env.registerType(typeName, {
      schema: rowSchema(rulebook, table),
      ctor: ctorFor(typeName),
    });
    env.registerVariable(
      table.name,
      table.shape === 'keyed'
        ? `map<string, ${typeName}>`
        : table.shape === 'list'
          ? `list<${typeName}>`
          : typeName,
    );
  }
  // A kind reads the facts of the kinds evaluated before it, and only those:
  // a later kind's facts do not exist yet when this one runs.
  for (const other of earlierKinds(rulebook, spec.kind)) {
    const typeName = `F_${other.kind}`;
    const schema = Object.fromEntries(
      (allFacts[other.kind] ?? []).map((f) => [f.name, celName(f.type)]),
    );
    env.registerType(typeName, { schema, ctor: ctorFor(typeName) });
    env.registerVariable(`${other.kind}_facts`, `map<string, ${typeName}>`);
  }
  const kind = rulebook.items.find((k) => k.kind === spec.kind);
  env.registerVariable('run_at', 'google.protobuf.Timestamp');
  env.registerVariable('key', 'string');
  if (kind) {
    if (kind.group) env.registerVariable('rows', `list<T_${kind.table}>`);
    else env.registerVariable('row', `T_${kind.table}`);
  }
  env.registerVariable({
    name: 'facts',
    schema: Object.fromEntries(
      spec.facts.map((f) => [f.name, celName(f.type)]),
    ),
  });
  env.registerVariable({
    name: 'change',
    schema: Object.fromEntries(
      spec.change.map((name) => {
        const type = rulebook.editable.find(
          (e) => e.kind === spec.kind && e.name === name,
        )?.type;
        return [name, CEL_OF[type ?? 'whole_number'] ?? 'int'];
      }),
    ),
  });
  return env;
}

export type Checked = { ok: true; type: string } | { ok: false; error: string };

// The library's messages name the symptom; these name the standard-CEL fix.
const HINTS: [RegExp, string | ((match: RegExpExecArray) => string)][] = [
  [
    /Unknown variable: (\w+)_facts/,
    (m) =>
      `Facts of ${m[1]} are only available to kinds listed after ${m[1]} in items. If this kind needs them, ask in data_model_requests for items to list ${m[1]} first.`,
  ],
  [
    /has\(\) invalid argument/,
    'has() works on a field of a variable (row.f, facts.f, change.f) but not after a lookup such as table[key].f. Test a cell that may be blank with table[key].?f.hasValue(), or read it with .?f.orValue(default).',
  ],
  [
    /no such overload: .* [!=]= null|no such overload: null [!=]= /,
    'Nothing is null here: a blank cell is absent. Test row.?field.hasValue(), or read row.?field.orValue(default).',
  ],
  [
    /no matching overload for '\w+\.hasValue\(\)'|orValue\(\) receiver must be optional/,
    'hasValue() and orValue() work only after .? on a cell that may be blank: row.?field.hasValue(), row.?field.orValue(default). A required cell is read as row.field.',
  ],
  [
    /fold|reduce|Expected RPAREN, got COMMA|no matching overload for 'list\.(min|max)\(\)'/,
    'There is no fold, reduce, min() or max(). Total a list with xs.sum(); take the smallest with xs.filter(x, xs.all(y, x <= y))[0].',
  ],
  [
    /no such overload: (int [-+*/<>=!]+ double|double [-+*/<>=!]+ int)/,
    'int and double never mix. Keep money and counts as int, or convert one side with double(x) or int(x).',
  ],
];

const withHint = (message: string) => {
  for (const [pattern, hint] of HINTS) {
    const match = pattern.exec(message);
    if (match)
      return `${message}. ${typeof hint === 'string' ? hint : hint(match)}`;
  }
  return message;
};

export function checkFormula(
  env: Environment,
  expression: string,
  expected?: string,
): Checked {
  try {
    const result = env.check(expression);
    if (!result.valid)
      return {
        ok: false,
        error: withHint((result.error?.message ?? 'Invalid').split('\n')[0]!),
      };
    const want = expected ? celName(expected) : null;
    if (want && result.type !== want && !(result.type === 'dyn'))
      return {
        ok: false,
        error: `Returns ${result.type}, but ${want} is required.`,
      };
    return { ok: true, type: result.type ?? 'unknown' };
  } catch (error) {
    return {
      ok: false,
      error: (error instanceof Error ? error.message : String(error)).split(
        '\n',
      )[0]!,
    };
  }
}

// ── evaluation ─────────────────────────────────────────────────────────────

export type RuleStatus = 'pass' | 'fail' | 'not_applicable' | 'error';
export type Disposition = 'blocked' | 'needs_decision' | 'ready';

export type ItemResult = {
  kind: string;
  key: string;
  facts: {
    name: string;
    label: string;
    value: string | null;
    error: string | null;
  }[];
  change: {
    name: string;
    label: string;
    value: string | null;
    // As a person writes it (£4.75 for 475), when that differs.
    display: string | null;
    from: 'default' | 'set' | 'not_applicable';
    error: string | null;
  }[];
  rules: {
    id: string;
    sheet_rule: string | null;
    title: string;
    outcome: 'block' | 'attention';
    status: RuleStatus;
    detail: string | null;
    // With options.explain: each condition of the formula, evaluated for
    // this item, with the values it read.
    working?: { conditions: Condition[] };
  }[];
  disposition: Disposition;
};

export type Evaluation = {
  runAt: { iso: string; label: string };
  periods: Period[];
  period: Period;
  times: TimeResolution[];
  items: ItemResult[];
};

// A CEL duration, as hours and minutes ("31h 0m"); JSON shows it as {}.
const isDuration = (value: unknown): value is { seconds: bigint | number } =>
  typeof value === 'object' &&
  value !== null &&
  'seconds' in value &&
  'nanos' in value;
const showDuration = ({ seconds }: { seconds: bigint | number }) => {
  const total = Number(seconds);
  const sign = total < 0 ? '−' : '';
  const minutes = Math.round(Math.abs(total) / 60);
  return `${sign}${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const showValue = (value: unknown): string =>
  value instanceof Date
    ? value.toISOString()
    : isDuration(value)
      ? showDuration(value)
      : typeof value === 'bigint'
        ? String(value)
        : (JSON.stringify(value, (_, v) =>
            typeof v === 'bigint' ? String(v) : v,
          ) ?? String(value));

function compiled(
  env: Environment,
  cache: Map<string, (ctx: object) => unknown>,
  expression: string,
) {
  let fn = cache.get(expression);
  if (!fn) {
    fn = env.parse(expression) as (ctx: object) => unknown;
    cache.set(expression, fn);
  }
  return fn;
}

const run = (
  env: Environment,
  cache: Map<string, (ctx: object) => unknown>,
  expression: string,
  context: object,
) => compiled(env, cache, expression)(context);

const pad = (n: number) => String(n).padStart(2, '0');

// How a person writes a value of this type, or null when it reads plainly.
function shownAs(
  rulebook: Rulebook,
  type: string,
): (value: unknown) => string | null {
  const tz = rulebook.timing.time_zone;
  switch (type) {
    case 'money':
      return (v) =>
        typeof v === 'bigint'
          ? formatMoney(
              Number(v),
              rulebook.currency ?? { code: 'XXX', minor_units: 2 },
            )
          : null;
    case 'percent':
      return (v) =>
        typeof v === 'number' ? `${Number((v * 100).toPrecision(12))}%` : null;
    case 'time_of_day':
      return (v) =>
        typeof v === 'bigint'
          ? `${pad(Number(v / 60n))}:${pad(Number(v % 60n))}`
          : null;
    case 'date':
    case 'datetime':
    case 'timestamp':
      return (v) => (v instanceof Date ? shortInstant(v, tz) : null);
    default:
      return () => null;
  }
}
// "Fri 16 Oct, 10:00" in the rulebook's time zone: short enough to sit in a
// formula. The Calculate step shows each time in full.
const shortInstant = (value: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
const DATE_TYPES = new Set(['date', 'datetime', 'timestamp']);

/*
  A value a person typed for a what-if, read as the sheet reads a cell of the
  editable value's type: "£4.75" and "4.75" are 475 minor units, "25" or
  "25%" a quarter, "1,200" twelve hundred.
*/
export function readWhatIf(
  rulebook: Rulebook,
  name: string,
  text: string,
): { ok: true; value: bigint | number } | { ok: false; issue: string } {
  const editable = rulebook.editable.find((e) => e.name === name);
  if (!editable)
    return { ok: false, issue: `Nothing called ${name} may change.` };
  const plain = text.trim().replace(/[^\d.%-]/g, '');
  if (!/\d/.test(plain))
    return {
      ok: false,
      issue: `${editable.label}: ${text.trim() ? `"${text.trim()}" is not a number.` : 'Enter a value.'}`,
    };
  const raw =
    editable.type === 'percent'
      ? plain.endsWith('%')
        ? plain
        : `${plain}%`
      : plain === ''
        ? undefined
        : Number(plain);
  if (typeof raw === 'number' && Number.isNaN(raw))
    return {
      ok: false,
      issue: `${editable.label}: "${text}" is not a number.`,
    };
  const read = interpretCell(raw, fieldType(rulebook, editable.type), true);
  if (read.issue || read.value === null)
    return {
      ok: false,
      issue: `${editable.label}: ${read.issue ?? 'Enter a value.'}`,
    };
  return {
    ok: true,
    value: toCel(read.value, editable.type) as bigint | number,
  };
}

// Each condition of a rule, the when part first. Only the part that settled
// the result keeps its settling condition.
function ruleWorking(
  rule: Rulebook['rules'][number],
  tools: WorkingTools,
): { conditions: Condition[] } {
  try {
    const when = rule.when
      ? conditionsOf('when', rule.when, true, tools)
      : null;
    const applies = !when || when.value === true;
    const require = conditionsOf('require', rule.assert, applies, tools);
    if (when && applies) for (const c of when.conditions) c.settled = false;
    return { conditions: [...(when?.conditions ?? []), ...require.conditions] };
  } catch {
    return { conditions: [] };
  }
}

// What the engine knows about each value a formula of one item reads: its
// meaning, its cell, and how a person writes it.
function workingTools(
  rulebook: Rulebook,
  at: {
    env: Environment;
    cache: Map<string, (ctx: object) => unknown>;
    context: object;
    kind: string;
    row: BoundRow | null;
    withTimes: Map<string, BoundRow[]>;
    change: ItemResult['change'];
  },
): WorkingTools {
  const tz = rulebook.timing.time_zone;
  const instant = shownAs(rulebook, 'timestamp');
  const fromTable = (
    table: TableDef,
    field: string | null,
    row: BoundRow | null | undefined,
  ): TermInfo | null => {
    const column = table.columns.find((c) => c.name === field);
    if (column)
      return {
        label: column.meaning,
        source: (field && row?.refs[field]) || null,
        show: shownAs(rulebook, column.type),
        fillShown: DATE_TYPES.has(column.type),
      };
    const time = rulebook.timing.times.find(
      (t) => t.table === table.name && t.name === field,
    );
    if (time)
      return {
        label: time.meaning,
        source:
          [row?.refs[time.day], row?.refs[time.time]]
            .filter(Boolean)
            .join(', ') || null,
        show: instant,
        fillShown: true,
      };
    return null;
  };
  const fact = (kind: string, field: string | null): TermInfo | null => {
    const f = rulebook.facts.find((x) => x.kind === kind && x.name === field);
    return f
      ? {
          label: f.label,
          source: 'calculated',
          show: shownAs(rulebook, f.type),
          fillShown: DATE_TYPES.has(f.type),
        }
      : null;
  };
  return {
    parse: (text) =>
      (compiled(at.env, at.cache, text) as unknown as { ast: never }).ast,
    evaluate: (text) => run(at.env, at.cache, text, at.context),
    showRaw: (value) =>
      value instanceof Date ? shortInstant(value, tz) : showValue(value),
    describe: ({ root, field, index }: Path) => {
      if (root === 'run_at')
        return {
          label: 'Run time',
          source: null,
          show: instant,
          fillShown: true,
        };
      if (root === 'key')
        return {
          label: 'Item key',
          source: null,
          show: () => null,
          fillShown: false,
        };
      if (root === 'row') {
        const kind = rulebook.items.find((k) => k.kind === at.kind);
        const table = rulebook.tables.find((t) => t.name === kind?.table);
        return table ? fromTable(table, field, at.row) : null;
      }
      if (root === 'change') {
        const editable = rulebook.editable.find(
          (e) => e.kind === at.kind && e.name === field,
        );
        const from = at.change.find((c) => c.name === field)?.from;
        return editable
          ? {
              label: editable.label,
              source: from === 'set' ? 'proposed' : 'starting value',
              show: shownAs(rulebook, editable.type),
              fillShown: false,
            }
          : null;
      }
      if (root === 'facts') return fact(at.kind, field);
      if (root.endsWith('_facts')) return fact(root.slice(0, -6), field);
      const table = rulebook.tables.find((t) => t.name === root);
      if (!table) return null;
      const rows = at.withTimes.get(table.name) ?? [];
      return fromTable(
        table,
        field,
        table.shape === 'single'
          ? rows[0]
          : table.shape === 'keyed' && index.length
            ? rows.find((r) => r.key === String(index[0]))
            : null,
      );
    },
  };
}

export function evaluate(
  rulebook: Rulebook,
  snapshot: Snapshot,
  runAt: number,
  options: {
    periodIndex?: number;
    // Proposed values per item key: bigint for int types, number for double.
    overrides?: Record<string, Record<string, bigint | number>>;
    // Evaluate one extra expression for one item, after its facts and defaults.
    probe?: { kind: string; key: string; expression: string };
    // Also show each rule's working: the values its formula read, per item.
    explain?: boolean;
  } = {},
): Evaluation & {
  probe?: { ok: true; value: string } | { ok: false; error: string };
} {
  const tables = bindTables(rulebook, snapshot);
  const periods = planPeriods(rulebook, tables, runAt);
  const period =
    periods[Math.min(options.periodIndex ?? 0, periods.length - 1)]!;
  const { withTimes, resolutions } = resolveTimes(
    rulebook,
    tables,
    runAt,
    period.monday,
  );

  const context: Record<string, unknown> = { run_at: new Date(runAt) };
  for (const table of rulebook.tables) {
    const Ctor = ctorFor(`T_${table.name}`);
    const rows = (withTimes.get(table.name) ?? []).map(
      (row) => new Ctor(row.values),
    );
    context[table.name] =
      table.shape === 'keyed'
        ? new Map(
            rows.map((row, i) => [withTimes.get(table.name)![i]!.key, row]),
          )
        : table.shape === 'list'
          ? rows
          : (rows[0] ?? new Ctor({}));
  }

  const declaredFacts: Record<string, ScopeFacts> = Object.fromEntries(
    rulebook.items.map((k) => [
      k.kind,
      rulebook.facts
        .filter((f) => f.kind === k.kind)
        .map(({ name, type }) => ({ name, type })),
    ]),
  );
  const results: ItemResult[] = [];
  let probe:
    { ok: true; value: string } | { ok: false; error: string } | undefined;

  for (const kind of rulebook.items) {
    const facts = rulebook.facts.filter((f) => f.kind === kind.kind);
    const editable = rulebook.editable.filter((e) => e.kind === kind.kind);
    const rules = rulebook.rules.filter((r) => r.kind === kind.kind);
    const env = buildEnvironment(
      rulebook,
      {
        kind: kind.kind,
        facts: declaredFacts[kind.kind] ?? [],
        change: editable.map((e) => e.name),
      },
      declaredFacts,
    );
    const cache = new Map<string, (ctx: object) => unknown>();
    const rows = withTimes.get(kind.table) ?? [];
    const keys = kind.group
      ? [...new Set(rows.map((r) => String(r.values[kind.key] ?? r.key)))]
      : rows.map((r) => String(r.values[kind.key] ?? r.key));
    const FactsCtor = ctorFor(`F_${kind.kind}`);
    const kindFacts = new Map<string, object>();
    const Ctor = ctorFor(`T_${kind.table}`);

    for (const key of keys) {
      const itemContext: Record<string, unknown> = { ...context, key };
      if (kind.group)
        itemContext.rows = rows
          .filter((r) => String(r.values[kind.key] ?? r.key) === key)
          .map((r) => new Ctor(r.values));
      else
        itemContext.row = new Ctor(
          rows.find((r) => String(r.values[kind.key] ?? r.key) === key)!.values,
        );

      const factValues: Record<string, unknown> = {};
      itemContext.facts = factValues;
      itemContext.change = {};
      const factResults = facts.map((fact) => {
        try {
          const value = run(env, cache, fact.expr, itemContext);
          factValues[fact.name] = value;
          return {
            name: fact.name,
            label: fact.label,
            value: showValue(value),
            error: null,
          };
        } catch (error) {
          return {
            name: fact.name,
            label: fact.label,
            value: null,
            error: (error as Error).message.split('\n')[0]!,
          };
        }
      });
      kindFacts.set(key, new FactsCtor(factValues));

      const changeValues: Record<string, unknown> = {};
      itemContext.change = changeValues;
      const overrides = options.overrides?.[key] ?? {};
      const changeResults = editable.map((field) => {
        try {
          const applies = field.applies_when
            ? run(env, cache, field.applies_when, itemContext) === true
            : true;
          if (!applies && overrides[field.name] === undefined)
            return {
              name: field.name,
              label: field.label,
              value: null,
              display: null,
              from: 'not_applicable' as const,
              error: null,
            };
          const value =
            overrides[field.name] ??
            run(env, cache, field.default, itemContext);
          changeValues[field.name] = value;
          return {
            name: field.name,
            label: field.label,
            value: showValue(value),
            display: shownAs(rulebook, field.type)(value),
            from:
              overrides[field.name] !== undefined
                ? ('set' as const)
                : ('default' as const),
            error: null,
          };
        } catch (error) {
          return {
            name: field.name,
            label: field.label,
            value: null,
            display: null,
            from: 'default' as const,
            error: (error as Error).message.split('\n')[0]!,
          };
        }
      });

      if (
        options.probe &&
        options.probe.kind === kind.kind &&
        options.probe.key === key
      ) {
        try {
          probe = {
            ok: true,
            value: showValue(
              run(env, cache, options.probe.expression, itemContext),
            ),
          };
        } catch (error) {
          probe = {
            ok: false,
            error: (error as Error).message.split('\n')[0]!,
          };
        }
      }
      const tools = options.explain
        ? workingTools(rulebook, {
            env,
            cache,
            context: itemContext,
            kind: kind.kind,
            row: kind.group
              ? null
              : (rows.find(
                  (r) => String(r.values[kind.key] ?? r.key) === key,
                ) ?? null),
            withTimes,
            change: changeResults,
          })
        : null;
      const ruleResults = rules.map((rule) => {
        let status: RuleStatus;
        let detail: string | null = null;
        try {
          const applies = rule.when
            ? run(env, cache, rule.when, itemContext)
            : true;
          if (applies !== true) status = 'not_applicable';
          else
            status =
              run(env, cache, rule.assert, itemContext) === true
                ? 'pass'
                : 'fail';
        } catch (error) {
          status = 'error';
          detail = `Cannot evaluate: ${(error as Error).message.split('\n')[0]}`;
        }
        return {
          id: rule.id,
          sheet_rule: rule.sheet_rule,
          title: rule.title,
          outcome: rule.outcome,
          status,
          detail,
          ...(tools ? { working: ruleWorking(rule, tools) } : {}),
        };
      });
      const blocked = ruleResults.some(
        (r) =>
          r.status === 'error' ||
          (r.status === 'fail' && r.outcome === 'block'),
      );
      const attention = ruleResults.some(
        (r) => r.status === 'fail' && r.outcome === 'attention',
      );
      results.push({
        kind: kind.kind,
        key,
        facts: factResults,
        change: changeResults,
        rules: ruleResults,
        disposition: blocked
          ? 'blocked'
          : attention
            ? 'needs_decision'
            : 'ready',
      });
    }
    context[`${kind.kind}_facts`] = kindFacts;
  }

  return {
    runAt: {
      iso: new Date(runAt).toISOString(),
      label: describeInstant(runAt, rulebook.timing.time_zone),
    },
    periods,
    period,
    times: resolutions,
    items: results,
    ...(options.probe
      ? {
          probe: probe ?? {
            ok: false as const,
            error: `No ${options.probe.kind} with key "${options.probe.key}".`,
          },
        }
      : {}),
  };
}
