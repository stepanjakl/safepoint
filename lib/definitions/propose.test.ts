import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { capturedRead } from './captured.fixture';
import { always, call, standIn, told } from './models.fixture';
import { checkProposal, keptProposal, propose } from './propose';
import { inScratchDirectory } from './scratch.fixture';
import { TEXT } from './set.fixture';
import { fingerprintOf } from './store';
import { definitionSetSchema } from './types';

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
      call('try_proposal', { key: 'AV-RR', values: { order: 60 } }),
      call('submit_proposals', every({ 'AV-RR': avocados })),
    );
    const proposal = await propose(owner, set, read, 'test', TEXT, {
      resolve: () => model,
    });
    expect(model.doGenerateCalls).toHaveLength(2);
    // What the try told it: the ripe check failing, with its working.
    expect(JSON.stringify(model.doGenerateCalls[1]!.prompt)).toContain(
      'blocks',
    );
    expect(proposal.records['AV-RR']).toMatchObject({
      action: 'set',
      values: { order: 50 },
      cited: ['Stock!B3'],
      verdict: 'decide',
    });
    expect(proposal.records['SD-01']).toMatchObject({
      action: 'leave',
      values: null,
      verdict: 'ready',
      checks: [],
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
    expect(rest.doGenerateCalls).toHaveLength(1);
    expect(told(rest)).not.toContain('Sourdough');
    expect(Object.keys(proposal.records)).toEqual(KEYS);
  });
});
