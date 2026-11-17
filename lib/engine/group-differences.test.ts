import { describe, expect, it } from 'vitest';

import { groupDifferences } from './group-differences';

describe('where two versions fill groups differently', () => {
  it('pairs groups by what they share, naming each by the shorter quote', () => {
    expect(
      groupDifferences(
        [
          { id: 'kit', keys: ['S', 'R', 'F'], quote: 'the kit' },
          { id: 'offer', keys: ['E', 'C'], quote: 'on offer' },
        ],
        [
          { id: 'on_offer', keys: ['E', 'C'], quote: 'on offer' },
          {
            id: 'kit_items',
            keys: ['S', 'R', 'L', 'F'],
            quote: 'We sell the kit',
          },
        ],
      ),
    ).toEqual([{ quote: 'the kit', key: 'L', inFirst: false }]);
  });

  it('finds nothing where the groups hold the same keys', () => {
    const group = { id: 'g', keys: ['A'], quote: 'g' };
    expect(groupDifferences([group], [{ ...group, id: 'h' }])).toEqual([]);
  });
});
