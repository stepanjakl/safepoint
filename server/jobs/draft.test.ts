import { and, eq, sql } from 'drizzle-orm';
import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead, capturedTabs } from '@/lib/engine/captured.fixture';
import { draftProgress, startDraft, startRewrite } from './draft';
import {
  accountedFor,
  answer,
  check,
  standIn,
} from '@/lib/engine/models.fixture';
import { eventually, inScratchStorage } from '@/lib/engine/scratch.fixture';
import { keepText, TEXT } from '@/lib/engine/set.fixture';
import { hashOf } from '@/lib/engine/fingerprint';
import { ensureProcess } from '@/server/db/scope';
import { jobs, modelAttempts } from '@/server/db/schema';
import { keepRead } from '@/server/storage/reads.fixture';
import { loadSet } from '@/server/storage/rules/rulebooks';

// A whole draft runs on the server: found, then each definition written, with
// its progress there to be asked for, and never on a read that does not fit.

const { database: db } = inScratchStorage();

// Drafting keeps rules for kept instructions, as a run's always are, and a
// draft's steps read the read it was started on by its id.
beforeEach(async () => {
  for (const text of [TEXT, `${TEXT} Interrupted.`, `${TEXT} Again.`])
    await keepText(text);
  await keepRead(db(), capturedRead());
});

// The row a draft's progress is kept in.
const draftRow = async (text: string) =>
  (
    await db()
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.process, owner.id),
          eq(jobs.kind, 'drafts'),
          eq(jobs.key, hashOf(text)),
        ),
      )
  )[0];

const found = {
  intent: 'Order enough.',
  definitions: [
    {
      id: 'two_weekends',
      name: 'Two weekends',
      text: 'The sales of the first two weekends',
      result: 'number',
      consequence: null,
    },
  ],
};
// SD-01 sold 28 and 31; AV-RR 21 and 23.
const written = {
  constants: [],
  groups: [],
  formula: 'record.weekend_1 + record.weekend_2',
  examples: [
    { key: 'SD-01', inputs: { order: null }, result: 59, why: '28 and 31.' },
    { key: 'AV-RR', inputs: { order: null }, result: 44, why: '21 and 23.' },
  ],
};

describe('a draft on the server', () => {
  it('reports progress as it stood when asked, not as it later becomes', async () => {
    const model = standIn(
      answer(accountedFor(found, TEXT)),
      check(written),
      check(written),
    );
    await startDraft(owner, TEXT, 'v1', capturedRead(), {
      resolve: () => model,
    });
    const asked = await draftProgress(owner, TEXT);
    expect(asked?.running).toBe(true);
    await eventually(async () =>
      expect((await draftProgress(owner, TEXT))?.running).toBe(false),
    );
    expect(asked?.running).toBe(true);
  });

  it('finds, then writes each definition, reporting as it goes', async () => {
    const model = standIn(
      answer(accountedFor(found, TEXT)),
      check(written),
      check(written),
    );
    const started = await startDraft(owner, TEXT, 'v1', capturedRead(), {
      resolve: () => model,
    });
    expect(started.running).toBe(true);
    await eventually(async () =>
      expect((await draftProgress(owner, TEXT))?.running).toBe(false),
    );
    expect(await draftProgress(owner, TEXT)).toMatchObject({
      step: 'Drafted 1 definition.',
      error: null,
    });
    const set = await loadSet(owner, TEXT);
    expect(set?.definitions[0]).toMatchObject({
      formula: 'record.weekend_1 + record.weekend_2',
      problem: null,
    });
    // Each model call, kept with the job it was part of before it ended: the
    // find, then the two writes the definition took to agree.
    const job = {
      process: owner.id,
      jobKind: 'drafts',
      jobKey: hashOf(TEXT),
      instructionsHash: hashOf(TEXT),
      readId: capturedRead().id,
      fingerprint: null,
      outcome: 'answered',
      requests: 1,
    };
    expect(
      await db().select().from(modelAttempts).orderBy(modelAttempts.id),
    ).toEqual([
      expect.objectContaining({
        ...job,
        purpose: 'find',
        definitionId: null,
        attempt: 1,
        asked: expect.objectContaining({ sentences: expect.any(Number) }),
        answer: expect.objectContaining({
          definitions: ['two_weekends'],
          problems: 0,
        }),
      }),
      expect.objectContaining({
        ...job,
        purpose: 'write',
        definitionId: 'two_weekends',
        attempt: 1,
        answer: expect.objectContaining({ problems: 0, kept: true }),
      }),
      expect.objectContaining({
        ...job,
        purpose: 'write',
        definitionId: 'two_weekends',
        attempt: 2,
      }),
    ]);
  });

  it('says so when the server stopped part way through a draft', async () => {
    const text = `${TEXT} Interrupted.`;
    // As a process that has since gone left it: running, its lease long out.
    await ensureProcess(db(), owner.id);
    await db()
      .insert(jobs)
      .values({
        process: owner.id,
        kind: 'drafts',
        key: hashOf(text),
        step: 'Writing 2 of 5…',
        running: true,
        holder: 'a-process-that-is-gone',
        heartbeatAt: sql`now() - interval '10 minutes'`,
        startedAt: sql`now() - interval '10 minutes'`,
      });
    expect(await draftProgress(owner, text)).toMatchObject({
      running: false,
      error: expect.stringMatching(
        /server stopped while this was being written/,
      ),
    });
    expect(await draftProgress(owner, `${TEXT} Never.`)).toBeNull();
  });

  it('refuses a read that does not fit what the process reads', () => {
    const tabs = capturedTabs();
    tabs.find((t) => t.name === 'Sales')!.values.length = 0;
    expect(() =>
      startDraft(owner, `${TEXT} Again.`, 'v1', capturedRead(tabs)),
    ).toThrow(/The Sales tab is missing or empty/);
  });

  describe('writing one definition again', () => {
    const settled = () =>
      eventually(async () =>
        expect((await draftProgress(owner, TEXT))?.running).toBe(false),
      );
    const drafted = async () => {
      const model = standIn(
        answer(accountedFor(found, TEXT)),
        check(written),
        check(written),
      );
      await startDraft(owner, TEXT, 'v1', capturedRead(), {
        resolve: () => model,
      });
      await settled();
    };
    const again = {
      ...written,
      formula: 'record.weekend_2 + record.weekend_1',
    };

    it('runs as a job, naming what it writes, and keeps the new version', async () => {
      await drafted();
      const model = standIn(check(again), check(again));
      const job = await startRewrite(
        owner,
        TEXT,
        capturedRead(),
        'two_weekends',
        {
          resolve: () => model,
        },
      );
      expect(job).toMatchObject({ running: true, error: null });
      await settled();
      expect(await draftProgress(owner, TEXT)).toMatchObject({
        running: false,
        writing: null,
        step: 'Written again.',
      });
      const kept = await loadSet(owner, TEXT);
      expect(kept?.definitions[0]?.formula).toBe(again.formula);
    });

    it('says which definition it is on, in the database as well as in memory', async () => {
      await drafted();
      let release = () => {};
      const held = new Promise<void>((done) => {
        release = done;
      });
      const step = check(again);
      const model = new MockLanguageModelV4({
        doGenerate: async () => {
          await held;
          return step;
        },
      });
      await startRewrite(owner, TEXT, capturedRead(), 'two_weekends', {
        resolve: () => model,
      });
      await eventually(async () =>
        expect((await draftProgress(owner, TEXT))?.writing).toBe(
          'two_weekends',
        ),
      );
      await eventually(async () =>
        expect(await draftRow(TEXT)).toMatchObject({
          running: true,
          writing: 'two_weekends',
        }),
      );
      release();
      await settled();
    });

    it('says what stopped it, and leaves the old version', async () => {
      await drafted();
      const before = (await loadSet(owner, TEXT))?.definitions[0]?.formula;
      const model = new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error('The service went away.');
        },
      });
      await startRewrite(owner, TEXT, capturedRead(), 'two_weekends', {
        resolve: () => model,
      });
      await settled();
      expect((await draftProgress(owner, TEXT))?.error).toBeTruthy();
      expect((await loadSet(owner, TEXT))?.definitions[0]?.formula).toBe(
        before,
      );
    });

    it('does not start while another job is running', async () => {
      await drafted();
      const slow = standIn(check(again), check(again));
      const first = startRewrite(owner, TEXT, capturedRead(), 'two_weekends', {
        resolve: () => slow,
      });
      const second = startRewrite(owner, TEXT, capturedRead(), 'two_weekends', {
        resolve: () => {
          throw new Error('Should not be asked.');
        },
      });
      // The second answers the first's progress, from the row both read.
      expect(await second).toEqual(await first);
      await settled();
      expect(await draftProgress(owner, TEXT)).toMatchObject({
        step: 'Written again.',
        error: null,
      });
    });
  });
});
