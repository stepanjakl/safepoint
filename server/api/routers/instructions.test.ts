import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashOf } from '@/lib/definitions/fingerprint';
import { inScratchDatabase } from '@/lib/definitions/scratch.fixture';
import { promotionProcess } from '@/lib/process/placeholder-process';

import { caller, failure } from '../run.fixture';

const PROMOTION = promotionProcess.id;

// The instructions procedures, called in process on a scratch database.

describe('instructions router', () => {
  inScratchDatabase();
  beforeEach(() => vi.stubEnv('NODE_ENV', 'development'));
  afterEach(() => vi.unstubAllEnvs());

  it('lists a process’s declared versions, oldest first, and the next label', async () => {
    const got = await caller().instructions.list({ process: PROMOTION });
    expect(got.versions.map((v) => v.version)).toEqual(['v2', 'v3', 'v4']);
    expect(got.next).toBe('v5');
    expect(got.versions.at(-1)).toMatchObject({
      hash: hashOf(promotionProcess.instructions.text),
      text: promotionProcess.instructions.text,
      origin: 'declared',
      promptedBy: promotionProcess.instructions.promptedBy,
    });
  });

  it('publishes text under the next label, and answers text kept already with its version', async () => {
    const published = await caller().instructions.publish({
      process: PROMOTION,
      text: 'Hold every line.\n\n\nNever apply a change.  ',
      note: '  Simpler. ',
    });
    expect(published).toMatchObject({
      created: true,
      version: {
        version: 'v5',
        text: 'Hold every line.\n\nNever apply a change.',
        note: 'Simpler.',
        origin: 'published',
        publishedBy: null,
      },
    });
    expect(
      await caller().instructions.get({
        process: PROMOTION,
        hash: published.version.hash,
      }),
    ).toEqual(published.version);
    expect(
      await caller().instructions.publish({
        process: PROMOTION,
        text: promotionProcess.instructions.text,
        note: null,
      }),
    ).toMatchObject({ created: false, version: { version: 'v4' } });
  });

  it('refuses what it cannot keep', async () => {
    for (const input of [
      { process: 'nobody', text: 'x', note: null },
      { process: PROMOTION, text: '', note: null },
      { process: PROMOTION, text: 'Half a pair \ud83e', note: null },
      { process: PROMOTION, text: 'A \u0000 here', note: null },
      { process: PROMOTION, text: 'x'.repeat(20_001), note: null },
      { process: PROMOTION, text: 'x' },
      { process: 'brunch-orders', text: 'x', note: null, extra: 1 },
    ])
      expect(
        await failure(caller().instructions.publish(input as never)),
      ).toMatchObject({ code: 'BAD_REQUEST' });
    expect(
      await failure(
        caller().instructions.publish({
          process: PROMOTION,
          text: '  \n\n  ',
          note: null,
        }),
      ),
    ).toEqual({ code: 'BAD_REQUEST', message: 'Instructions need some text.' });
    expect(
      await failure(
        caller().instructions.get({
          process: PROMOTION,
          hash: '000000000000',
        }),
      ),
    ).toEqual({
      code: 'NOT_FOUND',
      message: 'These instructions are not kept on the server.',
    });
  });

  it('is only for local development, as every stateful procedure is', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(
      await failure(caller().instructions.list({ process: PROMOTION })),
    ).toMatchObject({ code: 'NOT_FOUND' });
  });
});
