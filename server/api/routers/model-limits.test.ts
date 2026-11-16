import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { inScratchDatabase } from '@/lib/definitions/scratch.fixture';
import { DRAFTING_MODELS } from '@/lib/models';
import { modelLimits } from '@/server/db/schema';

import { appRouter } from '../root';

// How a model's quota stands, called in process, on a scratch database.
// Nothing is asked of Google.

const caller = () =>
  appRouter.createCaller({
    request: new Request('http://localhost:3000/api/trpc'),
  });

describe('modelLimits router', () => {
  const db = inScratchDatabase();
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    // A process that has read nothing yet.
    (globalThis as { modelLimits?: unknown }).modelLimits = undefined;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    (globalThis as { modelLimits?: unknown }).modelLimits = undefined;
  });

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

  it('says what an earlier process learned, read before it answers', async () => {
    const model = DRAFTING_MODELS[0]!;
    await db()
      .insert(modelLimits)
      .values({
        model,
        perDay: 20,
        perDayLearnedAt: new Date(),
        usedDay: new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Los_Angeles',
        }).format(Date.now()),
        usedCount: 7,
      });
    expect(await caller().modelLimits.get({ model })).toMatchObject({
      perDay: 20,
      usedToday: 7,
    });
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

  it('needs a signed-in person outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SAFEPOINT_ACCESS_KEY', 'a-shared-password-long-enough');
    vi.stubEnv(
      'SAFEPOINT_COOKIE_SECRET',
      'a-signing-secret-of-at-least-thirty-two-characters',
    );
    await expect(
      caller().modelLimits.get({ model: DRAFTING_MODELS[0]! }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Sign in required.',
    });
  });
});
