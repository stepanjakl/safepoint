import { checksTab } from './checks';
import { rulebookSchema } from './schema';
import {
  CEL_OF,
  bindTables,
  evaluate,
  buildEnvironment,
  type Bound,
  checkFormula,
  tabValues,
  type ScopeFacts,
  type Snapshot,
} from './engine';
import type {
  DataModel,
  Inventory,
  Logic,
  MayChange,
  Rulebook,
} from './schema';

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

/*
  Every check a rulebook must pass, in the order drafting meets them. Approval
  runs it on a draft; each evaluation runs it on the active rulebook, because
  the sheet can change under an approved rulebook and checks are added after
  it was approved.
*/
export function validateRulebook(
  rulebook: Rulebook,
  snapshot: Snapshot,
  mayChange: MayChange[],
  runAt: number = Date.now(),
): Issue[] {
  return [
    ...validateInventory(rulebook, snapshot, mayChange),
    ...validateDataModel(rulebook, rulebook, snapshot),
    ...validateLogic(rulebook, rulebook, rulebook, snapshot, runAt),
    ...rulebook.data_model_requests.map((r) => ({
      where: `data_model_requests.${r.statement}`,
      message: `Unresolved: ${r.request}`,
    })),
  ];
}

// A rulebook saved earlier, perhaps in an older shape: read as today's
// schema first, so one that cannot be read is reported rather than crashing.
export function validateSaved(
  saved: unknown,
  snapshot: Snapshot,
  mayChange: MayChange[],
): Issue[] {
  const parsed = rulebookSchema.safeParse(saved);
  if (!parsed.success)
    return parsed.error.issues.slice(0, 5).map((i) => ({
      where: i.path.join('.') || 'rulebook',
      message: `Saved in a shape the current checks cannot read: ${i.message}.`,
    }));
  return validateRulebook(parsed.data, snapshot, mayChange);
}

export function validateInventory(
  inventory: Inventory,
  snapshot: Snapshot,
  // What the process lets a proposal change: the inventory lists exactly these.
  mayChange?: MayChange[],
): Issue[] {
  const issues: Issue[] = [];
  if (mayChange?.length) {
    const listed = new Set(inventory.changeable.map((c) => c.name));
    for (const value of mayChange)
      if (!listed.has(value.name))
        issues.push({
          where: 'changeable',
          message: `The process lets a proposal change "${value.name}" (${value.meaning} Applies to ${value.applies_to}.) Add it to changeable, with the kind it belongs to.`,
        });
    for (const value of inventory.changeable)
      if (!mayChange.some((m) => m.name === value.name))
        issues.push({
          where: `changeable.${value.name}`,
          message: `"${value.name}" is not something the process lets a proposal change. Only ${mayChange.map((m) => m.name).join(', ')} may change: remove it.`,
        });
  }
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
    if (value.source)
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
  // A need is a column header, or a row: a value in the key column of a
  // keyed or list table, read in formulas as table['key'].
  const isRowOf = (table: DataModel['tables'][number], key: string) => {
    if (table.shape === 'single' || !table.key_header) return false;
    const values = tabValues(snapshot, table.tab)?.values ?? [];
    const at = (values[0] ?? []).findIndex(
      (h) => String(h ?? '').trim() === table.key_header,
    );
    return (
      at >= 0 &&
      values.slice(1).some((row) => String(row[at] ?? '').trim() === key)
    );
  };
  for (const [key, ids] of needed) {
    const [tab, header] = key.split('\u0000') as [string, string];
    if (
      !model.tables.some(
        (t) =>
          t.tab === tab &&
          (t.columns.some((c) => c.header === header) || isRowOf(t, header)),
      )
    )
      unbound.push({
        where: `tables`,
        message: `Statement${ids.length > 1 ? 's' : ''} ${ids.join(', ')} need${ids.length > 1 ? '' : 's'} "${header}" from ${tab}, but no table binds it. If it is a header, bind that column; if it is a row (a value in the first column), bind ${tab} as a keyed table whose key column holds it.`,
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
      // Saying what the cells hold lets the next attempt quote, not guess.
      message: `The quote is not in the cited cells: "${source.quote.slice(0, 80)}". They hold ${source.cells
        .map(
          (ref) => `${ref}: "${(cellText(snapshot, ref) ?? '').slice(0, 80)}"`,
        )
        .join(
          ', ',
        )}. Quote part of that text exactly, or cite the cell that says it${
        /^(editable|changeable)\./.test(where)
          ? '; or set source to null, since the process, not the sheet, says what may change'
          : ''
      }.`,
    });
  return issues;
}

export function validateLogic(
  inventory: Inventory,
  model: DataModel,
  logic: Logic,
  snapshot: Snapshot,
  // The run time of the dry run; tests pin it, drafting uses now.
  runAt: number = Date.now(),
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
  for (const fact of logic.facts)
    if (fact.statement)
      issues.push(...unknown(fact.statement, `facts.${fact.name}.statement`));
  for (const entry of logic.not_ruled)
    issues.push(...unknown(entry.statement, `not_ruled.${entry.statement}`));
  const normalise = (text: string) =>
    text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  // Every text in the sheet, as a name could be written for it: a header,
  // a key or a parameter name.
  const sheetWords = new Set(
    snapshot.valueRanges.flatMap((vr) =>
      (vr.values ?? []).flatMap((row) =>
        row
          .filter((cell): cell is string => typeof cell === 'string')
          .map(normalise),
      ),
    ),
  );
  for (const entry of logic.data_model_requests) {
    issues.push(
      ...unknown(entry.statement, `data_model_requests.${entry.statement}`),
    );
    // A request for a column already bound spends the revision round on
    // nothing. Only names joined by underscores, which ordinary words are not.
    const bound = model.tables.flatMap((t) =>
      t.columns
        .filter(
          (c) =>
            c.name.includes('_') &&
            new RegExp(`\\b${c.name}\\b`, 'i').test(entry.request),
        )
        .map((c) =>
          t.shape === 'single'
            ? `${t.name}.${c.name}`
            : t.shape === 'keyed'
              ? `${t.name}[key].${c.name}`
              : `${c.name} on each row of ${t.name}`,
        ),
    );
    if (bound.length)
      issues.push({
        where: `data_model_requests.${entry.statement}`,
        message: `Asks for what the data model already has: ${bound.join(', ')} (${entry.request.slice(0, 120)}). Read it there and write the rule. If you need something different from it, say in the request what differs.`,
      });
    // The data model binds what the sheet holds. A request naming only
    // things the sheet has nowhere asks for a result, which is a fact.
    const named = [
      ...new Set(entry.request.match(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/gi) ?? []),
    ];
    const known = (name: string) =>
      sheetWords.has(normalise(name)) ||
      model.tables.some((t) => t.columns.some((c) => c.name === name)) ||
      model.timing.times.some((t) => t.name === name);
    // A quoted header, key or name the sheet holds makes it a real request.
    const quoted = [
      ...entry.request.matchAll(/['"`‘“]([^'"`’”]+)['"`’”]/g),
    ].map((m) => normalise(m[1]!));
    if (
      !bound.length &&
      named.length &&
      !named.some(known) &&
      !quoted.some((q) => sheetWords.has(q))
    )
      issues.push({
        where: `data_model_requests.${entry.statement}`,
        message: `Asks for ${named.map((x) => `"${x}"`).join(', ')}, which the sheet does not hold anywhere (${entry.request.slice(0, 120)}). The data model only reads what the sheet has; a value worked out from it is a fact, and a condition is a rule. Write it as one instead; or, if the sheet holds it under another name, quote that header as written.`,
      });
  }
  for (const st of inventory.statements) {
    // A rule checks a statement; a fact implements a definition.
    const ruled =
      logic.rules.some((r) => r.statement === st.id) ||
      logic.facts.some((f) => f.statement === st.id);
    const notRuled = logic.not_ruled.find((n) => n.statement === st.id);
    const requested = logic.data_model_requests.some(
      (r) => r.statement === st.id,
    );
    const quote = `(${st.source.cells.join(', ')}: "${st.source.quote.slice(0, 80)}")`;
    if (!ruled && !notRuled && !requested)
      issues.push({
        where: `statements.${st.id}`,
        message: `Statement ${st.id} ${quote} is neither a rule, nor in not_ruled, nor in data_model_requests. Write a rule with statement: "${st.id}", or, if it defines how a value is calculated, a fact with statement: "${st.id}".`,
      });
    else if (notRuled && !ruled && st.checkable)
      issues.push({
        where: `not_ruled.${st.id}`,
        message: `The inventory found ${st.id} checkable ${quote}, so it needs a rule. If the data model lacks something it needs, move it to data_model_requests and say what to add.`,
      });
  }
  // Each assumption offers real alternatives for the owner to pick from.
  const norm = (t: string) => t.toLowerCase().replace(/\W+/g, ' ').trim();
  // An alternative whose words all appear in the assumption only rewords it
  // ("Treat missing stock as zero" against "Missing stock counts as zero").
  // Number words count as their digits: "zero" and "0" are the same answer.
  const words = (t: string) =>
    new Set(
      norm(t)
        .split(' ')
        .map((w) => w.replace(/s$/, ''))
        .map((w) => DIGIT_OF.get(w) ?? w)
        .filter((w) => w && !FILLER_WORDS.has(w)),
    );
  for (const part of [
    ...logic.rules.map((r) => ({ where: `rules.${r.id}`, assumes: r.assumes })),
    ...logic.facts.map((f) => ({
      where: `facts.${f.name}`,
      assumes: f.assumes,
    })),
  ])
    part.assumes.forEach((a, i) => {
      const readings = [a.assumption, ...a.alternatives].map(norm);
      const said = words(a.assumption);
      const reworded = a.alternatives.some((alt) =>
        [...words(alt)].every((w) => said.has(w)),
      );
      if (new Set(readings).size < readings.length || reworded)
        issues.push({
          where: `${part.where}.assumes.${i}`,
          message: `"${a.assumption}": its alternatives must each give a different answer from it and from each other (another number, source or way to count), not the same answer in other words, so the owner has a real choice.`,
        });
      const code = [
        ...new Set(
          [a.assumption, ...a.alternatives].flatMap(
            (t) => t.match(CODE_IN_TEXT) ?? [],
          ),
        ),
      ];
      if (code.length)
        issues.push({
          where: `${part.where}.assumes.${i}`,
          message: `"${a.assumption}": the owner reads the assumption and its alternatives, so write them in everyday words, without ${code.map((c) => `"${c}"`).join(', ')}. Say what the name or symbol means instead, and put the field or formula part in technical.`,
        });
    });

  // A rule's sheet id is the id of the statement it implements.
  for (const rule of logic.rules)
    if (rule.statement && rule.sheet_rule && rule.sheet_rule !== rule.statement)
      issues.push({
        where: `rules.${rule.id}.sheet_rule`,
        message: `Implements statement ${rule.statement} but is labelled sheet rule ${rule.sheet_rule}. sheet_rule is the sheet's own id of the statement it implements: "${rule.statement}", or null if the sheet gives it none.`,
      });

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
      // A fixed number gives every item the same start, and does not follow
      // the sheet when the cell it was copied from changes.
      if (
        /^\s*-?\d+(\.\d+)?\s*$/.test(field.default) &&
        Number(field.default) !== 0
      )
        issues.push({
          where: `editable.${field.name}.default`,
          message: `Starts every ${kind.kind} at the fixed number ${field.default.trim()}${field.source ? `, copied from ${field.source.cells.join(', ')}` : ''}. Read the starting value from the sheet for each item (such as table[key].field, or row.field), so it follows the sheet; a fixed start is only right when it is 0 or the policy names that number.`,
        });
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
      if (field.source)
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
  // Only a rulebook whose formulas all type-check is worth running.
  if (issues.length) return issues;
  return [
    ...literalKeyIssues(rulebook, snapshot),
    ...patternIssues(rulebook, snapshot),
    ...choiceIssues(rulebook),
    ...dryRunIssues(rulebook, snapshot, runAt),
  ];
}

const listKeys = (keys: string[]) =>
  `${keys.slice(0, 6).join(', ')}${keys.length > 6 ? `, … (${keys.length} in all)` : ''}`;

// Every formula of a rulebook, with where it lives.
function formulasOf(rulebook: Rulebook): { where: string; expr: string }[] {
  return [
    ...rulebook.facts.map((f) => ({ where: `facts.${f.name}`, expr: f.expr })),
    ...rulebook.editable.flatMap((e) => [
      { where: `editable.${e.name}.default`, expr: e.default },
      ...(e.applies_when
        ? [{ where: `editable.${e.name}.applies_when`, expr: e.applies_when }]
        : []),
    ]),
    ...rulebook.rules.flatMap((r) => [
      ...(r.when ? [{ where: `rules.${r.id}.when`, expr: r.when }] : []),
      { where: `rules.${r.id}.assert`, expr: r.assert },
    ]),
  ];
}

/*
  A key written into a formula, table['X'] or 'X' in table, must be a key the
  table has: a lookup of a key that is not there type-checks, and is then
  always absent or always false. Keys match exactly, case included.
*/
function literalKeyIssues(rulebook: Rulebook, snapshot: Snapshot): Issue[] {
  const keys = new Map<string, string[]>();
  for (const { table, rows } of bindTables(rulebook, snapshot))
    if (table.shape === 'keyed')
      keys.set(
        table.name,
        rows.map((r) => r.key),
      );
  const issues: Issue[] = [];
  const quoted = `(?:'([^']*)'|"([^"]*)")`;
  const patterns = [
    new RegExp(`\\b([a-z][a-z0-9_]*)\\[\\s*${quoted}\\s*\\]`, 'g'),
    new RegExp(`${quoted}\\s+in\\s+([a-z][a-z0-9_]*)\\b`, 'g'),
  ];
  for (const { where, expr } of formulasOf(rulebook)) {
    const found = new Set<string>();
    for (const match of expr.matchAll(patterns[0]!))
      found.add(`${match[1]}\u0000${match[2] ?? match[3]}`);
    for (const match of expr.matchAll(patterns[1]!))
      found.add(`${match[3]}\u0000${match[1] ?? match[2]}`);
    for (const pair of found) {
      const [table, key] = pair.split('\u0000') as [string, string];
      const known = keys.get(table);
      if (!known || known.includes(key)) continue;
      const near = known.find((k) => k.toLowerCase() === key.toLowerCase());
      issues.push({
        where,
        message: `Looks up "${key}" in ${table}, but ${table} has no row with that key, so the lookup is always absent or false. ${near ? `Did you mean "${near}"? Keys match exactly, case included.` : `Its keys: ${listKeys(known)}.`}`,
      });
    }
  }
  return issues;
}

/*
  Two mistakes that type-check and run, found by reading the formulas:
  - an age taken backwards: an observation minus run_at is never positive,
    so a limit on it never fires;
  - a formula naming one specific item: a rule applies to every item of its
    kind, through key, row or rows.
*/
function patternIssues(rulebook: Rulebook, snapshot: Snapshot): Issue[] {
  const issues: Issue[] = [];
  const observations = rulebook.timing.times
    .filter((t) => t.role === 'observation')
    .map((t) => t.name);
  const bound = new Map(
    bindTables(rulebook, snapshot).map((b) => [b.table.name, b]),
  );
  const itemKeys = new Set(
    rulebook.items.flatMap((kind) =>
      (bound.get(kind.table)?.rows ?? []).map((r) =>
        String(r.values[kind.key] ?? r.key),
      ),
    ),
  );
  // The text values each text column holds, by column name.
  const valuesOf = new Map<string, Set<string>>();
  for (const table of rulebook.tables)
    for (const column of table.columns)
      if (['key', 'text', 'one_of', 'weekday'].includes(column.type))
        for (const row of bound.get(table.name)?.rows ?? []) {
          const value = row.values[column.name];
          if (typeof value === 'string')
            valuesOf.set(
              column.name,
              (valuesOf.get(column.name) ?? new Set()).add(value),
            );
        }
  const quoted = `(?:'([^']*)'|"([^"]*)")`;
  const comparisons = [
    new RegExp(`\\.([a-z][a-z0-9_]*)\\s*(?:==|!=)\\s*${quoted}`, 'g'),
    new RegExp(
      `${quoted}\\s*(?:==|!=)\\s*[^\\s()]*\\.([a-z][a-z0-9_]*)\\b`,
      'g',
    ),
  ];
  for (const { where, expr } of formulasOf(rulebook)) {
    // A text column compared with a value it never holds.
    const compared = new Set<string>();
    for (const m of expr.matchAll(comparisons[0]!))
      compared.add(`${m[1]}\u0000${m[2] ?? m[3]}`);
    for (const m of expr.matchAll(comparisons[1]!))
      compared.add(`${m[3]}\u0000${m[1] ?? m[2]}`);
    for (const pair of compared) {
      const [field, value] = pair.split('\u0000') as [string, string];
      const values = valuesOf.get(field);
      if (!values || values.has(value)) continue;
      const near = [...values].find(
        (v) => v.toLowerCase() === value.toLowerCase(),
      );
      issues.push({
        where,
        message: `Compares ${field} with "${value}", but ${field} never holds it, so the comparison never changes. ${near ? `Did you mean "${near}"?` : `Its values: ${listKeys([...values])}.`}`,
      });
    }
    for (const name of observations)
      if (new RegExp(`\\b${name}\\s*\\)?\\s*-\\s*run_at\\b`).test(expr))
        issues.push({
          where,
          message: `Takes run_at away from ${name}, an observation, which happened before the run: the result is never positive, so a limit on it never fires. An age is run_at - ${name}.`,
        });
    const named = [...expr.matchAll(/\[\s*(?:'([^']*)'|"([^"]*)")\s*\]/g)]
      .map((m) => m[1] ?? m[2]!)
      .filter((key) => itemKeys.has(key));
    for (const key of new Set(named))
      issues.push({
        where,
        message: `Names one specific item, "${key}". A rule or fact applies to every item of its kind: reach the item's own values through key, row or rows, and other items through the keys in its rows.`,
      });
  }
  return issues;
}

const DIGIT_OF = new Map(
  [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
  ].map((w, i) => [w, String(i)]),
);

// Words that carry no answer, left out when comparing an alternative with
// its assumption.
const FILLER_WORDS = new Set(
  'a an the as is are be it its they them to of in on for with when if and or treat treated count counted use used value'.split(
    ' ',
  ),
);

// What reads as code rather than words in text the owner answers: a name
// joined by underscores, a dotted path, brackets, code operators, CEL's
// optional calls. "e.g." and "£4.75" are left alone.
const CODE_IN_TEXT =
  /\b\w*[a-z]_\w+\b|\b[a-z_]+\.\??[a-z_]{2,}\b|[[\]{}]|==|!=|&&|\|\||\.\?|\b(?:orValue|hasValue)\b/gi;

/*
  An assumption is needed where a formula makes a choice its statement's text
  does not: a number the text does not give, or a default for a blank cell.
  Each must be named in assumes, so a reviewer sees it; a formula that follows
  its text plainly needs none. (Inputs a statement does not mention are not
  required: judged against the model's own inventory they were mostly noise;
  the Check step shows what each rule read.) Applies to rules and facts that
  implement a statement; the model's own rules are labelled as suggestions.
*/
const NUMBER_WORDS: [string, number][] = [
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['half', 2],
  ['twice', 2],
  ['double', 2],
  ['week', 7],
];

function choiceIssues(rulebook: Rulebook): Issue[] {
  const issues: Issue[] = [];
  // Values the sheet may leave blank: optional columns, and times built from
  // an optional column. Testing one for a value decides what a blank means.
  const optional = new Set(
    rulebook.tables.flatMap((t) =>
      t.columns.filter((c) => !c.required).map((c) => c.name),
    ),
  );
  for (const time of rulebook.timing.times)
    if (optional.has(time.day) || optional.has(time.time))
      optional.add(time.name);
  const minor = 10 ** (rulebook.currency?.minor_units ?? 2);
  const parts = [
    ...rulebook.rules.map((r) => ({
      where: `rules.${r.id}`,
      statement: r.statement,
      assumes: r.assumes,
      exprs: [r.when, r.assert],
      table: rulebook.items.find((k) => k.kind === r.kind)?.table,
    })),
    ...rulebook.facts.map((f) => ({
      where: `facts.${f.name}`,
      statement: f.statement,
      assumes: f.assumes,
      exprs: [f.expr],
      table: rulebook.items.find((k) => k.kind === f.kind)?.table,
    })),
  ];
  // A missing row is one decision per table, whichever rules rely on it: it
  // is asked once, of the first, and any assumption naming the table answers.
  const saidAnywhere = parts
    .flatMap((p) => p.assumes.map((a) => `${a.assumption} ${a.technical}`))
    .join(' ')
    .toLowerCase();
  const askedTables = new Set<string>();
  for (const part of parts) {
    const st = rulebook.statements.find((x) => x.id === part.statement);
    if (!st) continue;
    // The numbers its text gives, as digits or words (money also in minor
    // units); a product of two of them, such as four weekends times 100, is
    // arithmetic on the text, not a choice.
    const numbers = new Set<number>([0, 1, 100]);
    const text = st.source.quote.toLowerCase();
    for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) {
      numbers.add(Number(m[0]));
      numbers.add(Math.round(Number(m[0]) * minor));
    }
    for (const [word, n] of NUMBER_WORDS)
      if (new RegExp(`\\b${word}\\b`).test(text)) numbers.add(n);
    const said = part.assumes
      .map((a) => `${a.assumption} ${a.technical}`)
      .join(' ')
      .toLowerCase();
    const choices: { what: string; mention: string }[] = [];
    for (const expr of part.exprs) {
      if (!expr) continue;
      const code = expr.replace(/'[^']*'|"[^"]*"/g, "''");
      const given = [...numbers];
      for (const m of code.matchAll(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g))
        if (
          !numbers.has(Number(m[0])) &&
          !given.some((a) => given.some((b) => a * b === Number(m[0])))
        )
          choices.push({
            what: `uses the number ${m[0]}, which is not in the statement`,
            mention: m[0],
          });
      for (const m of code.matchAll(/\.\?([a-z_][a-z0-9_]*)\.orValue\(/g))
        choices.push({
          what: `decides what a blank ${m[1]} means`,
          mention: m[1]!,
        });
      // has(x.f) and x.?f.hasValue() on a value the sheet may leave blank:
      // the formula then passes, skips or counts the item differently.
      for (const m of code.matchAll(
        /\.\?([a-z_][a-z0-9_]*)\.hasValue\(\)|\bhas\(\s*([a-z_][a-z0-9_]*)[^()]*?\.([a-z_][a-z0-9_]*)\s*\)/g,
      )) {
        const field = m[1] ?? m[3]!;
        const root = m[2];
        if (
          optional.has(field) &&
          root !== 'change' &&
          root !== 'facts' &&
          !root?.endsWith('_facts')
        )
          choices.push({
            what: `decides what happens when ${field} is blank`,
            mention: field,
          });
      }
      // key in another table: an item with no row there is skipped, passed
      // or counted differently, which the sheet does not say.
      for (const m of code.matchAll(/\bkey\s+in\s+([a-z_][a-z0-9_]*)\b/g)) {
        const table = rulebook.tables.find((t) => t.name === m[1]);
        if (
          table &&
          table.name !== part.table &&
          !saidAnywhere.includes(table.name.toLowerCase()) &&
          !askedTables.has(table.name)
        ) {
          askedTables.add(table.name);
          choices.push({
            what: `decides what happens to an item with no row in ${table.tab} (asked once: other rules relying on it follow the answer)`,
            mention: table.name,
          });
        }
      }
    }
    const unexplained = [
      ...new Map(choices.map((c) => [c.what, c])).values(),
    ].filter((c) => !said.includes(c.mention.toLowerCase()));
    if (unexplained.length)
      issues.push({
        where: `${part.where}.assumes`,
        message: `This formula ${unexplained.map((c) => c.what).join('; ')}. Name each in assumes: what was assumed, in plain words, and in technical the field or number (${unexplained.map((c) => `"${c.mention}"`).join(', ')}); or follow what the statement says.`,
      });
  }
  return issues;
}

/*
  Runs the draft on the sheet. A formula that type-checks can still fail on
  real rows, most often by reading a cell that is blank in some of them, and
  a rule that cannot be evaluated blocks its item. Errors that only follow
  from another (a rule reading a fact that failed) are left out, so the
  problem reported is the cause.
*/
function dryRunIssues(
  rulebook: Rulebook,
  snapshot: Snapshot,
  runAt: number,
): Issue[] {
  let items;
  try {
    items = evaluate(rulebook, snapshot, runAt).items;
  } catch (error) {
    return [
      {
        where: 'rulebook',
        message: `Running it on the sheet failed: ${(error as Error).message.split('\n')[0]}`,
      },
    ];
  }
  const failures = new Map<
    string,
    { message: string; keys: string[]; total: number }
  >();
  const note = (where: string, kind: string, message: string, key: string) => {
    const id = `${where}\u0000${message}`;
    const entry = failures.get(id) ?? {
      message,
      keys: [],
      total: items.filter((i) => i.kind === kind).length,
    };
    entry.keys.push(key);
    failures.set(id, entry);
  };
  for (const item of items) {
    const failed = new Set<string>();
    for (const fact of item.facts)
      if (fact.error) {
        failed.add(fact.name);
        note(`facts.${fact.name}`, item.kind, fact.error, item.key);
      }
    for (const field of item.change)
      if (field.error) {
        failed.add(field.name);
        note(`editable.${field.name}`, item.kind, field.error, item.key);
      }
    for (const rule of item.rules) {
      if (rule.status !== 'error' || !rule.detail) continue;
      const message = rule.detail.replace(/^Cannot evaluate: /, '');
      const missing = /^No such key: (\w+)$/.exec(message)?.[1];
      if (missing && failed.has(missing)) continue;
      note(`rules.${rule.id}`, item.kind, message, item.key);
    }
  }
  const editableNames = new Set(rulebook.editable.map((e) => e.name));
  return [...failures].map(([id, failure]) => {
    const where = id.split('\u0000')[0]!;
    const missing = /^No such key: (\w+)$/.exec(failure.message)?.[1];
    // The fix depends on what is missing, and where.
    const hint = !missing
      ? ''
      : where.startsWith('editable.')
        ? ` "${missing}" is blank for these items. If they have no such value, narrow applies_when to the items that have it (for example with .?${missing}.hasValue()), so nothing is proposed for them. Use .?${missing}.orValue(default) only when the default is a real starting value, never a placeholder such as 0.`
        : editableNames.has(missing)
          ? ` change.${missing} does not apply to these items (its applies_when is false for them). Give this rule when: has(change.${missing}), so it only judges items where the value applies.`
          : ` "${missing}" is blank or absent for these items. Narrow when to the items that have it (test .?${missing}.hasValue()), or read it with .?${missing}.orValue(default) when the default is a real value, never a placeholder.`;
    return {
      where,
      message: `Cannot be evaluated for ${failure.keys.length} of ${failure.total} items (${listKeys(failure.keys)}): ${failure.message}.${hint} An item whose rule cannot be evaluated is blocked.`,
    };
  });
}
