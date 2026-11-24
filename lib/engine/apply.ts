import {
  blockFor,
  CHANGED_SINCE_READ,
  cellsOfBlock,
  sameBlock,
  writesOf,
  type Block,
  type DecisionMade,
  type LastWrite,
} from './apply-block';
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

export {
  blockFor,
  CHANGED_SINCE_READ,
  cellsOfBlock,
  sameBlock,
  writesOf,
  type Block,
  type DecisionMade,
  type LastWrite,
};

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
  of a write, writing it and undoing it are server/storage/writes/applications.ts.
*/

export type OutputSheet = {
  readNow(): Promise<KeptRead>;
  readTab(tab: string): Promise<unknown[][] | null>;
  addTab(tab: string): Promise<void>;
  writeRange(tab: string, range: string, values: unknown[][]): Promise<void>;
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

/*
  What is wrong with values a person sets for a record: each field needs a
  whole number, at least the least the process allows. The one rule, for a
  decision when it is made (server/operations/record-decisions.ts) and for
  the write that uses it.
*/
export const valueProblems = (
  subject: DefinitionProcess['subject'],
  key: string,
  values: Record<string, number>,
): string[] =>
  subject.proposal
    .filter(
      (field) =>
        !Number.isInteger(values[field.id]) ||
        (field.min !== undefined && values[field.id]! < field.min),
    )
    .map(
      (field) =>
        `${key} needs a whole number${field.min === undefined ? '' : `, ${field.min} or more,`} for ${field.label}.`,
    );

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
  headers: Record<string, string> = {},
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

  /*
    Data changed since the run's read asks a person, as a check that newly
    fails does: a value the sheet works out from the time changes with no
    one recounting anything. Every check runs again on what it holds now, so
    a rule that blocks still blocks on it.
  */
  const now = await sheet.readNow();
  const changed = changedTabs(read, now);
  const newlyFailing: NewlyFailing[] = changed.length
    ? [
        {
          id: CHANGED_SINCE_READ,
          key: changed.join(', '),
          check: `changed in the ${sourceOf(owner.subject.data).noun} since this run read it`,
        },
      ]
    : [];

  const writes = writesOf(proposal, decisions);
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
    const bad = write ? valueProblems(owner.subject, key, values) : [];
    if (bad.length) {
      problems.push(...bad);
      continue;
    }
    const was = checkProposal(owner, set, read, key, values);
    let is: typeof was;
    try {
      is = checkProposal(owner, set, now, key, values);
    } catch {
      problems.push(
        `${key} cannot be checked on what the ${sourceOf(owner.subject.data).noun} holds now. Start a new run.`,
      );
      continue;
    }
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
  } = blockFor(grid ?? [], owner, writes, headers);
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

// A write another request is making now, not yet read back.
export const stillWriting = (owner: DefinitionProcess, last: Application) =>
  `The last write to the ${last.tab} ${sourceOf(owner.subject.data).resource.singular} is still being made. Try again in a moment.`;

// A write another request is undoing now.
export const beingUndone = (owner: DefinitionProcess, last: Application) =>
  `The last write to the ${last.tab} ${sourceOf(owner.subject.data).resource.singular} is being undone. Try again in a moment.`;
