import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { runDataDir } from '@/lib/storage/run-data';

import { checkProposal, readJson, writeWhole } from './propose';
import { cellOf, type KeptRead } from './records';
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

type Block = { range: string; before: unknown[][]; after: unknown[][] };

const applicationFile = (
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
) => {
  // Both name a file: never a path.
  if (![readId, fingerprint].every((id) => /^[\w-]+$/.test(id)))
    throw new Error('Not a read or rulebook id.');
  return path.join(
    runDataDir(owner.id, 'applied'),
    `${readId}.${fingerprint}.json`,
  );
};

const keptApplications = async (
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
) =>
  (await readJson<Application[]>(
    applicationFile(owner, readId, fingerprint),
  )) ?? [];

// The latest write of a run's proposal, whatever came of it.
export async function keptApplication(
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
): Promise<Application | null> {
  return (await keptApplications(owner, readId, fingerprint)).at(-1) ?? null;
}

// The latest write to a process's output, of any run, as a page summarises
// it; null when nothing has been written.
export type LastWrite = Pick<
  Application,
  'at' | 'tab' | 'status' | 'undoneAt'
> & { cells: number };

export async function lastWrite(
  owner: DefinitionProcess,
): Promise<LastWrite | null> {
  const dir = runDataDir(owner.id, 'applied');
  const files = (await readdir(dir).catch(() => [])).filter((name) =>
    name.endsWith('.json'),
  );
  const all = (
    await Promise.all(
      files.map((name) => readJson<Application[]>(path.join(dir, name))),
    )
  ).flatMap((kept) => kept ?? []);
  const latest = all.reduce<Application | null>(
    (last, one) => (!last || one.at > last.at ? one : last),
    null,
  );
  return latest
    ? {
        at: latest.at,
        tab: latest.tab,
        status: latest.status,
        undoneAt: latest.undoneAt,
        cells: latest.changes.length,
      }
    : null;
}

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
      problems: [`The ${output.tab} tab has no ${output.key} column.`],
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
        `The ${output.tab} tab lists ${key} ${found.length} times; each needs one row.`,
      );
    const row = found[0] ?? nextRow++;
    if (!found.length) put(row, keyColumn, key);
    for (const field of fields) {
      const column = columnOf[field]!;
      put(row, column, values[field]);
      changes.push({
        key,
        field,
        cell: cellOf(output.tab, column, row),
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
  const inTab = (tabCell: string) => tabCell.slice(tabCell.indexOf('!') + 1);
  return {
    block: {
      range: `${inTab(cellOf(output.tab, left, top))}:${inTab(cellOf(output.tab, right, bottom))}`,
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

// A block's cells as a tab holds them now, read at the block's own place.
function cellsOfBlock(grid: unknown[][], block: Block) {
  const [from = 'A1'] = block.range.split(':');
  const letters = /^[A-Z]+/.exec(from)![0];
  const left =
    [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) -
    1;
  const top = Number(from.slice(letters.length)) - 1;
  return block.before.map((row, r) =>
    row.map((_, c) => cellAt(grid, top + r, left + c)),
  );
}

const sameBlock = (a: unknown[][], b: unknown[][]) =>
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
  const { output } = owner.subject.data;
  if (!output) throw new Error('This process declares no output.');
  const fields = owner.subject.proposal.map((field) => field.id);
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
      `The sheet has changed since this run read it (${changed.join(', ')}). Start a new run to propose from what it holds now.`,
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
    if (!write) continue;
    if (
      fields.some(
        (field) =>
          !Number.isInteger(write.values[field]) || write.values[field]! < 0,
      )
    ) {
      problems.push(
        `${key} needs a whole number, zero or more, for each value.`,
      );
      continue;
    }
    const was = checkProposal(owner, set, read, key, write.values);
    const is = changed.length
      ? was
      : checkProposal(owner, set, now, key, write.values);
    const failing = is.checks.filter((check) => !check.holds);
    applied[key].verdict = is.verdict;
    applied[key].failing = failing.map((check) => check.name);
    for (const check of failing) {
      if (check.consequence === 'block')
        problems.push(`${key} cannot be written: ${check.name} fails.`);
      else if (!was.checks.some((c) => c.id === check.id && !c.holds))
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

const isStanding = (application: Application | undefined) =>
  application?.status === 'verified' || application?.status === 'mismatch';

export type WriteOutcome =
  | { kind: 'written'; application: Application }
  | { kind: 'refused'; prepared: Prepared };

/*
  Writes the decisions, reads the block back to confirm, and keeps the record.
  A write that failed is kept too; if its cells are untouched it does not stand
  in the way of trying again.
*/
export async function applyDecisions(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  fingerprint: string,
  proposal: Proposal,
  decisions: Record<string, DecisionMade>,
  acknowledged: string[],
  sheet: OutputSheet,
): Promise<WriteOutcome> {
  const { output } = owner.subject.data;
  if (!output) throw new Error('This process declares no output.');
  const file = applicationFile(owner, read.id, fingerprint);
  const kept = await keptApplications(owner, read.id, fingerprint);
  const prepared = await prepareWrite(
    owner,
    set,
    read,
    proposal,
    decisions,
    sheet,
  );
  if (isStanding(kept.at(-1)))
    prepared.problems.push(
      `This run has already written to the ${output.tab} tab. Undo that first to write again.`,
    );
  if (!prepared.block) prepared.problems.push('There is nothing to write.');
  const held = prepared.newlyFailing.filter(
    (failing) => !acknowledged.includes(failing.id),
  );
  if (prepared.problems.length || held.length || !prepared.block)
    return { kind: 'refused', prepared };

  const { block } = prepared;
  let error: string | null = null;
  try {
    if (!prepared.tabExists) await sheet.addTab(output.tab);
    await sheet.writeRange(output.tab, block.range, block.after);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'The write failed.';
  }
  const back = await sheet.readTab(output.tab).catch(() => null);
  const cells = back ? cellsOfBlock(back, block) : null;
  const status: Application['status'] =
    cells && sameBlock(block.after, cells)
      ? 'verified'
      : cells && sameBlock(block.before, cells)
        ? 'failed'
        : 'mismatch';
  const application: Application = {
    proposedAt: proposal.at,
    tab: output.tab,
    at: new Date().toISOString(),
    status,
    error:
      error ??
      (status === 'verified'
        ? null
        : 'The cells read back differently from what was written.'),
    undoneAt: null,
    range: block.range,
    before: block.before,
    after: block.after,
    changes: prepared.changes,
    decisions: prepared.decisions,
  };
  await writeWhole(file, [...kept, application]);
  return { kind: 'written', application };
}

export type UndoOutcome =
  | { kind: 'undone'; application: Application }
  | { kind: 'refused'; problem: string };

// Puts the block back, only while it still holds exactly what was written.
export async function undoApplication(
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
  sheet: OutputSheet,
): Promise<UndoOutcome> {
  const file = applicationFile(owner, readId, fingerprint);
  const kept = await keptApplications(owner, readId, fingerprint);
  const last = kept.at(-1);
  if (!last || !isStanding(last))
    return { kind: 'refused', problem: 'There is no write to undo.' };
  const grid = await sheet.readTab(last.tab);
  if (!grid || !sameBlock(last.after, cellsOfBlock(grid, last)))
    return {
      kind: 'refused',
      problem: `The ${last.tab} tab has changed since this was written, so undoing it could overwrite someone's work. Change it by hand.`,
    };
  await sheet.writeRange(last.tab, last.range, last.before);
  const back = await sheet.readTab(last.tab);
  if (!back || !sameBlock(last.before, cellsOfBlock(back, last)))
    return {
      kind: 'refused',
      problem: `The ${last.tab} tab did not read back as it was before the write. Check it by hand.`,
    };
  const application: Application = {
    ...last,
    status: 'undone',
    undoneAt: new Date().toISOString(),
  };
  await writeWhole(file, [...kept.slice(0, -1), application]);
  return { kind: 'undone', application };
}
