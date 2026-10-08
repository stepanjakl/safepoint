import { inWeek, WEEKDAYS, type LocalDate, type Weekday } from './cycle';
import {
  CEL_OF,
  evaluate,
  fieldType,
  tabValues,
  type Disposition,
  type Snapshot,
} from './engine';
import { interpretCell } from './field-types';
import type { Rulebook } from './schema';

/*
  Checks are expected outcomes written by the sheet's owner, in a tab the
  drafting model never sees. The tab is recognised by its header row, not its
  name. Its format belongs to the engine, not to any scenario:

    check_id | run_at, or run_day and run_time | item | set | expect | because | note

  run_at is a date and time (a date cell, or text like 2026-10-15 08:45); a
  weekday and time are read in the week starting `reference`. `set` lists
  proposed values as `name=value; name=value` in the sheet's own units: money
  in the main currency unit, a percentage as 25%, a date as 2026-10-15.
  `because` names the sheet rule ids expected to decide the outcome.
*/
const REQUIRED = ['check_id', 'item', 'expect'] as const;
type Header =
  | (typeof REQUIRED)[number]
  | 'run_at'
  | 'run_day'
  | 'run_time'
  | 'set'
  | 'because'
  | 'note';

const headerRow = (snapshot: Snapshot, tab: string) =>
  (tabValues(snapshot, tab)?.values?.[0] ?? []).map((h) =>
    String(h ?? '')
      .trim()
      .toLowerCase(),
  );

// The tab of checks: the first whose header row has the required headers.
export function checksTab(snapshot: Snapshot): string | null {
  return (
    snapshot.tabs.find((tab) => {
      const header = headerRow(snapshot, tab);
      return REQUIRED.every((h) => header.includes(h));
    }) ?? null
  );
}

function parseTime(raw: unknown): number | null {
  if (typeof raw === 'number') return Math.round(raw * 1440);
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(raw ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function readChecks(snapshot: Snapshot) {
  const tab = checksTab(snapshot);
  const values = tab ? (tabValues(snapshot, tab)?.values ?? []) : [];
  const header = tab ? headerRow(snapshot, tab) : [];
  const timed =
    header.includes('run_at') ||
    (header.includes('run_day') && header.includes('run_time'));
  const missing = tab && !timed ? ['run_at, or run_day and run_time'] : [];
  const at = (h: Header) => header.indexOf(h);
  const raw = (row: unknown[], h: Header) => (at(h) >= 0 ? row[at(h)] : '');
  const rows = values.slice(1).flatMap((row, i) => {
    const get = (h: Header) => String(raw(row, h) ?? '').trim();
    if (!get('check_id')) return [];
    return [
      {
        id: get('check_id'),
        ref: `${tab}!A${i + 2}`,
        runAt: raw(row, 'run_at'),
        day: get('run_day'),
        time: raw(row, 'run_time'),
        item: get('item'),
        set: get('set'),
        expect: get('expect'),
        because: get('because')
          .split(/[,\s]+/)
          .filter(Boolean),
        note: get('note'),
      },
    ];
  });
  return { tab, missing, rows };
}

// A set value as the sheet would hold it: a number where one is meant.
const asSheetValue = (text: string) =>
  /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text;

export type CheckResult = {
  id: string;
  ref: string;
  item: string;
  runAt: string;
  set: string;
  expect: string;
  because: string[];
  note: string;
  actual: Disposition | null;
  decidedBy: string[];
  passed: boolean;
  problem: string | null;
};

export type ChecksReport = ReturnType<typeof runChecks> & {
  reference: LocalDate;
};

export function runChecks(
  rulebook: Rulebook,
  snapshot: Snapshot,
  reference: LocalDate,
): {
  results: CheckResult[];
  missingHeaders: string[];
  found: boolean;
  tab: string | null;
} {
  const { tab, missing, rows } = readChecks(snapshot);
  const tz = rulebook.timing.time_zone;
  const results = rows.map((check): CheckResult => {
    const base = {
      id: check.id,
      ref: check.ref,
      item: check.item,
      set: check.set,
      expect: check.expect,
      because: check.because,
      note: check.note,
      actual: null,
      decidedBy: [],
      passed: false,
    };
    let runAt: number;
    if (check.runAt !== '' && check.runAt !== undefined) {
      const at = interpretCell(
        check.runAt,
        { kind: 'datetime', timeZone: tz },
        true,
      );
      if (at.issue || typeof at.value !== 'number')
        return { ...base, runAt: '', problem: `run_at: ${at.issue}` };
      runAt = at.value;
    } else {
      const minutes = parseTime(check.time);
      if (!WEEKDAYS.includes(check.day as Weekday) || minutes === null)
        return {
          ...base,
          runAt: '',
          problem: 'Neither run_at nor run_day and run_time can be read.',
        };
      runAt = inWeek(reference, { day: check.day as Weekday, minutes }, tz);
    }

    // Which kind of item is this? The approved rulebook decides, not the check.
    const overrides: Record<string, bigint | number> = {};
    const kinds = rulebook.editable;
    for (const pair of check.set
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)) {
      const [name, value] = pair.split('=').map((s) => s.trim());
      const field = kinds.find((e) => e.name === name);
      if (!field || value === undefined)
        return {
          ...base,
          runAt: new Date(runAt).toISOString(),
          problem: `"${name}" is not a value the rulebook lets a proposal change.`,
        };
      const parsed = interpretCell(
        asSheetValue(value),
        fieldType(rulebook, field.type),
        true,
      );
      if (parsed.issue || parsed.value === null)
        return {
          ...base,
          runAt: new Date(runAt).toISOString(),
          problem: `${name}=${value}: ${parsed.issue}`,
        };
      overrides[name!] =
        CEL_OF[field.type] === 'int'
          ? BigInt(parsed.value as number)
          : (parsed.value as number);
    }

    const evaluation = evaluate(rulebook, snapshot, runAt, {
      overrides: { [check.item]: overrides },
    });
    // A check names an item by its key. Where a rulebook has several kinds
    // sharing that key (a product, and the same product as an offer), the
    // check is about all of them: the worst outcome stands, and every rule
    // of every one counts.
    const matching = evaluation.items.filter((i) => i.key === check.item);
    if (!matching.length)
      return {
        ...base,
        runAt: evaluation.runAt.label,
        problem: `No item "${check.item}" in the rulebook's items.`,
      };
    const disposition = (['blocked', 'needs_decision', 'ready'] as const).find(
      (d) => matching.some((i) => i.disposition === d),
    )!;
    const rules = matching.flatMap((i) => i.rules);
    const deciding = rules.filter(
      (r) =>
        r.status === 'error' ||
        (r.status === 'fail' &&
          r.outcome === (disposition === 'blocked' ? 'block' : 'attention')),
    );
    const decidedBy = [...new Set(deciding.map((r) => r.sheet_rule ?? r.id))];
    const failing = new Set(
      rules
        .filter((r) => r.status === 'fail' || r.status === 'error')
        .map((r) => r.sheet_rule ?? r.id),
    );
    const passed =
      disposition === check.expect &&
      check.because.every((id) => failing.has(id));
    return {
      ...base,
      runAt: evaluation.runAt.label,
      actual: disposition,
      decidedBy,
      passed,
      problem: null,
    };
  });
  return { results, missingHeaders: missing, found: tab !== null, tab };
}
