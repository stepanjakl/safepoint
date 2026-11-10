import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead, capturedTabs } from './captured.fixture';
import { always, call, standIn, told } from './models.fixture';
import { checkProposal, keptProposal, newActivity, propose } from './propose';
import { inScratchDirectory } from './scratch.fixture';
import { TEXT } from './set.fixture';
import { fingerprintOf, noRules } from './store';
import { definitionSetSchema, type DefinitionProcess } from './types';

// The accepted rulebook the browser tests serve, held to the engine by
// e2e-fixtures.test.ts: two calculations and five checks.
const set = definitionSetSchema.parse(
  JSON.parse(readFileSync('e2e/fixtures/brunch-orders-accepted.json', 'utf8')),
);
const read = capturedRead();
const KEYS = [
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
const failing = (key: string, order: number) =>
  checkProposal(owner, set, read, key, { order })
    .checks.filter((c) => !c.holds)
    .map((c) => c.id);

describe('checking a proposal', () => {
  it('finds each verdict as worked out by hand', () => {
    // AV-RR holds 12 (14 on hand, 2 reserved) and expects to sell 65; cover
    // with its 10% safety is 71.5. 50 keeps ripe stock under 65 but falls
    // short of cover: a person decides.
    expect(
      checkProposal(owner, set, read, 'AV-RR', { order: 50 }).verdict,
    ).toBe('decide');
    expect(failing('AV-RR', 50)).toEqual(['cover_sales_and_safety_margin']);
    // 60 covers 71.5 but holds 72 ripe against 65 expected: blocked.
    expect(failing('AV-RR', 60)).toEqual(['order_ripe_avocados_limit']);
    // The bakery has nothing in stock: 72 is its supplier's most, short of
    // the 80.3 cover; 80 is over that most.
    expect(failing('SD-01', 72)).toEqual(['cover_sales_and_safety_margin']);
    expect(
      checkProposal(owner, set, read, 'SD-01', { order: 80 }).verdict,
    ).toBe('blocked');
    expect(failing('SD-01', 80)).toContain('supplier_delivery_limit');
    // Cases of 10.
    expect(failing('CT-250', 25)).toContain('order_in_whole_cases');
    // Eggs hold 38 against 30.8: nothing to order, and nothing fails.
    expect(checkProposal(owner, set, read, 'EG-06', { order: 0 }).verdict).toBe(
      'ready',
    );
  });

  it('shows the working of each check', () => {
    const ripe = checkProposal(owner, set, read, 'AV-RR', {
      order: 60,
    }).checks.find((c) => c.id === 'order_ripe_avocados_limit')!;
    expect(ripe.steps.at(-1)).toBe('false');
    expect(ripe.steps[0]).toContain('14 - 2 + 0');
  });

  it('says which checks do not apply to a record, whatever is proposed', () => {
    const applying = (key: string, order: number) =>
      Object.fromEntries(
        checkProposal(owner, set, read, key, { order }).checks.map((c) => [
          c.id,
          c.applies,
        ]),
      );
    // Ripe stock is capped only for what is ripe; an order of nothing is
    // still checked for arriving in time, because its guard reads the order.
    expect(applying('AV-RR', 50).order_ripe_avocados_limit).toBe(true);
    const sourdough = applying('SD-01', 72);
    expect(sourdough.order_ripe_avocados_limit).toBe(false);
    expect(Object.values(applying('EG-06', 0)).every(Boolean)).toBe(false);
    const ripe = checkProposal(owner, set, read, 'SD-01', {
      order: 72,
    }).checks.find((c) => c.id === 'order_ripe_avocados_limit')!;
    expect(ripe).toMatchObject({ holds: true, steps: ['!false', 'true'] });
  });
});

describe('a record the rulebook was not accepted on', () => {
  const known = { ...set, acceptedKeys: KEYS };
  // The data gains a record: a copy of one in every tab, under a new key.
  const gained = (from: string, key = 'NEW-01') => {
    const tabs = capturedTabs();
    for (const tab of tabs) {
      const row = tab.values.find((r) => r[0] === from);
      if (row) tab.values.push([key, ...row.slice(1)]);
    }
    return capturedRead(tabs);
  };
  const added = gained('EG-06');
  const newOnes = (checks: { id: string }[]) =>
    checks.filter((c) => c.id === 'new:record');

  it('is for a person to decide, naming the groups by the instructions’ words', () => {
    // Eggs hold enough, so with nothing proposed it would be ready.
    expect(
      checkProposal(owner, set, added, 'NEW-01', { order: 0 }).verdict,
    ).toBe('ready');
    const { verdict, checks } = checkProposal(owner, known, added, 'NEW-01', {
      order: 0,
    });
    expect(verdict).toBe('decide');
    expect(newOnes(checks)).toEqual([
      {
        id: 'new:record',
        name: 'New product since the rules were accepted: a person confirms which of the named groups it belongs to',
        consequence: 'decide',
        holds: false,
        applies: true,
        steps: [
          'NEW-01 was not among the products the rules were accepted on',
          'The rules name groups by their words: "eggs, cherry tomatoes and rocket are on offer"; "a sourdough loaf, a pack of ripe avocados and a pack of feta"',
        ],
        error: null,
      },
    ]);
  });

  it('does not stop a check that blocks from blocking', () => {
    expect(
      checkProposal(owner, known, gained('SD-01'), 'NEW-01', { order: 80 })
        .verdict,
    ).toBe('blocked');
  });

  it('leaves a record it was accepted on as it is', () => {
    for (const key of KEYS)
      expect(checkProposal(owner, known, read, key, { order: 10 })).toEqual(
        checkProposal(owner, set, read, key, { order: 10 }),
      );
  });

  it('adds nothing for a rulebook that kept no keys, or groups nothing', () => {
    expect(
      newOnes(checkProposal(owner, set, added, 'NEW-01', { order: 0 }).checks),
    ).toEqual([]);
    const ungrouped = {
      ...known,
      definitions: known.definitions.map((d) => ({
        ...d,
        groups: d.groups.map((g) => ({ ...g, keys: [] })),
      })),
    };
    expect(
      newOnes(
        checkProposal(owner, ungrouped, added, 'NEW-01', { order: 0 }).checks,
      ),
    ).toEqual([]);
    expect(
      newOnes(
        checkProposal(
          owner,
          {
            ...known,
            definitions: known.definitions.map((d) => ({ ...d, groups: [] })),
          },
          added,
          'NEW-01',
          { order: 0 },
        ).checks,
      ),
    ).toEqual([]);
  });
});

describe('a calculation that cannot be worked out', () => {
  // One record's first weekend of sales is blank.
  const blank = (sku = 'AV-RR') => {
    const tabs = capturedTabs();
    const sales = tabs.find((t) => t.name === 'Sales')!;
    const column = sales.values[0]!.indexOf('weekend_1');
    const row = sales.values.find((r) => r[0] === sku)!;
    row[column] = '';
    return capturedRead(tabs);
  };

  it('fails the checks that need it, naming it, and runs the others', () => {
    const { verdict, checks } = checkProposal(owner, set, blank(), 'AV-RR', {
      order: 50,
    });
    const by = Object.fromEntries(checks.map((c) => [c.id, c]));
    // Directly, and through the calculation that reads it.
    for (const id of [
      'order_ripe_avocados_limit',
      'cover_sales_and_safety_margin',
    ])
      expect(by[id]).toMatchObject({ holds: false, steps: [] });
    expect(by.order_ripe_avocados_limit!.error).toMatch(
      /^Expected sales cannot be worked out: /,
    );
    expect(by.cover_sales_and_safety_margin!.error).toMatch(
      /^Expected sales cannot be worked out: /,
    );
    // What does not read it runs as it would.
    for (const id of [
      'order_in_whole_cases',
      'supplier_delivery_limit',
      'arrival_before_saturday_opening',
    ])
      expect(by[id]).toMatchObject({ holds: true, error: null });
    expect(verdict).toBe('blocked');
    // A check its guard settles for this record never reads it, so it holds:
    // LM-04 is not ripe, while cover still needs the missing number.
    const unripe = Object.fromEntries(
      checkProposal(owner, set, blank('LM-04'), 'LM-04', {
        order: 0,
      }).checks.map((c) => [c.id, c]),
    );
    expect(unripe.order_ripe_avocados_limit).toMatchObject({
      holds: true,
      applies: false,
      error: null,
    });
    expect(unripe.cover_sales_and_safety_margin).toMatchObject({
      holds: false,
      error: expect.stringMatching(/^Expected sales cannot be worked out: /),
    });
    // Another record's read of it is not affected.
    expect(
      checkProposal(owner, set, blank(), 'EG-06', { order: 0 }).verdict,
    ).toBe('ready');
  });
});

describe('a set with no accepted check', () => {
  it('says so rather than ready', () => {
    const none = noRules(TEXT);
    expect(checkProposal(owner, none, read, 'AV-RR', { order: 50 })).toEqual({
      verdict: 'unchecked',
      checks: [],
    });
  });
});

describe('a proposal below its minimum', () => {
  const least: DefinitionProcess = {
    ...owner,
    subject: {
      ...owner.subject,
      proposal: owner.subject.proposal.map((f) => ({ ...f, min: 5 })),
    },
  };

  it('is blocked by one check made from the field’s own words', () => {
    const { verdict, checks } = checkProposal(least, set, read, 'EG-06', {
      order: 4,
    });
    expect(verdict).toBe('blocked');
    expect(checks.filter((c) => c.id.startsWith('min:'))).toEqual([
      expect.objectContaining({
        id: 'min:order',
        name: 'Proposed order at least 5 units',
        consequence: 'block',
        holds: false,
        steps: ['4 units is below 5'],
      }),
    ]);
  });

  it('adds nothing where the value holds, or where none is declared', () => {
    const bare: DefinitionProcess = {
      ...owner,
      subject: {
        ...owner.subject,
        proposal: owner.subject.proposal.map((f) => ({ ...f, min: undefined })),
      },
    };
    const count = (process: DefinitionProcess, order: number) =>
      checkProposal(process, set, read, 'EG-06', { order }).checks.length;
    expect(count(least, 5)).toBe(count(bare, 5));
    expect(count(bare, -3)).toBe(count(bare, 0));
    // Brunch orders declare a least of 0.
    expect(
      checkProposal(owner, set, read, 'EG-06', { order: -10 }).checks.map(
        (c) => c.id,
      ),
    ).toContain('min:order');
  });

  it('is blocked with no rulebook, and told to the model as its lower bound', async () => {
    expect(
      checkProposal(owner, noRules(TEXT), read, 'EG-06', { order: -1 }),
    ).toMatchObject({ verdict: 'blocked' });
    const model = standIn(call('submit_proposals', { records: [] }));
    await propose(owner, noRules(TEXT), read, 'test', TEXT, {
      resolve: () => model,
    }).catch(() => undefined);
    expect(JSON.stringify(model.doStreamCalls[0]!.tools)).toContain(
      '"minimum":0',
    );
  });
});

describe('proposing', () => {
  inScratchDirectory();
  const leave = (key: string) => ({
    key,
    action: 'leave',
    values: null,
    reason: 'Enough in stock.',
    cited: [],
    unsure: null,
  });
  const every = (change: Partial<Record<string, object>> = {}) => ({
    records: KEYS.map((key) => change[key] ?? leave(key)),
  });
  const avocados = {
    key: 'AV-RR',
    action: 'set',
    values: { order: 50 },
    reason: 'As much as ripe stock allows.',
    cited: [{ tab: 'Stock', row: 3, column: 'on_hand' }],
    unsure: 'Cover needs 60, but ripe stock allows 50.',
  };

  it('tries values, then keeps code’s verdicts on what it submits', async () => {
    const model = standIn(
      call('try_proposals', {
        proposals: [
          { key: 'AV-RR', values: { order: 60 } },
          { key: 'SD-01', values: { order: 72 } },
        ],
      }),
      call('submit_proposals', every({ 'AV-RR': avocados })),
    );
    const proposal = await propose(owner, set, read, 'test', TEXT, {
      resolve: () => model,
    });
    expect(model.doStreamCalls).toHaveLength(2);
    // What the try told it, for both records in the one call: the ripe check
    // failing for AV-RR, with its working, and not applying to SD-01.
    const shown = JSON.stringify(model.doStreamCalls[1]!.prompt);
    expect(shown).toContain('blocks');
    expect(shown).toMatch(/SD-01[^]*"applies":false/);
    expect(proposal.records['AV-RR']).toMatchObject({
      action: 'set',
      values: { order: 50 },
      cited: ['Stock!B3'],
      verdict: 'decide',
    });
    // A record left is checked with the order at nothing: the bakery has
    // none in stock, so cover fails; eggs hold enough.
    expect(proposal.records['SD-01']).toMatchObject({
      action: 'leave',
      values: null,
      verdict: 'decide',
    });
    expect(proposal.records['SD-01']!.checks).toHaveLength(5);
    expect(
      proposal.records['SD-01']!.checks.filter((c) => !c.holds).map(
        (c) => c.id,
      ),
    ).toEqual(['cover_sales_and_safety_margin']);
    expect(proposal.records['EG-06']).toMatchObject({
      action: 'leave',
      values: null,
      verdict: 'ready',
    });
    expect(Object.keys(proposal.records)).toEqual(KEYS);
    // Never told a formula; told the checks in their own words.
    expect(told(model)).not.toContain('record.on_hand');
    expect(told(model)).toContain('Order in whole cases');
    expect(await keptProposal(owner, 'test', fingerprintOf(set))).toEqual(
      proposal,
    );
  });

  it('refuses a submission that leaves a record out or cites what is not there', async () => {
    const short = always(
      call('submit_proposals', { records: every().records.slice(1) }),
    );
    await expect(
      propose(owner, set, read, 'test', TEXT, { resolve: () => short }),
    ).rejects.toThrow(/not answered: SD-01/);
    const blank = always(
      call(
        'submit_proposals',
        every({
          'AV-RR': {
            ...avocados,
            // AV-RR's supplier sets no most.
            cited: [{ tab: 'Deliveries', row: 3, column: 'max_order_units' }],
          },
        }),
      ),
    );
    await expect(
      propose(owner, set, read, 'test', TEXT, { resolve: () => blank }),
    ).rejects.toThrow(/AV-RR cites Deliveries!G3 is blank/);
  });

  it('proposes with no rulebook from the instructions alone', async () => {
    const model = standIn(
      call('submit_proposals', every({ 'AV-RR': avocados })),
    );
    const none = noRules(TEXT);
    const proposal = await propose(owner, none, read, 'test', TEXT, {
      resolve: () => model,
    });
    // Nothing to try values against, and no checks or worked-out values told.
    const offered = model.doStreamCalls[0]!.tools?.map((t) => t.name);
    expect(offered).toEqual(['submit_proposals']);
    expect(told(model)).not.toContain('accepted checks');
    expect(told(model)).not.toContain('values worked out');
    expect(told(model)).toContain('A person reviews every proposal');
    // Code has no checks to run: nothing says any is ready, unsure or not.
    expect(proposal.records['AV-RR']).toMatchObject({
      values: { order: 50 },
      verdict: 'unchecked',
      checks: [],
      unsure: avocados.unsure,
    });
    expect(await keptProposal(owner, 'test', fingerprintOf(none))).toEqual(
      proposal,
    );
  });

  it('tells a watcher what the model is doing as it works', async () => {
    const answer = call('submit_proposals', every({ 'AV-RR': avocados }));
    const thinking = {
      ...answer,
      content: [
        {
          type: 'reasoning' as const,
          text: '**Reading the stock**\nAvocados hold 12.\n**Weighing the kit**\nForty kits need forty packs.',
        },
        ...answer.content,
      ],
    };
    const activity = newActivity();
    let changes = 0;
    await propose(owner, noRules(TEXT), read, 'test', TEXT, {
      resolve: () => standIn(thinking),
      watch: { activity, changed: () => changes++ },
    });
    expect(activity.model).toBe('gemini-3.6-flash');
    // The latest section of its thinking, not the whole of it.
    expect(activity.thought).toBe(
      '**Weighing the kit**\nForty kits need forty packs.',
    );
    // Facts, not words: a page words them in the process's nouns.
    expect(activity.events).toEqual([
      expect.objectContaining({ kind: 'asked', model: 'gemini-3.6-flash' }),
      expect.objectContaining({
        kind: 'answered',
        records: KEYS.length,
        set: 1,
        leave: KEYS.length - 1,
        unsure: 1,
        cited: 1,
        problems: [],
      }),
    ]);
    expect(activity.tokens.output).toBeGreaterThan(0);
    expect(changes).toBeGreaterThan(2);
    // The stream as it came back: the thought whole, the model's call, the
    // app's answer to it, and the step's finish; nothing that was sent.
    const parts = activity.stream!.map(
      ({ from, part }) => `${from}:${part.type}`,
    );
    expect(parts).toEqual(
      expect.arrayContaining([
        'model:reasoning-start',
        'model:tool-call',
        'app:tool-result',
        'model:finish-step',
      ]),
    );
    const thought = activity.stream!.find(
      (p) => p.part.type === 'reasoning-start',
    );
    expect(thought?.part.text).toContain('Forty kits need forty packs.');
    expect(
      activity.stream!.find((p) => p.part.type === 'tool-call')?.part,
    ).toMatchObject({ toolName: 'submit_proposals' });
    expect(JSON.stringify(activity.stream)).not.toContain('"request"');
  });

  it('asks in batches, and again only for what a stopped one missed', async () => {
    const first = KEYS.slice(0, 6).map(leave);
    const second = KEYS.slice(6).map(leave);
    const stopped = standIn(
      call('submit_proposals', { records: first }),
      ...Array(3).fill(call('submit_proposals', { records: [] })),
    );
    await expect(
      propose(owner, set, read, 'test', TEXT, {
        resolve: () => stopped,
        batch: 6,
      }),
    ).rejects.toThrow(/not answered/);
    const rest = standIn(call('submit_proposals', { records: second }));
    const proposal = await propose(owner, set, read, 'test', TEXT, {
      resolve: () => rest,
      batch: 6,
    });
    expect(rest.doStreamCalls).toHaveLength(1);
    expect(told(rest)).not.toContain('Sourdough');
    expect(Object.keys(proposal.records)).toEqual(KEYS);
  });
});
