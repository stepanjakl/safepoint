import { z } from 'zod';

import type { DefinitionSubject } from './subject';
import type { DraftingModel } from '@/lib/models';

import type { RecordAttempt } from './attempts';
import { ask, type Resolve } from './calls';
import { givenOf } from './checks';
import { contextFor, run } from './formulas';
import { dataOf, plain } from './prompts';
import { profiledFor } from './profile';
import { fitting, namesOf, sourceOf, type KeptRead, type Row } from './records';
import { fingerprintOf } from './fingerprint';
import type { Definition, DefinitionProcess, DefinitionSet } from './types';
import { stepsFor } from './working';

/*
  Calculate: every accepted calculation worked out by code for
  every record of a read. The engine's values are the record; later steps
  read them. The model cross-checks them on its own: it works the same values
  out from the instructions, the data and each value's plain words, never
  seeing a formula, so a formula that reads the instructions one way and the
  model another shows as a disagreement for a person to look at. Nothing is
  settled automatically.
*/

export type Cell = {
  value: number | null;
  error: string | null;
  // The app's working, as the examples show it.
  steps: string[];
};

export type Calculation = {
  // The accepted rulebook it ran on.
  fingerprint: string;
  accepted: number;
  calculations: Pick<Definition, 'id' | 'name' | 'text'>[];
  rows: { key: string; name: string; values: Record<string, Cell> }[];
};

// A number as a person writes it: decimal noise settled.
const settled = (value: unknown): number | null =>
  typeof value === 'bigint'
    ? Number(value)
    : typeof value === 'number' && Number.isFinite(value)
      ? Number(value.toFixed(6))
      : null;

export function calculate(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
): Calculation {
  const { subject } = profiledFor(owner, set);
  const records = fitting(read, subject.data);
  const numbers = set.definitions.filter((d) => d.result === 'number');
  const open = numbers.filter((d) => !d.approvedAt || !d.formula);
  if (open.length)
    throw new Error(
      `Not every calculation is accepted: ${open.map((d) => d.name).join(', ')}.`,
    );
  const names = namesOf(read, subject.data);
  const proposal = subject.proposal.map((field) => field.id);
  return {
    fingerprint: fingerprintOf(set),
    accepted: set.definitions.filter((d) => d.approvedAt).length,
    calculations: numbers.map(({ id, name, text }) => ({ id, name, text })),
    rows: records.keys.map((key) => {
      // Each value as a later calculation reads it, in order.
      const values: Row = {};
      const cells: Record<string, Cell> = {};
      for (const definition of numbers) {
        const context = contextFor(
          read,
          key,
          subject,
          givenOf(definition, {}),
          values,
        );
        try {
          const value = run(definition.formula!, context);
          values[definition.id] = value;
          cells[definition.id] = {
            value: settled(value),
            error: settled(value) === null ? 'It gave no number.' : null,
            steps: stepsFor(definition.formula!, context, proposal),
          };
        } catch (error) {
          cells[definition.id] = {
            value: null,
            error: (error as Error).message.split('\n')[0]!,
            steps: [],
          };
        }
      }
      return { key, name: names[key] ?? '', values: cells };
    }),
  };
}

/*
  The model's answer, built from what is asked: one entry per record, its key
  one of the records' keys, and every value under its own id. A key and a
  value's id cannot be swapped or left out; only a record answered twice or
  not at all is left to check.
*/
type CrossAnswer = {
  records: {
    key: string;
    values: Record<string, { value: number; working: string }>;
  }[];
};

const answerSchema = (
  subject: DefinitionSubject,
  keys: [string, ...string[]],
  calculations: Calculation['calculations'],
) =>
  z.object({
    records: z
      .array(
        z.object({
          key: z.enum(keys).describe(`The ${subject.record.singular}'s key`),
          values: z.object(
            Object.fromEntries(
              calculations.map((c) => [
                c.id,
                z
                  .object({
                    value: z.number(),
                    working: z
                      .string()
                      .describe(
                        'How it was worked out, with the numbers, in one line',
                      ),
                  })
                  .describe(c.name),
              ]),
            ),
          ),
        }),
      )
      .describe(`One entry per ${subject.record.singular}`),
  }) as unknown as z.ZodType<CrossAnswer>;

// How the declared tabs fit together, in words: which hold a record's
// columns, joined by its key, and which are looked up through a column.
export const layoutOf = ({ record, data }: DefinitionSubject) =>
  [
    `Each ${record.singular} is one row in each of ${data.records.tabs.join(', ')}, matched by the ${data.records.key} column.`,
    ...data.lookups.map(
      (lookup) =>
        `Its ${lookup.tab} row is the one whose ${lookup.key} is the ${record.singular}'s ${lookup.via}.`,
    ),
  ].join('\n');

export type CrossCell = {
  model: number;
  working: string;
  agrees: boolean;
};

export type CrossCheck = {
  fingerprint: string;
  readId: string;
  model: string;
  at: string;
  cells: Record<string, Record<string, CrossCell>>;
  agreed: number;
  total: number;
};

// Equal to two decimal places: the model writes 80.3 where code has 80.3000…
const agree = (a: number, b: number) =>
  Math.round(a * 100) === Math.round(b * 100);

// The read with only these records' rows in its record tabs; a lookup tab
// stays whole, as any record may reach any row of it.
export function onlyRecords(
  read: KeptRead,
  subject: DefinitionSubject,
  keys: string[],
): KeptRead {
  const { tabs, key } = subject.data.records;
  return {
    ...read,
    tabs: read.tabs.map((tab) => {
      if (!tabs.includes(tab.name)) return tab;
      const [header = [], ...rows] = tab.values;
      const at = header.map(String).indexOf(key);
      return {
        ...tab,
        values: [
          header,
          ...rows.filter((row) => keys.includes(String(row[at]))),
        ],
      };
    }),
  };
}

// One call's answer, held to exactly the records it was asked about.
export async function crossCheckBatch(
  owner: DefinitionProcess,
  calculation: Calculation,
  read: KeptRead,
  text: string,
  keys: [string, ...string[]],
  models: DraftingModel[],
  resolve: Resolve | undefined,
  record?: RecordAttempt,
): Promise<{ cells: CrossCheck['cells']; model: string }> {
  const { subject } = owner;
  const { singular, plural } = subject.record;
  const { output, model } = await ask(
    models,
    answerSchema(subject, keys, calculation.calculations),
    [
      `You work out values for every ${singular} from the data, exactly as the instructions describe them.`,
      'Work from the instructions and the data alone, and read every number from the data rather than assuming it.',
      `Answer once for every ${singular} asked for, giving each value as a number. Keep decimals as they come unless the instructions say to round.`,
      `For each value, say in one line how you worked it out, with the numbers. ${plain(subject)}`,
    ].join('\n'),
    [
      `Instructions:\n${text}`,
      `The values to work out, in order; a later one may use an earlier one:\n${calculation.calculations
        .map((c) => `- ${c.id} (${c.name}): ${c.text}`)
        .join('\n')}`,
      `The ${plural} to work them out for: ${keys.join(', ')}.`,
      `How the data fits together:\n${layoutOf(subject)}`,
      `The data, by ${sourceOf(subject.data).resource.singular}, a header row then one row per line:\n${dataOf(onlyRecords(read, subject, keys))}`,
    ].join('\n\n'),
    'cross-check',
    resolve,
    record && {
      record,
      purpose: 'cross-check',
      asked: { records: keys, values: calculation.calculations.length },
      judged: (answer) => {
        const { cells, problems } = heldTo(answer);
        return {
          refused: problems.length > 0,
          answer: {
            records: Object.keys(cells).length,
            agreed: Object.values(cells)
              .flatMap((values) => Object.values(values))
              .filter((cell) => cell.agrees).length,
            problems: problems.length,
          },
        };
      },
    },
  );
  const { cells, problems } = heldTo(output);
  if (problems.length)
    throw new Error(
      `The model's answer does not cover every ${singular} once: ${problems.slice(0, 3).join('; ')}.`,
    );
  return { cells, model };

  // Every record asked for exactly once; the schema holds each one's values.
  function heldTo(output: {
    records: {
      key: string;
      values: Record<string, { value: number; working: string } | undefined>;
    }[];
  }) {
    const problems: string[] = [];
    const cells: CrossCheck['cells'] = {};
    for (const answer of output.records) {
      if (!keys.includes(answer.key))
        problems.push(`${answer.key} is not asked for`);
      else if (cells[answer.key])
        problems.push(`${answer.key} is answered twice`);
      else {
        const row = calculation.rows.find((r) => r.key === answer.key)!;
        cells[answer.key] = Object.fromEntries(
          calculation.calculations.map((c) => {
            const given = answer.values[c.id];
            const engine = row.values[c.id]!.value;
            if (!given) problems.push(`${answer.key} has no ${c.id}`);
            return [
              c.id,
              {
                model: given?.value ?? Number.NaN,
                working: given?.working ?? '',
                agrees:
                  given !== undefined &&
                  engine !== null &&
                  agree(engine, given.value),
              },
            ];
          }),
        );
      }
    }
    const missing = keys.filter((key) => !cells[key]);
    if (missing.length)
      problems.push(
        `${missing.length} not answered (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', …' : ''})`,
      );
    return { cells, problems };
  }
}
