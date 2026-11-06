import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { advise } from './advise';
import { capturedRead } from './captured.fixture';
import { answer, standIn } from './models.fixture';
import { definition } from './set.fixture';
import type { DefinitionSet, WrittenVersion } from './types';

const TEXT = 'Start from the weekend sales. Products in the kit sell 10% more.';

const version = (keys: string[], factor: string): WrittenVersion => ({
  shape: null,
  unfit: null,
  formula: `record.weekend_1 * (key in groups.kit ? ${factor} : 1.0)`,
  constants: [],
  groups: [{ id: 'kit', keys, quote: 'Products in the kit' }],
  uses: [],
  examples: [],
  model: 'test',
});

const set = (): DefinitionSet => ({
  hash: 'h',
  version: 'v1',
  intent: 'Order enough.',
  intentConfirmedAt: null,
  readId: 'test',
  foundAt: '2026-11-06T00:00:00.000Z',
  model: 'test',
  definitions: [
    definition('expected', {
      text: 'The weekend sales, 10% more for the kit.',
      agreement: {
        status: 'split',
        runs: 2,
        versions: [
          version(['SD-01'], '1.1'),
          version(['SD-01', 'EG-06'], '1.1'),
        ],
        differences: [{ key: 'EG-06', inputs: {}, results: ['19', '21'] }],
      },
    }),
  ],
});

const advice = (more: Record<string, unknown> = {}) =>
  answer({
    verdict: 'version_1',
    quote: 'Products in the kit sell 10% more.',
    reason: 'Only the kit sells more.',
    rephrase: 'ignored',
    ...more,
  });

describe('advice on two versions that disagree', () => {
  it('names a version, resting on words of the instructions', async () => {
    const model = standIn(advice());
    const said = await advise(owner, TEXT, set(), capturedRead(), 'expected', {
      resolve: () => model,
    });
    expect(said).toMatchObject({
      verdict: 'version_1',
      quote: 'Products in the kit sell 10% more.',
      // Only an unclear verdict carries a rewording.
      rephrase: null,
    });
    // It is given each version in words, and where they part.
    const told = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(told).toContain('Does not count EG-06');
    expect(told).toContain('Counts EG-06');
    expect(told).toContain('version 1 gives 19; version 2 gives 21');
  });

  it('asks again for a quote the instructions do not hold, then leaves it out', async () => {
    const model = standIn(
      advice({ quote: 'Kits sell more.' }),
      advice({ quote: 'Kits sell more still.' }),
    );
    const said = await advise(owner, TEXT, set(), capturedRead(), 'expected', {
      resolve: () => model,
    });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(said.quote).toBeNull();
  });

  it('keeps the rewording of instructions that read either way', async () => {
    const model = standIn(
      advice({ verdict: 'unclear', rephrase: 'Only SD-01 is in the kit.' }),
    );
    const said = await advise(owner, TEXT, set(), capturedRead(), 'expected', {
      resolve: () => model,
    });
    expect(said).toMatchObject({
      verdict: 'unclear',
      rephrase: 'Only SD-01 is in the kit.',
    });
  });
});
