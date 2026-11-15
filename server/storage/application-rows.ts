import 'server-only';

import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm';

import type { Application } from '@/lib/definitions/types';
import type { Database } from '@/server/db/client';
import { applications, proposals } from '@/server/db/schema';

import type { RunKey } from './run-key';

/*
  Server-only. The statements applications.ts keeps a write's record with,
  each one statement, none holding a lock across a call to the sheet
  (docs/engineering/DATABASE.md, "One standing write, settled once"). Apart
  so a test can stop one, as if the process stopped there.

  A write or an undo in flight holds a lease on its row: `holder` is a token
  of that one call, and `heartbeat_at` is renewed every HEARTBEAT_MS while it
  works. Only the holder settles a row whose lease is live; anyone may settle
  one whose lease has lapsed (its process is gone) or was given back. Each
  update says in its own WHERE what it needs to be true, so of two callers
  racing, one changes the row and the other matches nothing and reads again.
*/

export const HEARTBEAT_MS = 15_000;
export const LEASE_MS = 60_000;

const lapsed = sql`(${applications.holder} is null or ${applications.heartbeatAt} < now() - make_interval(secs => ${LEASE_MS / 1000}))`;

const ofKey = (key: RunKey) =>
  and(
    eq(applications.process, key.process),
    eq(applications.readId, key.readId),
    eq(applications.fingerprint, key.fingerprint),
  );

const COLUMNS = {
  id: applications.id,
  // The proposal's own `at`, from the row it points at.
  proposedAt: proposals.proposedAt,
  resource: applications.resource,
  writtenAt: applications.writtenAt,
  status: applications.status,
  error: applications.error,
  undoneAt: applications.undoneAt,
  range: applications.range,
  before: applications.before,
  after: applications.after,
  changes: applications.changes,
  decisions: applications.decisions,
  addsResource: applications.addsResource,
  undoStartedAt: applications.undoStartedAt,
  // Whether a write or an undo is working on it now, by the database's clock.
  live: sql<boolean>`not ${lapsed}`,
};

export type Row = {
  id: number;
  // The proposal's own `at`, from the row it points at.
  proposedAt: Date;
  resource: string;
  writtenAt: Date;
  status: string;
  error: string | null;
  undoneAt: Date | null;
  range: string;
  before: unknown;
  after: unknown;
  changes: unknown;
  decisions: unknown;
  addsResource: boolean | null;
  undoStartedAt: Date | null;
  live: boolean;
};

const selectRows = (db: Database) =>
  db
    .select(COLUMNS)
    .from(applications)
    .innerJoin(
      proposals,
      and(
        eq(proposals.process, applications.process),
        eq(proposals.id, applications.proposalId),
      ),
    );

// The latest record of a run key, which `applications_by_run_key` serves.
export async function latestRow(db: Database, key: RunKey) {
  const [row] = await selectRows(db)
    .where(ofKey(key))
    .orderBy(desc(applications.id))
    .limit(1);
  return (row as Row | undefined) ?? null;
}

// Every record of a run key, oldest first.
export async function rowsOfKey(db: Database, key: RunKey) {
  return (await selectRows(db)
    .where(ofKey(key))
    .orderBy(applications.id)) as Row[];
}

export async function rowById(db: Database, id: number) {
  const [row] = await selectRows(db).where(eq(applications.id, id));
  return (row as Row | undefined) ?? null;
}

// A process's latest write of any run, which `applications_by_time` serves.
export async function latestOfProcess(db: Database, process: string) {
  const [row] = await selectRows(db)
    .where(eq(applications.process, process))
    .orderBy(desc(applications.writtenAt), desc(applications.id))
    .limit(1);
  return (row as Row | undefined) ?? null;
}

export type NewRow = {
  key: RunKey;
  readProcess: string;
  proposalId: number;
  // The kept run it is written through, where it names one.
  runId: string | null;
  application: Application;
  // The lease, for a write about to be made; none for a record of one made.
  holder: string | null;
};

const asDate = (iso: string | null | undefined) =>
  iso === null || iso === undefined ? null : new Date(iso);

/*
  The claim: a pending row, kept before anything is written. The partial
  unique index refuses it while another write of the run key stands, which
  the caller reads as "already written" or "not yet read back".
*/
export async function insertRow(db: Database, row: NewRow): Promise<number> {
  const { application: a } = row;
  const [inserted] = await db
    .insert(applications)
    .values({
      process: row.key.process,
      readProcess: row.readProcess,
      readId: row.key.readId,
      fingerprint: row.key.fingerprint,
      proposalId: row.proposalId,
      runId: row.runId,
      status: a.status,
      resource: a.tab,
      range: a.range,
      writtenAt: new Date(a.at),
      error: a.error,
      undoneAt: asDate(a.undoneAt),
      undoStartedAt: asDate(a.undoStartedAt),
      addsResource: a.addsResource ?? null,
      before: a.before,
      after: a.after,
      changes: a.changes,
      decisions: a.decisions,
      holder: row.holder,
      heartbeatAt: row.holder ? sql`now()` : null,
    })
    .returning({ id: applications.id });
  return inserted!.id;
}

// Whether the database refused a row because another stands for its run key.
export const standsAlready = (error: unknown) => {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return (
    (cause?.code ?? (error as { code?: unknown } | null)?.code) === '23505'
  );
};

const released = { holder: null, heartbeatAt: null };

const changed = async (query: Promise<{ id: number }[]>): Promise<boolean> =>
  (await query).length > 0;

/*
  Settles a pending write: by its holder, or by anyone once its lease has
  lapsed. False when it was not pending, or another holds it: someone else
  settled it first, or is still writing.
*/
export const settleWrite = (
  db: Database,
  id: number,
  settled: { status: 'verified' | 'mismatch' | 'failed'; error: string | null },
  holder: string | null,
) =>
  changed(
    db
      .update(applications)
      .set({ ...settled, ...released })
      .where(
        and(
          eq(applications.id, id),
          eq(applications.status, 'pending'),
          holder === null ? lapsed : eq(applications.holder, holder),
        ),
      )
      .returning({ id: applications.id }),
  );

// A write not read back stays pending, with what it was told, and gives its
// lease back so the next caller that can read the block settles it.
export const leavePending = (
  db: Database,
  id: number,
  error: string | null,
  holder: string,
) =>
  changed(
    db
      .update(applications)
      .set({ error, ...released })
      .where(
        and(
          eq(applications.id, id),
          eq(applications.status, 'pending'),
          eq(applications.holder, holder),
        ),
      )
      .returning({ id: applications.id }),
  );

const STANDING = ['verified', 'mismatch'];

// Claims an undo: marks it on a standing row no undo is marked on.
export const markUndo = (
  db: Database,
  id: number,
  at: string,
  holder: string,
) =>
  changed(
    db
      .update(applications)
      .set({ undoStartedAt: new Date(at), holder, heartbeatAt: sql`now()` })
      .where(
        and(
          eq(applications.id, id),
          inArray(applications.status, STANDING),
          isNull(applications.undoStartedAt),
          lapsed,
        ),
      )
      .returning({ id: applications.id }),
  );

/*
  Settles a marked undo: `undone` once the block is back as before, `cleared`
  (the marker removed, the write standing as it did) once it still holds what
  was written. By its holder, or by anyone once its lease has lapsed.
*/
export const settleUndo = (
  db: Database,
  id: number,
  outcome: { undoneAt: string } | 'cleared',
  holder: string | null,
) =>
  changed(
    db
      .update(applications)
      .set(
        outcome === 'cleared'
          ? { undoStartedAt: null, ...released }
          : {
              status: 'undone',
              undoneAt: new Date(outcome.undoneAt),
              ...released,
            },
      )
      .where(
        and(
          eq(applications.id, id),
          inArray(applications.status, STANDING),
          isNotNull(applications.undoStartedAt),
          holder === null ? lapsed : eq(applications.holder, holder),
        ),
      )
      .returning({ id: applications.id }),
  );

/*
  An undo that read back as before after its marker was cleared by someone
  who found the block still as written, before this undo's write landed:
  it is undone all the same, unless someone else has marked an undo since.
*/
export const undoneUnmarked = (db: Database, id: number, undoneAt: string) =>
  changed(
    db
      .update(applications)
      .set({ status: 'undone', undoneAt: new Date(undoneAt), ...released })
      .where(
        and(
          eq(applications.id, id),
          inArray(applications.status, STANDING),
          or(isNull(applications.undoStartedAt), lapsed),
        ),
      )
      .returning({ id: applications.id }),
  );

// Renews the lease, and says whether this call still holds it: checked
// before each change to the sheet, so one that lost it writes nothing.
export const renewLease = (db: Database, id: number, holder: string) =>
  changed(
    db
      .update(applications)
      .set({ heartbeatAt: sql`now()` })
      .where(and(eq(applications.id, id), eq(applications.holder, holder)))
      .returning({ id: applications.id }),
  );

// Gives the lease back; nothing if another settled the row already.
export const releaseLease = async (
  db: Database,
  id: number,
  holder: string,
) => {
  await db
    .update(applications)
    .set(released)
    .where(and(eq(applications.id, id), eq(applications.holder, holder)));
};
