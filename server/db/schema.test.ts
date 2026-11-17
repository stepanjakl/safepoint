import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { hashOf } from '@/lib/engine/fingerprint';
import { inScratchDatabase, rowsOf } from '@/lib/engine/scratch.fixture';

import { database, type Database } from './client';
import {
  applications,
  currentRulebooks,
  instructionVersions,
  jobs,
  processes,
  proposals,
  reads,
  recordDecisions,
  ruleDecisions,
  rulebookHeads,
  rulebookRevisions,
  runs,
} from './schema';

/*
  The constraints the design rests on, proved on PGlite (docs/engineering/
  DATABASE.md, "What the database enforces"). Each refusal is read from the
  database's own error: its SQLSTATE and, for a trigger, its words.
*/

const scratch = inScratchDatabase();

const PROCESS = 'a-process';
const TEXT = 'Order what the week needs.';
const HASH = hashOf(TEXT);
const READ = 'read-1';
const FINGERPRINT = 'aaaaaaaaaaaa';
const AT = new Date('2026-11-13T09:00:00.000Z');

// What the database said when it refused, or a failure if it did not.
async function refused(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } })
      .cause;
    return { code: cause?.code, message: cause?.message ?? String(error) };
  }
  throw new Error('The database accepted it.');
}

async function seed(db: Database) {
  await db.insert(processes).values({ id: PROCESS });
  await db.insert(instructionVersions).values({
    process: PROCESS,
    hash: HASH,
    version: 'v1',
    text: TEXT,
    origin: 'declared',
    publishedAt: AT,
  });
  await db.insert(reads).values({
    process: PROCESS,
    id: READ,
    readAt: AT,
    source: 'A stand-in read',
    body: { id: READ } as never,
  });
}

const revision = (id: string, parent: string | null = null) => ({
  process: PROCESS,
  instructionsHash: HASH,
  id,
  parent,
  reason: 'accepted',
  revisedAt: AT,
  schemaVersion: 1,
  body: { hash: HASH, id } as never,
});

async function proposal(db: Database) {
  const [row] = await db
    .insert(proposals)
    .values({
      process: PROCESS,
      readProcess: PROCESS,
      readId: READ,
      fingerprint: FINGERPRINT,
      proposedAt: AT,
      model: 'stand-in',
      body: {
        fingerprint: FINGERPRINT,
        readId: READ,
        at: AT.toISOString(),
      } as never,
    })
    .returning({ id: proposals.id });
  return row!.id;
}

const application = (proposalId: number, status = 'pending') => ({
  process: PROCESS,
  readProcess: PROCESS,
  readId: READ,
  fingerprint: FINGERPRINT,
  proposalId,
  status,
  resource: 'Orders',
  range: 'B2:B3',
  writtenAt: AT,
  before: [[''], ['']],
  after: [[1], [2]],
  changes: [],
  decisions: {},
});

describe('the scratch database', () => {
  it('is the one database() gives, and starts empty', async () => {
    expect(await database()).toBe(scratch());
    expect(await scratch().select().from(processes)).toEqual([]);
  });

  it('keeps nothing from one test to the next', async () => {
    await scratch().insert(processes).values({ id: 'left-behind' });
  });

  it('really keeps nothing from one test to the next', async () => {
    expect(await scratch().select().from(processes)).toEqual([]);
  });
});

describe('a rulebook revision', () => {
  it('cannot be kept twice under one id', async () => {
    const db = scratch();
    await seed(db);
    await db.insert(rulebookRevisions).values(revision('bbbbbbbbbbbb'));
    expect(
      await refused(
        db.insert(rulebookRevisions).values(revision('bbbbbbbbbbbb')),
      ),
    ).toMatchObject({ code: '23505' });
  });

  it('is never changed or removed', async () => {
    const db = scratch();
    await seed(db);
    await db.insert(rulebookRevisions).values(revision('bbbbbbbbbbbb'));
    const one = eq(rulebookRevisions.id, 'bbbbbbbbbbbb');
    expect(
      await refused(
        db
          .update(rulebookRevisions)
          .set({ body: { another: 'body' } as never })
          .where(one),
      ),
    ).toMatchObject({
      code: '23000',
      message: 'rulebook_revisions rows are written once: UPDATE refused',
    });
    expect(
      await refused(db.delete(rulebookRevisions).where(one)),
    ).toMatchObject({
      message: 'rulebook_revisions rows are written once: DELETE refused',
    });
  });

  it('names a parent that is kept', async () => {
    const db = scratch();
    await seed(db);
    expect(
      await refused(
        db
          .insert(rulebookRevisions)
          .values(revision('bbbbbbbbbbbb', 'cccccccccccc')),
      ),
    ).toMatchObject({ code: '23503' });
  });

  it('agrees with its body on the instructions and profile it names', async () => {
    const db = scratch();
    await seed(db);
    for (const body of [
      { hash: 'dddddddddddd' },
      { hash: HASH, profileId: 'eeeeeeeeeeee' },
    ])
      expect(
        await refused(
          db
            .insert(rulebookRevisions)
            .values({ ...revision('bbbbbbbbbbbb'), body: body as never }),
        ),
      ).toMatchObject({ code: '23514' });
  });

  it('moves with its head, or neither moves', async () => {
    const db = scratch();
    await seed(db);
    // The head names a revision that is not the one inserted: the insert
    // goes back with it.
    expect(
      await refused(
        db.transaction(async (tx) => {
          await tx.insert(rulebookRevisions).values(revision('bbbbbbbbbbbb'));
          await tx.insert(rulebookHeads).values({
            process: PROCESS,
            instructionsHash: HASH,
            revisionId: 'cccccccccccc',
          });
        }),
      ),
    ).toMatchObject({ code: '23503' });
    expect(await db.select().from(rulebookRevisions)).toEqual([]);
    expect(await db.select().from(rulebookHeads)).toEqual([]);

    // Written as a storage function will be: given the database or a
    // transaction alike.
    const keep = async (on: Database, id: string) => {
      await on.insert(rulebookRevisions).values(revision(id));
      await on.insert(rulebookHeads).values({
        process: PROCESS,
        instructionsHash: HASH,
        revisionId: id,
      });
    };
    await db.transaction((tx) => keep(tx, 'bbbbbbbbbbbb'));
    expect(
      await db.select({ id: rulebookHeads.revisionId }).from(rulebookHeads),
    ).toEqual([{ id: 'bbbbbbbbbbbb' }]);
  });
});

describe('the rulebook under review', () => {
  it('refuses a compare-and-set once its counter has moved', async () => {
    const db = scratch();
    await seed(db);
    await db.insert(currentRulebooks).values({
      process: PROCESS,
      instructionsHash: HASH,
      body: { hash: HASH, step: 0 } as never,
      schemaVersion: 1,
    });
    const update = (seen: number, step: number) =>
      db
        .update(currentRulebooks)
        .set({ body: { hash: HASH, step } as never })
        .where(
          and(
            eq(currentRulebooks.process, PROCESS),
            eq(currentRulebooks.instructionsHash, HASH),
            eq(currentRulebooks.revision, seen),
          ),
        )
        .returning({ revision: currentRulebooks.revision });

    // Two writers both read revision 1; the first wins, the second matches
    // nothing and must read again.
    expect(await update(1, 1)).toEqual([{ revision: 2 }]);
    expect(await update(1, 2)).toEqual([]);
    // An update cannot hold the counter back by setting it.
    await db
      .update(currentRulebooks)
      .set({ revision: 1 })
      .where(eq(currentRulebooks.process, PROCESS));
    const [kept] = await db.select().from(currentRulebooks);
    expect(kept).toMatchObject({ revision: 3, body: { step: 1 } });
  });

  it('is only for instructions that are kept', async () => {
    const db = scratch();
    await seed(db);
    expect(
      await refused(
        db.insert(currentRulebooks).values({
          process: PROCESS,
          instructionsHash: 'dddddddddddd',
          body: { hash: 'dddddddddddd' } as never,
          schemaVersion: 1,
        }),
      ),
    ).toMatchObject({ code: '23503' });
  });
});

describe('an instructions version', () => {
  it('is named by the hash of its own text', async () => {
    const db = scratch();
    await db.insert(processes).values({ id: PROCESS });
    expect(
      await refused(
        db.insert(instructionVersions).values({
          process: PROCESS,
          hash: hashOf('Some other text.'),
          version: 'v1',
          text: TEXT,
          origin: 'declared',
          publishedAt: AT,
        }),
      ),
    ).toMatchObject({ code: '23514' });
  });
});

describe('a write to the output', () => {
  it('is the only standing write of its run', async () => {
    const db = scratch();
    await seed(db);
    const id = await proposal(db);
    await db.insert(applications).values(application(id));
    // A pending write stands in the way, as does one written.
    expect(
      await refused(db.insert(applications).values(application(id))),
    ).toMatchObject({ code: '23505' });
    await db
      .update(applications)
      .set({ status: 'verified' })
      .where(eq(applications.proposalId, id));
    expect(
      await refused(db.insert(applications).values(application(id))),
    ).toMatchObject({ code: '23505' });
    // Undone, it no longer stands, and the run may write again.
    await db
      .update(applications)
      .set({ status: 'undone', undoneAt: AT })
      .where(eq(applications.proposalId, id));
    await db.insert(applications).values(application(id));
    // A failed write never stood.
    await db
      .update(applications)
      .set({ status: 'failed' })
      .where(eq(applications.status, 'pending'));
    await db.insert(applications).values(application(id));
    expect(await db.select().from(applications)).toHaveLength(3);
  });

  it('moves only forward and keeps what it wrote', async () => {
    const db = scratch();
    await seed(db);
    const id = await proposal(db);
    await db.insert(applications).values(application(id, 'verified'));
    const one = eq(applications.proposalId, id);
    expect(
      await refused(
        db.update(applications).set({ status: 'pending' }).where(one),
      ),
    ).toMatchObject({
      message: 'an application cannot move from verified to pending',
    });
    expect(
      await refused(
        db
          .update(applications)
          .set({ after: [[9], [9]] })
          .where(one),
      ),
    ).toMatchObject({ message: 'what an application wrote is never changed' });
    // Nor the read it was written from (0005 adds read_process to the guard).
    await db.insert(processes).values({ id: 'another-process' });
    await db.insert(reads).values({
      process: 'another-process',
      id: READ,
      readAt: AT,
      source: 'A stand-in read',
      body: { id: READ } as never,
    });
    expect(
      await refused(
        db
          .update(applications)
          .set({ readProcess: 'another-process' })
          .where(one),
      ),
    ).toMatchObject({ message: 'what an application wrote is never changed' });
    expect(await refused(db.delete(applications).where(one))).toMatchObject({
      message: 'applications rows are never removed',
    });
    // An undo is marked before it writes, and cleared if it never landed;
    // its lease is taken and given back, both or neither.
    await db
      .update(applications)
      .set({ undoStartedAt: AT, holder: 'an-undo', heartbeatAt: AT })
      .where(one);
    expect(
      await refused(
        db.update(applications).set({ heartbeatAt: null }).where(one),
      ),
    ).toMatchObject({ code: '23514' });
    await db
      .update(applications)
      .set({ undoStartedAt: null, holder: null, heartbeatAt: null })
      .where(one);
  });

  it('is undone only with the time it was undone', async () => {
    const db = scratch();
    await seed(db);
    const id = await proposal(db);
    await db.insert(applications).values(application(id, 'verified'));
    expect(
      await refused(
        db
          .update(applications)
          .set({ status: 'undone' })
          .where(eq(applications.proposalId, id)),
      ),
    ).toMatchObject({ code: '23514' });
  });
});

describe('a decision', () => {
  async function decided(db: Database) {
    await seed(db);
    await db.insert(runs).values({
      process: PROCESS,
      id: 'run-1',
      instructionsHash: HASH,
      readProcess: PROCESS,
      readId: READ,
      stage: 'propose',
      status: 'running',
      trigger: 'manual',
      startedAt: AT,
    });
    const proposalId = await proposal(db);
    await db.insert(recordDecisions).values({
      process: PROCESS,
      runId: 'run-1',
      proposalId,
      recordKey: 'SD-01',
      kind: 'change',
      values: { order: 4 },
      verdict: 'ready',
      actor: 'Alex',
    });
    await db.insert(ruleDecisions).values({
      process: PROCESS,
      instructionsHash: HASH,
      kind: 'deny',
      definitionId: 'stock_available',
      definition: { id: 'stock_available' } as never,
      rulebookRevision: 3,
      note: 'Counts the delivery twice.',
    });
  }

  it('is appended and never changed or removed', async () => {
    const db = scratch();
    await decided(db);
    for (const table of [recordDecisions, ruleDecisions]) {
      expect(
        await refused(db.update(table).set({ actor: 'Someone else' })),
      ).toMatchObject({ code: '23000' });
      expect(await refused(db.delete(table))).toMatchObject({ code: '23000' });
    }
  });

  it('holds what it was made on from being removed', async () => {
    const db = scratch();
    await decided(db);
    // A run is never removed at all (0007), whatever points at it.
    expect(await refused(db.delete(runs))).toMatchObject({
      code: '23000',
      message: 'runs rows are never removed',
    });
    expect(await refused(db.delete(proposals))).toMatchObject({
      code: '23000',
    });
    expect(await refused(db.delete(processes))).toMatchObject({
      code: '23001',
    });
  });

  it('says what a change set, and only a change', async () => {
    const db = scratch();
    await decided(db);
    const [{ id }] = (await db
      .select({ id: proposals.id })
      .from(proposals)) as [{ id: number }];
    const base = {
      process: PROCESS,
      runId: 'run-1',
      proposalId: id,
      recordKey: 'SD-01',
    } as const;
    expect(
      await refused(
        db.insert(recordDecisions).values({ ...base, kind: 'change' }),
      ),
    ).toMatchObject({ code: '23514' });
    expect(
      await refused(
        db
          .insert(recordDecisions)
          .values({ ...base, kind: 'approve', values: { order: 1 } }),
      ),
    ).toMatchObject({ code: '23514' });
  });

  it('on a rule keeps the definition it was made on', async () => {
    const db = scratch();
    await decided(db);
    expect(
      await refused(
        db.insert(ruleDecisions).values({
          process: PROCESS,
          instructionsHash: HASH,
          kind: 'accept',
          definitionId: 'stock_available',
        }),
      ),
    ).toMatchObject({ code: '23514' });
  });
});

describe('a run', () => {
  const started = {
    process: PROCESS,
    id: 'run-1',
    instructionsHash: HASH,
    readProcess: PROCESS,
    stage: 'read',
    status: 'running',
    trigger: 'manual',
    startedAt: AT,
  };

  it('moves on, but never changes what it started with', async () => {
    const db = scratch();
    await seed(db);
    await db.insert(runs).values(started);
    await db
      .update(runs)
      .set({ readId: READ, stage: 'propose', status: 'awaiting_review' });
    for (const change of [
      { instructionsHash: 'bbbbbbbbbbbb' },
      { trigger: 'rerun' },
      { additionalInstructions: 'Also this.' },
      { startedAt: new Date() },
      { readProcess: 'another' },
    ])
      expect(await refused(db.update(runs).set(change))).toMatchObject({
        code: '23000',
        message: 'what a run started with is never changed',
      });
  });

  it('reads only what is kept where its process keeps reads', async () => {
    const db = scratch();
    await seed(db);
    await db.insert(runs).values(started);
    expect(
      await refused(db.update(runs).set({ readId: 'not-kept' })),
    ).toMatchObject({ code: '23503' });
  });

  it('pins only a revision kept for its own instructions', async () => {
    const db = scratch();
    await seed(db);
    await db.insert(runs).values(started);
    await db.insert(rulebookRevisions).values(revision('aaaaaaaaaaaa'));
    expect(
      await refused(db.update(runs).set({ rulebookId: 'bbbbbbbbbbbb' })),
    ).toMatchObject({ code: '23503' });
    await db.update(runs).set({ rulebookId: 'aaaaaaaaaaaa' });
    // A revision kept for other instructions is not one for this run.
    await db.insert(instructionVersions).values({
      process: PROCESS,
      hash: hashOf('Order less.'),
      version: 'v2',
      text: 'Order less.',
      origin: 'declared',
      publishedAt: AT,
    });
    await db.insert(rulebookRevisions).values({
      ...revision('cccccccccccc'),
      instructionsHash: hashOf('Order less.'),
      body: { hash: hashOf('Order less.'), id: 'cccccccccccc' } as never,
    });
    expect(
      await refused(db.update(runs).set({ rulebookId: 'cccccccccccc' })),
    ).toMatchObject({ code: '23503' });
  });

  it('once discarded, stays discarded and moves no further', async () => {
    const db = scratch();
    await seed(db);
    await db.insert(runs).values({ ...started, discardedAt: AT });
    for (const change of [
      { discardedAt: null },
      { discardedAt: new Date() },
      { stage: 'propose' },
      { status: 'completed' },
      { readId: READ },
    ])
      expect(await refused(db.update(runs).set(change))).toMatchObject({
        code: '23000',
        message: 'a discarded run moves no further',
      });
  });
});

describe('closed sets of values', () => {
  it('refuse a value they do not list', async () => {
    const db = scratch();
    await seed(db);
    const id = await proposal(db);
    const cases = [
      db.insert(applications).values(application(id, 'written')),
      db.insert(rulebookRevisions).values({
        ...revision('bbbbbbbbbbbb'),
        reason: 'edited',
      }),
      db.insert(jobs).values({
        process: PROCESS,
        kind: 'imports',
        key: HASH,
        step: '',
        running: false,
        startedAt: AT,
      }),
      db.insert(runs).values({
        process: PROCESS,
        id: 'run-1',
        instructionsHash: HASH,
        readProcess: PROCESS,
        stage: 'publish',
        status: 'running',
        trigger: 'manual',
        startedAt: AT,
      }),
      db.insert(ruleDecisions).values({
        process: PROCESS,
        instructionsHash: HASH,
        kind: 'approve',
      }),
    ];
    for (const one of cases)
      expect(await refused(one)).toMatchObject({ code: '23514' });
  });

  it('hold a running job to the instance holding it', async () => {
    const db = scratch();
    await seed(db);
    expect(
      await refused(
        db.insert(jobs).values({
          process: PROCESS,
          kind: 'drafts',
          key: HASH,
          step: 'Finding…',
          running: true,
          startedAt: AT,
        }),
      ),
    ).toMatchObject({ code: '23514' });
  });
});

describe('the migrations', () => {
  it('leave the guards the generator cannot write in place', async () => {
    const rows = await rowsOf<{ name: string }>(
      scratch(),
      sql`select tgname as name from pg_trigger where not tgisinternal order by tgname`,
    );
    expect(rows.map((row) => row.name)).toEqual([
      'applications_move_forward',
      'current_profiles_next_revision',
      'current_rulebooks_next_revision',
      'data_profiles_written_once',
      'instruction_versions_written_once',
      'proposals_written_once',
      'reads_written_once',
      'record_decisions_written_once',
      'rule_decisions_written_once',
      'rulebook_revisions_written_once',
      'runs_keep_their_start',
      'source_reads_written_once',
    ]);
  });
});
