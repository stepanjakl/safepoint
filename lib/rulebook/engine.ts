import { Environment } from '@marcbachmann/cel-js';

import {
  addDays,
  describeInstant,
  inWeek,
  latestAtOrBefore,
  mondayOf,
  type LocalDate,
} from './cycle';
import type { FieldType, Weekday } from './field-types';
import type { Rulebook } from './schema';
import { bindTab, type BoundTab, type TabSpec } from './sheet-binding';

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

function fieldType(column: TableDef['columns'][number]): FieldType {
  return column.type === 'one_of'
    ? { kind: 'one_of', values: column.allowed ?? [] }
    : ({ kind: column.type } as FieldType);
}

function tabSpec(table: TableDef): TabSpec {
  const columns = table.columns.map((c) => ({
    header: c.header,
    label: c.meaning,
    type: fieldType(c),
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
    : kind === 'whole_number' || kind === 'money_gbp' || kind === 'time_of_day'
      ? BigInt(value as number)
      : value;

export function bindTables(rulebook: Rulebook, snapshot: Snapshot): Bound[] {
  return rulebook.tables.map((table) => {
    const range = tabValues(snapshot, table.tab) ?? {
      range: `${table.tab}!A1`,
      values: [],
    };
    const bound = bindTab(tabSpec(table), range);
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

const CEL_OF: Record<string, string> = {
  key: 'string',
  text: 'string',
  weekday: 'string',
  one_of: 'string',
  whole_number: 'int',
  money_gbp: 'int',
  time_of_day: 'int',
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
  for (const other of rulebook.items)
    if (other.kind !== spec.kind)
      vars.push({
        name: `${other.kind}_facts`,
        type: `map<string, …>`,
        meaning: `Facts of every ${other.label}, by key`,
      });
  return vars;
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
  const env = new Environment({
    unlistedVariablesAreDyn: false,
    enableOptionalTypes: true,
    limits: { maxAstNodes: MAX_AST_NODES },
  });
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
  for (const other of rulebook.items) {
    if (other.kind === spec.kind) continue;
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
    schema: Object.fromEntries(spec.change.map((name) => [name, 'int'])),
  });
  return env;
}

export type Checked = { ok: true; type: string } | { ok: false; error: string };

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
        error: (result.error?.message ?? 'Invalid').split('\n')[0]!,
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

const showValue = (value: unknown): string =>
  value instanceof Date
    ? value.toISOString()
    : typeof value === 'bigint'
      ? String(value)
      : (JSON.stringify(value, (_, v) =>
          typeof v === 'bigint' ? String(v) : v,
        ) ?? String(value));

function run(
  env: Environment,
  cache: Map<string, (ctx: object) => unknown>,
  expression: string,
  context: object,
) {
  let fn = cache.get(expression);
  if (!fn) {
    fn = env.parse(expression) as (ctx: object) => unknown;
    cache.set(expression, fn);
  }
  return fn(context);
}

export function evaluate(
  rulebook: Rulebook,
  snapshot: Snapshot,
  runAt: number,
  options: {
    periodIndex?: number;
    overrides?: Record<string, Record<string, bigint>>;
    // Evaluate one extra expression for one item, after its facts and defaults.
    probe?: { kind: string; key: string; expression: string };
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
              from: 'not_applicable' as const,
              error: null,
            };
          const value =
            overrides[field.name] ??
            (run(env, cache, field.default, itemContext) as bigint);
          changeValues[field.name] = value;
          return {
            name: field.name,
            label: field.label,
            value: showValue(value),
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
