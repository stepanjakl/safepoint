import { describe, expect, it } from 'vitest';

import { wordDiff } from './word-diff';

const changed = (runs: ReturnType<typeof wordDiff>[number]) =>
  runs.filter((r) => r.changed).map((r) => r.text);

describe('where two texts differ', () => {
  it('marks only the words that differ', () => {
    const [a, b] = wordDiff(
      'Where the max order units is blank, it fails.',
      'Where the max order units is blank, it does not apply.',
    );
    expect(changed(a)).toEqual(['fails']);
    expect(changed(b)).toEqual(['does not apply']);
    expect(a.map((r) => r.text).join('')).toBe(
      'Where the max order units is blank, it fails.',
    );
  });

  it('marks a word one text has and the other lacks', () => {
    const [a, b] = wordDiff(
      'The stock available plus the order',
      'The on hand plus the order',
    );
    expect(changed(a)).toEqual(['stock available']);
    expect(changed(b)).toEqual(['on hand']);
  });

  it('marks nothing in the same text', () => {
    const [a] = wordDiff('Order in whole cases.', 'Order in whole cases.');
    expect(changed(a)).toEqual([]);
  });
});
