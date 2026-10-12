import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import type { DefinitionSubject } from '@/lib/process/model';
import { fallbackChain, type DraftingModel } from '@/lib/rulebook/models';

import { ask, DRAFT_MODELS, type Resolve } from './calls';
import { givenOf } from './checks';
import { contextFor, run } from './formulas';
import { dataOf, plain } from './prompts';
import { fitting, namesOf, type KeptRead, type Row } from './records';
import { hashOf } from './store';
import type { Definition, DefinitionProcess, DefinitionSet } from './types';
import { stepsFor } from './working';

/*
  Server-only. Calculate: every accepted calculation worked out by code for
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

// The exact accepted rulebook: any change to what was accepted changes it.
export const fingerprintOf = (set: DefinitionSet) =>
  hashOf(
    JSON.stringify(
      set.definitions
        .filter((d) => d.approvedAt)
        .map((d) => [d.id, d.formula, d.constants, d.groups, d.approvedAt]),
    ),
  );

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
  const { subject } = owner;
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
const layoutOf = ({ record, data }: DefinitionSubject) =>
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

export async function crossCheck(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  readId: string,
  text: string,
  {
    model: chosen = null,
    resolve,
  }: { model?: DraftingModel | null; resolve?: Resolve } = {},
): Promise<CrossCheck> {
  const { subject } = owner;
  const calculation = calculate(owner, set, read);
  const keys = calculation.rows.map((row) => row.key);
  const [first, ...rest] = keys;
  if (first === undefined) throw new Error('The read has no records.');
  const { singular, plural } = subject.record;
  const { output, model } = await ask(
    chosen ? fallbackChain(chosen) : DRAFT_MODELS,
    answerSchema(subject, [first, ...rest], calculation.calculations),
    [
      `You work out values for every ${singular} from the data, exactly as the instructions describe them.`,
      'Work from the instructions and the data alone, and read every number from the data rather than assuming it.',
      `Answer once for every ${singular}, giving each value as a number. Keep decimals as they come unless the instructions say to round.`,
      `For each value, say in one line how you worked it out, with the numbers. ${plain(subject)}`,
    ].join('\n'),
    [
      `Instructions:\n${text}`,
      `The values to work out, in order; a later one may use an earlier one:\n${calculation.calculations
        .map((c) => `- ${c.id} (${c.name}): ${c.text}`)
        .join('\n')}`,
      `The ${plural} to work them out for: ${keys.join(', ')}.`,
      `How the data fits together:\n${layoutOf(subject)}`,
      `The data, by tab, a header row then one row per line:\n${dataOf(read)}`,
    ].join('\n\n'),
    'cross-check',
    resolve,
  );
  // Every record exactly once; the schema holds each record's values.
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
  if (problems.length)
    throw new Error(
      `The model's answer does not cover every ${singular} once: ${problems.slice(0, 3).join('; ')}.`,
    );
  const all = Object.values(cells).flatMap((row) => Object.values(row));
  return {
    fingerprint: calculation.fingerprint,
    readId,
    model,
    at: new Date().toISOString(),
    cells,
    agreed: all.filter((cell) => cell.agrees).length,
    total: all.length,
  };
}

/*
  A cross-check is kept beside the reads, by read and rulebook: it costs a
  model call, and the same read on the same rulebook would give the same
  answer to compare. Written beside the file and renamed over it.
*/
const crossFile = (owner: DefinitionProcess, readId: string, fp: string) => {
  // Both name a file: never a path.
  if (![readId, fp].every((part) => /^[\w-]+$/.test(part)))
    throw new Error('Not a read or rulebook id.');
  return path.join(
    process.cwd(),
    '.rulebook-reads',
    owner.id,
    'crosschecks',
    `${readId}-${fp}.json`,
  );
};

const keptSchema = z.object({
  fingerprint: z.string(),
  readId: z.string(),
  model: z.string(),
  at: z.string(),
  cells: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({ model: z.number(), working: z.string(), agrees: z.boolean() }),
    ),
  ),
  agreed: z.number(),
  total: z.number(),
});

export async function keepCrossCheck(
  owner: DefinitionProcess,
  check: CrossCheck,
): Promise<void> {
  const file = crossFile(owner, check.readId, check.fingerprint);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(check, null, 2)}\n`);
  await rename(temporary, file);
}

export async function keptCrossCheck(
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
): Promise<CrossCheck | null> {
  try {
    const raw = await readFile(crossFile(owner, readId, fingerprint), 'utf8');
    const parsed = keptSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
