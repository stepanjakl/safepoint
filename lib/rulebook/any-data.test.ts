import { describe, expect, it } from 'vitest';

import { runChecks } from './checks';
import { sheetForModel } from './draft';
import { evaluate, type Snapshot } from './engine';
import { rulebook, snapshot } from './library.fixture';
import type { Rulebook } from './schema';
import {
  validateDataModel,
  validateInventory,
  validateLogic,
} from './validate';

/*
  The library again, with data of every other kind: a decimal, a percentage, a
  date, a date-time and euros. Nothing in the engine may assume a currency,
  whole numbers or a weekly timetable.
*/
const books = snapshot.valueRanges.find((r) => r.range.startsWith('Books!'))!;
const wider: Snapshot = {
  tabs: [...snapshot.tabs.filter((t) => t !== 'Checks'), 'Expected'],
  valueRanges: [
    ...snapshot.valueRanges.filter(
      (r) => r !== books && !r.range.includes('Checks'),
    ),
    {
      range: 'Books!A1:H3',
      values: [
        [
          ...books.values![0]!,
          'weight_kg',
          'discount',
          'published',
          'returned_at',
        ],
        [...books.values![1]!, 0.45, 0.1, 46310, 46310.75],
        [...books.values![2]!, 1.2, '25%', '2026-07-01', ''],
      ],
    },
    {
      // Named freely: the checks tab is found by its headers.
      range: 'Expected!A1:F3',
      values: [
        ['check_id', 'run_at', 'item', 'set', 'expect', 'because'],
        ['E1', '2026-10-16 10:00', 'B2', 'fee=3.00', 'needs_decision', 'F1'],
        ['E2', 46311.4166666667, 'B1', 'fee=1.50', 'ready', ''],
      ],
    },
  ],
};

const column = (
  header: string,
  type: Rulebook['tables'][number]['columns'][number]['type'],
  required: boolean,
) => ({ header, name: header, type, allowed: null, required, meaning: header });

const euros: Rulebook = {
  ...rulebook,
  currency: { code: 'EUR', minor_units: 2 },
  tables: rulebook.tables.map((t) =>
    t.name === 'books'
      ? {
          ...t,
          columns: [
            ...t.columns,
            column('weight_kg', 'decimal', true),
            column('discount', 'percent', true),
            column('published', 'date', true),
            column('returned_at', 'datetime', false),
          ],
        }
      : t,
  ),
  facts: [
    ...rulebook.facts,
    {
      kind: 'book',
      name: 'heavy',
      label: 'Heavy',
      type: 'bool',
      expr: 'row.weight_kg > 1.0',
      explain: 'Over a kilo',
      assumes: [],
      statement: null,
    },
    {
      kind: 'book',
      name: 'new_title',
      label: 'New',
      type: 'bool',
      expr: 'run_at - row.published < duration("2160h")',
      explain: 'Published in the last 90 days',
      assumes: [],
      statement: null,
    },
    {
      kind: 'book',
      name: 'deep_discount',
      label: 'Deep discount',
      type: 'bool',
      expr: 'row.discount >= 0.25',
      explain: 'A quarter off or more',
      assumes: [],
      statement: null,
    },
  ],
};

describe('any kind of data', () => {
  it('binds decimals, percentages, dates and euros, and formulas read them typed', () => {
    expect(validateDataModel(euros, euros, wider)).toEqual([]);
    expect(validateLogic(euros, euros, euros, wider)).toEqual([]);
    const runAt = Date.parse('2026-10-16T09:00:00Z');
    const facts = (key: string) =>
      Object.fromEntries(
        evaluate(euros, wider, runAt)
          .items.find((i) => i.key === key)!
          .facts.map((f) => [f.name, f.value]),
      );
    expect(facts('B1')).toMatchObject({
      heavy: 'false',
      new_title: 'true',
      deep_discount: 'false',
    });
    expect(facts('B2')).toMatchObject({
      heavy: 'true',
      new_title: 'false',
      deep_discount: 'true',
    });
  });

  it('asks for a currency when there is money, and the right type of default', () => {
    expect(
      validateDataModel(euros, { ...euros, currency: null }, wider),
    ).toContainEqual(expect.objectContaining({ where: 'currency' }));
    const issues = validateLogic(
      euros,
      euros,
      {
        ...euros,
        editable: [
          {
            ...euros.editable[0]!,
            name: 'discount',
            type: 'percent',
            default: '1',
          },
        ],
      },
      wider,
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ where: 'editable.discount.default' }),
    );
  });

  it('catches percentage points bound as a percentage', () => {
    const points = {
      ...euros,
      tables: euros.tables.map((t) =>
        t.name === 'books'
          ? {
              ...t,
              columns: t.columns.map((c) =>
                c.name === 'copies' ? { ...c, type: 'percent' as const } : c,
              ),
            }
          : t,
      ),
    };
    expect(validateDataModel(points, points, wider)).toContainEqual({
      where: 'tables.books.copies',
      message: expect.stringMatching(/percentage points: use whole_number/),
    });
  });

  it('accepts a statement that needs a row of a keyed table, not only a column', () => {
    const needsRow = {
      ...euros,
      statements: [
        ...euros.statements,
        {
          id: 'B2X',
          source: euros.statements[0]!.source,
          kind: 'book',
          needs: [{ tab: 'Books', header: 'B2' }],
          changes: [],
          checkable: true,
          why_not: null,
        },
      ],
    };
    expect(
      validateDataModel(needsRow, euros, wider).filter(
        (i) => i.where === 'tables',
      ),
    ).toEqual([]);
  });

  it('runs the draft on the sheet and reports the cause of what cannot be evaluated', () => {
    const blank = {
      ...euros,
      facts: [
        ...euros.facts,
        {
          kind: 'book',
          name: 'returned',
          label: 'Returned',
          type: 'bool' as const,
          // returned_at is blank for B2: this fails there, at run time only.
          expr: 'row.returned_at < run_at',
          explain: 'Back on the shelf',
          assumes: [],
          statement: null,
        },
      ],
      rules: [
        ...euros.rules,
        {
          ...euros.rules[0]!,
          id: 'on_shelf',
          assert: 'facts.returned',
        },
      ],
    };
    const issues = validateLogic(
      blank,
      blank,
      blank,
      wider,
      Date.parse('2026-10-16T09:00:00Z'),
    );
    // The fact is the cause; the rule that reads it is left out.
    expect(issues).toEqual([
      {
        where: 'facts.returned',
        message: expect.stringMatching(
          /for 1 of 2 items \(B2\): No such key: returned_at\. "returned_at" is blank.*\.\?returned_at\.orValue/,
        ),
      },
    ]);
  });

  it('tells a rule reading a proposed value that does not apply everywhere to say when', () => {
    const partly = {
      ...euros,
      // Only B2 (a 1.25 fee) can have its fee changed now.
      editable: [{ ...euros.editable[0]!, applies_when: 'row.fee > 100' }],
      rules: [
        ...euros.rules,
        {
          ...euros.rules[1]!,
          id: 'fee_always',
          when: null,
          assert: 'change.fee <= 200',
        },
      ],
    };
    expect(
      validateLogic(
        partly,
        partly,
        partly,
        wider,
        Date.parse('2026-10-16T09:00:00Z'),
      ),
    ).toEqual([
      {
        where: 'rules.fee_always',
        message: expect.stringMatching(/\(B1\).*when: has\(change\.fee\)/),
      },
    ]);
  });

  it('offers a kind only the facts of kinds evaluated before it', () => {
    const backwards = {
      ...euros,
      // book is evaluated before member, so it cannot read member facts.
      rules: [
        ...euros.rules,
        {
          ...euros.rules[0]!,
          id: 'reads_later',
          assert: "member_facts['M1'].held > 0",
        },
      ],
    };
    expect(
      validateLogic(
        backwards,
        backwards,
        backwards,
        wider,
        Date.parse('2026-10-16T09:00:00Z'),
      ),
    ).toContainEqual({
      where: 'rules.reads_later.assert',
      message: expect.stringMatching(
        /ask in data_model_requests for items to list member first/,
      ),
    });
  });

  it('catches an age taken backwards and a formula that names one item', () => {
    const wrong = {
      ...euros,
      rules: [
        ...euros.rules,
        {
          ...euros.rules[2]!,
          id: 'recent',
          assert: '(rows[0].borrowed_at - run_at).getHours() < 24',
        },
        {
          ...euros.rules[0]!,
          id: 'one_book',
          assert: "books['B1'].copies > 0",
        },
      ],
    };
    const issues = validateLogic(
      wrong,
      wrong,
      wrong,
      wider,
      Date.parse('2026-10-16T09:00:00Z'),
    );
    expect(issues).toContainEqual({
      where: 'rules.recent.assert',
      message: expect.stringMatching(/An age is run_at - borrowed_at/),
    });
    expect(issues).toContainEqual({
      where: 'rules.one_book.assert',
      message: expect.stringMatching(/Names one specific item, "B1"/),
    });
  });

  it('asks for an assumption only where a formula makes a choice its statement does not', () => {
    const choosy = {
      ...euros,
      rules: euros.rules.map((r) =>
        r.id === 'loan_limit'
          ? {
              ...r,
              // The 3, the 9 and the default for a blank are choices L1 does not make.
              assert:
                'facts.held <= policy.max_loans && size(rows) * 3 <= books[rows[0].isbn].?copies.orValue(9)',
            }
          : r,
      ),
    };
    const at = Date.parse('2026-10-16T09:00:00Z');
    const issues = validateLogic(choosy, choosy, choosy, wider, at);
    expect(issues).toContainEqual({
      where: 'rules.loan_limit.assumes',
      message: expect.stringMatching(
        /uses the number 3, which is not in the statement; uses the number 9.*decides what a blank copies means/,
      ),
    });
    const explained = {
      ...choosy,
      rules: choosy.rules.map((r) =>
        r.id === 'loan_limit'
          ? {
              ...r,
              assumes: [
                {
                  // Plain words for the owner; the numbers and the default
                  // are named in technical, which the check reads too.
                  assumption:
                    'A member may borrow at most a third of the copies of their first book, counting a book with no copy count as well stocked.',
                  alternatives: [
                    'There is no limit other than the most loans a member may hold.',
                  ],
                  technical: 'size(rows) * 3, orValue(9) on copies',
                },
              ],
            }
          : r,
      ),
    };
    expect(
      validateLogic(explained, explained, explained, wider, at).filter((i) =>
        i.where.endsWith('.assumes'),
      ),
    ).toEqual([]);
  });

  it('asks for an assumption where a blank cell or a missing row changes what a rule does', () => {
    const blankPasses = {
      ...euros,
      rules: euros.rules.map((r) =>
        r.id === 'fee_cap'
          ? {
              ...r,
              // A proposed value that is not set is not a blank in the sheet.
              when: 'has(change.fee)',
              assert: '!has(row.returned_at) || change.fee <= 200',
            }
          : r.id === 'loan_limit'
            ? { ...r, when: 'key in books' }
            : r,
      ),
    };
    const issues = validateLogic(
      blankPasses,
      blankPasses,
      blankPasses,
      wider,
      Date.parse('2026-10-16T09:00:00Z'),
    ).filter((i) => i.where.endsWith('.assumes'));
    expect(issues).toEqual([
      {
        where: 'rules.fee_cap.assumes',
        message: expect.stringMatching(
          /^This formula decides what happens when returned_at is blank\. Name each/,
        ),
      },
      {
        where: 'rules.loan_limit.assumes',
        message: expect.stringMatching(
          /^This formula decides what happens to an item with no row in Books \(asked once/,
        ),
      },
    ]);
  });

  it('wants real alternatives in plain words, and a sheet id that matches the statement', () => {
    const sloppy = {
      ...euros,
      rules: euros.rules.map((r) =>
        r.id === 'fee_cap'
          ? {
              ...r,
              sheet_rule: 'L1',
              assumes: [
                {
                  assumption: 'The limit is per loan.',
                  alternatives: ['The limit is per loan'],
                  technical: 'change.fee <= 200',
                },
                {
                  assumption: 'A blank fee counts as zero.',
                  alternatives: [
                    'Treat blank fees as 0',
                    'A blank fee blocks the loan',
                  ],
                  technical: 'orValue(0) on fee',
                },
                {
                  assumption: 'The cap applies to change.fee only.',
                  alternatives: ['It applies to the max_fee and late fees.'],
                  technical: 'change.fee',
                },
              ],
            }
          : r,
      ),
    };
    const issues = validateLogic(
      sloppy,
      sloppy,
      sloppy,
      wider,
      Date.parse('2026-10-16T09:00:00Z'),
    );
    expect(issues).toContainEqual({
      where: 'rules.fee_cap.assumes.0',
      message: expect.stringMatching(
        /alternatives must each give a different answer/,
      ),
    });
    expect(issues).toContainEqual({
      where: 'rules.fee_cap.assumes.1',
      message: expect.stringMatching(/not the same answer in other words/),
    });
    expect(issues).toContainEqual({
      where: 'rules.fee_cap.assumes.2',
      message: expect.stringMatching(
        /write them in everyday words, without "change.fee", "max_fee"/,
      ),
    });
    expect(issues).toContainEqual({
      where: 'rules.fee_cap.sheet_rule',
      message: expect.stringMatching(
        /Implements statement F1 but is labelled sheet rule L1/,
      ),
    });
  });

  it('refuses a starting value copied as a fixed number from one cell', () => {
    const copied = {
      ...euros,
      editable: [{ ...euros.editable[0]!, default: '125' }],
    };
    expect(
      validateLogic(
        copied,
        copied,
        copied,
        wider,
        Date.parse('2026-10-16T09:00:00Z'),
      ),
    ).toContainEqual({
      where: 'editable.fee.default',
      message: expect.stringMatching(
        /Starts every book at the fixed number 125, copied from Policy!B6/,
      ),
    });
  });

  it('lists exactly what the process lets a proposal change', () => {
    const mayChange = [
      {
        name: 'fee',
        applies_to: 'each book',
        type: 'money' as const,
        starts_as: 'the current fee',
        meaning: 'The loan fee.',
      },
      {
        name: 'copies_to_buy',
        applies_to: 'each book',
        type: 'whole_number' as const,
        starts_as: '0',
        meaning: 'Copies to buy.',
      },
    ];
    const issues = validateInventory(
      {
        ...euros,
        changeable: [
          ...euros.changeable.map((c) => ({ ...c, source: null })),
          { name: 'loan_days', kind: 'member', meaning: 'Days', source: null },
        ],
      },
      wider,
      mayChange,
    );
    expect(issues).toEqual([
      {
        where: 'changeable',
        message: expect.stringMatching(
          /lets a proposal change "copies_to_buy"/,
        ),
      },
      {
        where: 'changeable.loan_days',
        message: expect.stringMatching(
          /not something the process lets a proposal change/,
        ),
      },
    ]);
  });

  it('sends back a request for something the sheet does not hold', () => {
    const asks = {
      ...euros,
      data_model_requests: [
        {
          statement: 'L1',
          request: "Add a boolean field 'over_limit' to the member item.",
        },
        // Quotes a header the sheet has: a real request.
        {
          statement: 'F1',
          request: "Bind the 'copies' column as copies_owned.",
        },
      ],
    };
    const requests = validateLogic(asks, asks, asks, wider).filter((i) =>
      i.where.startsWith('data_model_requests'),
    );
    expect(requests).toEqual([
      {
        where: 'data_model_requests.L1',
        message: expect.stringMatching(
          /"over_limit", which the sheet does not hold anywhere.*a value worked out from it is a fact/,
        ),
      },
    ]);
  });

  it('sends back a request for a column the data model already has', () => {
    const asks = {
      ...euros,
      data_model_requests: [
        { statement: 'L1', request: 'Add field max_loans to the policy tab.' },
      ],
    };
    expect(
      validateLogic(asks, asks, asks, wider).filter((i) =>
        i.where.startsWith('data_model_requests'),
      ),
    ).toEqual([
      {
        where: 'data_model_requests.L1',
        message: expect.stringMatching(
          /already has: policy\.max_loans .*Read it there/,
        ),
      },
    ]);
  });

  it('lets a fact implement a statement that defines a value', () => {
    const definition = {
      id: 'D1',
      source: euros.statements[0]!.source,
      kind: 'book',
      needs: [{ tab: 'Books', header: 'copies' }],
      changes: [],
      checkable: true,
      why_not: null,
    };
    const defined = {
      ...euros,
      statements: [...euros.statements, definition],
      facts: euros.facts.map((f) =>
        f.name === 'available' ? { ...f, statement: 'D1' } : f,
      ),
    };
    const at = Date.parse('2026-10-16T09:00:00Z');
    expect(validateLogic(defined, defined, defined, wider, at)).toEqual([]);
    const missing = { ...defined, facts: euros.facts };
    expect(validateLogic(missing, missing, missing, wider, at)).toContainEqual({
      where: 'statements.D1',
      message: expect.stringMatching(
        /or, if it defines how a value is calculated, a fact/,
      ),
    });
  });

  it('catches a text column compared with a value it never holds', () => {
    const typo = {
      ...euros,
      rules: [
        ...euros.rules,
        { ...euros.rules[0]!, id: 'by_title', assert: "row.title != 'dune'" },
      ],
    };
    expect(
      validateLogic(
        typo,
        typo,
        typo,
        wider,
        Date.parse('2026-10-16T09:00:00Z'),
      ),
    ).toContainEqual({
      where: 'rules.by_title.assert',
      message: expect.stringMatching(
        /Compares title with "dune".*Did you mean "Dune"\?/,
      ),
    });
  });

  it('catches a key written into a formula that the table does not have', () => {
    const typo = {
      ...euros,
      rules: [
        ...euros.rules,
        {
          ...euros.rules[0]!,
          id: 'case',
          when: "'b1' in books",
          assert: 'true',
        },
        { ...euros.rules[0]!, id: 'missing', assert: "books['B9'].copies > 0" },
      ],
    };
    const issues = validateLogic(
      typo,
      typo,
      typo,
      wider,
      Date.parse('2026-10-16T09:00:00Z'),
    );
    expect(issues).toContainEqual({
      where: 'rules.case.when',
      message: expect.stringMatching(
        /Looks up "b1" in books.*Did you mean "B1"\?/,
      ),
    });
    expect(issues).toContainEqual({
      where: 'rules.missing.assert',
      message: expect.stringMatching(
        /Looks up "B9" in books.*Its keys: B1, B2/,
      ),
    });
  });

  it('finds the checks tab by its headers and runs exact run times', () => {
    const report = runChecks(euros, wider, { year: 2026, month: 10, day: 12 });
    expect(report.tab).toBe('Expected');
    expect(
      report.results.map((r) => [r.id, r.actual, r.passed, r.problem]),
    ).toEqual([
      ['E1', 'needs_decision', true, null],
      ['E2', 'ready', true, null],
    ]);
  });

  it('shows the model a long tab as its first rows and a profile of every row', () => {
    const rows = [
      ['sku', 'price', 'note'],
      ...Array.from({ length: 300 }, (_, i) => [
        `S${i}`,
        i % 2 ? 1.5 : 2,
        ...(i === 299 ? [] : ['x']),
      ]),
    ];
    const long: Snapshot = {
      tabs: ['Long'],
      valueRanges: [{ range: 'Long!A1:C301', values: rows }],
    };
    const [tab] = sheetForModel(long) as unknown as [
      { rows: unknown[]; rows_not_shown: number; column_profiles: unknown[] },
    ];
    expect(tab.rows).toHaveLength(41);
    expect(tab.rows_not_shown).toBe(260);
    expect(tab.column_profiles).toEqual([
      expect.objectContaining({
        header: 'sku',
        filled: 300,
        distinct_texts: 300,
      }),
      expect.objectContaining({
        header: 'price',
        whole_numbers_only: false,
        min: 1.5,
        max: 2,
      }),
      expect.objectContaining({ header: 'note', filled: 299, blank: 1 }),
    ]);
  });
});
