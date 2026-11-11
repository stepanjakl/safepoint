import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  BRUNCH_ORDERS_DEFINITIONS as owner,
  brunchOrdersProcess,
} from '@/lib/processes/brunch-orders/process';

import { calculate } from './calculate';
import { capturedRead } from './captured.fixture';
import { problemsOf, review, settingOf, states, type Draft } from './checks';
import { checkProposal } from './propose';
import { namesOf, recordsOf, type KeptRead } from './records';
import { formulaOf, sentencesOf, type ShapeContext } from './shapes';
import { definitionSetSchema, type DefinitionSet } from './types';

/*
  The one real process, held still while the engine is made to hold for any
  other: on the captured read and on a kept read, its records and read
  problems, what the accepted rulebook calculates and how its checks find a
  range of orders, and, for the rulebook under review, every formula and
  sentence written from its shapes and every grounding verdict on its quotes.
  The snapshot was taken from the code before the agnosticism audit changed
  anything; a difference is a change to Brunch orders, never a refresh.

  The kept read lives in data/, which is not in git: where it is absent, that
  half is skipped and says so.
*/

const ACCEPTED =
  'fixtures/brunch-orders/rulebooks/v2-91823c6c8281/5b895575e4e7.json';
// A frozen copy of the rulebook under review as it was before data profiles:
// the live one changes whenever rules are drafted again, as they should.
const UNDER_REVIEW = 'lib/definitions/rulebook-before-profiles.fixture.json';
const KEPT_READ =
  'data/brunch-orders/reads/2026-10-30T19-52-57-107Z-6e93bf09.json';

const setAt = (file: string): DefinitionSet =>
  definitionSetSchema.parse(JSON.parse(readFileSync(file, 'utf8')));

const v3 = brunchOrdersProcess.instructions.text;
const v2 = brunchOrdersProcess.instructions.previous.find(
  (p) => p.version === 'v2',
)!.text;

// Bigints as text, so a snapshot keeps an int apart from a double.
const plain = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_, v: unknown) =>
      typeof v === 'bigint' ? `${v}n` : v,
    ),
  );

/*
  One proposal's verdict as a line: each check holding (+), failing (-), not
  applying (~) or not running (!), and a fingerprint of the whole answer,
  working included, so a changed step shows without a page of steps.
*/
const verdictLine = (checked: ReturnType<typeof checkProposal>) =>
  `${checked.verdict}: ${checked.checks
    .map(
      (c) =>
        `${c.id}${c.error ? '!' : c.applies ? (c.holds ? '+' : '-') : '~'}`,
    )
    .join(' ')} #${createHash('sha256')
    .update(JSON.stringify(checked))
    .digest('hex')
    .slice(0, 16)}`;

const ORDERS = [
  0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30, 36, 48, 60, 100,
];

function heldOn(read: KeptRead) {
  const { data } = owner.subject;
  const records = recordsOf(read, data);
  const accepted = setAt(ACCEPTED);
  const underReview = setAt(UNDER_REVIEW);
  const versionsOf = (d: DefinitionSet['definitions'][number]) => [
    { name: 'own', written: d },
    ...(d.agreement?.versions ?? []).map((v, i) => ({
      name: `version ${i + 1}`,
      written: v,
    })),
  ];
  const draftOf = (
    written: DefinitionSet['definitions'][number] | Draft,
  ): Draft => ({
    constants: written.constants,
    groups: written.groups,
    shape: written.shape ?? null,
    formula: written.formula ?? '',
    examples: written.examples,
  });
  const reviewed = (set: DefinitionSet, text: string) =>
    Object.fromEntries(
      set.definitions.flatMap((d) =>
        versionsOf(d)
          .filter(({ written }) => written.formula)
          .map(({ name, written }) => {
            const setting = settingOf(owner, text, set, read, d);
            const result = review(setting, draftOf(written as Draft));
            return [
              `${d.id} ${name}`,
              {
                problems: result.problems,
                shown: result.ran?.problem ?? null,
                blocked: result.blocked,
              },
            ];
          }),
      ),
    );
  return plain({
    records: {
      keys: records.keys,
      problems: records.problems,
      types: records.types,
      lookupKeys: records.lookupKeys,
      rows: Object.fromEntries(
        records.keys.map((key) => [
          key,
          { record: records.record(key), lookups: records.lookups(key) },
        ]),
      ),
      names: namesOf(read, data),
    },
    calculation: calculate(owner, accepted, read),
    verdicts: Object.fromEntries(
      records.keys.map((key) => [
        key,
        Object.fromEntries(
          ORDERS.map((order) => [
            order,
            verdictLine(checkProposal(owner, accepted, read, key, { order })),
          ]),
        ),
      ]),
    ),
    // Every formula a shape writes, and its sentence, as a person approves it.
    written: Object.fromEntries(
      underReview.definitions.flatMap((d) =>
        versionsOf(d)
          .filter(({ written }) => written.shape)
          .map(({ name, written }) => {
            const context: ShapeContext = {
              subject: owner.subject,
              records,
              read,
              consequence: d.consequence,
              constants: written.constants,
              groups: written.groups,
              earlier: underReview.definitions.slice(
                0,
                underReview.definitions.indexOf(d),
              ),
            };
            let formula: string;
            try {
              formula = formulaOf(written.shape!, context);
            } catch (error) {
              formula = `cannot be written: ${(error as Error).message}`;
            }
            return [`${d.id} ${name}`, formula];
          }),
      ),
    ),
    sentences: sentencesOf(owner.subject, underReview, read),
    // Each quote of the rulebook under review, and whether it states its value.
    grounding: Object.fromEntries(
      underReview.definitions.flatMap((d) =>
        versionsOf(d).map(({ name, written }) => [
          `${d.id} ${name}`,
          {
            states: written.constants.map((c) => [
              c.quote,
              c.value,
              states(c.quote, c.value),
            ]),
            problems: problemsOf(
              { ...written, formula: written.formula ?? '' },
              {
                text: v3,
                subject: owner.subject,
                keys: records.keys,
                names: namesOf(read, data),
                earlier: underReview.definitions
                  .slice(0, underReview.definitions.indexOf(d))
                  .map((one) => one.id),
                lookupKeys: records.lookupKeys,
              },
            ),
          },
        ]),
      ),
    ),
    reviews: {
      accepted: reviewed(accepted, v2),
      underReview: reviewed(underReview, v3),
    },
  });
}

describe('Brunch orders, unchanged by the engine being made agnostic', () => {
  it('on the captured read', () => {
    expect(heldOn(capturedRead())).toMatchSnapshot();
  });

  const kept = existsSync(KEPT_READ);
  it.skipIf(!kept)(
    `on the kept read ${KEPT_READ}${kept ? '' : ' (absent here, so skipped)'}`,
    () => {
      const read = JSON.parse(readFileSync(KEPT_READ, 'utf8')) as KeptRead;
      expect(heldOn(read)).toMatchSnapshot();
    },
  );
});
