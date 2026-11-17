import { readFileSync } from 'node:fs';

import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { inScratchDatabase, rowsOf } from '@/lib/engine/scratch.fixture';
import {
  proposalPartSchema,
  proposalSchema,
  type Proposal,
} from '@/lib/engine/types';
import {
  BRUNCH_ORDERS_DEFINITIONS as owner,
  BRUNCH_ORDERS_DIRECT_DEFINITIONS as direct,
} from '@/lib/processes/brunch-orders/process';
import { answerParts, crossChecks, proposals } from '@/server/db/schema';

import { keepStandInRead } from './reads.fixture';
import { dropPart, keepPart, keptPart } from './answer-parts';
import { keepProposal, keptProposal, runKeyOf } from './proposals';

// A proposal is kept whole, and never changed; the latest for a run key is the
// one kept. A part is replaced as each batch arrives and goes with the whole.

const db = inScratchDatabase();
// Every read is kept under Brunch orders', whichever process works on it.
beforeEach(() => keepStandInRead(db(), READ));

const frozen = proposalSchema.parse(
  (
    JSON.parse(
      readFileSync('e2e/fixtures/brunch-orders-proposal.json', 'utf8'),
    ) as { proposal: unknown }
  ).proposal,
);
const FINGERPRINT = '5b895575e4e7';
const READ = '2026-10-08T21-46-29-441Z-6e93bf09';
const record = frozen.records['SD-01']!;

const made = (at: string, keys: string[] = ['SD-01']): Proposal => ({
  fingerprint: FINGERPRINT,
  readId: READ,
  model: 'a-model',
  at,
  records: Object.fromEntries(keys.map((key) => [key, record])),
});
const key = runKeyOf(owner, READ, FINGERPRINT);

describe('a kept proposal', () => {
  it('is none until one is kept, and is read back as it was kept', async () => {
    expect(await keptProposal(owner, READ, FINGERPRINT)).toBeNull();
    const proposal = made('2026-11-01T09:00:00.000Z');
    await keepProposal(owner, proposal);
    expect(await keptProposal(owner, READ, FINGERPRINT)).toEqual(proposal);
    expect(await keptProposal(owner, READ, '000000000000')).toBeNull();
    expect(await keptProposal(direct, READ, FINGERPRINT)).toBeNull();
  });

  it('comes back with its records in the order they were kept', async () => {
    // jsonb would give these back shortest key first, then by byte.
    const keys = ['ZZ-9', 'B-10', 'M-5', 'A-1', 'BB-2'];
    await keepProposal(owner, made('2026-11-01T09:00:00.000Z', keys));
    const kept = await keptProposal(owner, READ, FINGERPRINT);
    expect(Object.keys(kept!.records)).toEqual(keys);
    expect(keys).not.toEqual([...keys].sort());
    const [row] = await db().select({ body: proposals.body }).from(proposals);
    expect(Object.keys((row!.body as Proposal).records)).toEqual(keys);
  });

  it('is the latest proposed for the run key, the earlier ones kept as history', async () => {
    const first = made('2026-11-01T09:00:00.000Z');
    const second = made('2026-11-02T09:00:00.000Z', ['SD-01', 'AV-RR']);
    await keepProposal(owner, second);
    await keepProposal(owner, first);
    await keepProposal(owner, made('2026-10-01T09:00:00.000Z'));
    // The latest by when it was proposed, however the rows came to be kept.
    expect(await keptProposal(owner, READ, FINGERPRINT)).toEqual(second);
    expect(await db().select().from(proposals)).toHaveLength(3);
    // Another run key's is its own.
    await keepProposal(owner, { ...first, fingerprint: '000000000000' });
    expect(await keptProposal(owner, READ, FINGERPRINT)).toEqual(second);
  });

  it('is kept once: the same proposal again leaves the first as it was', async () => {
    const first = made('2026-11-01T09:00:00.000Z');
    await keepProposal(owner, first);
    await keepProposal(owner, { ...first, model: 'another' });
    expect(await db().select().from(proposals)).toHaveLength(1);
    expect((await keptProposal(owner, READ, FINGERPRINT))?.model).toBe(
      'a-model',
    );
  });

  it('is found by the index the run key is served by', async () => {
    await keepProposal(owner, made('2026-11-01T09:00:00.000Z'));
    const plan = await db().transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      return rowsOf<{ 'QUERY PLAN': string }>(
        tx,
        sql`explain select body from proposals
          where process = ${owner.id} and read_id = ${READ} and fingerprint = ${FINGERPRINT}
          order by proposed_at desc limit 1`,
      );
    });
    const text = plan.map((row) => row['QUERY PLAN']).join('\n');
    expect(text).toContain('proposals_by_run_key');
    expect(text).not.toContain('Sort');
  });

  it('is reported when it no longer fits, never taken for none kept', async () => {
    await keepProposal(owner, made('2026-11-01T09:00:00.000Z'));
    // Written once, so a bad one is put in by lifting the guard for a moment.
    await db().transaction(async (tx) => {
      await tx.execute(
        sql`alter table proposals disable trigger proposals_written_once`,
      );
      await tx
        .update(proposals)
        .set({ body: { fingerprint: FINGERPRINT, readId: READ } as never })
        .where(eq(proposals.readId, READ));
      await tx.execute(
        sql`alter table proposals enable trigger proposals_written_once`,
      );
    });
    await expect(keptProposal(owner, READ, FINGERPRINT)).rejects.toThrow(
      /does not fit the stored shape/,
    );
  });

  it('lets a database failure through', async () => {
    const failing = vi.spyOn(db(), 'select').mockImplementation(() => {
      throw new Error('connection lost');
    });
    await expect(keptProposal(owner, READ, FINGERPRINT)).rejects.toThrow(
      'connection lost',
    );
    failing.mockRestore();
  });

  it('is kept for a process whose read is kept under another', async () => {
    // The direct process proposes on a read kept under `brunch-orders`.
    await keepProposal(direct, made('2026-11-01T09:00:00.000Z'));
    expect(await keptProposal(direct, READ, FINGERPRINT)).toMatchObject({
      readId: READ,
    });
    expect(
      await db()
        .select({
          process: proposals.process,
          readProcess: proposals.readProcess,
        })
        .from(proposals),
    ).toEqual([{ process: direct.id, readProcess: owner.id }]);
    await keepPart(
      'proposal',
      runKeyOf(direct, READ, FINGERPRINT),
      proposalPartSchema,
      {
        records: {},
        models: [],
      },
    );
    expect(
      await db()
        .select({ readProcess: answerParts.readProcess })
        .from(answerParts),
    ).toEqual([{ readProcess: owner.id }]);
  });
});

describe('the read a row was made on', () => {
  const refusedFor = async (attempt: Promise<unknown>) => {
    const error = await attempt.then(
      () => null,
      (thrown: unknown) =>
        thrown as { cause?: { code?: string }; code?: string },
    );
    return (error?.cause ?? error)?.code;
  };

  it('must be kept: a proposal, a cross-check or a part for a read kept nowhere is refused', async () => {
    await expect(
      keepProposal(owner, {
        ...made('2026-11-01T09:00:00.000Z'),
        readId: 'nowhere',
      }),
    ).rejects.toThrow();
    await expect(
      keepPart('proposal', { ...key, readId: 'nowhere' }, proposalPartSchema, {
        records: {},
        models: [],
      }),
    ).rejects.toThrow();
    expect(await db().select().from(proposals)).toEqual([]);
    expect(await db().select().from(answerParts)).toEqual([]);
  });

  it('is refused by the database itself, whatever wrote the row', async () => {
    const body = made('2026-11-01T09:00:00.000Z');
    const here = { process: owner.id, fingerprint: FINGERPRINT };
    await db().execute(
      sql`insert into processes (id) values (${owner.id}) on conflict do nothing`,
    );
    // 23503: foreign_key_violation. Under the right process, with no such read.
    expect(
      await refusedFor(
        db()
          .insert(proposals)
          .values({
            ...here,
            readProcess: owner.id,
            readId: 'nowhere',
            proposedAt: new Date(body.at),
            model: 'a-model',
            body: { ...body, readId: 'nowhere' },
          }),
      ),
    ).toBe('23503');
    // And under another process that has the id kept: the read is of the
    // process that keeps it, not any with the same id.
    expect(
      await refusedFor(
        db()
          .insert(answerParts)
          .values({
            ...here,
            kind: 'proposal',
            readProcess: direct.id,
            readId: READ,
            body: {},
          }),
      ),
    ).toBe('23503');
    expect(
      await refusedFor(
        db()
          .insert(crossChecks)
          .values({
            ...here,
            readProcess: owner.id,
            readId: 'nowhere',
            checkedAt: new Date(body.at),
            model: 'a-model',
            agreed: 0,
            total: 0,
            body: {} as never,
          }),
      ),
    ).toBe('23503');
  });

  it('cannot be removed while a row points at it: the key restricts deletes', async () => {
    const keys = await rowsOf<{
      name: string;
      onDelete: string;
      columns: string;
    }>(
      db(),
      sql`select conrelid::regclass::text || '.' || conname as name,
          confdeltype as "onDelete",
          (select string_agg(attname, ',' order by ord) from unnest(conkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = conrelid and a.attnum = k.attnum) as columns
        from pg_constraint
        where confrelid = 'reads'::regclass
          and conrelid in ('proposals'::regclass, 'cross_checks'::regclass, 'answer_parts'::regclass)
        order by name`,
    );
    expect(keys).toEqual(
      ['answer_parts', 'cross_checks', 'proposals'].map((table) => ({
        name: `${table}.${table}_read_fk`,
        onDelete: 'r',
        columns: 'read_process,read_id',
      })),
    );
    await keepProposal(owner, made('2026-11-01T09:00:00.000Z'));
    // Reads are written once, so the trigger answers first; the key is the
    // second lock on the same door.
    await expect(db().execute(sql`delete from reads`)).rejects.toThrow();
  });
});

describe('keeping the whole and dropping its part', () => {
  const part = { records: { 'SD-01': record }, models: ['a-model'] };

  it('removes the part in the same transaction as it keeps the proposal', async () => {
    await keepPart('proposal', key, proposalPartSchema, part);
    expect(await keptPart('proposal', key, proposalPartSchema)).toEqual(part);
    await keepProposal(owner, made('2026-11-01T09:00:00.000Z'));
    expect(await keptPart('proposal', key, proposalPartSchema)).toBeNull();
    expect(await db().select().from(answerParts)).toEqual([]);
  });

  it('keeps the part when the proposal cannot be kept: both or neither', async () => {
    const bad = { ...key, fingerprint: 'not-a-fingerprint' };
    await keepPart('proposal', bad, proposalPartSchema, part);
    await expect(
      keepProposal(owner, {
        ...made('2026-11-01T09:00:00.000Z'),
        fingerprint: bad.fingerprint,
      }),
    ).rejects.toThrow();
    expect(await keptPart('proposal', bad, proposalPartSchema)).toEqual(part);
    expect(await db().select().from(proposals)).toEqual([]);
  });
});

describe('a part', () => {
  const one = { records: { 'SD-01': record }, models: ['a-model'] };
  const two = {
    records: { 'ZZ-9': record, 'SD-01': record },
    models: ['a-model', 'another'],
  };

  it('is replaced as each batch arrives, in the order it was kept', async () => {
    await keepPart('proposal', key, proposalPartSchema, one);
    await keepPart('proposal', key, proposalPartSchema, two);
    expect(await db().select().from(answerParts)).toHaveLength(1);
    const kept = await keptPart('proposal', key, proposalPartSchema);
    expect(Object.keys(kept!.records)).toEqual(['ZZ-9', 'SD-01']);
    expect(kept!.models).toEqual(['a-model', 'another']);
  });

  it('is its own for a proposal and a cross-check of the same run key', async () => {
    await keepPart('proposal', key, proposalPartSchema, one);
    await dropPart(db(), 'cross-check', key);
    expect(await keptPart('proposal', key, proposalPartSchema)).toEqual(one);
  });

  it('is asked for again, not reported, when it no longer fits', async () => {
    await keepPart('proposal', key, proposalPartSchema, one);
    await db()
      .update(answerParts)
      .set({ body: { records: 3 } });
    expect(await keptPart('proposal', key, proposalPartSchema)).toBeNull();
  });
});
