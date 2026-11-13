import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { inScratchDirectory } from '@/lib/definitions/scratch.fixture';
import { DRAFTING_MODELS } from '@/lib/models';

import { appRouter } from '../root';

// How a model's quota stands, called in process. Nothing is asked of Google.

const caller = () =>
  appRouter.createCaller({
    request: new Request('http://localhost:3000/api/trpc'),
  });

describe('modelLimits router', () => {
  inScratchDirectory();
  beforeEach(() => vi.stubEnv('NODE_ENV', 'development'));
  afterEach(() => vi.unstubAllEnvs());

  it('says how a model’s quota stands, and which models share it', async () => {
    const model = DRAFTING_MODELS[0]!;
    const limits = await caller().modelLimits.get({ model });
    expect(limits).toMatchObject({
      usedToday: 0,
      restingUntil: null,
      waitingUntil: null,
    });
    expect(limits.models).toContain(model);
    expect(limits.perMinute).toBeGreaterThan(0);
  });

  it('refuses a model the app does not draft with, and any other input', async () => {
    await expect(
      caller().modelLimits.get({ model: 'gpt-nope' as never }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller().modelLimits.get({
        model: DRAFTING_MODELS[0]!,
        extra: 1,
      } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('is not found outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(
      caller().modelLimits.get({ model: DRAFTING_MODELS[0]! }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Not found.' });
  });
});
