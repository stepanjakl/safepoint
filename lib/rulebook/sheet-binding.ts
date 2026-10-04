import { interpretCell, type FieldType, type Interpreted } from './field-types';

/*
  A tab is bound by its header row, never by column position: a column moved
  in the sheet is still found, and a renamed one is reported as missing rather
  than silently read from the wrong place. Every cell keeps its A1 reference.
*/

export type ColumnSpec = {
  header: string;
  label: string;
  type: FieldType;
  required: boolean;
};

export type TabSpec =
  | {
      kind: 'table';
      tab: string;
      // What the tab holds, in a sentence.
      purpose: string;
      key: string;
      // False where several rows may share a key (a kit's components).
      unique?: boolean;
      columns: ColumnSpec[];
    }
  | {
      // Two columns, `key` and `value`: one fact per row.
      kind: 'key_value';
      tab: string;
      purpose: string;
      keyHeader: string;
      valueHeader: string;
      rows: (ColumnSpec & { key: string })[];
    };

export type BoundCell = Interpreted & {
  header: string;
  ref: string;
  raw: unknown;
};

export type BoundTab = {
  tab: string;
  purpose: string;
  range: string;
  headers: {
    expected: string[];
    found: string[];
    missing: string[];
    extra: string[];
  };
  rows: { key: string; cells: BoundCell[] }[];
  issues: string[];
};

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// The returned range names where the values start: `Stock!A1:Z200`.
function origin(range: string) {
  const match = /!([A-Z]+)(\d+)/.exec(range);
  if (!match) return { column: 0, row: 1 };
  const letters = match[1]!;
  let column = 0;
  for (const ch of letters) column = column * 26 + (ch.charCodeAt(0) - 64);
  return { column: column - 1, row: Number(match[2]) };
}

export function bindTab(
  spec: TabSpec,
  valueRange: { range: string; values?: unknown[][] },
): BoundTab {
  const values = valueRange.values ?? [];
  const start = origin(valueRange.range);
  const ref = (columnIndex: number, rowIndex: number) =>
    `${spec.tab}!${columnLetter(start.column + columnIndex)}${start.row + rowIndex}`;
  const found = (values[0] ?? []).map((cell) => String(cell ?? '').trim());
  const issues: string[] = [];

  if (spec.kind === 'key_value') {
    const expected = [spec.keyHeader, spec.valueHeader];
    const missing = expected.filter((h) => !found.includes(h));
    const keyAt = found.indexOf(spec.keyHeader);
    const valueAt = found.indexOf(spec.valueHeader);
    const byKey = new Map<string, number>();
    values.slice(1).forEach((row, i) => {
      if (keyAt >= 0) byKey.set(String(row[keyAt] ?? '').trim(), i + 1);
    });
    const rows = spec.rows.map((row) => {
      const at = byKey.get(row.key);
      if (at === undefined || valueAt < 0) {
        issues.push(`Row "${row.key}" is missing.`);
        return {
          key: row.key,
          cells: [
            {
              header: row.key,
              ref: '—',
              raw: undefined,
              ...interpretCell(undefined, row.type, row.required),
            },
          ],
        };
      }
      const raw = values[at]?.[valueAt];
      return {
        key: row.key,
        cells: [
          {
            header: row.key,
            ref: ref(valueAt, at),
            raw,
            ...interpretCell(raw, row.type, row.required),
          },
        ],
      };
    });
    const extra = [...byKey.keys()].filter(
      (k) => k && !spec.rows.some((r) => r.key === k),
    );
    return finish(
      spec,
      valueRange.range,
      { expected, found, missing, extra },
      rows,
      issues,
    );
  }

  const expected = spec.columns.map((c) => c.header);
  const missing = expected.filter((h) => !found.includes(h));
  const extra = found.filter((h) => h && !expected.includes(h));
  for (const header of missing)
    issues.push(`Column "${header}" is missing from the header row.`);
  const keyAt = found.indexOf(spec.key);
  const seen = new Set<string>();
  const rows = values.slice(1).flatMap((row, i) => {
    if (row.every((cell) => cell === '' || cell === undefined || cell === null))
      return [];
    const key = keyAt >= 0 ? String(row[keyAt] ?? '').trim() : `row ${i + 2}`;
    if (spec.unique !== false && seen.has(key))
      issues.push(`Key "${key}" appears more than once.`);
    seen.add(key);
    const cells = spec.columns.map((column) => {
      const at = found.indexOf(column.header);
      if (at < 0)
        return {
          header: column.header,
          ref: '—',
          raw: undefined,
          ...interpretCell(undefined, column.type, column.required),
        };
      const raw = row[at];
      return {
        header: column.header,
        ref: ref(at, i + 1),
        raw,
        ...interpretCell(raw, column.type, column.required),
      };
    });
    return [{ key, cells }];
  });
  return finish(
    spec,
    valueRange.range,
    { expected, found, missing, extra },
    rows,
    issues,
  );
}

function finish(
  spec: TabSpec,
  range: string,
  headers: BoundTab['headers'],
  rows: BoundTab['rows'],
  issues: string[],
): BoundTab {
  for (const row of rows)
    for (const cell of row.cells)
      if (cell.issue)
        issues.push(
          `${cell.ref === '—' ? `${row.key} · ${cell.header}` : cell.ref}: ${cell.issue}`,
        );
  return { tab: spec.tab, purpose: spec.purpose, range, headers, rows, issues };
}
