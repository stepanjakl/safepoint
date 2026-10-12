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
import { capturedRead } from './captured.fixture';
import { definitionSetSchema } from './types';

/*
  The browser tests serve frozen copies (e2e/fixtures/) in place of what the
  app keeps, which a new draft replaces. This holds the copies to the engine:
  each rulebook fits the stored shape, and the calculation is exactly what the
  engine gives on the accepted one and the captured read.

  `pnpm fixtures:e2e` writes the calculation again; with E2E_RULEBOOK=<id> it
  first copies that accepted rulebook from fixtures/ as the frozen one.
*/

const E2E = 'e2e/fixtures';
const ACCEPTED = path.join(E2E, 'brunch-orders-accepted.json');
const CALCULATION = path.join(E2E, 'brunch-orders-calculation.json');
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
});
