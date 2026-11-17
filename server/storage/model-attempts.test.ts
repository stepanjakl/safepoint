import { readFileSync } from 'node:fs';

import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { DRAFT_MODELS } from '@/lib/definitions/calls';
import { capturedRead } from '@/lib/definitions/captured.fixture';
import { fingerprintOf, hashOf } from '@/lib/definitions/fingerprint';
import { always, call } from '@/lib/definitions/models.fixture';
import {
  eventually,
  inScratchStorage,
} from '@/lib/definitions/scratch.fixture';
import { keepText, TEXT } from '@/lib/definitions/set.fixture';
import { definitionSetSchema } from '@/lib/definitions/types';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { modelAttempts } from '@/server/db/schema';
import { proposalProgress, startProposal } from '@/server/jobs/proposal';

import { attemptRecorder } from './model-attempts';
import { propose } from './proposals';
import { keepRead, keepStandInRead } from './reads.fixture';
import { saveSet } from './rulebooks';

/*
  Each model call recorded in `model_attempts`, with what it was part of, on
  stand-in models: a proposal's job here; finding and writing in
  server/jobs/draft.test.ts, cross-checking and advising in the routers'
  tests; pacing's waits in lib/definitions/limits.test.ts.
*/

const { database: db } = inScratchStorage();

const set = definitionSetSchema.parse(
  JSON.parse(readFileSync('e2e/fixtures/brunch-orders-accepted.json', 'utf8')),
);
const FP = fingerprintOf(set);
const read = capturedRead();
const KEYS = [
  'SD-01',
  'AV-RR',
  'AV-LS',
  'EG-06',
  'FT-200',
  'LM-04',
  'CT-250',
  'RK-60',
  'CF-40',
  'SS-125',
  'OO-500',
];
// A proposal that leaves every record as it is.
const leaving = () =>
  always(
    call('submit_proposals', {
      records: KEYS.map((key) => ({
        key,
        action: 'leave',
        values: null,
        reason: 'Enough in stock.',
        cited: [],
        unsure: null,
      })),
    }),
  );
const busy = () =>
  new MockLanguageModelV4({
    doStream: async () => {
      throw new APICallError({
        message: 'This model is currently experiencing high demand.\nMore.',
        url: 'https://example.test',
        requestBodyValues: {},
        statusCode: 503,
        isRetryable: true,
      });
    },
  });

const attempts = () =>
  db().select().from(modelAttempts).orderBy(modelAttempts.id);

// A job's steps read what it works on where it is kept, by the ids it was
// started with: the instructions, these rules for them, and the read.
async function proposed(resolve: (id: string) => MockLanguageModelV4) {
  await keepText(TEXT);
  await saveSet(owner, { ...set, hash: hashOf(TEXT) });
  await keepRead(db(), read);
  await startProposal(owner, set, read, 'test', TEXT, { resolve });
  await eventually(async () =>
    expect((await proposalProgress(owner, 'test', FP))?.running).toBe(false),
  );
  expect((await proposalProgress(owner, 'test', FP))?.error).toBeNull();
}

describe('the model calls of a job', () => {
  it('are kept one per request, with the job, the read and the rulebook they were part of', async () => {
    await proposed(() => leaving());
    expect(await attempts()).toEqual([
      expect.objectContaining({
        process: owner.id,
        purpose: 'propose',
        model: DRAFT_MODELS[0],
        jobKind: 'proposals',
        jobKey: `test:${FP}`,
        runId: null,
        instructionsHash: hashOf(TEXT),
        readId: 'test',
        fingerprint: FP,
        definitionId: null,
        attempt: 1,
        outcome: 'answered',
        requests: 1,
        waitedMs: 0,
        inputTokens: 1,
        outputTokens: 1,
        thinkingTokens: null,
        // What was asked and what came back, as keys and counts only.
        asked: { records: KEYS, checks: 5 },
        answer: { records: 11, problems: 0 },
        error: null,
        durationMs: expect.any(Number),
        startedAt: expect.any(Date),
      }),
    ]);
  });

  it('keeps each model tried, in turn, when one is busy and the next answers', async () => {
    await proposed((id) => (id === DRAFT_MODELS[0] ? busy() : leaving()));
    expect(
      (await attempts()).map((a) => [a.model, a.attempt, a.outcome, a.error]),
    ).toEqual([
      [
        DRAFT_MODELS[0],
        1,
        'busy',
        'This model is currently experiencing high demand.',
      ],
      [DRAFT_MODELS[1], 2, 'answered', null],
    ]);
  });
});

describe('a recorder', () => {
  it('that cannot keep its row leaves the request as it was', async () => {
    await keepStandInRead(db(), 'test');
    // Not a process id the table takes: every row is refused.
    const record = attemptRecorder({ process: 'Not a process' });
    const proposal = await propose(owner, set, read, 'test', TEXT, {
      resolve: () => leaving(),
      record,
    });
    await record.settled();
    expect(Object.keys(proposal.records)).toEqual(KEYS);
    expect(await attempts()).toEqual([]);
  });

  it('none given, none kept', async () => {
    await keepStandInRead(db(), 'test');
    await propose(owner, set, read, 'test', TEXT, { resolve: () => leaving() });
    expect(await attempts()).toEqual([]);
  });
});
