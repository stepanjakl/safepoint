import { describe, expect, it } from 'vitest';

import type { AnswerProblem, ProposalEvent } from '@/lib/definitions/types';

import { describeEvent, type ModelRunFacts } from './model-run';

const AT = '2026-11-06T11:49:05.000Z';
type Facts = Pick<ModelRunFacts, 'subject' | 'sources' | 'records'>;
const brunch: Facts = {
  subject: { one: 'product', other: 'products', field: 'order' },
  sources: 1,
  records: 11,
};
// A process with nothing in common but the engine.
const rota: Facts = {
  subject: { one: 'person', other: 'people', field: 'shift' },
  sources: 2,
  records: 1,
};
const said = (event: ProposalEvent, facts = brunch) =>
  describeEvent(event, facts, 'v1').map(({ by, text, problem }) => ({
    by,
    text,
    problem,
  }));
const answered = (
  more: Partial<Extract<ProposalEvent, { kind: 'answered' }>> = {},
): ProposalEvent => ({
  at: AT,
  kind: 'answered',
  records: 11,
  set: 6,
  leave: 5,
  unsure: 2,
  cited: 23,
  problems: [],
  ...more,
});

describe('the proposing timeline, in any process’s words', () => {
  it('says what was sent and to which model', () => {
    const asked: ProposalEvent = {
      at: AT,
      kind: 'asked',
      model: 'gemini-3.6-flash',
    };
    expect(said(asked)[0]?.text).toBe(
      'Sent instructions v1 and 1 source (11 products) to gemini-3.6-flash.',
    );
    expect(said(asked, rota)[0]?.text).toBe(
      'Sent instructions v1 and 2 sources (1 person) to gemini-3.6-flash.',
    );
  });

  it('says an answer and what the app’s checks made of it, as two lines', () => {
    expect(said(answered())).toEqual([
      {
        by: 'model',
        text: 'Answered all 11 products: 6 with a new order, 5 unchanged, 2 unsure.',
        problem: false,
      },
      {
        by: 'app',
        text: 'Checked: every product answered, 23 cited cells found.',
        problem: false,
      },
    ]);
    expect(
      said(answered({ records: 1, set: 1, leave: 0, unsure: 0 }), rota)[0]
        ?.text,
    ).toBe('Answered all 1 person: 1 with a new shift.');
  });

  it('groups what was sent back, and keeps each problem for the list', () => {
    const everyone = [
      'SD-01',
      'AV-RR',
      'AV-LS',
      'EG-06',
      'FT-200',
      'LM-04',
      'CT-250',
      'RK-60',
      'CF-40',
      'SS-125',
      'OO-500',
    ];
    const column = everyone.map((key): AnswerProblem => ({
      kind: 'no-column',
      key,
      tab: 'Deliveries',
      column: 'hours_until_cutoff',
    }));
    const [, sent] = describeEvent(
      answered({ problems: column }),
      brunch,
      'v1',
    );
    expect(sent).toMatchObject({
      by: 'app',
      problem: true,
      text: "Sent back to fix: every product cites a column that isn't there (Deliveries › hours_until_cutoff).",
    });
    expect(sent?.details).toHaveLength(11);
    expect(sent?.details?.[0]).toBe(
      "SD-01 cites Deliveries › hours_until_cutoff, a column that isn't there",
    );
    // Different kinds, each said once; blank cells together whatever cell.
    const mixed: AnswerProblem[] = [
      { kind: 'blank', key: 'AV-RR', cell: 'Deliveries!G3' },
      { kind: 'blank', key: 'LM-04', cell: 'Stock!B7' },
      { kind: 'unanswered', key: 'SD-01' },
    ];
    expect(said(answered({ problems: mixed }))[1]?.text).toBe(
      "Sent back to fix: 2 products cite blank cells; 1 product wasn't answered.",
    );
  });

  it('says when a model or an answer went wrong', () => {
    expect(
      said({
        at: AT,
        kind: 'busy',
        model: 'm',
        why: 'unavailable',
        status: 503,
      })[0],
    ).toMatchObject({
      text: 'm is unavailable (503); trying the next model.',
      problem: true,
    });
    expect(said({ at: AT, kind: 'ended', reason: 'length' })[0]?.text).toBe(
      'The answer was cut short at the length limit.',
    );
  });
});
