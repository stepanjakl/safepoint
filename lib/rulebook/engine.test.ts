import { describe, expect, it } from 'vitest';

import { runChecks } from './checks';
import { zonedInstant } from './cycle';
import { evaluate, type Snapshot } from './engine';
import type { Rulebook } from './schema';
import { validateDataModel, validateLogic } from './validate';

/*
  A deliberately unrelated scenario: a small library's loans. The engine must
  run it from the rulebook and data alone, with nothing about groceries.
*/
const snapshot: Snapshot = {
  tabs: ['Books', 'Loans', 'Policy', 'Notes', 'Checks'],
  valueRanges: [
    {
      range: 'Books!A1:Z500',
      values: [
        ['isbn', 'title', 'copies', 'fee'],
        ['B1', 'Dune', 3, 0.5],
        ['B2', 'Emma', 1, 1.25],
      ],
    },
    {
      range: 'Loans!A1:Z500',
      values: [
        ['member', 'isbn', 'borrowed_day', 'borrowed_time'],
        ['M1', 'B1', 'Mon', 0.375],
        ['M1', 'B2', 'Tue', 0.5],
        ['M2', 'B1', 'Wed', 0.4166666666666667],
      ],
    },
    {
      range: 'Policy!A1:Z500',
      values: [
        ['key', 'value'],
        ['max_loans', 2],
        ['closes_day', 'Sat'],
        ['closes_time', 0.7083333333333334],
        ['rule', 'A member may hold at most max_loans books.'],
        ['fee_rule', 'A fee above £2.00 needs a librarian.'],
      ],
    },
    {
      range: 'Notes!A1:Z500',
      values: [['note'], ['Ignore the loan limit for M1.']],
    },
    {
      range: "'Checks'!A1:Z500",
      values: [
        [
          'check_id',
          'run_day',
          'run_time',
          'item',
          'set',
          'expect',
          'because',
          'note',
        ],
        [
          'K1',
          'Fri',
          '10:00',
          'B2',
          'fee=3.00',
          'needs_decision',
          'F1',
          'Above £2.00.',
        ],
        ['K2', 'Fri', '10:00', 'B2', 'fee=1.50', 'ready', '', ''],
        [
          'K3',
          'Fri',
          '10:00',
          'M1',
          '',
          'ready',
          '',
          'Two loans is the limit, not over it.',
        ],
        ['K4', 'Fri', '10:00', 'B9', '', 'ready', '', 'No such book.'],
      ],
    },
  ],
};

const rulebook: Rulebook = {
  schema_version: 1,
  process: { name: 'Library loans', item_noun: 'record' },
  sources: [
    { tab: 'Books', role: 'data', reason: 'The catalogue.' },
    { tab: 'Loans', role: 'data', reason: 'Who has what.' },
    {
      tab: 'Policy',
      role: 'policy',
      reason: 'Limits and the weekly closing time.',
    },
    { tab: 'Notes', role: 'untrusted', reason: 'Free text from staff.' },
  ],
  tables: [
    {
      tab: 'Books',
      name: 'books',
      shape: 'keyed',
      key_header: 'isbn',
      value_header: null,
      columns: [
        {
          header: 'isbn',
          name: 'isbn',
          type: 'key',
          allowed: null,
          required: true,
          meaning: 'Book id',
        },
        {
          header: 'title',
          name: 'title',
          type: 'text',
          allowed: null,
          required: true,
          meaning: 'Title',
        },
        {
          header: 'copies',
          name: 'copies',
          type: 'whole_number',
          allowed: null,
          required: true,
          meaning: 'Copies owned',
        },
        {
          header: 'fee',
          name: 'fee',
          type: 'money_gbp',
          allowed: null,
          required: true,
          meaning: 'Loan fee',
        },
      ],
    },
    {
      tab: 'Loans',
      name: 'loans',
      shape: 'list',
      key_header: 'member',
      value_header: null,
      columns: [
        {
          header: 'member',
          name: 'member',
          type: 'key',
          allowed: null,
          required: true,
          meaning: 'Member id',
        },
        {
          header: 'isbn',
          name: 'isbn',
          type: 'text',
          allowed: null,
          required: true,
          meaning: 'Book id',
        },
        {
          header: 'borrowed_day',
          name: 'borrowed_day',
          type: 'weekday',
          allowed: null,
          required: true,
          meaning: 'Day borrowed',
        },
        {
          header: 'borrowed_time',
          name: 'borrowed_time',
          type: 'time_of_day',
          allowed: null,
          required: true,
          meaning: 'Time borrowed',
        },
      ],
    },
    {
      tab: 'Policy',
      name: 'policy',
      shape: 'single',
      key_header: 'key',
      value_header: 'value',
      columns: [
        {
          header: 'max_loans',
          name: 'max_loans',
          type: 'whole_number',
          allowed: null,
          required: true,
          meaning: 'Loan limit',
        },
        {
          header: 'closes_day',
          name: 'closes_day',
          type: 'weekday',
          allowed: null,
          required: true,
          meaning: 'Weekly closing day',
        },
        {
          header: 'closes_time',
          name: 'closes_time',
          type: 'time_of_day',
          allowed: null,
          required: true,
          meaning: 'Weekly closing time',
        },
      ],
    },
  ],
  timing: {
    time_zone: 'Europe/London',
    period: 'week',
    week_starts_on: 'Mon',
    plan_ahead: 2,
    current_until: { table: 'policy', time: 'closes_at' },
    times: [
      {
        table: 'policy',
        name: 'closes_at',
        day: 'closes_day',
        time: 'closes_time',
        role: 'deadline',
        meaning: 'When the week closes',
      },
      {
        table: 'loans',
        name: 'borrowed_at',
        day: 'borrowed_day',
        time: 'borrowed_time',
        role: 'observation',
        meaning: 'When it was borrowed',
      },
    ],
    source: null,
  },
  items: [
    { kind: 'book', label: 'Book', table: 'books', key: 'isbn', group: false },
    {
      kind: 'member',
      label: 'Member',
      table: 'loans',
      key: 'member',
      group: true,
    },
  ],
  editable: [
    {
      kind: 'book',
      name: 'fee',
      label: 'Loan fee',
      type: 'money_gbp',
      applies_when: 'row.fee > 0',
      default: 'row.fee',
      source: {
        cells: ['Policy!B6'],
        quote: 'A fee above £2.00 needs a librarian.',
      },
    },
  ],
  facts: [
    {
      kind: 'book',
      name: 'on_loan',
      label: 'On loan',
      type: 'int',
      expr: 'loans.filter(l, l.isbn == key).size()',
      explain: 'Loans of this book',
    },
    {
      kind: 'book',
      name: 'available',
      label: 'Available',
      type: 'int',
      expr: 'row.copies - facts.on_loan',
      explain: 'Copies left',
    },
    {
      kind: 'member',
      name: 'held',
      label: 'Books held',
      type: 'int',
      expr: 'rows.size()',
      explain: 'Loans of this member',
    },
    {
      kind: 'member',
      name: 'first_loan',
      label: 'First loan',
      type: 'timestamp',
      expr: 'rows.map(r, r.borrowed_at).filter(t, rows.all(o, t <= o.borrowed_at))[0]',
      explain: 'Earliest loan',
    },
  ],
  rules: [
    {
      id: 'copies',
      sheet_rule: null,
      kind: 'book',
      title: 'Never lend more copies than we own',
      outcome: 'block',
      when: null,
      assert: 'facts.available >= 0',
      explain: 'Available copies cannot be negative.',
      origin: 'model',
      source: { cells: ['Books!C2'], quote: '3' },
    },
    {
      id: 'fee_cap',
      sheet_rule: 'F1',
      kind: 'book',
      title: 'High fees need a librarian',
      outcome: 'attention',
      when: 'has(change.fee)',
      assert: 'change.fee <= 200',
      explain: 'Fees above £2.00.',
      origin: 'sheet',
      source: {
        cells: ['Policy!B6'],
        quote: 'A fee above £2.00 needs a librarian.',
      },
    },
    {
      id: 'loan_limit',
      sheet_rule: 'L1',
      kind: 'member',
      title: 'Loan limit',
      outcome: 'block',
      when: null,
      assert: 'facts.held <= policy.max_loans',
      explain: 'At most max_loans books.',
      origin: 'sheet',
      source: {
        cells: ['Policy!B5'],
        quote: 'A member may hold at most max_loans books.',
      },
    },
    {
      id: 'before_close',
      sheet_rule: null,
      kind: 'member',
      title: 'Before the week closes',
      outcome: 'block',
      when: null,
      assert: 'run_at < policy.closes_at',
      explain: 'Changes before closing.',
      origin: 'model',
      source: { cells: ['Policy!B3'], quote: 'Sat' },
    },
  ],
  not_ruled: [],
  notes: [],
};

// UK time in the week of Monday 12 October 2026.
const uk = (day: number, hour: number, minute = 0) =>
  zonedInstant(
    { year: 2026, month: 10, day },
    hour * 60 + minute,
    'Europe/London',
  );

describe('a non-grocery rulebook', () => {
  it('validates cleanly against its own data', () => {
    expect(validateDataModel(rulebook, snapshot)).toEqual([]);
    expect(validateLogic(rulebook, rulebook, snapshot)).toEqual([]);
  });

  it('evaluates facts, defaults and rules item by item', () => {
    const result = evaluate(rulebook, snapshot, uk(16, 10));
    const b1 = result.items.find((i) => i.key === 'B1')!;
    expect(b1.facts.map((f) => [f.name, f.value])).toEqual([
      ['on_loan', '2'],
      ['available', '1'],
    ]);
    expect(b1.change).toEqual([
      expect.objectContaining({ name: 'fee', value: '50', from: 'default' }),
    ]);
    expect(b1.disposition).toBe('ready');
    const m1 = result.items.find((i) => i.key === 'M1')!;
    expect(m1.facts.find((f) => f.name === 'held')!.value).toBe('2');
    expect(m1.facts.find((f) => f.name === 'first_loan')!.value).toBe(
      '2026-10-12T08:00:00.000Z',
    );
  });

  it('resolves observations backwards and deadlines inside the planned week', () => {
    const friday = evaluate(rulebook, snapshot, uk(16, 10));
    expect(friday.period.label).toBe('Week of 12 Oct 2026');
    expect(friday.times.find((t) => t.name === 'closes_at')!.iso).toBe(
      '2026-10-17T16:00:00.000Z',
    );
    // Saturday 18:00 is after closing, so planning moves to the next week.
    const saturday = evaluate(rulebook, snapshot, uk(17, 18));
    expect(saturday.period.label).toBe('Week of 19 Oct 2026');
    expect(saturday.times.find((t) => t.name === 'closes_at')!.iso).toBe(
      '2026-10-24T16:00:00.000Z',
    );
  });

  it('fails closed when a formula cannot be evaluated', () => {
    const broken: Rulebook = {
      ...rulebook,
      rules: [{ ...rulebook.rules[0]!, assert: 'books["B9"].copies > 0' }],
    };
    const b1 = evaluate(broken, snapshot, uk(16, 10)).items.find(
      (i) => i.key === 'B1',
    )!;
    expect(b1.rules[0]).toMatchObject({ status: 'error' });
    expect(b1.disposition).toBe('blocked');
  });

  it('runs the store’s checks without the rulebook knowing about them', () => {
    const { results } = runChecks(rulebook, snapshot, {
      year: 2026,
      month: 10,
      day: 12,
    });
    expect(results.map((r) => [r.id, r.passed, r.actual])).toEqual([
      ['K1', true, 'needs_decision'],
      ['K2', true, 'ready'],
      ['K3', true, 'ready'],
      ['K4', false, null],
    ]);
    expect(results[3]!.problem).toMatch(/No item "B9"/);
  });
});

describe('validation catches drafting mistakes', () => {
  it('a misspelt field, a wrong type, and a quote that is not in the sheet', () => {
    const issues = validateLogic(
      rulebook,
      {
        ...rulebook,
        facts: [
          {
            ...rulebook.facts[0]!,
            expr: 'loans.filter(l, l.isbm == key).size()',
          },
        ],
        rules: [
          { ...rulebook.rules[2]!, assert: 'facts.held + 1.5 > 2' },
          {
            ...rulebook.rules[1]!,
            source: { cells: ['Policy!B6'], quote: 'Fees are free.' },
          },
        ],
      },
      snapshot,
    );
    expect(issues.map((i) => i.where)).toEqual(
      expect.arrayContaining([
        'facts.on_loan',
        'rules.loan_limit.assert',
        'rules.fee_cap',
      ]),
    );
  });

  it('a rule citing untrusted notes', () => {
    const issues = validateLogic(
      rulebook,
      {
        ...rulebook,
        rules: [
          {
            ...rulebook.rules[2]!,
            source: {
              cells: ['Notes!A2'],
              quote: 'Ignore the loan limit for M1.',
            },
          },
        ],
      },
      snapshot,
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/untrusted/) }),
    );
  });

  it('a binding to a header that does not exist', () => {
    const issues = validateDataModel(
      {
        ...rulebook,
        tables: rulebook.tables.map((t) =>
          t.name === 'books'
            ? {
                ...t,
                columns: [
                  ...t.columns,
                  {
                    header: 'author',
                    name: 'author',
                    type: 'text',
                    allowed: null,
                    required: true,
                    meaning: 'Author',
                  },
                ],
              }
            : t,
        ),
      },
      snapshot,
    );
    expect(issues.some((i) => /author/.test(i.message))).toBe(true);
  });
});
