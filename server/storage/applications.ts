import 'server-only';

import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import {
  beingUndone,
  cellsOfBlock,
  isStanding,
  landed,
  prepareWrite,
  READ_BACK_DIFFERS,
  sameBlock,
  stillWriting,
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

import { database, type Database } from '@/server/db/client';
import { ensureProcess } from '@/server/db/scope';
import { applications, proposals } from '@/server/db/schema';

import {
  HEARTBEAT_MS,
  insertRow,
  latestOfProcess,
  latestRow,
  leavePending,
  markUndo,
  releaseLease,
  renewLease,
  rowById,
  settleUndo,
  settleWrite,
  standsAlready,
  undoneUnmarked,
  type Row,
} from './application-rows';
import { readProcessOf } from './brunch-orders-reads';
import type { RunKey } from './run-key';
import { parseStored } from './stored';

/*
  Server-only. What a write to a process's output leaves kept, by read and
  rulebook, in the `applications` table: the record of each write, made
  before the write and settled by reading the block back, and the write and
  its undo themselves. Each record is a row; the latest of a run key is the
  one in force. What a write would do, and whether it landed, is
  lib/definitions/apply.ts.

  Safe across server instances without a lock held over the sheet
  (docs/engineering/DATABASE.md, "One standing write, settled once"): the
  pending row is the claim, at most one standing per run key; a write or an
  undo in flight holds a lease on its row, renewed while it works, and no one
  else settles a row whose lease is live, so a block not yet written is never
  taken for a write that failed.
*/

const keyOf = (
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
): RunKey => ({ process: owner.id, readId, fingerprint });

const iso = (at: Date | null) => (at ? at.toISOString() : null);

// What a record holds, as its schema lists it, from its fields: what a row
// keeps of it, and what reads back from one.
export const recordFields = (a: {
  [key: string]: unknown;
  proposedAt: string;
  tab: string;
  at: string;
  status: string;
  error: string | null;
  undoneAt: string | null;
  range: string;
  before: unknown;
  after: unknown;
  changes: unknown;
  decisions: unknown;
  addsResource?: boolean | undefined;
  undoStartedAt?: string | undefined;
}) => ({
  proposedAt: a.proposedAt,
  tab: a.tab,
  at: a.at,
  status: a.status,
  error: a.error,
  undoneAt: a.undoneAt,
  range: a.range,
  before: a.before,
  after: a.after,
  changes: a.changes,
  decisions: a.decisions,
  ...(a.addsResource === undefined ? {} : { addsResource: a.addsResource }),
  ...(a.undoStartedAt === undefined ? {} : { undoStartedAt: a.undoStartedAt }),
});

// A row as the record it is, read through the record's schema: one that
// does not fit is reported, naming its run.
export function recordOf(key: RunKey, row: Row): Application {
  return parseStored(
    recordFields({
      proposedAt: row.proposedAt.toISOString(),
      tab: row.resource,
      at: row.writtenAt.toISOString(),
      status: row.status,
      error: row.error,
      undoneAt: iso(row.undoneAt),
      range: row.range,
      before: row.before,
      after: row.after,
      changes: row.changes,
      decisions: row.decisions,
      addsResource: row.addsResource ?? undefined,
      undoStartedAt: row.undoStartedAt?.toISOString(),
    }),
    applicationSchema,
    `The kept write ${key.process}/${key.readId}.${key.fingerprint}`,
  );
}

type Kept = { id: number; record: Application; live: boolean };

const keptOf = (key: RunKey, row: Row | null): Kept | null =>
  row && { id: row.id, record: recordOf(key, row), live: row.live };

const latest = async (db: Database, key: RunKey) =>
  keptOf(key, await latestRow(db, key));

const undoMarked = (record: Application) =>
  record.undoStartedAt !== undefined && isStanding(record);

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
  const db = await database();
  const key = keyOf(owner, readId, fingerprint);
  const kept = sheet
    ? await settled(db, owner, key, sheet)
    : await latest(db, key);
  return kept?.record ?? null;
}

// The latest write of any run, for a page's summary: read from columns
// only, so a record whose bodies no longer fit still shows here, and is
// reported where it is acted on.
export async function lastWrite(
  owner: DefinitionProcess,
): Promise<LastWrite | null> {
  const row = await latestOfProcess(await database(), owner.id);
  if (!row) return null;
  return {
    at: row.writtenAt.toISOString(),
    tab: row.resource,
    // One of the closed set: the table's check holds it.
    status: row.status as Application['status'],
    undoneAt: iso(row.undoneAt),
    cells: Array.isArray(row.changes) ? row.changes.length : 0,
  };
}

/*
  A record kept before the sheet was changed, whose write or undo is no
  longer in flight, is settled from what the block holds now: a write by
  whether it landed, an undo by whether the block is back as before. Left as
  it is when the block cannot be read, so nothing is guessed, and while its
  lease is live, since its block may not be written yet. Of two callers
  settling one record, one changes the row; the other reads it again.
*/
async function settled(
  db: Database,
  owner: DefinitionProcess,
  key: RunKey,
  sheet: OutputSheet,
): Promise<Kept | null> {
  const kept = await latest(db, key);
  if (!kept || kept.live) return kept;
  const { record } = kept;
  if (record.status !== 'pending' && !undoMarked(record)) return kept;
  const { data } = owner.subject;
  let grid: unknown[][] | null;
  try {
    grid = await sheet.readTab(record.tab);
  } catch {
    return kept;
  }
  if (record.status === 'pending') {
    const status = landed(record, grid, data);
    await settleWrite(
      db,
      kept.id,
      {
        status,
        // What the write was told, where it was kept, says more than these.
        error:
          status === 'verified'
            ? null
            : (record.error ??
              (status === 'failed'
                ? 'The write stopped before it landed.'
                : READ_BACK_DIFFERS)),
      },
      null,
    );
  } else {
    const cells = grid && cellsOfBlock(grid, record, data);
    if (cells && sameBlock(record.before, cells))
      await settleUndo(
        db,
        kept.id,
        { undoneAt: new Date().toISOString() },
        null,
      );
    // The undo never landed: the write stands as it did.
    else if (cells && sameBlock(record.after, cells))
      await settleUndo(db, kept.id, 'cleared', null);
    else return kept;
  }
  // Settled here, or by whoever was first: the row says which.
  return latest(db, key);
}

// Renews a lease every HEARTBEAT_MS until stopped, on a timer of its own,
// so a slow call to the sheet cannot let it lapse; a failed renewal is
// tried again at the next tick.
function heartbeat(db: Database, id: number, holder: string) {
  const timer = setInterval(() => {
    void renewLease(db, id, holder).catch(() => undefined);
  }, HEARTBEAT_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

// Before each change to the sheet: a call that no longer holds its row
// (another settled it once its lease lapsed) changes nothing.
const stillHeld = (db: Database, id: number, holder: string) =>
  renewLease(db, id, holder);

// The proposal row a write applies, by the proposal's own time.
async function proposalIdOf(
  db: Database,
  key: RunKey,
  proposal: Proposal,
): Promise<number> {
  const [row] = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(
      and(
        eq(proposals.process, key.process),
        eq(proposals.readId, key.readId),
        eq(proposals.fingerprint, key.fingerprint),
        eq(proposals.proposedAt, new Date(proposal.at)),
      ),
    );
  if (!row) throw new Error('This run has no proposal kept.');
  return row.id;
}

// What stands in the way of another write: one in flight, one not read back,
// one being undone, or one written.
function inTheWay(owner: DefinitionProcess, kept: Kept | null): string | null {
  if (!kept) return null;
  const { record } = kept;
  const { output } = owner.subject.data;
  if (record.status === 'pending')
    return kept.live ? stillWriting(owner, record) : unconfirmed(owner, record);
  if (!isStanding(record)) return null;
  if (undoMarked(record) && kept.live) return beingUndone(owner, record);
  return `This run has already written to the ${output!.tab} ${sourceOf(owner.subject.data).resource.singular}. Undo that first to write again.`;
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
  const db = await database();
  const key = keyOf(owner, read.id, fingerprint);
  const kept = await settled(db, owner, key, sheet);
  const prepared = await prepareWrite(
    owner,
    set,
    read,
    proposal,
    decisions,
    sheet,
  );
  const inWay = inTheWay(owner, kept);
  if (inWay) prepared.problems.push(inWay);
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
  const proposalId = await proposalIdOf(db, key, proposal);
  await ensureProcess(db, owner.id);
  const holder = randomUUID();
  // Kept before anything is written: if it cannot be, nothing is. Refused
  // while another write of the run stands, which another caller made since
  // this one looked.
  let id: number;
  try {
    id = await insertRow(db, {
      key,
      readProcess: readProcessOf(owner),
      proposalId,
      application: pending,
      holder,
    });
  } catch (error) {
    if (!standsAlready(error)) throw error;
    prepared.problems.push(
      inTheWay(owner, await latest(db, key)) ?? unconfirmed(owner, pending),
    );
    return { kind: 'refused', prepared };
  }
  const stop = heartbeat(db, id, holder);
  try {
    let error: string | null = null;
    try {
      if (!prepared.tabExists) {
        if (!(await stillHeld(db, id, holder)))
          return await lost(db, owner, key, id, null);
        await sheet.addTab(output.tab);
      }
      if (!(await stillHeld(db, id, holder)))
        return await lost(db, owner, key, id, null);
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
      const unread: Application = { ...pending, error };
      if (!(await leavePending(db, id, error, holder)))
        return await lost(db, owner, key, id, null);
      return { kind: 'written', application: unread };
    }
    const status = landed(pending, back, owner.subject.data);
    const application: Application = {
      ...pending,
      status,
      error: error ?? (status === 'verified' ? null : READ_BACK_DIFFERS),
    };
    if (await settleWrite(db, id, { status, error: application.error }, holder))
      return { kind: 'written', application };
    return await lost(db, owner, key, id, application);
  } finally {
    stop();
    // Given back however it ended, so a record left pending is settled at
    // the next look rather than after the lease runs out.
    await releaseLease(db, id, holder).catch(() => undefined);
  }
}

/*
  A write whose row was settled by someone else while it worked, which only
  happens once its lease lapsed: what the row says stands, and is what is
  answered. One settled as failed whose write then landed after all is kept
  again as what it read back, so the cells it replaced are not lost to undo,
  unless another write of the run has begun since, which is said.
*/
async function lost(
  db: Database,
  owner: DefinitionProcess,
  key: RunKey,
  id: number,
  readBack: Application | null,
): Promise<WriteOutcome> {
  const kept = recordOf(key, (await rowById(db, id))!);
  if (!readBack || kept.status !== 'failed' || readBack.status === 'failed')
    return { kind: 'written', application: kept };
  const [scope] = await db
    .select({
      readProcess: applications.readProcess,
      proposalId: applications.proposalId,
    })
    .from(applications)
    .where(eq(applications.id, id));
  try {
    await insertRow(db, {
      key,
      readProcess: scope!.readProcess,
      proposalId: scope!.proposalId,
      application: readBack,
      holder: null,
    });
  } catch (error) {
    if (!standsAlready(error)) throw error;
    throw new Error(
      `This write landed after it was recorded as failed, and another write of this run began since. Check the ${readBack.tab} ${sourceOf(owner.subject.data).resource.singular} by hand.`,
    );
  }
  return { kind: 'written', application: readBack };
}

export type UndoOutcome =
  | { kind: 'undone'; application: Application }
  | { kind: 'refused'; problem: string };

/*
  Puts the block back, only while it still holds exactly what was written.
  The undo is marked on the record before the block is written, so one cut
  short is finished or cleared by reading the block back, never repeated
  over what came after it; the mark is the claim, so of two undos at once
  only one writes.
*/
export async function undoApplication(
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
  sheet: OutputSheet,
): Promise<UndoOutcome> {
  const db = await database();
  const key = keyOf(owner, readId, fingerprint);
  const found = await latest(db, key);
  let kept = await settled(db, owner, key, sheet);
  // An undo cut short, now found finished.
  if (
    kept &&
    found?.record.status !== 'undone' &&
    kept.record.status === 'undone'
  )
    return { kind: 'undone', application: kept.record };
  // A mark left by an undo whose block could not be read just now: read
  // again, and refused as unconfirmed if it still cannot be settled.
  if (kept && !kept.live && undoMarked(kept.record)) {
    await sheet.readTab(kept.record.tab);
    kept = await settled(db, owner, key, sheet);
    if (kept?.record.status === 'undone')
      return { kind: 'undone', application: kept.record };
  }
  const refusal = undoRefusal(owner, kept);
  if (refusal) return { kind: 'refused', problem: refusal };
  const { id, record: last } = kept!;
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
  const holder = randomUUID();
  if (!(await markUndo(db, id, undoing.undoStartedAt!, holder)))
    return {
      kind: 'refused',
      problem:
        undoRefusal(owner, await latest(db, key)) ?? beingUndone(owner, last),
    };
  const stop = heartbeat(db, id, holder);
  try {
    if (!(await stillHeld(db, id, holder)))
      return {
        kind: 'refused',
        problem:
          undoRefusal(owner, await latest(db, key)) ?? beingUndone(owner, last),
      };
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
    if (
      (await settleUndo(db, id, { undoneAt: application.undoneAt! }, holder)) ||
      (await undoneUnmarked(db, id, application.undoneAt!))
    )
      return { kind: 'undone', application };
    // Someone else finished it first: the row says how.
    const now = recordOf(key, (await rowById(db, id))!);
    return now.status === 'undone'
      ? { kind: 'undone', application: now }
      : {
          kind: 'refused',
          problem: beingUndone(owner, now),
        };
  } finally {
    stop();
    await releaseLease(db, id, holder).catch(() => undefined);
  }
}

// Why the latest record cannot be undone now, if it cannot.
function undoRefusal(
  owner: DefinitionProcess,
  kept: Kept | null,
): string | null {
  if (kept?.record.status === 'pending')
    return kept.live
      ? stillWriting(owner, kept.record)
      : unconfirmed(owner, kept.record);
  if (!kept || !isStanding(kept.record)) return 'There is no write to undo.';
  if (undoMarked(kept.record))
    return kept.live
      ? beingUndone(owner, kept.record)
      : unconfirmed(owner, kept.record);
  return null;
}
