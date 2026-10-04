import { inWeek, type LocalDate } from './cycle';
import { WEEKDAYS, interpretCell, type Weekday } from './field-types';
import { evaluate, tabValues, type Disposition, type Snapshot } from './engine';
import type { Rulebook } from './schema';

/*
  Checks are expected outcomes written by the store, in a tab the drafting
  model never sees. Their format belongs to the engine, not to any scenario:

    check_id | run_day | run_time | item | set | expect | because | note

  `set` lists proposed values as `name=value; name=value`, in the sheet's own
  units (pounds for money). `because` names the sheet rule ids expected to
  decide the outcome. Run times are read in the week starting `reference`.
*/
export const CHECKS_TAB = 'Checks';
const HEADERS = [
  'check_id',
  'run_day',
  'run_time',
  'item',
  'set',
  'expect',
  'because',
  'note',
] as const;

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

function parseTime(raw: unknown): number | null {
  if (typeof raw === 'number') return Math.round(raw * 1440);
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(raw ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function readChecks(snapshot: Snapshot) {
  const range = tabValues(snapshot, CHECKS_TAB);
  const values = range?.values ?? [];
  const header = (values[0] ?? []).map((h) => String(h ?? '').trim());
  const missing = HEADERS.filter((h) => !header.includes(h));
  const at = (h: (typeof HEADERS)[number]) => header.indexOf(h);
  const rows = values.slice(1).flatMap((row, i) => {
    const get = (h: (typeof HEADERS)[number]) =>
      at(h) >= 0 ? String(row[at(h)] ?? '').trim() : '';
    if (!get('check_id')) return [];
    return [
      {
        id: get('check_id'),
        ref: `${CHECKS_TAB}!A${i + 2}`,
        day: get('run_day'),
        time: at('run_time') >= 0 ? row[at('run_time')] : '',
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
  return { found: Boolean(range), missing, rows };
}

export function runChecks(
  rulebook: Rulebook,
  snapshot: Snapshot,
  reference: LocalDate,
): { results: CheckResult[]; missingHeaders: string[]; found: boolean } {
  const { found, missing, rows } = readChecks(snapshot);
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
    const minutes = parseTime(check.time);
    if (!WEEKDAYS.includes(check.day as Weekday) || minutes === null)
      return {
        ...base,
        runAt: '',
        problem: 'The run day or time cannot be read.',
      };
    const runAt = inWeek(
      reference,
      { day: check.day as Weekday, minutes },
      rulebook.timing.time_zone,
    );

    // Which kind of item is this? The approved rulebook decides, not the check.
    const overrides: Record<string, bigint> = {};
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
        field.type === 'money_gbp' ? Number(value) : Number(value),
        { kind: field.type },
        true,
      );
      if (parsed.issue || parsed.value === null)
        return {
          ...base,
          runAt: new Date(runAt).toISOString(),
          problem: `${name}=${value}: ${parsed.issue}`,
        };
      overrides[name!] = BigInt(parsed.value as number);
    }

    const evaluation = evaluate(rulebook, snapshot, runAt, {
      overrides: { [check.item]: overrides },
    });
    const item = evaluation.items.find((i) => i.key === check.item);
    if (!item)
      return {
        ...base,
        runAt: evaluation.runAt.label,
        problem: `No item "${check.item}" in the rulebook's items.`,
      };
    const deciding = item.rules.filter(
      (r) =>
        r.status === 'error' ||
        (r.status === 'fail' &&
          r.outcome ===
            (item.disposition === 'blocked' ? 'block' : 'attention')),
    );
    const decidedBy = deciding.map((r) => r.sheet_rule ?? r.id);
    const failing = new Set(
      item.rules
        .filter((r) => r.status === 'fail' || r.status === 'error')
        .map((r) => r.sheet_rule ?? r.id),
    );
    const passed =
      item.disposition === check.expect &&
      check.because.every((id) => failing.has(id));
    return {
      ...base,
      runAt: evaluation.runAt.label,
      actual: item.disposition,
      decidedBy,
      passed,
      problem: null,
    };
  });
  return { results, missingHeaders: missing, found };
}
