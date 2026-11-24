import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { DraftingModel } from '@/lib/models';

import type { Attempt } from './attempts';
import { ask, BUSY_WAIT_MS, ModelsBusy } from './calls';
import { always, answer } from './models.fixture';

// How a call moves through its models when the service refuses or fails.
// Each test names its own models: those out of quota stay so for the run.

// Refused for quota, as Google refuses: which limit, and when to come back.
const refused = (retryDelay: string) =>
  new APICallError({
    message: 'You exceeded your current quota.',
    url: 'https://example.test',
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
    responseBody: JSON.stringify({
      error: {
        details: [
          { violations: [{ quotaId: 'GenerateRequestsPerDay-FreeTier' }] },
          { retryDelay },
        ],
      },
    }),
  });
const answering = () => always(answer({ ok: true }));

describe('asking a model', () => {
  it('leaves a model out of quota for the day, once, and skips it after', async () => {
    const spent = new MockLanguageModelV4({
      doGenerate: async () => {
        throw refused('6585s');
      },
    });
    const next = answering();
    const models = { spent, next } as Record<string, MockLanguageModelV4>;
    const call = () =>
      ask(
        ['spent', 'next'] as unknown as DraftingModel[],
        z.object({ ok: z.boolean() }),
        'system',
        'prompt',
        'test',
        (id) => models[id]!,
      );
    expect((await call()).model).toBe('next');
    expect((await call()).model).toBe('next');
    // Asked once, never retried, and not asked again while out of quota.
    expect(spent.doGenerateCalls).toHaveLength(1);
  });

  it('says until when, once every model is out of quota', async () => {
    const spent = new MockLanguageModelV4({
      doGenerate: async () => {
        throw refused('3600s');
      },
    });
    await expect(
      ask(
        ['spent-alone'] as unknown as DraftingModel[],
        z.object({ ok: z.boolean() }),
        'system',
        'prompt',
        'test',
        () => spent,
      ),
    ).rejects.toThrow(/Out of quota: spent-alone until \d\d:\d\d/);
  });

  it('moves on from a busy model at once', async () => {
    const busy = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: 'This model is currently experiencing high demand.',
          url: 'https://example.test',
          requestBodyValues: {},
          statusCode: 503,
          isRetryable: true,
        });
      },
    });
    const next = answering();
    const models = { busy, next } as Record<string, MockLanguageModelV4>;
    const asked = ask(
      ['busy', 'next-after-busy'] as unknown as DraftingModel[],
      z.object({ ok: z.boolean() }),
      'system',
      'prompt',
      'test',
      (id) => models[(id as string) === 'busy' ? 'busy' : 'next']!,
    );
    expect((await asked).model).toBe('next-after-busy');
    expect(busy.doGenerateCalls).toHaveLength(1);
  });

  it('says to wait a little, not to stop, when every model is busy', async () => {
    const busy = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: 'This model is currently experiencing high demand.',
          url: 'https://example.test',
          requestBodyValues: {},
          statusCode: 503,
          isRetryable: true,
        });
      },
    });
    const before = Date.now();
    const asked = ask(
      ['busy-one', 'busy-two'] as unknown as DraftingModel[],
      z.object({ ok: z.boolean() }),
      'system',
      'prompt',
      'test',
      () => busy,
    );
    const error = await asked.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelsBusy);
    expect((error as ModelsBusy).message).toBe(
      'This model is currently experiencing high demand.',
    );
    expect((error as ModelsBusy).until).toBeGreaterThanOrEqual(
      before + BUSY_WAIT_MS,
    );
  });

  it('moves on from a model it could not reach', async () => {
    const unreached = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: 'Cannot connect to API: other side closed',
          url: 'https://example.test',
          requestBodyValues: {},
          isRetryable: true,
        });
      },
    });
    const next = answering();
    const asked = await ask(
      ['unreached', 'next-after-unreached'] as unknown as DraftingModel[],
      z.object({ ok: z.boolean() }),
      'system',
      'prompt',
      'test',
      (id) => ((id as string) === 'unreached' ? unreached : next),
    );
    expect(asked.model).toBe('next-after-unreached');
  });

  it('stops at once where a model refused what it was asked', async () => {
    const wrong = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: 'Bad request.',
          url: 'https://example.test',
          requestBodyValues: {},
          statusCode: 400,
          isRetryable: false,
        });
      },
    });
    const error = await ask(
      ['wrong-alone'] as unknown as DraftingModel[],
      z.object({ ok: z.boolean() }),
      'system',
      'prompt',
      'test',
      () => wrong,
    ).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ModelsBusy);
  });

  it('moves on from a model too slow to answer in time, without asking it again', async () => {
    const slow = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new DOMException(
          'Step timeout of 180000ms exceeded',
          'TimeoutError',
        );
      },
    });
    const next = answering();
    const models = { slow, next } as Record<string, MockLanguageModelV4>;
    const asked = await ask(
      ['slow', 'next-after-slow'] as unknown as DraftingModel[],
      z.object({ ok: z.boolean() }),
      'system',
      'prompt',
      'test',
      (id) => models[(id as string) === 'slow' ? 'slow' : 'next']!,
    );
    expect(asked.model).toBe('next-after-slow');
    expect(slow.doGenerateCalls).toHaveLength(1);
  });
});

describe('recording each model asked', () => {
  const spentForTheDay = () =>
    new MockLanguageModelV4({
      doGenerate: async () => {
        throw refused('6585s');
      },
    });
  const asking = (
    ids: string[],
    models: Record<string, MockLanguageModelV4>,
    record?: (attempt: Attempt) => void,
    refusedIf?: (output: { ok: boolean }) => boolean,
  ) =>
    ask(
      ids as unknown as DraftingModel[],
      z.object({ ok: z.boolean() }),
      'system',
      'prompt',
      'test',
      (id) => models[id]!,
      record && {
        record,
        purpose: 'find',
        asked: { sentences: 2 },
        judged: (output) => ({
          refused: refusedIf?.(output) ?? false,
          answer: { ok: output.ok },
        }),
      },
    );

  it('says how each ended, in turn, with what the provider counted', async () => {
    const said: Attempt[] = [];
    await asking(
      ['spent-recorded', 'next-recorded'],
      { 'spent-recorded': spentForTheDay(), 'next-recorded': answering() },
      (attempt) => said.push(attempt),
    );
    expect(said).toEqual([
      expect.objectContaining({
        purpose: 'find',
        model: 'spent-recorded',
        outcome: 'quota',
        requests: 1,
        inputTokens: null,
        answer: null,
        error: 'You exceeded your current quota.',
      }),
      expect.objectContaining({
        model: 'next-recorded',
        outcome: 'answered',
        requests: 1,
        inputTokens: 1,
        outputTokens: 1,
        waitedMs: 0,
        // The prompt's size, never the prompt.
        asked: { systemChars: 6, promptChars: 6, sentences: 2 },
        answer: { ok: true },
        error: null,
      }),
    ]);
  });

  it('says an answer its checks sent back was refused', async () => {
    const said: Attempt[] = [];
    await asking(
      ['refused-recorded'],
      { 'refused-recorded': answering() },
      (attempt) => said.push(attempt),
      () => true,
    );
    expect(said.map((a) => a.outcome)).toEqual(['refused']);
  });

  it('leaves the call as it was when the recorder fails, or there is none', async () => {
    const model = answering();
    const failing = await asking(
      ['failing-recorder'],
      { 'failing-recorder': model },
      () => {
        throw new Error('The database is gone.');
      },
    );
    expect(failing.output).toEqual({ ok: true });
    const none = await asking(['no-recorder'], { 'no-recorder': model });
    expect(none.output).toEqual({ ok: true });
    expect(model.doGenerateCalls).toHaveLength(2);
  });
});
