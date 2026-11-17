import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashOf } from '@/lib/definitions/fingerprint';
import { inScratchDatabase } from '@/lib/definitions/scratch.fixture';
import { brunchOrdersProcess } from '@/lib/processes/brunch-orders/process';

import { caller, failure } from '../run.fixture';

const PROCESS = brunchOrdersProcess.id;

// The instructions procedures, called in process on a scratch database.

describe('instructions router', () => {
  inScratchDatabase();
  beforeEach(() => vi.stubEnv('NODE_ENV', 'development'));
  afterEach(() => vi.unstubAllEnvs());

  it('lists a process’s declared versions, oldest first, and the next label', async () => {
    const got = await caller().instructions.list({ process: PROCESS });
    expect(got.versions.map((v) => v.version)).toEqual(['v1', 'v2', 'v3']);
    expect(got.next).toBe('v4');
    expect(got.versions.at(-1)).toMatchObject({
      hash: hashOf(brunchOrdersProcess.instructions.text),
      text: brunchOrdersProcess.instructions.text,
      origin: 'declared',
      promptedBy: brunchOrdersProcess.instructions.promptedBy,
    });
  });

  it('publishes text under the next label, and answers text kept already with its version', async () => {
    const published = await caller().instructions.publish({
      process: PROCESS,
      text: 'Hold every line.\n\n\nNever apply a change.  ',
      note: '  Simpler. ',
    });
    expect(published).toMatchObject({
      created: true,
      version: {
        version: 'v4',
        text: 'Hold every line.\n\nNever apply a change.',
        note: 'Simpler.',
        origin: 'published',
        publishedBy: null,
      },
    });
    expect(
      await caller().instructions.get({
        process: PROCESS,
        hash: published.version.hash,
      }),
    ).toEqual(published.version);
    expect(
      await caller().instructions.publish({
        process: PROCESS,
        text: brunchOrdersProcess.instructions.text,
        note: null,
      }),
    ).toMatchObject({ created: false, version: { version: 'v3' } });
  });

  it('refuses what it cannot keep', async () => {
    for (const input of [
      { process: 'nobody', text: 'x', note: null },
      { process: PROCESS, text: '', note: null },
      { process: PROCESS, text: 'Half a pair \ud83e', note: null },
      { process: PROCESS, text: 'A \u0000 here', note: null },
      { process: PROCESS, text: 'x'.repeat(20_001), note: null },
      { process: PROCESS, text: 'x' },
      { process: 'brunch-orders', text: 'x', note: null, extra: 1 },
    ])
      expect(
        await failure(caller().instructions.publish(input as never)),
      ).toMatchObject({ code: 'BAD_REQUEST' });
    expect(
      await failure(
        caller().instructions.publish({
          process: PROCESS,
          text: '  \n\n  ',
          note: null,
        }),
      ),
    ).toEqual({ code: 'BAD_REQUEST', message: 'Instructions need some text.' });
    expect(
      await failure(
        caller().instructions.get({
          process: PROCESS,
          hash: '000000000000',
        }),
      ),
    ).toEqual({
      code: 'NOT_FOUND',
      message: 'These instructions are not kept on the server.',
    });
  });

  it('needs a signed-in person outside development, as every stateful procedure does', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SAFEPOINT_ACCESS_KEY', 'a-shared-password-long-enough');
    vi.stubEnv(
      'SAFEPOINT_COOKIE_SECRET',
      'a-signing-secret-of-at-least-thirty-two-characters',
    );
    expect(
      await failure(caller().instructions.list({ process: PROCESS })),
    ).toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
