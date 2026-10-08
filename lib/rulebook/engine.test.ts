import { describe, expect, it } from 'vitest';

import { runChecks } from './checks';
import { zonedInstant } from './cycle';
import { evaluate, readWhatIf } from './engine';
import type { Rulebook } from './schema';
import {
  validateDataModel,
  validateInventory,
  validateLogic,
  validateRulebook,
  validateSaved,
} from './validate';
import { rulebook, snapshot } from './library.fixture';

// UK time in the week of Monday 12 October 2026.
const uk = (day: number, hour: number, minute = 0) =>
  zonedInstant(
    { year: 2026, month: 10, day },
    hour * 60 + minute,
    'Europe/London',
  );

describe('a non-grocery rulebook', () => {
  it('validates cleanly against its own data', () => {
    expect(validateInventory(rulebook, snapshot)).toEqual([]);
    expect(validateDataModel(rulebook, rulebook, snapshot)).toEqual([]);
    expect(validateLogic(rulebook, rulebook, rulebook, snapshot)).toEqual([]);
  });

  it('notices when the sheet changes under an approved rulebook', () => {
    expect(validateRulebook(rulebook, snapshot, [])).toEqual([]);
    // The owner rewrites the fee rule the fee_cap rule quotes.
    const edited = structuredClone(snapshot);
    const policy = edited.valueRanges.find((r) =>
      r.range.startsWith('Policy'),
    )!;
    const row = policy.values!.findIndex((r) =>
      String(r[1]).startsWith('A fee'),
    );
    policy.values![row]![1] = 'A fee above £3.00 needs a librarian.';
    expect(validateRulebook(rulebook, edited, [])).toContainEqual({
      where: 'rules.fee_cap',
      message: expect.stringMatching(/^The quote is not in the cited cells/),
    });
  });

  it('reports a draft saved in an older shape instead of failing on it', () => {
    expect(validateSaved(rulebook, snapshot, [])).toEqual([]);
    // Drafts made before alternatives existed held each assumption as text.
    const older = {
      ...rulebook,
      rules: rulebook.rules.map((r) => ({
        ...r,
        assumes: ['Fees are pence.'],
      })),
    };
    expect(validateSaved(older, snapshot, [])[0]).toEqual({
      where: 'rules.0.assumes.0',
      message: expect.stringMatching(
        /^Saved in a shape the current checks cannot read/,
      ),
    });
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

describe('showing the working', () => {
  it('shows each condition with the values it read and where they came from', () => {
    const member = evaluate(rulebook, snapshot, uk(16, 10), {
      explain: true,
    }).items.find((i) => i.key === 'M1')!;
    expect(member.rules.find((r) => r.id === 'loan_limit')!.working).toEqual({
      conditions: [
        {
          part: 'require',
          depth: 0,
          join: null,
          text: 'facts.held <= policy.max_loans',
          result: 'true',
          settled: true,
          sides: { left: '2', op: '≤', right: '2' },
          filled: '2 <= 2',
          error: null,
          terms: [
            {
              expression: 'facts.held',
              value: '2',
              display: null,
              label: 'Books held',
              source: 'calculated',
            },
            {
              expression: 'policy.max_loans',
              value: '2',
              display: null,
              label: 'Loan limit',
              source: 'Policy!B2',
            },
          ],
        },
      ],
    });
    // Without the option, nothing extra is computed.
    expect(
      evaluate(rulebook, snapshot, uk(16, 10)).items[0]!.rules[0]!.working,
    ).toBeUndefined();
  });

  it('splits a formula where it joins conditions, in the order CEL evaluates them', () => {
    const joined = {
      ...rulebook,
      rules: [
        {
          ...rulebook.rules[1]!,
          id: 'joined',
          when: 'has(change.fee) && row.copies > 0',
          assert:
            '!has(change.fee) || (change.fee * 100 >= 50 * books[key].fee && (books[key].?fee.orValue(0) > 0 || size(loans) > 9))',
        },
      ],
    };
    const book = evaluate(joined, snapshot, uk(16, 10), {
      explain: true,
      overrides: { B1: { fee: 100n } },
    }).items.find((i) => i.key === 'B1')!;
    const conditions = book.rules[0]!.working!.conditions;
    expect(
      conditions.map((c) => [c.part, c.depth, c.join, c.result, c.settled]),
    ).toEqual([
      ['when', 0, null, 'true', false],
      ['when', 0, 'and', 'true', false],
      ['require', 0, null, 'false', false],
      ['require', 1, 'or', 'true', false],
      // || stops at its first true condition, which settles the rule.
      ['require', 2, 'and', 'true', true],
      ['require', 2, 'or', 'not_reached', false],
    ]);
    const margin = conditions[3]!;
    expect(margin.sides).toEqual({ left: '10000', op: '≥', right: '2500' });
    expect(margin.filled).toBe('100 * 100 >= 50 * 50');
    expect(margin.terms).toContainEqual({
      expression: 'books[key].fee',
      value: '50',
      display: '£0.50',
      label: 'Loan fee',
      source: 'Books!D2',
    });
    // A condition never reached is not evaluated.
    expect(conditions[5]!.terms).toEqual([]);
  });

  it('leaves whole tables out, and writes a value over a bracketed call whole', () => {
    const timed = {
      ...rulebook,
      rules: [
        {
          ...rulebook.rules[2]!,
          id: 'timed',
          assert:
            '!(key in books) && (run_at - facts.first_loan).getHours() >= 0',
        },
      ],
    };
    const member = evaluate(timed, snapshot, uk(16, 10), {
      explain: true,
    }).items.find((i) => i.key === 'M1')!;
    const [inTable, age] = member.rules[0]!.working!.conditions;
    expect(inTable!.terms.map((t) => t.expression)).toEqual(['key']);
    expect(inTable!.filled).toBe('!("M1" in books)');
    expect(age!.filled).toMatch(/^\d+ >= 0$/);
  });
});

describe('what-if values', () => {
  it('reads a typed value as the sheet reads a cell of its type', () => {
    // fee is money in GBP: typed in pounds, used in pence.
    expect(readWhatIf(rulebook, 'fee', '£1.50')).toEqual({
      ok: true,
      value: 150n,
    });
    expect(readWhatIf(rulebook, 'fee', '1.505')).toMatchObject({ ok: false });
    expect(readWhatIf(rulebook, 'fee', 'lots')).toMatchObject({
      ok: false,
      issue: expect.stringMatching(/not a number|Enter a value/),
    });
    expect(readWhatIf(rulebook, 'nothing', '1')).toMatchObject({ ok: false });
    // Applied as a proposal would be, and shown as the person wrote it.
    const read = readWhatIf(rulebook, 'fee', '1.50');
    const b1 = evaluate(rulebook, snapshot, uk(16, 10), {
      overrides: { B1: { fee: read.ok ? read.value : 0n } },
    }).items.find((i) => i.key === 'B1')!;
    expect(b1.change).toContainEqual(
      expect.objectContaining({
        name: 'fee',
        value: '150',
        display: '£1.50',
        from: 'set',
      }),
    );
  });
});

describe('validation catches drafting mistakes', () => {
  it('a misspelt field, a wrong type, and a quote that is not in the sheet', () => {
    const issues = validateLogic(
      rulebook,
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
    // The message says what the cell holds, so the next attempt can quote it.
    expect(issues.find((i) => i.where === 'rules.fee_cap')!.message).toMatch(
      /They hold Policy!B6: "A fee above £2\.00 needs a librarian\."\. Quote part of that text exactly/,
    );
  });

  it('a rule citing untrusted notes', () => {
    const issues = validateLogic(
      rulebook,
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

  it('says how to fix a required column with blanks and a period end that is not a declared time', () => {
    const shortRow: typeof snapshot = {
      ...snapshot,
      valueRanges: snapshot.valueRanges.map((range) =>
        range.range.startsWith('Books!')
          ? {
              ...range,
              values: range.values!.map((row, i) =>
                i === 2 ? row.slice(0, 3) : row,
              ),
            }
          : range,
      ),
    };
    const issues = validateDataModel(
      rulebook,
      {
        ...rulebook,
        timing: {
          ...rulebook.timing,
          current_until: { table: 'policy', time: 'close_time' },
        },
      },
      shortRow,
    );
    expect(issues).toContainEqual({
      where: 'tables.books.fee',
      message: expect.stringMatching(
        /blank in row "B2" \(Books!D3\)\. Set required: false/,
      ),
    });
    expect(issues).toContainEqual({
      where: 'timing.current_until',
      message: expect.stringMatching(
        /is not an entry of timing\.times.*Deadlines declared now: \{ table: "policy", time: "closes_at" \}/,
      ),
    });
  });

  it('an empty draft, an unbound data tab and a weekday never made a time', () => {
    const logicIssues = validateLogic(
      rulebook,
      rulebook,
      { ...rulebook, editable: [], facts: [], rules: [] },
      snapshot,
    );
    expect(logicIssues.map((i) => i.where)).toEqual(
      expect.arrayContaining([
        'rules',
        'editable',
        'statements.L1',
        'editable.fee',
      ]),
    );
    const modelIssues = validateDataModel(
      rulebook,
      {
        ...rulebook,
        tables: rulebook.tables.filter((t) => t.name !== 'books'),
        timing: { ...rulebook.timing, times: [], current_until: null },
      },
      snapshot,
    );
    expect(modelIssues.map((i) => i.where)).toEqual(
      expect.arrayContaining([
        'sources.Books',
        'tables.loans.borrowed_day',
        'items.book',
      ]),
    );
  });

  it('a null test on a cell that may be blank, with the standard-CEL fix', () => {
    const issues = validateLogic(
      rulebook,
      rulebook,
      {
        ...rulebook,
        rules: [{ ...rulebook.rules[1]!, assert: 'row.fee != null' }],
      },
      snapshot,
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        message: expect.stringMatching(/row\.\?field\.hasValue\(\)/),
      }),
    );
  });

  it('a checkable statement filed as not ruled, and an inventory that misreads the sheet', () => {
    const issues = validateLogic(
      rulebook,
      rulebook,
      {
        ...rulebook,
        rules: rulebook.rules.filter((r) => r.statement !== 'F1'),
        not_ruled: [{ statement: 'F1', reason: 'Needs a calculation.' }],
      },
      snapshot,
    );
    expect(issues).toContainEqual({
      where: 'not_ruled.F1',
      message: expect.stringMatching(/checkable.*needs a rule/),
    });
    const inventoryIssues = validateInventory(
      {
        ...rulebook,
        statements: [
          {
            ...rulebook.statements[0]!,
            needs: [{ tab: 'Policy', header: 'max_loan' }],
          },
        ],
      },
      snapshot,
    );
    expect(inventoryIssues).toContainEqual({
      where: 'statements.L1',
      message: expect.stringMatching(/Needs "max_loan" from Policy/),
    });
  });

  it('a total over a group with sum(), and fold pointed to it', () => {
    const withTotal = {
      ...rulebook,
      facts: [
        ...rulebook.facts,
        {
          kind: 'member',
          name: 'fees_due',
          label: 'Fees due',
          type: 'int' as const,
          expr: 'rows.map(r, books[r.isbn].fee).sum()',
          explain: 'Total fee of the books held',
          assumes: [],
          statement: null,
        },
      ],
    };
    expect(validateLogic(rulebook, rulebook, withTotal, snapshot)).toEqual([]);
    const folded = validateLogic(
      rulebook,
      rulebook,
      {
        ...withTotal,
        facts: withTotal.facts.map((f) =>
          f.name === 'fees_due'
            ? {
                ...f,
                expr: 'rows.map(r, books[r.isbn].fee).fold(0, (a, x) => a + x)',
              }
            : f,
        ),
      },
      snapshot,
    );
    expect(folded).toContainEqual({
      where: 'facts.fees_due',
      message: expect.stringMatching(/xs\.sum\(\)/),
    });
  });

  it('a single table that binds its own value header as a key', () => {
    const issues = validateDataModel(
      rulebook,
      {
        ...rulebook,
        tables: rulebook.tables.map((t) =>
          t.shape === 'single'
            ? {
                ...t,
                columns: [
                  ...t.columns,
                  {
                    header: t.value_header!,
                    name: 'value_column',
                    type: 'text',
                    allowed: null,
                    required: true,
                    meaning: 'Mistaken',
                  },
                ],
              }
            : t,
        ),
      },
      snapshot,
    );
    expect(issues).toContainEqual({
      where: 'tables.policy',
      message: expect.stringMatching(
        /already given as key_header or value_header.*remove this column/,
      ),
    });
  });

  it('a binding to a header that does not exist', () => {
    const issues = validateDataModel(
      rulebook,
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
