import { describe, expect, it } from 'vitest';

import { diffClauses, diffText, paragraphsOf } from './instruction-diff';

describe('diffClauses', () => {
  it('reports nothing but unchanged clauses for identical versions', () => {
    expect(diffClauses(['a', 'b'], ['a', 'b'])).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'same', text: 'b' },
    ]);
  });

  it('pairs a rewritten clause as one change rather than a removal and an addition', () => {
    expect(diffClauses(['a', 'b', 'c'], ['a', 'B', 'c'])).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'changed', before: 'b', after: 'B' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('keeps additions and removals that have nothing to pair with', () => {
    expect(diffClauses(['a', 'b', 'c'], ['a', 'c', 'd'])).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'same', text: 'c' },
      { kind: 'added', text: 'd' },
    ]);
  });

  it('handles an empty side', () => {
    expect(diffClauses([], ['a'])).toEqual([{ kind: 'added', text: 'a' }]);
    expect(diffClauses(['a'], [])).toEqual([{ kind: 'removed', text: 'a' }]);
  });
});

describe('paragraphsOf', () => {
  it('splits on blank lines and keeps single line breaks inside a paragraph', () => {
    expect(paragraphsOf('One.\n\n  Two\nstill two.  \n\n\nThree.')).toEqual([
      'One.',
      'Two\nstill two.',
      'Three.',
    ]);
  });
});

describe('diffText', () => {
  it('marks the words changed inside a rewritten paragraph', () => {
    const diff = diffText(
      'Keep this.\n\nHold any line below the floor.',
      'Keep this.\n\nHold any line below the floor or out of date.',
    );
    expect(diff.paragraphs[0]).toEqual({ kind: 'same', text: 'Keep this.' });
    expect(diff.paragraphs[1]).toEqual({
      kind: 'changed',
      segments: [
        { kind: 'same', text: 'Hold any line below the floor' },
        { kind: 'added', text: ' or out of date' },
        { kind: 'same', text: '.' },
      ],
    });
    expect(diff.paragraphsChanged).toBe(1);
    expect(diff.wordsRemoved).toBe(0);
    expect(diff.wordsAdded).toBe(4);
  });

  it('reads a paragraph extended with a new clause as rewritten, not replaced', () => {
    const diff = diffText(
      'Hold any candidate whose projected margin falls below the floor.',
      'Hold any candidate whose projected margin falls below the floor, and any candidate whose supporting evidence is unavailable or older than the policy window.',
    );
    expect(diff.paragraphs.map((p) => p.kind)).toEqual(['changed']);
  });

  it('marks the punctuation that changed rather than the word beside it', () => {
    const diff = diffText(
      'Round to the order multiple.',
      'Round to the order multiple, and never above the allocation.',
    );
    expect(diff.paragraphs[0]).toEqual({
      kind: 'changed',
      segments: [
        { kind: 'same', text: 'Round to the order multiple' },
        { kind: 'added', text: ', and never above the allocation' },
        { kind: 'same', text: '.' },
      ],
    });
  });

  it('shows an unrelated replacement as one paragraph removed and one added', () => {
    const diff = diffText(
      'Start.\n\nPrice every candidate.\n\nEnd.',
      'Start.\n\nNever send a message to a supplier.\n\nEnd.',
    );
    expect(diff.paragraphs.map((p) => p.kind)).toEqual([
      'same',
      'removed',
      'added',
      'same',
    ]);
  });

  it('counts words for each paragraph as well as for the whole text', () => {
    const diff = diffText(
      'Keep.\n\nHold below the floor.\n\nDrop this one.',
      'Keep.\n\nHold below the floor or out of date.\n\nKeep.\n\nA brand new paragraph here.',
    );
    expect(diff.stats).toHaveLength(diff.paragraphs.length);
    const totals = diff.stats.reduce(
      (sum, s) => ({
        added: sum.added + s.wordsAdded,
        removed: sum.removed + s.wordsRemoved,
      }),
      { added: 0, removed: 0 },
    );
    expect(totals).toEqual({
      added: diff.wordsAdded,
      removed: diff.wordsRemoved,
    });
    expect(diff.stats[0]).toEqual({ wordsAdded: 0, wordsRemoved: 0 });
  });

  it('reports no change for text that differs only in paragraph spacing', () => {
    const diff = diffText('One.\n\nTwo.', 'One.\n\n\n  Two.  ');
    expect(diff.paragraphsChanged).toBe(0);
  });
});
