import { describe, expect, it, vi } from 'vitest';

import type { CrossCheck } from '@/lib/definitions/calculate';
import { inScratchDatabase } from '@/lib/definitions/scratch.fixture';
import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';
import { answerParts, crossChecks } from '@/server/db/schema';

import { keepPart, keptPart } from './answer-parts';
import {
  crossCheckPartSchema,
  keepCrossCheck,
  keptCrossCheck,
} from './cross-checks';

// A cross-check is the model's answer to compare: a new one replaces the old,
// and one that cannot be read is worked out again rather than reported.

const db = inScratchDatabase();

const READ = '2026-10-08T21-46-29-441Z-6e93bf09';
const FINGERPRINT = 'd23a4c56d75b';
const made = (at: string, agreed = 1): CrossCheck => ({
  fingerprint: FINGERPRINT,
  readId: READ,
  model: 'a-model',
  at,
  cells: {
    'ZZ-9': { sales: { model: 3, working: 'Three.', agrees: agreed === 2 } },
    'SD-01': { sales: { model: 1, working: 'One.', agrees: true } },
  },
  agreed,
  total: 2,
});

describe('a kept cross-check', () => {
  it('is none until one is kept, and is read back as it was kept', async () => {
    expect(await keptCrossCheck(owner, READ, FINGERPRINT)).toBeNull();
    const check = made('2026-11-01T09:00:00.000Z');
    await keepCrossCheck(owner, check);
    const kept = await keptCrossCheck(owner, READ, FINGERPRINT);
    expect(kept).toEqual(check);
    expect(Object.keys(kept!.cells)).toEqual(['ZZ-9', 'SD-01']);
  });

  it('is replaced by a new one for the same run key', async () => {
    await keepCrossCheck(owner, made('2026-11-01T09:00:00.000Z'));
    const later = made('2026-11-02T09:00:00.000Z', 2);
    await keepCrossCheck(owner, later);
    expect(await db().select().from(crossChecks)).toHaveLength(1);
    expect(await keptCrossCheck(owner, READ, FINGERPRINT)).toEqual(later);
  });

  it('reads as none kept when it no longer fits, to be worked out again', async () => {
    await keepCrossCheck(owner, made('2026-11-01T09:00:00.000Z'));
    await db()
      .update(crossChecks)
      .set({ body: { agreed: 'many' } as never });
    expect(await keptCrossCheck(owner, READ, FINGERPRINT)).toBeNull();
  });

  it('lets a database failure through, which is not a check to work out again', async () => {
    const failing = vi.spyOn(db(), 'select').mockImplementation(() => {
      throw new Error('connection lost');
    });
    await expect(keptCrossCheck(owner, READ, FINGERPRINT)).rejects.toThrow(
      'connection lost',
    );
    failing.mockRestore();
  });
});

describe('a cross-check’s part', () => {
  const key = { process: owner.id, readId: READ, fingerprint: FINGERPRINT };
  const part = {
    cells: made('2026-11-01T09:00:00.000Z').cells,
    models: ['a-model'],
  };

  it('is kept as each batch arrives, and reads as none when it no longer fits', async () => {
    await keepPart('cross-check', key, crossCheckPartSchema, part);
    expect(await keptPart('cross-check', key, crossCheckPartSchema)).toEqual(
      part,
    );
    await db()
      .update(answerParts)
      .set({ body: { cells: 1 } });
    expect(await keptPart('cross-check', key, crossCheckPartSchema)).toBeNull();
  });
});
