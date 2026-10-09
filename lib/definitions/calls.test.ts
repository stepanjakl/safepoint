import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { DraftingModel } from '@/lib/rulebook/models';

import { ask } from './calls';
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

  it('tries a busy model once more, then the next', async () => {
    vi.useFakeTimers();
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
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await asked).model).toBe('next-after-busy');
    expect(busy.doGenerateCalls).toHaveLength(2);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
