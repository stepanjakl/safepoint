import { sourceTermsOf } from '@/lib/sources/model';

import type {
  Application,
  AppliedDecision,
  CellChange,
  DefinitionProcess,
  Proposal,
} from './types';

// The acknowledgement a write needs where its data changed since the read
// (apply.ts): one id, so the controls can word it apart from a check.
export const CHANGED_SINCE_READ = 'changed-since-read';

/*
  Working out the block of cells a set of decided writes touches on a tab's
  grid, with no model or storage dependency, so both the engine's write
  preparation (apply.ts) and client-side previews or mock runs can compute it.
*/

const sourceOf = (data: DefinitionProcess['subject']['data']) =>
  sourceTermsOf(data.source);

export type DecisionMade = {
  kind: AppliedDecision['kind'];
  values?: Record<string, number>;
  at: string;
};

export type Block = { range: string; before: unknown[][]; after: unknown[][] };

// The latest write to a process's output, of any run, as a page summarises
// it; null when nothing has been written.
export type LastWrite = Pick<
  Application,
  'at' | 'tab' | 'status' | 'undoneAt'
> & { cells: number };

const cellAt = (grid: unknown[][], row: number, column: number) =>
  grid[row]?.[column] ?? '';
const sameCell = (a: unknown, b: unknown) =>
  String(a ?? '') === String(b ?? '');
const cellValue = (raw: unknown): CellChange['before'] =>
  raw === '' || raw === undefined || raw === null
    ? null
    : (raw as CellChange['before']);

/*
  The block a set of writes touches on a tab's grid: its header when the tab is
  empty, a column for any field it has no column for, and a row for any key it
  has no row for.
*/
export function blockFor(
  grid: unknown[][],
  owner: DefinitionProcess,
  writes: { key: string; values: Record<string, number> }[],
  // The header a field is written under, where it is not the field's id.
  headers: Record<string, string> = {},
): { block: Block | null; changes: CellChange[]; problems: string[] } {
  const { output } = owner.subject.data;
  if (!output) throw new Error('This process declares no output.');
  const { resource, address } = sourceOf(owner.subject.data);
  const fields = owner.subject.proposal.map((field) => field.id);
  const header = (grid[0] ?? []).map(String);
  const touched = new Map<
    string,
    { row: number; column: number; to: unknown }
  >();
  const put = (row: number, column: number, to: unknown) =>
    touched.set(`${row}:${column}`, { row, column, to });
  const empty = !header.some(Boolean);
  if (empty) put(0, 0, output.key);
  const keyColumn = empty ? 0 : header.indexOf(output.key);
  if (keyColumn < 0)
    return {
      block: null,
      changes: [],
      problems: [
        `The ${output.tab} ${resource.singular} has no ${output.key} column.`,
      ],
    };
  let nextColumn = empty ? 1 : header.length;
  const columnOf = Object.fromEntries(
    fields.map((field) => {
      const name = headers[field] ?? field;
      const at = empty ? -1 : header.indexOf(name);
      if (at >= 0) return [field, at];
      put(0, nextColumn, name);
      return [field, nextColumn++];
    }),
  );
  let nextRow = Math.max(grid.length, 1);
  const rowsOf = (key: string) =>
    grid.flatMap((row, index) =>
      index > 0 && String(row[keyColumn] ?? '') === key ? [index] : [],
    );
  const problems: string[] = [];
  const changes: CellChange[] = [];
  for (const { key, values } of writes) {
    const found = rowsOf(key);
    if (found.length > 1)
      problems.push(
        `The ${output.tab} ${resource.singular} lists ${key} ${found.length} times; each needs one row.`,
      );
    const row = found[0] ?? nextRow++;
    if (!found.length) put(row, keyColumn, key);
    for (const field of fields) {
      const column = columnOf[field]!;
      put(row, column, values[field]);
      changes.push({
        key,
        field,
        cell: address.value({
          resource: output.tab,
          column: { index: column, header: headers[field] ?? field },
          // Listed more than once, the key does not name the row alone.
          row: { index: row, key: found.length > 1 ? undefined : key },
        }),
        before: cellValue(cellAt(grid, row, column)),
        after: values[field]!,
      });
    }
  }
  if (!touched.size) return { block: null, changes, problems };
  const cells = [...touched.values()];
  const rows = cells.map((cell) => cell.row);
  const columns = cells.map((cell) => cell.column);
  const [top, bottom] = [Math.min(...rows), Math.max(...rows)];
  const [left, right] = [Math.min(...columns), Math.max(...columns)];
  const rowIndexes = Array.from(
    { length: bottom - top + 1 },
    (_, i) => top + i,
  );
  const columnIndexes = Array.from(
    { length: right - left + 1 },
    (_, i) => left + i,
  );
  return {
    block: {
      range: address.block({ top, left, bottom, right }),
      before: rowIndexes.map((row) =>
        columnIndexes.map((column) => cellAt(grid, row, column)),
      ),
      after: rowIndexes.map((row) =>
        columnIndexes.map((column) => {
          const cell = touched.get(`${row}:${column}`);
          return cell ? cell.to : cellAt(grid, row, column);
        }),
      ),
    },
    changes,
    problems,
  };
}

// A block's cells as a tab holds them now, read at the block's own place;
// null where its address is not one this source gives.
export function cellsOfBlock(
  grid: unknown[][],
  block: Block,
  data: DefinitionProcess['subject']['data'],
) {
  const start = sourceOf(data).address.blockStart(block.range);
  if (!start) return null;
  const { top, left } = start;
  return block.before.map((row, r) =>
    row.map((_, c) => cellAt(grid, top + r, left + c)),
  );
}

export const sameBlock = (a: unknown[][], b: unknown[][] | null) =>
  b !== null &&
  a.every((row, r) => row.every((cell, c) => sameCell(cell, b[r]?.[c])));

// What the decisions write: nothing for a rejection or a record left as it is.
export function writesOf(
  proposal: Proposal,
  decisions: Record<string, DecisionMade>,
) {
  return Object.entries(proposal.records).flatMap(([key, record]) => {
    const decision = decisions[key];
    if (!decision || decision.kind === 'reject') return [];
    const values = decision.kind === 'change' ? decision.values : record.values;
    return values ? [{ key, values }] : [];
  });
}
