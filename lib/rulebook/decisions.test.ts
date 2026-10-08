import { describe, expect, it } from 'vitest';

import { isStale } from './decisions';
import { snapshot } from './library.fixture';

const decision = {
  id: 'd1',
  statement: 'L1',
  quote: 'A member may hold at most max_loans books.',
  question: 'Do overdue books count?',
  answer: 'Yes, every book not yet returned counts.',
  decided_at: '2026-10-07T12:00:00Z',
};

describe('owner decisions', () => {
  it('stay current while their statement is in the sheet, and go stale when it changes', () => {
    expect(isStale(decision, snapshot)).toBe(false);
    const edited = {
      ...snapshot,
      valueRanges: snapshot.valueRanges.map((r) =>
        r.range.startsWith('Policy!')
          ? {
              ...r,
              values: r.values!.map((row) =>
                row[0] === 'rule'
                  ? ['rule', 'A member may hold at most three books.']
                  : row,
              ),
            }
          : r,
      ),
    };
    expect(isStale(decision, edited)).toBe(true);
  });
});
