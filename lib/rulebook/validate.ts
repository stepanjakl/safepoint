import { checksTab } from './checks';
import {
  CEL_OF,
  bindTables,
  buildEnvironment,
  type Bound,
  checkFormula,
  tabValues,
  type ScopeFacts,
  type Snapshot,
} from './engine';
import type { DataModel, Inventory, Logic, Rulebook } from './schema';

/*
  Deterministic checks on a draft before anyone is asked to approve it. The
  same list goes back to the model as feedback while it drafts, so every
  message names what was found and what to change, in terms of the draft and
  the sheet in hand, never of any one scenario.
*/

export type Issue = { where: string; message: string };

// A header in a tab's first row, or a key in the first column of a key/value tab.
function hasHeaderOrKey(snapshot: Snapshot, tab: string, header: string) {
  const values = tabValues(snapshot, tab)?.values ?? [];
  const text = (v: unknown) => String(v ?? '').trim();
  return (
    (values[0] ?? []).some((v) => text(v) === header) ||
    values.some((row) => text(row[0]) === header)
  );
}

const PARTIAL = {
  schema_version: 1 as const,
  editable: [],
  facts: [],
  rules: [],
  not_ruled: [],
  data_model_requests: [],
  notes: [],
};

export function validateInventory(
  inventory: Inventory,
  snapshot: Snapshot,
): Issue[] {
  const issues: Issue[] = [];
  const hidden = checksTab(snapshot);
  const tabs = snapshot.tabs.filter((t) => t !== hidden);
  for (const tab of tabs)
    if (!inventory.sources.some((s) => s.tab === tab))
      issues.push({
        where: 'sources',
        message: `Tab "${tab}" is not classified. Classify every tab once.`,
      });
  for (const source of inventory.sources)
    if (!tabs.includes(source.tab))
      issues.push({
        where: 'sources',
        message: `There is no tab "${source.tab}". Tabs: ${tabs.join(', ')}.`,
      });

  const kinds = new Set<string>();
  for (const kind of inventory.kinds) {
    if (kinds.has(kind.kind))
      issues.push({ where: `kinds.${kind.kind}`, message: 'Kind used twice.' });
    kinds.add(kind.kind);
    const header = tabValues(snapshot, kind.tab)?.values?.[0] ?? [];
    if (!tabValues(snapshot, kind.tab))
      issues.push({
        where: `kinds.${kind.kind}`,
        message: `There is no tab "${kind.tab}". Tabs: ${tabs.join(', ')}.`,
      });
    else if (!header.some((h) => String(h ?? '').trim() === kind.key_header))
      issues.push({
        where: `kinds.${kind.kind}`,
        message: `"${kind.key_header}" is not a header of ${kind.tab}. Its headers: ${header.join(', ')}.`,
      });
  }

  const changeable = new Set<string>();
  for (const value of inventory.changeable) {
    changeable.add(value.name);
    if (!kinds.has(value.kind))
      issues.push({
        where: `changeable.${value.name}`,
        message: `No kind "${value.kind}". Kinds: ${[...kinds].join(', ')}. Add the kind to kinds if the policy lets a proposal change it.`,
      });
    issues.push(
      ...validateSource(
        inventory.sources,
        snapshot,
        value.source,
        `changeable.${value.name}`,
        true,
      ),
    );
  }

  const ids = new Set<string>();
  for (const statement of inventory.statements) {
    const where = `statements.${statement.id}`;
    if (ids.has(statement.id))
      issues.push({ where, message: 'Id used twice.' });
    ids.add(statement.id);
    if (statement.kind && !kinds.has(statement.kind))
      issues.push({
        where,
        message: `No kind "${statement.kind}". Kinds: ${[...kinds].join(', ')}. Add it to kinds if items of that kind are reviewed.`,
      });
    for (const need of statement.needs)
      if (!hasHeaderOrKey(snapshot, need.tab, need.header))
        issues.push({
          where,
          message: `Needs "${need.header}" from ${need.tab}, but ${need.tab} has no such header (first row) or key (first column). Copy it exactly as written.`,
        });
    for (const name of statement.changes)
      if (!changeable.has(name))
        issues.push({
          where,
          message: `Changes "${name}", which is not in changeable. Declare it there, or remove it here.`,
        });
    if (!statement.checkable && !statement.why_not)
      issues.push({
        where,
        message: 'Not checkable, so why_not must say why.',
      });
    issues.push(
      ...validateSource(
        inventory.sources,
        snapshot,
        statement.source,
        where,
        false,
      ),
    );
  }
  return issues;
}

export function validateDataModel(
  inventory: Inventory,
  model: DataModel,
  snapshot: Snapshot,
): Issue[] {
  const issues: Issue[] = [];

  // Coverage: a lighter model otherwise binds little and rules nothing.
  const unbound: Issue[] = [];
  for (const kind of inventory.kinds) {
    const item = model.items.find((i) => i.kind === kind.kind);
    const table = item && model.tables.find((t) => t.name === item.table);
    if (!item || table?.tab !== kind.tab)
      unbound.push({
        where: `items.${kind.kind}`,
        message: `The inventory reviews "${kind.kind}" items from ${kind.tab}, but ${item ? `items.${kind.kind} reads ${table?.tab ?? 'no tab'}` : 'items has no such kind'}. Add { kind: "${kind.kind}" } with a table bound to ${kind.tab} and its key column "${kind.key_header}".`,
      });
  }
  const needed = new Map<string, string[]>();
  for (const statement of inventory.statements)
    for (const need of statement.needs) {
      const key = `${need.tab}\u0000${need.header}`;
      needed.set(key, [...(needed.get(key) ?? []), statement.id]);
    }
  for (const [key, ids] of needed) {
    const [tab, header] = key.split('\u0000') as [string, string];
    if (
      !model.tables.some(
        (t) => t.tab === tab && t.columns.some((c) => c.header === header),
      )
    )
      unbound.push({
        where: `tables`,
        message: `Statement${ids.length > 1 ? 's' : ''} ${ids.join(', ')} need${ids.length > 1 ? '' : 's'} "${header}" from ${tab}, but no table binds it. Add it as a column of a table on ${tab}.`,
      });
  }
  for (const source of inventory.sources)
    if (
      source.role === 'data' &&
      !model.tables.some((t) => t.tab === source.tab)
    )
      unbound.push({
        where: `sources.${source.tab}`,
        message: `"${source.tab}" is classified data, but no table reads it, so no rule can use it. Bind it as a table, or classify it context or ignored if nothing in it could matter to a rule.`,
      });

  if (model.tables.some((t) => t.columns.some((c) => c.type === 'money'))) {
    const known =
      typeof Intl.supportedValuesOf === 'function'
        ? Intl.supportedValuesOf('currency')
        : null;
    if (!model.currency)
      issues.push({
        where: 'currency',
        message:
          'There are money columns but no currency. Give its ISO 4217 code and decimal places, from what the sheet says or shows.',
      });
    else if (known && !known.includes(model.currency.code))
      issues.push({
        where: 'currency.code',
        message: `"${model.currency.code}" is not an ISO 4217 currency code.`,
      });
  }

  const names = new Set<string>();
  for (const table of model.tables) {
    if (names.has(table.name))
      issues.push({
        where: `tables.${table.name}`,
        message: 'Name used twice.',
      });
    names.add(table.name);
    if (!tabValues(snapshot, table.tab)) {
      issues.push({
        where: `tables.${table.name}`,
        message: `There is no tab "${table.tab}".`,
      });
      continue;
    }
    const role = inventory.sources.find((s) => s.tab === table.tab)?.role;
    if (role === 'untrusted')
      issues.push({
        where: `tables.${table.name}`,
        message: `"${table.tab}" is classified untrusted, so no table may read it. Remove this table and keep the tab classified as untrusted.`,
      });
    const columnNames = new Set<string>();
    for (const c of table.columns) {
      if (columnNames.has(c.name))
        issues.push({
          where: `tables.${table.name}.${c.name}`,
          message: 'Column name used twice.',
        });
      columnNames.add(c.name);
      if (c.type === 'one_of' && !c.allowed?.length)
        issues.push({
          where: `tables.${table.name}.${c.name}`,
          message: 'one_of needs allowed values.',
        });
    }
  }
  if (issues.length) return [...issues, ...unbound];

  const partial: Rulebook = { ...PARTIAL, ...inventory, ...model };
  for (const bound of bindTables(partial, snapshot))
    issues.push(...bindingIssues(bound));

  const { timing } = model;
  for (const table of model.tables)
    for (const c of table.columns)
      if (
        c.type === 'weekday' &&
        !timing.times.some((t) => t.table === table.name && t.day === c.name)
      )
        issues.push({
          where: `tables.${table.name}.${c.name}`,
          message: `Weekday column "${c.name}" is not turned into a time, so no rule can compare it. Declare it in timing.times with its time_of_day column: an observation if it already happened, a deadline if it is planned.`,
        });
  for (const t of timing.times) {
    const table = model.tables.find((x) => x.name === t.table);
    if (!table) {
      issues.push({
        where: `timing.${t.name}`,
        message: `No table "${t.table}".`,
      });
      continue;
    }
    const day = table.columns.find((c) => c.name === t.day);
    const time = table.columns.find((c) => c.name === t.time);
    const namesOf = (type: string) =>
      table.columns
        .filter((c) => c.type === type)
        .map((c) => c.name)
        .join(', ') || 'none';
    if (day?.type !== 'weekday')
      issues.push({
        where: `timing.${t.name}`,
        message: `day "${t.day}" is not a weekday column of ${t.table}. Its weekday columns, by name: ${namesOf('weekday')}. Use one of those names, or declare the column with type weekday.`,
      });
    if (time?.type !== 'time_of_day')
      issues.push({
        where: `timing.${t.name}`,
        message: `time "${t.time}" is not a time_of_day column of ${t.table}. Its time_of_day columns, by name: ${namesOf('time_of_day')}. Use one of those names, or declare the column with type time_of_day.`,
      });
    if (table.columns.some((c) => c.name === t.name))
      issues.push({
        where: `timing.${t.name}`,
        message: `"${t.name}" is already a column of ${t.table}. Give the resolved time a new name.`,
      });
  }
  if (timing.period === 'week') {
    const until = timing.current_until;
    const def =
      until &&
      timing.times.find(
        (t) => t.table === until.table && t.name === until.time,
      );
    const declared =
      timing.times
        .filter((t) => t.role === 'deadline')
        .map((t) => `{ table: "${t.table}", time: "${t.name}" }`)
        .join(', ') || 'none';
    const howTo =
      'current_until names an entry of timing.times by its table and its name. Declare the deadline that ends the period in timing.times (role deadline, day and time from a single table), then name it here.';
    if (!def)
      issues.push({
        where: 'timing.current_until',
        message: `${until ? `{ table: "${until.table}", time: "${until.time}" } is not an entry of timing.times.` : 'Missing although period is week.'} ${howTo} Deadlines declared now: ${declared}.`,
      });
    else if (def.role !== 'deadline')
      issues.push({
        where: 'timing.current_until',
        message: `"${def.name}" is an observation, which looks backwards; the period must end at a deadline. ${howTo} Deadlines declared now: ${declared}.`,
      });
    else if (model.tables.find((x) => x.name === def.table)?.shape !== 'single')
      issues.push({
        where: 'timing.current_until',
        message: `"${def.name}" comes from ${def.table}, which has many rows, so it has no single time. ${howTo}`,
      });
  }
  const kinds = new Set<string>();
  for (const item of model.items) {
    if (kinds.has(item.kind))
      issues.push({ where: `items.${item.kind}`, message: 'Kind used twice.' });
    kinds.add(item.kind);
    const table = model.tables.find((x) => x.name === item.table);
    if (!table)
      issues.push({
        where: `items.${item.kind}`,
        message: `No table "${item.table}".`,
      });
    else if (!table.columns.some((c) => c.name === item.key))
      issues.push({
        where: `items.${item.kind}`,
        message: `No column named "${item.key}" in ${item.table}. Its columns, by name: ${table.columns.map((c) => c.name).join(', ')}.`,
      });
    else if (item.group !== (table.shape === 'list'))
      issues.push({
        where: `items.${item.kind}`,
        message: `group must be ${table.shape === 'list'} because ${item.table} has shape ${table.shape}: an item is a group of rows exactly when its table is a list.`,
      });
  }
  return [...issues, ...unbound];
}

const isBlank = (raw: unknown) =>
  raw === undefined || raw === null || raw === '';

// Reading every cell is the real test of a binding; each problem says which
// part of the binding to change.
function bindingIssues({ table, bound }: Bound): Issue[] {
  const where = `tables.${table.name}`;
  const nameOf = (header: string) =>
    table.columns.find((c) => c.header === header)?.name ?? header;
  const issues: Issue[] = [];
  const fromCells = new Set<string>();
  const blanks = new Map<string, string[]>();
  for (const row of bound.rows)
    for (const cell of row.cells) {
      if (!cell.issue) continue;
      fromCells.add(
        `${cell.ref === '—' ? `${row.key} · ${cell.header}` : cell.ref}: ${cell.issue}`,
      );
      // A missing column or key is reported once, below.
      if (cell.ref === '—') continue;
      if (isBlank(cell.raw))
        blanks.set(cell.header, [
          ...(blanks.get(cell.header) ?? []),
          `"${row.key}" (${cell.ref})`,
        ]);
      else
        issues.push({
          where: `${where}.${nameOf(cell.header)}`,
          message: `${cell.ref}, row "${row.key}", holds ${JSON.stringify(cell.raw)}: ${cell.issue} Choose the type that fits every value in this column.`,
        });
    }
  // A percentage cell holds 30% as 0.3; a column of 30s means percent points.
  for (const column of table.columns.filter((c) => c.type === 'percent')) {
    const numbers = bound.rows.flatMap((row) =>
      row.cells
        .filter((c) => c.header === column.header && typeof c.raw === 'number')
        .map((c) => c.raw as number),
    );
    if (numbers.some((n) => n > 1) && numbers.every((n) => Number.isInteger(n)))
      issues.push({
        where: `${where}.${column.name}`,
        message: `"${column.header}" holds whole numbers such as ${Math.max(...numbers)}, which a percentage cell would hold as ${Math.max(...numbers) / 100}. These are percentage points: use whole_number (or decimal), and compare them with 100 in formulas.`,
      });
  }
  for (const [header, rows] of blanks)
    issues.push({
      where: `${where}.${nameOf(header)}`,
      message: `"${header}" is marked required but is blank in ${rows.length === 1 ? 'row' : `${rows.length} rows`} ${rows.slice(0, 5).join(', ')}${rows.length > 5 ? ', …' : ''}. Set required: false if a blank is valid here (a short row means its last cells are blank), or remove the column if no rule needs it.`,
    });
  for (const issue of bound.issues) {
    if (fromCells.has(issue)) continue;
    const message = issue.startsWith('Column ')
      ? `${issue} Headers in ${table.tab}'s first row: ${bound.headers.found.filter(Boolean).join(', ') || 'none'}. Copy a header exactly as written.`
      : issue.startsWith('Key ')
        ? `${issue} If several rows may share a key, use shape list.`
        : issue.startsWith('Row ')
          ? [table.key_header, table.value_header].some(
              (h) => h && issue === `Row "${h}" is missing.`,
            )
            ? `${issue} "${issue.slice(5, -13)}" is a header of ${table.tab}, already given as key_header or value_header. In a single table each column is one key from the key column, so remove this column.`
            : `${issue} Keys in ${table.tab} not bound yet: ${bound.headers.extra.join(', ') || 'none'}. Copy a key exactly as written.`
          : issue;
    issues.push({ where, message });
  }
  return issues;
}

function cellText(snapshot: Snapshot, ref: string): string | null {
  const bang = ref.lastIndexOf('!');
  const tab = ref.slice(0, bang).replace(/^'(.*)'$/, '$1');
  const match = /^([A-Z]+)(\d+)$/.exec(ref.slice(bang + 1));
  const values = tabValues(snapshot, tab)?.values;
  if (!match || !values) return null;
  let column = 0;
  for (const ch of match[1]!) column = column * 26 + ch.charCodeAt(0) - 64;
  const value = values[Number(match[2]) - 1]?.[column - 1];
  return value === undefined || value === null ? '' : String(value);
}

function validateSource(
  sources: Inventory['sources'],
  snapshot: Snapshot,
  source: { cells: string[]; quote: string },
  where: string,
  requirePolicy: boolean,
): Issue[] {
  const issues: Issue[] = [];
  const texts: string[] = [];
  for (const ref of source.cells) {
    const text = cellText(snapshot, ref);
    if (text === null) {
      issues.push({ where, message: `Cell ${ref} does not exist.` });
      continue;
    }
    texts.push(text);
    const tab = ref.slice(0, ref.lastIndexOf('!')).replace(/^'(.*)'$/, '$1');
    const role = sources.find((s) => s.tab === tab)?.role;
    if (tab === checksTab(snapshot))
      issues.push({
        where,
        message:
          "Cites the tab of checks, the owner's expected outcomes, which drafting must not use.",
      });
    else if (role === 'untrusted')
      issues.push({ where, message: `Cites ${ref}, an untrusted source.` });
    else if (requirePolicy && role !== 'policy' && role !== 'data')
      issues.push({
        where,
        message: `Cites ${ref}, which is not a policy or data source.`,
      });
  }
  const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();
  if (
    texts.length &&
    !normalise(texts.join(' ')).includes(normalise(source.quote))
  )
    issues.push({
      where,
      message: `The quote is not in the cited cells: "${source.quote.slice(0, 80)}".`,
    });
  return issues;
}

export function validateLogic(
  inventory: Inventory,
  model: DataModel,
  logic: Logic,
  snapshot: Snapshot,
): Issue[] {
  const issues: Issue[] = [];
  const rulebook: Rulebook = {
    schema_version: 1,
    ...inventory,
    ...model,
    ...logic,
  };

  // Coverage against the inventory: nothing it found may drop out unnoticed.
  const statements = new Map(inventory.statements.map((st) => [st.id, st]));
  const unknown = (id: string, where: string) =>
    statements.has(id)
      ? []
      : [
          {
            where,
            message: `No inventory statement "${id}". Statements: ${[...statements.keys()].join(', ')}.`,
          },
        ];
  for (const rule of logic.rules)
    if (rule.statement)
      issues.push(...unknown(rule.statement, `rules.${rule.id}.statement`));
  for (const entry of logic.not_ruled)
    issues.push(...unknown(entry.statement, `not_ruled.${entry.statement}`));
  for (const entry of logic.data_model_requests)
    issues.push(
      ...unknown(entry.statement, `data_model_requests.${entry.statement}`),
    );
  for (const st of inventory.statements) {
    const ruled = logic.rules.some((r) => r.statement === st.id);
    const notRuled = logic.not_ruled.find((n) => n.statement === st.id);
    const requested = logic.data_model_requests.some(
      (r) => r.statement === st.id,
    );
    const quote = `(${st.source.cells.join(', ')}: "${st.source.quote.slice(0, 80)}")`;
    if (!ruled && !notRuled && !requested)
      issues.push({
        where: `statements.${st.id}`,
        message: `Statement ${st.id} ${quote} is neither a rule, nor in not_ruled, nor in data_model_requests. Write a rule with statement: "${st.id}".`,
      });
    else if (notRuled && !ruled && st.checkable)
      issues.push({
        where: `not_ruled.${st.id}`,
        message: `The inventory found ${st.id} checkable ${quote}, so it needs a rule. If the data model lacks something it needs, move it to data_model_requests and say what to add.`,
      });
  }
  for (const value of inventory.changeable)
    if (
      !logic.editable.some(
        (e) => e.name === value.name && e.kind === value.kind,
      )
    )
      issues.push({
        where: `editable.${value.name}`,
        message: `The inventory lists "${value.name}" as changeable for ${value.kind}, but editable has no { kind: "${value.kind}", name: "${value.name}" }. Declare it${model.items.some((i) => i.kind === value.kind) ? '' : `, and request the kind "${value.kind}" in data_model_requests if the data model lacks it`}.`,
      });

  const kinds = new Set(model.items.map((k) => k.kind));
  const allFacts: Record<string, ScopeFacts> = {};
  for (const kind of model.items)
    allFacts[kind.kind] = logic.facts
      .filter((f) => f.kind === kind.kind)
      .map(({ name, type }) => ({ name, type }));

  if (!logic.rules.length)
    issues.push({
      where: 'rules',
      message:
        'No rules. Every policy statement the bound data could check needs a rule, with the facts it needs written as formulas. not_ruled is only for statements no formula over the data could check.',
    });
  if (!logic.editable.length)
    issues.push({
      where: 'editable',
      message:
        'No editable values, so a proposal could change nothing. Declare every value the policy says a proposal may change, for the kind of item it belongs to.',
    });

  for (const item of [...logic.editable, ...logic.facts, ...logic.rules])
    if (!kinds.has(item.kind))
      issues.push({
        where: `${'id' in item ? item.id : item.name}`,
        message: `No item kind "${item.kind}".`,
      });

  for (const kind of model.items) {
    const editable = logic.editable.filter((e) => e.kind === kind.kind);
    const facts = logic.facts.filter((f) => f.kind === kind.kind);
    const seen = new Set<string>();
    facts.forEach((fact, i) => {
      if (seen.has(fact.name))
        issues.push({
          where: `facts.${fact.name}`,
          message: 'Name used twice.',
        });
      seen.add(fact.name);
      if (/\bchange\b/.test(fact.expr))
        issues.push({
          where: `facts.${fact.name}`,
          message: 'Facts must not read change.',
        });
      const env = buildEnvironment(
        rulebook,
        {
          kind: kind.kind,
          facts: facts.slice(0, i).map(({ name, type }) => ({ name, type })),
          change: [],
        },
        allFacts,
      );
      const checked = checkFormula(env, fact.expr, fact.type);
      if (!checked.ok)
        issues.push({ where: `facts.${fact.name}`, message: checked.error });
    });
    const full = buildEnvironment(
      rulebook,
      {
        kind: kind.kind,
        facts: allFacts[kind.kind] ?? [],
        change: editable.map((e) => e.name),
      },
      allFacts,
    );
    for (const field of editable) {
      const d = checkFormula(
        full,
        field.default,
        CEL_OF[field.type] === 'double' ? 'double' : 'int',
      );
      if (!d.ok)
        issues.push({
          where: `editable.${field.name}.default`,
          message: d.error,
        });
      if (field.applies_when) {
        const a = checkFormula(full, field.applies_when, 'bool');
        if (!a.ok)
          issues.push({
            where: `editable.${field.name}.applies_when`,
            message: a.error,
          });
      }
      issues.push(
        ...validateSource(
          inventory.sources,
          snapshot,
          field.source,
          `editable.${field.name}`,
          true,
        ),
      );
    }
    const ids = new Set<string>();
    for (const rule of logic.rules.filter((r) => r.kind === kind.kind)) {
      if (ids.has(rule.id))
        issues.push({ where: `rules.${rule.id}`, message: 'Id used twice.' });
      ids.add(rule.id);
      for (const [part, expr] of [
        ['when', rule.when],
        ['assert', rule.assert],
      ] as const) {
        if (!expr) continue;
        const checked = checkFormula(full, expr, 'bool');
        if (!checked.ok)
          issues.push({
            where: `rules.${rule.id}.${part}`,
            message: checked.error,
          });
      }
      issues.push(
        ...validateSource(
          inventory.sources,
          snapshot,
          rule.source,
          `rules.${rule.id}`,
          rule.origin === 'sheet',
        ),
      );
    }
  }
  return issues;
}
