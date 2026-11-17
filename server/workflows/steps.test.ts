import { readFileSync } from 'node:fs';

import { and, eq } from 'drizzle-orm';
import { RetryableError } from 'workflow';
import { describe, expect, it } from 'vitest';

import { capturedRead } from '@/lib/engine/captured.fixture';
import { ModelsResting } from '@/lib/engine/calls';
import { fingerprintOf, hashOf } from '@/lib/engine/fingerprint';
import {
  accountedFor,
  always,
  answer,
  call,
  check,
  standIn,
} from '@/lib/engine/models.fixture';
import { inScratchStorage } from '@/lib/engine/scratch.fixture';
import { keepText, TEXT } from '@/lib/engine/set.fixture';
import {
  definitionSetSchema,
  draftProgressSchema,
  type DraftProgress,
} from '@/lib/engine/types';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { answerParts, proposals } from '@/server/db/schema';
import { claimJob } from '@/server/jobs/run-job';
import { keepRead } from '@/server/storage/reads.fixture';
import { loadSet, saveSet } from '@/server/storage/rulebooks';

import * as draft from './draft-work';
import { inStep } from './in-step';
import * as proposal from './proposal-work';
import { holdStandIns } from './stand-ins';
import type { DraftFind, Found, ProposalRun } from './types';

/*
  A job's steps, each done twice, as a retry or a server that stopped part
  way through one does them: the second time asks no model and keeps
  nothing different. The models of the second go are ones that refuse to be
  asked.
*/

const { database: db } = inScratchStorage();

const refusing = () => {
  throw new Error('Should not be asked.');
};

const begin: DraftProgress = {
  step: 'Starting',
  error: null,
  running: true,
  writing: null,
};

// A job claimed as a start claims it, with its claim's models.
async function claimed(job: DraftFind['job'], initial: DraftProgress = begin) {
  const claim = await claimJob(
    { ...job, schema: draftProgressSchema, interrupted: 'Stopped.' },
    initial,
  );
  if (!('holder' in claim)) throw new Error('Not claimed.');
  return claim.holder;
}

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
const written = (formula: string) => ({
  constants: [],
  groups: [],
  formula,
  examples: [
    { key: 'SD-01', inputs: { order: null }, result: 59, why: '28 and 31.' },
    { key: 'AV-RR', inputs: { order: null }, result: 44, why: '21 and 23.' },
  ],
});

describe('a draft’s steps, done twice', () => {
  const drafting = async () => {
    await keepText(TEXT);
    await keepRead(db(), capturedRead());
    const job = {
      kind: 'drafts' as const,
      process: owner.id,
      key: hashOf(TEXT),
    };
    const holder = await claimed(job);
    const run: DraftFind = {
      job,
      holder,
      readId: capturedRead().id,
      model: null,
      version: 'v1',
      since: Date.now(),
    };
    return run;
  };

  it('find once, and write each definition once', async () => {
    const run = await drafting();
    const plus = 'record.weekend_1 + record.weekend_2';
    const model = standIn(
      answer(accountedFor(found, TEXT)),
      check(written(plus)),
      check(written(plus)),
    );
    holdStandIns(run.holder, () => model);
    const first = await draft.find(run);
    expect(first).toEqual({
      done: [{ id: 'two_weekends', name: 'Two weekends' }],
    });
    const at = { index: 0, of: 1 };
    const [definition] = (first as { done: Found[] }).done;
    expect(await draft.write(run, definition!, at, null)).toEqual({
      done: null,
    });
    const kept = await loadSet(owner, TEXT);
    expect(kept?.definitions[0]?.formula).toBe(plus);

    holdStandIns(run.holder, refusing);
    expect(await draft.find(run)).toEqual(first);
    expect(await draft.write(run, definition!, at, null)).toEqual({
      done: null,
    });
    expect(await loadSet(owner, TEXT)).toEqual(kept);
  });

  it('write a definition again once, and leave it as that write kept it', async () => {
    const run = await drafting();
    const plus = 'record.weekend_1 + record.weekend_2';
    const swapped = 'record.weekend_2 + record.weekend_1';
    const model = standIn(
      answer(accountedFor(found, TEXT)),
      check(written(plus)),
      check(written(plus)),
      check(written(swapped)),
      check(written(swapped)),
    );
    holdStandIns(run.holder, () => model);
    const { done } = (await draft.find(run)) as {
      done: { id: string; name: string }[];
    };
    await draft.write(run, done[0]!, { index: 0, of: 1 }, null);
    // What a rewrite records when it starts, then its step twice.
    const before = await draft.writtenNow(owner, TEXT, 'two_weekends');
    expect(await draft.write(run, done[0]!, null, before)).toEqual({
      done: null,
    });
    const rewritten = await loadSet(owner, TEXT);
    expect(rewritten?.definitions[0]?.formula).toBe(swapped);
    holdStandIns(run.holder, refusing);
    expect(await draft.write(run, done[0]!, null, before)).toEqual({
      done: null,
    });
    expect(await loadSet(owner, TEXT)).toEqual(rewritten);
  });
});

describe('a proposal’s steps, done twice', () => {
  const set = definitionSetSchema.parse(
    JSON.parse(
      readFileSync('e2e/fixtures/brunch-orders-accepted.json', 'utf8'),
    ),
  );
  const read = capturedRead();
  const leaving = (keys: string[]) =>
    always(
      call('submit_proposals', {
        records: keys.map((key) => ({
          key,
          action: 'leave',
          values: null,
          reason: 'Enough in stock.',
          cited: [],
          unsure: null,
        })),
      }),
    );

  it('answer each batch once, and keep the whole once', async () => {
    await keepText(TEXT);
    await saveSet(owner, { ...set, hash: hashOf(TEXT) });
    await keepRead(db(), read);
    const fingerprint = fingerprintOf(set);
    const job = {
      kind: 'proposals' as const,
      process: owner.id,
      key: `${read.id}:${fingerprint}`,
    };
    const run: ProposalRun = {
      job,
      holder: await claimed(job),
      instructions: hashOf(TEXT),
      readId: read.id,
      fingerprint,
      rules: true,
      model: null,
    };
    const batches = await proposal.batches(run);
    if (!('done' in batches)) throw new Error(batches.stopped);
    const keys = batches.done.flat();
    expect(keys.length).toBeGreaterThan(0);
    const model = leaving(keys);
    holdStandIns(run.holder, () => model);
    const at = { index: 0, of: batches.done.length };
    for (const batch of batches.done)
      expect(await proposal.answer(run, batch, at)).toEqual({ done: null });
    const part = await db().select().from(answerParts);

    holdStandIns(run.holder, refusing);
    for (const batch of batches.done)
      expect(await proposal.answer(run, batch, at)).toEqual({ done: null });
    expect(await db().select().from(answerParts)).toEqual(part);

    const when = new Date().toISOString();
    const first = await proposal.finish(run, when);
    expect(first).toEqual({
      done: `Proposed for ${keys.length} ${owner.subject.record.plural}.`,
    });
    expect(await proposal.finish(run, when)).toEqual(first);
    expect(
      await db()
        .select({ at: proposals.proposedAt })
        .from(proposals)
        .where(
          and(eq(proposals.process, owner.id), eq(proposals.readId, read.id)),
        ),
    ).toEqual([{ at: new Date(when) }]);
  });
});

describe('a step whose models are all spent', () => {
  const job = { kind: 'drafts' as const, process: owner.id, key: 'spent' };
  const spent = (inMs: number) => async () => {
    throw new ModelsResting(
      'Out of quota: a-model until 14:05.',
      Date.now() + inMs,
    );
  };

  it('is retried by its run when one is back soon, holding nothing meanwhile', async () => {
    const holder = await claimed(job);
    await expect(
      inStep({ job, holder }, {}, begin, spent(5 * 60_000)),
    ).rejects.toSatisfy((error) => RetryableError.is(error));
  });

  it('says so, as before, when none is back soon', async () => {
    const holder = await claimed({ ...job, key: 'spent-long' });
    expect(
      await inStep(
        { job: { ...job, key: 'spent-long' }, holder },
        {},
        begin,
        spent(3 * 60 * 60_000),
      ),
    ).toEqual({ stopped: 'Out of quota: a-model until 14:05.' });
  });
});
