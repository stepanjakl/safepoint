import { CHECKS_TAB } from './checks';
import {
  bindTables,
  buildEnvironment,
  checkFormula,
  tabValues,
  type ScopeFacts,
  type Snapshot,
} from './engine';
import type { DataModel, Logic, Rulebook } from './schema';

/*
  Deterministic checks on a draft before anyone is asked to approve it. The
  same list goes back to the model as feedback while it drafts.
*/

export type Issue = { where: string; message: string };

export function validateDataModel(
  model: DataModel,
  snapshot: Snapshot,
): Issue[] {
  const issues: Issue[] = [];
  const tabs = snapshot.tabs.filter((t) => t !== CHECKS_TAB);
  for (const tab of tabs)
    if (!model.sources.some((s) => s.tab === tab))
      issues.push({
        where: 'sources',
        message: `Tab "${tab}" is not classified.`,
      });
  for (const source of model.sources)
    if (!tabs.includes(source.tab))
      issues.push({
        where: 'sources',
        message: `There is no tab "${source.tab}".`,
      });

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
    const role = model.sources.find((s) => s.tab === table.tab)?.role;
    if (role === 'untrusted')
      issues.push({
        where: `tables.${table.name}`,
        message: `"${table.tab}" is untrusted; rules cannot read it.`,
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
  if (issues.length) return issues;

  // Reading every cell is the real test of a binding.
  const partial = {
    ...model,
    schema_version: 1 as const,
    editable: [],
    facts: [],
    rules: [],
    not_ruled: [],
    notes: [],
  };
  for (const bound of bindTables(partial, snapshot))
    for (const issue of bound.bound.issues)
      issues.push({ where: `tables.${bound.table.name}`, message: issue });

  const { timing } = model;
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
    if (day?.type !== 'weekday')
      issues.push({
        where: `timing.${t.name}`,
        message: `"${t.day}" is not a weekday column of ${t.table}.`,
      });
    if (time?.type !== 'time_of_day')
      issues.push({
        where: `timing.${t.name}`,
        message: `"${t.time}" is not a time-of-day column of ${t.table}.`,
      });
    if (table.columns.some((c) => c.name === t.name))
      issues.push({
        where: `timing.${t.name}`,
        message: 'Clashes with a column name.',
      });
  }
  if (timing.period === 'week') {
    const until = timing.current_until;
    const def =
      until &&
      timing.times.find(
        (t) => t.table === until.table && t.name === until.time,
      );
    if (!def)
      issues.push({
        where: 'timing.current_until',
        message: 'Must name one of the deadline times.',
      });
    else if (def.role !== 'deadline')
      issues.push({
        where: 'timing.current_until',
        message: 'Must be a deadline, not an observation.',
      });
    else if (model.tables.find((x) => x.name === def.table)?.shape !== 'single')
      issues.push({
        where: 'timing.current_until',
        message: 'Must come from a single (key/value) table.',
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
        message: `No column "${item.key}" in ${item.table}.`,
      });
    else if (item.group !== (table.shape === 'list'))
      issues.push({
        where: `items.${item.kind}`,
        message: 'group must be true exactly when the table is a list.',
      });
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
  model: DataModel,
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
    const role = model.sources.find((s) => s.tab === tab)?.role;
    if (tab === CHECKS_TAB)
      issues.push({
        where,
        message: 'Cites the Checks tab, which drafting must not use.',
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
  model: DataModel,
  logic: Logic,
  snapshot: Snapshot,
): Issue[] {
  const issues: Issue[] = [];
  const rulebook: Rulebook = { schema_version: 1, ...model, ...logic };
  const kinds = new Set(model.items.map((k) => k.kind));
  const allFacts: Record<string, ScopeFacts> = {};
  for (const kind of model.items)
    allFacts[kind.kind] = logic.facts
      .filter((f) => f.kind === kind.kind)
      .map(({ name, type }) => ({ name, type }));

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
      const d = checkFormula(full, field.default, 'int');
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
          model,
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
          model,
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
