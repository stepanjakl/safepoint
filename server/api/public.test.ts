import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashOf } from '@/lib/engine/fingerprint';
import { inScratchDatabase } from '@/lib/engine/scratch.fixture';
import { TEXT } from '@/lib/engine/set.fixture';
import { usageRefusal } from '@/server/access/usage';
import { SHARED_INSTRUCTIONS_LOCKED } from '@/server/access/shared-rules';
import {
  VISITOR_COOKIE,
  newVisitor,
  signVisitor,
} from '@/server/access/visitor';

import { PUBLISHED } from './kept-run.fixture';
import { failure } from './run.fixture';
import { appRouter } from './root';

// A deployment open to anyone (SAFEPOINT_ACCESS=public): procedures called
// as a visitor would call them, on a scratch database.

const SECRET = 'a-signing-secret-of-at-least-thirty-two-characters';

async function visitorCaller(id: string, address = '203.0.113.7') {
  // The name comes from the bytes: each id gets its own.
  const bytes = new Uint8Array(16).map((_, i) => id.charCodeAt(i) * (i + 1));
  const visitor = newVisitor(Date.now(), bytes, id);
  return appRouter.createCaller({
    request: new Request('https://safepoint.example/api/trpc', {
      headers: {
        cookie: `${VISITOR_COOKIE}=${await signVisitor(visitor, SECRET)}`,
        'x-real-ip': address,
      },
    }),
  });
}

describe('a public deployment', () => {
  inScratchDatabase();
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SAFEPOINT_ACCESS', 'public');
    vi.stubEnv('SAFEPOINT_COOKIE_SECRET', SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  const start = (id: string) =>
    visitorCaller(id).then((c) =>
      c.runs.start({
        process: 'brunch-orders',
        instructions: hashOf(PUBLISHED),
      }),
    );

  it('starts runs as the visitor, up to their daily limit', async () => {
    vi.stubEnv('SAFEPOINT_DAILY_LIMITS', '{"runs":{"visitor":2}}');
    const first = await start('11111111-1111-4111-8111-111111111111');
    expect(first.startedBy).toEqual(expect.any(String));
    await start('11111111-1111-4111-8111-111111111111');
    expect(
      await failure(start('11111111-1111-4111-8111-111111111111')),
    ).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: usageRefusal('runs', 'yours'),
    });
  });

  it('lets a visitor discard their own run, not another visitor’s', async () => {
    const mine = '22222222-2222-4222-8222-222222222222';
    const run = await start(mine);
    const other = await visitorCaller('33333333-3333-4333-8333-333333333333');
    expect(
      (
        await failure(
          other.runs.discard({ process: 'brunch-orders', runId: run.id }),
        )
      ).code,
    ).toBe('BAD_REQUEST');
    await (
      await visitorCaller(mine)
    ).runs.discard({ process: 'brunch-orders', runId: run.id });
  });

  it('keeps the shared instructions and rules closed to change', async () => {
    const visitor = await visitorCaller('44444444-4444-4444-8444-444444444444');
    expect(
      await failure(
        visitor.instructions.publish({
          process: 'brunch-orders',
          text: `${TEXT}\nOne more line.`,
          note: null,
        }),
      ),
    ).toEqual({ code: 'BAD_REQUEST', message: SHARED_INSTRUCTIONS_LOCKED });
    expect(
      (
        await failure(
          visitor.rules.decide({ text: TEXT, id: 'any', decision: 'deny' }),
        )
      ).code,
    ).toBe('FORBIDDEN');
  });

  it('opens the shared rules again with SAFEPOINT_PUBLIC_RULES=open', async () => {
    vi.stubEnv('SAFEPOINT_PUBLIC_RULES', 'open');
    const visitor = await visitorCaller('55555555-5555-4555-8555-555555555555');
    const outcome = await visitor.rules
      .decide({ text: TEXT, id: 'any', decision: 'deny' })
      .then(
        () => 'answered',
        (error: { code?: string }) => error.code,
      );
    expect(outcome).not.toBe('FORBIDDEN');
  });
});
