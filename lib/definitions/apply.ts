import { profiledFor } from './profile';
import { checkProposal, noneOf } from './propose';
import { sourceOf, type KeptRead } from './records';
import type {
  Application,
  AppliedDecision,
  CellChange,
  DefinitionProcess,
  DefinitionSet,
  Proposal,
} from './types';

/*
  Writing a decided proposal to the output tab the process declares, and
  undoing it. The browser only says what a person decided: this works out what
  that writes from the kept proposal, and takes nothing else on trust.

  A write reads the sheet again first. Data that has changed since the run's
  read refuses it, since the proposal was checked against what is no longer
  there. The same data read now still runs every check again, because a
  deadline can pass between deciding and writing. A check that newly asks a
  person holds the write until they acknowledge it, by name.

  One block of cells in one request, so a failed write leaves nothing part way,
  and only the block is touched: other columns of the tab stay as they are.

  "Tab" and "sheet" in the names here are historical: a tab is one resource
  of the process's source, and the sheet the source itself, whatever its kind
  (`DataShape.source`). Every address is the source's own (`sourceOf`).

  What is worked out here, and read back, is the engine's. Keeping the record
  of a write, writing it and undoing it are server/storage/applications.ts.
*/

export type OutputSheet = {
  readNow(): Promise<KeptRead>;
  readTab(tab: string): Promise<unknown[][] | null>;
  addTab(tab: string): Promise<void>;
  writeRange(tab: string, range: string, values: unknown[][]): Promise<void>;
};

export type DecisionMade = {
  kind: AppliedDecision['kind'];
  values?: Record<string, number>;
  at: string;
};

// A check that fails now but did not on the run's read.
export type NewlyFailing = { id: string; key: string; check: string };

export type Prepared = {
  // Each thing that refuses the write, in words a person can act on.
  problems: string[];
  newlyFailing: NewlyFailing[];
  changes: CellChange[];
  tabExists: boolean;
  block: Block | null;
  decisions: Record<string, AppliedDecision>;
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
      const at = empty ? -1 : header.indexOf(field);
      if (at >= 0) return [field, at];
      put(0, nextColumn, field);
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
          column: { index: column, header: field },
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

export const READ_BACK_DIFFERS =
  'The cells read back differently from what was written.';

// What a write's block holds, from its resource as read back: null when the
// resource is not there.
export function landed(
  written: Application,
  grid: unknown[][] | null,
  data: DefinitionProcess['subject']['data'],
): 'verified' | 'failed' | 'mismatch' {
  // One the write had to add, still missing, was never written to.
  if (!grid) return written.addsResource ? 'failed' : 'mismatch';
  const cells = cellsOfBlock(grid, written, data);
  return cells && sameBlock(written.after, cells)
    ? 'verified'
    : cells && sameBlock(written.before, cells)
      ? 'failed'
      : 'mismatch';
}

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

// Which data tabs are not what the run read.
const changedTabs = (read: KeptRead, now: KeptRead) =>
  read.tabs
    .filter(
      (tab) =>
        JSON.stringify(tab.values) !==
        JSON.stringify(now.tabs.find((t) => t.name === tab.name)?.values),
    )
    .map((tab) => tab.name);

/*
  What writing these decisions would do, from the sheet as it is now, and
  whatever refuses it. Nothing is written here, so it is also the preview.
*/
export async function prepareWrite(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  proposal: Proposal,
  decisions: Record<string, DecisionMade>,
  sheet: OutputSheet,
): Promise<Prepared> {
  owner = profiledFor(owner, set);
  const { output } = owner.subject.data;
  if (!output) throw new Error('This process declares no output.');
  const problems: string[] = [];

  const undecided = Object.keys(proposal.records).filter(
    (key) => !decisions[key],
  );
  if (undecided.length)
    problems.push(`Not decided yet: ${undecided.join(', ')}.`);
  for (const key of Object.keys(decisions))
    if (!proposal.records[key])
      problems.push(`${key} is not in this proposal.`);

  const now = await sheet.readNow();
  const changed = changedTabs(read, now);
  if (changed.length)
    problems.push(
      `The ${sourceOf(owner.subject.data).noun} has changed since this run read it (${changed.join(', ')}). Start a new run to propose from what it holds now.`,
    );

  const writes = writesOf(proposal, decisions);
  const newlyFailing: NewlyFailing[] = [];
  const applied: Record<string, AppliedDecision> = {};
  for (const [key, decision] of Object.entries(decisions)) {
    const write = writes.find((w) => w.key === key);
    applied[key] = {
      kind: decision.kind,
      values: write?.values ?? null,
      at: decision.at,
      verdict: null,
      failing: [],
    };
    // A record the proposal left is checked as the sheet is now, though
    // nothing is written for it; a rejection is not checked at all.
    const left = !write && decision.kind !== 'reject';
    if (!write && !left) continue;
    const values = write?.values ?? noneOf(owner.subject);
    // Whole numbers, at least the least the process allows.
    const bad = write
      ? owner.subject.proposal.filter(
          (field) =>
            !Number.isInteger(values[field.id]) ||
            (field.min !== undefined && values[field.id]! < field.min),
        )
      : [];
    if (bad.length) {
      for (const field of bad)
        problems.push(
          `${key} needs a whole number${field.min === undefined ? '' : `, ${field.min} or more,`} for ${field.label}.`,
        );
      continue;
    }
    const was = checkProposal(owner, set, read, key, values);
    const is = changed.length
      ? was
      : checkProposal(owner, set, now, key, values);
    const failing = is.checks.filter((check) => !check.holds);
    applied[key].verdict = is.verdict;
    applied[key].failing = failing.map((check) => check.name);
    for (const check of failing) {
      if (check.consequence === 'block') {
        if (write)
          problems.push(`${key} cannot be written: ${check.name} fails.`);
      } else if (!was.checks.some((c) => c.id === check.id && !c.holds))
        newlyFailing.push({
          id: `${key}:${check.id}`,
          key,
          check: check.name,
        });
    }
  }

  const grid = await sheet.readTab(output.tab);
  const {
    block,
    changes,
    problems: tabProblems,
  } = blockFor(grid ?? [], owner, writes);
  return {
    problems: [...problems, ...tabProblems],
    newlyFailing,
    changes,
    tabExists: grid !== null,
    block,
    decisions: applied,
  };
}

export const isStanding = (application: Application | undefined) =>
  application?.status === 'verified' || application?.status === 'mismatch';

// A write kept as begun whose block could not be read back to settle it.
export const unconfirmed = (owner: DefinitionProcess, last: Application) => {
  const { noun, resource } = sourceOf(owner.subject.data);
  return `The last write to the ${last.tab} ${resource.singular} has not been read back to confirm it. Try again once the ${noun} can be read.`;
};
