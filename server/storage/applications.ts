import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import {
  cellsOfBlock,
  isStanding,
  landed,
  prepareWrite,
  READ_BACK_DIFFERS,
  sameBlock,
  unconfirmed,
  type DecisionMade,
  type LastWrite,
  type OutputSheet,
  type Prepared,
} from '@/lib/definitions/apply';
import { profiledFor } from '@/lib/definitions/profile';
import { sourceOf, type KeptRead } from '@/lib/definitions/records';
import {
  applicationSchema,
  type Application,
  type DefinitionProcess,
  type DefinitionSet,
  type Proposal,
} from '@/lib/definitions/types';

import { inTurn, readKept, writeKept } from './files';
import { runDataDir } from './run-data';
import { runFile } from './run-key';

/*
  Server-only. What a write to a process's output leaves kept in
  data/<process>/applied/ by read and rulebook: the record of each write,
  made before the write and settled by reading the block back, and the
  write and its undo themselves, which take their turns on that record.
  What a write would do, and whether it landed, is lib/definitions/apply.ts.
*/

const applicationFile = (
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
) => runFile('applied', { process: owner.id, readId, fingerprint });

const applicationsSchema = z.array(applicationSchema);

// A record that cannot be read is reported: writing on would replace it.
const keptApplications = async (
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
) =>
  (await readKept(
    applicationFile(owner, readId, fingerprint),
    applicationsSchema,
  )) ?? [];

/*
  The latest write of a run's proposal, whatever came of it. Given the sheet,
  one that was cut short (pending, or an undo begun) is settled first by
  reading its block back; without it, it is shown as it was kept.
*/
export async function keptApplication(
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
  sheet?: OutputSheet,
): Promise<Application | null> {
  if (!sheet)
    return (await keptApplications(owner, readId, fingerprint)).at(-1) ?? null;
  const file = applicationFile(owner, readId, fingerprint);
  return inTurn(file, async () => {
    const kept = await keptApplications(owner, readId, fingerprint);
    return (await settledApplications(owner, file, kept, sheet)).at(-1) ?? null;
  });
}

export async function lastWrite(
  owner: DefinitionProcess,
): Promise<LastWrite | null> {
  const dir = runDataDir(owner.id, 'applied');
  const files = (await readdir(dir).catch(() => [])).filter((name) =>
    name.endsWith('.json'),
  );
  const all = (
    await Promise.all(
      files.map((name) =>
        // A summary for a page: a record that cannot be read is left out of
        // it, and reported where it is acted on.
        readKept(path.join(dir, name), applicationsSchema, {
          unreadableIsMissing: true,
        }),
      ),
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
/*
  A record kept before the sheet was changed, whose process stopped before
  the change was confirmed, is settled from what the block holds now: a write
  by whether it landed, an undo by whether the block is back as before. Left
  as it is when the block cannot be read, so nothing is guessed.
*/
async function settledApplications(
  owner: DefinitionProcess,
  file: string,
  kept: Application[],
  sheet: OutputSheet,
): Promise<Application[]> {
  const last = kept.at(-1);
  const undoing =
    last?.undoStartedAt !== undefined &&
    (last.status === 'verified' || last.status === 'mismatch');
  if (!last || (last.status !== 'pending' && !undoing)) return kept;
  const { data } = owner.subject;
  let grid: unknown[][] | null;
  try {
    grid = await sheet.readTab(last.tab);
  } catch {
    return kept;
  }
  let next: Application;
  if (last.status === 'pending') {
    const status = landed(last, grid, data);
    next = {
      ...last,
      status,
      // What the write was told, where it was kept, says more than these.
      error:
        status === 'verified'
          ? null
          : (last.error ??
            (status === 'failed'
              ? 'The write stopped before it landed.'
              : READ_BACK_DIFFERS)),
    };
  } else {
    const cells = grid && cellsOfBlock(grid, last, data);
    if (cells && sameBlock(last.before, cells))
      next = { ...last, status: 'undone', undoneAt: new Date().toISOString() };
    else if (cells && sameBlock(last.after, cells)) {
      // The undo never landed: the write stands as it did.
      next = { ...last };
      delete next.undoStartedAt;
    } else return kept;
  }
  const all = [...kept.slice(0, -1), next];
  await writeKept(file, all);
  return all;
}

export type WriteOutcome =
  | { kind: 'written'; application: Application }
  | { kind: 'refused'; prepared: Prepared };

/*
  Writes the decisions, reads the block back to confirm, and keeps the record.
  The record is kept first, as pending, with the cells as they were, so a
  process that stops part way leaves what is needed to settle it and undo it:
  a retry would read the written cells as "before". A write that failed is
  kept too; if its cells are untouched it does not stand in the way of trying
  again.
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
  owner = profiledFor(owner, set);
  const { output } = owner.subject.data;
  if (!output) throw new Error('This process declares no output.');
  const file = applicationFile(owner, read.id, fingerprint);
  return inTurn(file, async () => {
    const kept = await settledApplications(
      owner,
      file,
      await keptApplications(owner, read.id, fingerprint),
      sheet,
    );
    const prepared = await prepareWrite(
      owner,
      set,
      read,
      proposal,
      decisions,
      sheet,
    );
    const last = kept.at(-1);
    if (last?.status === 'pending')
      prepared.problems.push(unconfirmed(owner, last));
    else if (isStanding(last))
      prepared.problems.push(
        `This run has already written to the ${output.tab} ${sourceOf(owner.subject.data).resource.singular}. Undo that first to write again.`,
      );
    if (!prepared.block) prepared.problems.push('There is nothing to write.');
    const held = prepared.newlyFailing.filter(
      (failing) => !acknowledged.includes(failing.id),
    );
    if (prepared.problems.length || held.length || !prepared.block)
      return { kind: 'refused', prepared };

    const { block } = prepared;
    const pending: Application = {
      proposedAt: proposal.at,
      tab: output.tab,
      at: new Date().toISOString(),
      status: 'pending',
      error: null,
      undoneAt: null,
      range: block.range,
      before: block.before,
      after: block.after,
      changes: prepared.changes,
      decisions: prepared.decisions,
      ...(prepared.tabExists ? {} : { addsResource: true }),
    };
    // Kept before anything is written: if it cannot be, nothing is.
    await writeKept(file, [...kept, pending]);
    let error: string | null = null;
    try {
      if (!prepared.tabExists) await sheet.addTab(output.tab);
      await sheet.writeRange(output.tab, block.range, block.after);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'The write failed.';
    }
    let back: unknown[][] | null;
    try {
      back = await sheet.readTab(output.tab);
    } catch {
      // Unread, it stays pending, to be settled when it can be read; what the
      // write was told is kept for then.
      if (!error) return { kind: 'written', application: pending };
      const unread: Application = { ...pending, error };
      await writeKept(file, [...kept, unread]);
      return { kind: 'written', application: unread };
    }
    const status = landed(pending, back, owner.subject.data);
    const application: Application = {
      ...pending,
      status,
      error: error ?? (status === 'verified' ? null : READ_BACK_DIFFERS),
    };
    await writeKept(file, [...kept, application]);
    return { kind: 'written', application };
  });
}

export type UndoOutcome =
  | { kind: 'undone'; application: Application }
  | { kind: 'refused'; problem: string };

/*
  Puts the block back, only while it still holds exactly what was written.
  The undo is marked on the record before the block is written, so one cut
  short is finished or cleared by reading the block back, never repeated
  over what came after it.
*/
export async function undoApplication(
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
  sheet: OutputSheet,
): Promise<UndoOutcome> {
  const file = applicationFile(owner, readId, fingerprint);
  return inTurn(file, async () => {
    const found = await keptApplications(owner, readId, fingerprint);
    const kept = await settledApplications(owner, file, found, sheet);
    const last = kept.at(-1);
    // An undo cut short, now found finished.
    if (last && found.at(-1)?.status !== 'undone' && last.status === 'undone')
      return { kind: 'undone', application: last };
    if (last?.status === 'pending')
      return { kind: 'refused', problem: unconfirmed(owner, last) };
    if (!last || !isStanding(last))
      return { kind: 'refused', problem: 'There is no write to undo.' };
    const { data } = owner.subject;
    const { singular } = sourceOf(data).resource;
    const grid = await sheet.readTab(last.tab);
    if (!grid || !sameBlock(last.after, cellsOfBlock(grid, last, data)))
      return {
        kind: 'refused',
        problem: `The ${last.tab} ${singular} has changed since this was written, so undoing it could overwrite someone's work. Change it by hand.`,
      };
    const undoing: Application = {
      ...last,
      undoStartedAt: new Date().toISOString(),
    };
    await writeKept(file, [...kept.slice(0, -1), undoing]);
    await sheet.writeRange(last.tab, last.range, last.before);
    const back = await sheet.readTab(last.tab);
    if (!back || !sameBlock(last.before, cellsOfBlock(back, last, data)))
      return {
        kind: 'refused',
        problem: `The ${last.tab} ${singular} did not read back as it was before the write. Check it by hand.`,
      };
    const application: Application = {
      ...undoing,
      status: 'undone',
      undoneAt: new Date().toISOString(),
    };
    await writeKept(file, [...kept.slice(0, -1), application]);
    return { kind: 'undone', application };
  });
}
