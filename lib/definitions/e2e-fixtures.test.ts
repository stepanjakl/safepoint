import {
  copyFileSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BRUNCH_ORDERS_DEFINITIONS as owner } from '@/lib/processes/brunch-orders/process';

import { calculate } from './calculate';
import { checkProposal } from './propose';
import { namesOf, recordsOf, type KeptRead } from './records';
import { capturedRead } from './captured.fixture';
import {
  definitionSetSchema,
  type DefinitionSet,
  type Proposal,
} from './types';

/*
  The browser tests serve frozen copies (e2e/fixtures/) in place of what the
  app keeps, which a new draft replaces. This holds the copies to the engine:
  each rulebook fits the stored shape, the calculation is exactly what the
  engine gives on the accepted one and the captured read, and every verdict in
  the frozen proposal is what the checks give on its values.

  `pnpm fixtures:e2e` writes the calculation again; with E2E_RULEBOOK=<id> it
  first copies that accepted rulebook from fixtures/ as the frozen one.
*/

const E2E = 'e2e/fixtures';
const ACCEPTED = path.join(E2E, 'brunch-orders-accepted.json');
const CALCULATION = path.join(E2E, 'brunch-orders-calculation.json');
const PROPOSAL = path.join(E2E, 'brunch-orders-proposal.json');
const update = process.env.UPDATE_E2E_FIXTURES === '1';
const pinned = process.env.E2E_RULEBOOK;

const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

describe('the frozen copies the browser tests serve', () => {
  it('copies the accepted rulebook asked for', () => {
    if (!update || !pinned) return;
    const from = path.join('fixtures', owner.id, 'rulebooks');
    const version = readdirSync(from).find((entry) =>
      readdirSync(path.join(from, entry)).includes(`${pinned}.json`),
    );
    if (!version) throw new Error(`No accepted rulebook ${pinned} is kept.`);
    copyFileSync(path.join(from, version, `${pinned}.json`), ACCEPTED);
  });

  it('are rulebooks of the stored shape', () => {
    for (const file of [
      'brunch-orders-rules.json',
      'brunch-orders-accepted.json',
    ])
      expect(
        definitionSetSchema.safeParse(json(path.join(E2E, file))).success,
        file,
      ).toBe(true);
  });

  it('calculate as the engine does', () => {
    const set = definitionSetSchema.parse(json(ACCEPTED));
    const calculation = calculate(owner, set, capturedRead());
    if (update)
      writeFileSync(CALCULATION, `${JSON.stringify(calculation, null, 2)}\n`);
    expect(json(CALCULATION)).toEqual(calculation);
  });

  it('propose with the verdicts the checks give', () => {
    const set = definitionSetSchema.parse(json(ACCEPTED));
    const read = capturedRead();
    if (update)
      writeFileSync(
        PROPOSAL,
        `${JSON.stringify(frozenProposal(set, read), null, 2)}\n`,
      );
    const frozen = json(PROPOSAL) as FrozenProposal;
    for (const [key, record] of Object.entries(frozen.proposal.records))
      if (record.values)
        expect(
          checkProposal(owner, set, read, key, record.values),
          key,
        ).toEqual({ verdict: record.verdict, checks: record.checks });
    for (const [key, tried] of Object.entries(frozen.trials))
      for (const [order, checked] of Object.entries(tried))
        expect(
          checkProposal(owner, set, read, key, { order: Number(order) }),
        ).toEqual(checked);
  });
});

type FrozenProposal = ReturnType<typeof frozenProposal>;

/*
  A proposal as a model might make it, on the captured read: for each record
  the least order in whole cases that is ready, or, where none is, the most
  that nothing blocks, with the conflict said; nothing where stock already
  covers it. One record is left wrong on purpose -- chilli flakes in a part
  case -- for the browser test to change.
*/
function frozenProposal(set: DefinitionSet, read: KeptRead) {
  const calculation = calculate(owner, set, read);
  const names = namesOf(read, owner.subject.data);
  const caseOf = (key: string) =>
    Number(recordsOf(read, owner.subject.data).record(key).case_size);
  const row = (key: string) =>
    calculation.rows.findIndex((r) => r.key === key) + 2;
  const records: Proposal['records'] = {};
  for (const { key } of calculation.rows) {
    const step = caseOf(key);
    let chosen: number | null = null;
    let fallback = 0;
    for (let order = 0; order <= step * 30; order += step) {
      const { verdict } = checkProposal(owner, set, read, key, { order });
      if (verdict === 'ready') {
        chosen = order;
        break;
      }
      if (verdict === 'blocked') break;
      fallback = order;
    }
    const order = key === 'CF-40' ? 7 : (chosen ?? fallback);
    const checked = checkProposal(owner, set, read, key, { order });
    records[key] =
      order === 0 && checked.verdict === 'ready'
        ? {
            action: 'leave',
            values: null,
            reason: 'Stock already covers what is expected to sell.',
            cited: [`Stock!B${row(key)}`],
            unsure: null,
            verdict: 'ready',
            checks: [],
          }
        : {
            action: 'set',
            values: { order },
            reason:
              key === 'CF-40'
                ? 'Seven jars, to be safe.'
                : `${order} in whole cases of ${step}, toward the target stock level.`,
            cited: [`Stock!B${row(key)}`, `Products!G${row(key)}`],
            unsure:
              checked.verdict === 'decide'
                ? 'Covering the target needs more than the checks that block allow.'
                : null,
            ...checked,
          };
  }
  return {
    names,
    calculated: {
      calculations: calculation.calculations.map(({ id, name }) => ({
        id,
        name,
      })),
      rows: Object.fromEntries(
        calculation.rows.map((r) => [
          r.key,
          Object.fromEntries(
            Object.entries(r.values).map(([id, cell]) => [id, cell.value]),
          ),
        ]),
      ),
    },
    proposal: {
      fingerprint: calculation.fingerprint,
      readId: 'frozen',
      model: 'frozen',
      at: '2026-10-12T12:00:00.000Z',
      records,
    } satisfies Proposal,
    // What the browser test changes CF-40 to, as the checks find it.
    trials: {
      'CF-40': { 6: checkProposal(owner, set, read, 'CF-40', { order: 6 }) },
    },
  };
}
