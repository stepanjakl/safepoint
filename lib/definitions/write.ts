import { generateText, isStepCount, tool, ToolChoiceViolationError } from 'ai';
import { z } from 'zod';

import type { DefinitionSubject } from '@/lib/process/model';
import { fallbackChain, type DraftingModel } from '@/lib/models';

import { WRITE_MODELS, withModels } from './calls';
import { limitedGoogle } from './limits';
import {
  dependentsOf,
  givenOf,
  KIND_WORDS,
  celOf,
  differencesBetween,
  review,
  scopeOf,
  settingOf,
  valuesFor,
  type Draft,
  type Setting,
  readsName,
} from './checks';
import type { Asking } from './find';
import { checkFormula, contextFor, describe, run } from './formulas';
import {
  dataOf,
  describeExample,
  describeWritten,
  plain,
  proposalWords,
} from './prompts';
import { fitting, type KeptRead } from './records';
import { loadSet, updateSet } from './store';
import type {
  Agreement,
  Definition,
  DefinitionProcess,
  DefinitionSet,
  Example,
  WrittenVersion,
} from './types';

/*
  Writing gives one definition a formula, the constants and groups it reads
  (each with the instructions' words it comes from), and two or three
  examples on real records. It is one conversation that checks itself: the
  model answers only through check_definition, which reviews the whole
  answer (checks.ts) and returns each problem, and may try_formula on a real
  record. It ends on a clean check, on a draft that reads a definition that
  does not work yet, when the same problems come back three times, or at the
  step limit. What the person said when they denied the last version is part
  of what the model is told.

  A draft writes each definition more than once (writeAgreed), with no write
  seeing another, and code compares how the versions behave. A model's examples
  come from the same reading as its formula, so they agree with a misreading;
  another write misreads differently, or not at all.
*/

// A write's tool calls: room to check, try and fix several times over.
const STEPS = 12;
// The writes a definition gets to find two that pass every check.
const WRITES_AT_MOST = 3;

// What one answer holds: built per definition, so a check's examples say
// whether it holds and a number's say the number, from one schema.
const writeSchema = (definition: Definition, subject: DefinitionSubject) =>
  z.object({
    constants: z
      .array(
        z.object({
          id: z.string().describe('snake_case, named for what it is'),
          value: z.number(),
          quote: z
            .string()
            .describe('The exact words of the instructions it comes from'),
        }),
      )
      .describe('Every number the formula uses, other than 0, 1 and 100'),
    groups: z
      .array(
        z.object({
          id: z
            .string()
            .describe('snake_case, named for what they have in common'),
          keys: z.array(z.string()),
          quote: z
            .string()
            .describe('The exact words of the instructions that name them'),
        }),
      )
      .describe(
        `${subject.record.plural} the instructions name in words, as their keys`,
      ),
    formula: z
      .string()
      .describe(
        definition.result === 'check'
          ? 'CEL, true when it holds'
          : 'CEL, giving the number',
      ),
    examples: z
      .array(
        z.object({
          key: z.string().describe(`The ${subject.record.singular}'s key`),
          inputs: z.object(
            Object.fromEntries(
              subject.proposal.map((field) => [
                field.id,
                z
                  .number()
                  .int()
                  .nullable()
                  .describe(
                    `The proposed ${field.label}, in ${field.unit}, where the formula reads it; otherwise null`,
                  ),
              ]),
            ),
          ),
          result:
            definition.result === 'check'
              ? z.boolean().describe('Whether it holds')
              : z.number().describe('The number'),
          why: z.string().describe('Why, in plain words, with the numbers'),
        }),
      )
      .min(2)
      .max(5),
  });

type Answer = z.infer<ReturnType<typeof writeSchema>>;

// An answer as the review reads it: inputs the model left null are unset.
const draftOf = (answer: Answer): Draft => ({
  formula: answer.formula,
  constants: answer.constants,
  groups: answer.groups,
  examples: answer.examples.map((e) => ({
    key: e.key,
    inputs: Object.fromEntries(
      Object.entries(e.inputs).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number',
      ),
    ),
    expect: e.result as boolean | number,
    why: e.why,
  })),
});

function instructionsFor(setting: Setting) {
  const { owner, read, definition } = setting;
  const { subject } = owner;
  const { plural } = subject.record;
  return [
    'You write the formula for one definition of a process, and two to five examples that show it working.',
    describe(read, subject),
    definition.result === 'check'
      ? `The formula is true when it holds: the proposal is fine as far as this check goes. Give examples on real ${plural} where it holds (result: true) and where it does not (result: false), with a proposed ${proposalWords(subject)} that makes the point.`
      : `The formula gives the number. Give examples on real ${plural}.`,
    'Follow the instructions literally. Never add a condition, a record or a number they do not state, and never special-case an example to make it come out.',
    `Every number the formula needs, other than 0, 1 and 100, is a constant: give it an id, its value and the instructions' exact words it comes from, and read it as constants.<id>. Write no other number into the formula.`,
    `Quote, for each constant, the words that state its number (07:00, Saturday, 40%, four), not merely words near it.`,
    `Where the instructions name ${plural} in words, list them as a group: the keys they are and the instructions' exact words that name them, read as groups.<id>. Never write a key into the formula. Give examples both in and outside every group the formula reads.`,
    'Write the formula as the instructions put it, step by step, so a person can follow it, and do not fold the arithmetic together.',
    'Work each example out by hand from the data below, not from your formula: the examples are how a person checks the formula. try_formula runs a formula on one real record. Answer by calling check_definition with your whole answer; when it reports problems, fix them and call it again, until it returns ok.',
    plain(subject),
  ].join('\n');
}

/*
  What the definitions already written come to, record by record. Told only what
  they mean, a model works them out again by hand for its examples, gets them
  wrong, and argues with a right formula. Those that depend on what is proposed
  are left out: they have no one value.
*/
function workedOutFor(setting: Setting) {
  const { set, read, records, definition, working, owner } = setting;
  const { subject } = owner;
  const fields = subject.proposal.map((field) => field.id);
  const numbers = working.filter(
    (d) =>
      d.result === 'number' &&
      !fields.some((field) => readsName(d.formula!, field)),
  );
  if (!numbers.length) return '';
  return `What those come to for each ${subject.record.singular}, worked out by the app. Use these in your examples; do not work them out again:\n${records.keys
    .map((key) => {
      const values = valuesFor(set, read, key, {}, definition.id, subject);
      return `- ${key}: ${numbers.map((d) => `${d.id} = ${String(values[d.id])}`).join(', ')}`;
    })
    .join('\n')}`;
}

function promptFor(setting: Setting) {
  const { text, definition, working, broken, sample, records, read, owner } =
    setting;
  const { plural } = owner.subject.record;
  const denied = definition.deniedAt
    ? `The person denied your last version${definition.denial ? `, saying: "${definition.denial}"` : ''}. It was:\n${describeWritten(definition)}\nwith these examples:\n${definition.examples
        .map(
          (e) =>
            `- ${describeExample(e, owner.subject)}: ${String(e.expect)} (${e.why})`,
        )
        .join('\n')}`
    : '';
  return [
    `Instructions:\n${text}`,
    `Definitions already written, which you may read as values.<id>:\n${
      working
        .map(
          (d) => `- ${d.id} (${KIND_WORDS[celOf(sample[d.id], d)]}): ${d.text}`,
        )
        .join('\n') || 'none'
    }`,
    broken.length
      ? `Not working yet, so never read: ${broken.map((d) => d.id).join(', ')}.`
      : '',
    `Write: ${definition.id}, ${definition.text}${definition.consequence ? ` (failing it ${definition.consequence === 'block' ? 'blocks the proposal' : 'needs a person to decide'})` : ''}`,
    workedOutFor(setting),
    `${plural[0]!.toUpperCase()}${plural.slice(1)}: ${records.keys.join(', ')}`,
    `The data:\n${dataOf(read)}`,
    denied,
  ]
    .filter(Boolean)
    .join('\n\n');
}

// The latest answer whose formula ran on its examples: what is kept when no
// answer comes out clean, so what is shown and what is said about it match.
type Kept = {
  written: Pick<Definition, 'formula' | 'constants' | 'groups' | 'uses'>;
  examples: Example[];
  problem: string | null;
};

type Written = {
  kept: Kept | null;
  // Whether the last answer passed every check.
  clean: boolean;
  // Why the last answer was not kept, when it was not.
  unkept: string;
  // What stopped a later answer, if anything.
  blocked: string | null;
  model: DraftingModel;
};

// One write: asks the model, and saves nothing.
async function writeOnce(
  setting: Setting,
  { model: chosen = null, resolve }: Asking,
): Promise<Written> {
  const { owner, read, definition, set } = setting;
  const { id } = definition;
  const schema = writeSchema(definition, owner.subject);

  // Set by the tools while the conversation runs.
  let kept = null as Kept | null;
  let last = null as string[] | null;
  let same = 0;
  let blocked = null as string | null;

  const tools = {
    try_formula: tool({
      description: `Run a formula on one real ${owner.subject.record.singular} and see what it gives, or the exact error. Use it to work out an example, or to find why one disagrees.`,
      inputSchema: z.object({
        formula: z.string(),
        key: z.string(),
        inputs: z
          .record(z.string(), z.number().int())
          .describe(`The proposed ${proposalWords(owner.subject)}, by id`)
          .default({}),
        constants: schema.shape.constants.default([]),
        groups: schema.shape.groups.default([]),
      }),
      execute: async ({ formula, key, inputs, constants, groups }) => {
        const written = { constants, groups };
        const typed = checkFormula(
          read,
          owner.subject,
          scopeOf(setting, written),
          definition.result,
          formula,
        );
        if (typed) return { ok: false, error: typed };
        try {
          const value = run(
            formula,
            contextFor(
              read,
              key,
              owner.subject,
              givenOf(written, inputs),
              valuesFor(set, read, key, inputs, definition.id, owner.subject),
            ),
          );
          return {
            ok: true,
            value: typeof value === 'bigint' ? Number(value) : value,
          };
        } catch (error) {
          return { ok: false, error: (error as Error).message.split('\n')[0] };
        }
      },
    }),
    check_definition: tool({
      description:
        'Check your complete answer: the formula against what it may read, every number and name against the instructions, and every example run on the data. Returns ok, or each problem to fix. Answer only through this tool, until it returns ok.',
      inputSchema: schema,
      execute: async (answer: Answer) => {
        const draft = draftOf(answer);
        const { problems, ran, blocked: reads } = review(setting, draft);
        if (reads) blocked = reads;
        if (ran)
          kept = {
            written: {
              formula: draft.formula,
              constants: draft.constants,
              groups: draft.groups,
              uses: ran.uses,
            },
            examples: ran.examples,
            problem: ran.problem,
          };
        same =
          last && JSON.stringify(last) === JSON.stringify(problems)
            ? same + 1
            : 1;
        last = problems;
        return problems.length ? { ok: false, problems } : { ok: true };
      },
    }),
  };

  const { model } = await withModels(
    chosen ? fallbackChain(chosen) : WRITE_MODELS,
    `write-${id}`,
    resolve ?? limitedGoogle,
    async (languageModel, options) => {
      try {
        await generateText({
          model: languageModel,
          system: instructionsFor(setting),
          prompt: promptFor(setting),
          tools,
          stopWhen: [
            isStepCount(STEPS),
            () => last !== null && last.length === 0,
            () => blocked !== null,
            () => same >= 3,
          ],
          prepareStep: ({ stepNumber }) => ({
            toolChoice:
              stepNumber === 0
                ? { type: 'tool' as const, toolName: 'check_definition' }
                : ('required' as const),
          }),
          timeout: { stepMs: 180_000, totalMs: 900_000 },
          ...options,
        });
      } catch (error) {
        // An answer in text rather than through the check ends the
        // conversation; what was checked so far stands.
        if (!ToolChoiceViolationError.isInstance(error)) throw error;
      }
    },
  );

  return {
    kept,
    clean: last !== null && last.length === 0,
    unkept: blocked ?? (last ?? ['No answer was checked.']).join(' '),
    blocked,
    model,
  };
}

const settingFor = async (
  owner: DefinitionProcess,
  text: string,
  read: KeptRead,
  id: string,
) => {
  fitting(read, owner.subject.data);
  const set = await loadSet(owner, text);
  const definition = set?.definitions.find((d) => d.id === id);
  return set && definition
    ? settingOf(owner, text, set, read, definition)
    : null;
};

// Keeps a write, or says why there is nothing to keep.
function keep(
  { owner, text, read, definition }: Setting,
  written: Written,
  agreement: Agreement | null,
  note: string | null = null,
) {
  const { id } = definition;
  const { kept, unkept, model } = written;
  if (!kept)
    return updateSet(owner, text, (s) => ({
      ...s,
      definitions: s.definitions.map((d) =>
        d.id === id
          ? {
              ...d,
              problem: d.formula
                ? `No new version passed: ${unkept} The version shown is the one before.`
                : unkept,
            }
          : d,
      ),
    }));
  return updateSet(owner, text, (s) => {
    // A rewritten definition may change any that reads it.
    const dependents = dependentsOf(s, id);
    return {
      ...s,
      readId: read.id,
      definitions: s.definitions.map((d) =>
        d.id === id
          ? {
              ...d,
              ...kept.written,
              examples: kept.examples,
              // Its own problem, and what stopped a later answer, if any.
              problem:
                [kept.problem, written.blocked, note]
                  .filter(Boolean)
                  .join(' ') || null,
              model,
              approvedAt: null,
              deniedAt: null,
              denial: null,
              agreement,
            }
          : dependents.has(d.id)
            ? { ...d, approvedAt: null }
            : d,
      ),
    };
  });
}

// One write, kept as it stands.
export async function writeDefinition(
  owner: DefinitionProcess,
  text: string,
  read: KeptRead,
  id: string,
  asking: Asking = {},
): Promise<DefinitionSet | null> {
  const setting = await settingFor(owner, text, read, id);
  if (!setting) return null;
  return keep(setting, await writeOnce(setting, asking), null);
}

const draftOfKept = (kept: Kept): Draft => ({
  formula: kept.written.formula!,
  constants: kept.written.constants,
  groups: kept.written.groups,
  examples: kept.examples,
});

const versionOf = ({ kept, model }: Written): WrittenVersion => ({
  formula: kept!.written.formula!,
  constants: kept!.written.constants,
  groups: kept!.written.groups,
  uses: kept!.written.uses,
  examples: kept!.examples,
  model,
});

export type WriteRuns = { onRun?: (run: number) => void | Promise<void> };

/*
  Writes a definition until two writes have passed every check, each from the same
  input, and compares how those two behave. If they agree, the first is kept. If
  not, a person chooses, because a vote does not settle it: over three drafts, the
  two-of-three answer was wrong on 2 of 6 such rules, the same misreading coming up
  twice, and there was no wrong rule where the first two agreed.
*/
export async function writeAgreed(
  owner: DefinitionProcess,
  text: string,
  read: KeptRead,
  id: string,
  { onRun, ...asking }: Asking & WriteRuns = {},
): Promise<DefinitionSet | null> {
  const setting = await settingFor(owner, text, read, id);
  if (!setting) return null;
  const writes: Written[] = [];
  const passed = () => writes.filter((w) => w.clean && w.kept);
  let stopped: string | null = null;
  for (let run = 1; run <= WRITES_AT_MOST && passed().length < 2; run += 1) {
    await onRun?.(run);
    try {
      writes.push(await writeOnce(setting, asking));
    } catch (error) {
      // Nothing to show for it, so there is nothing to keep: say so as before.
      if (!passed().length) throw error;
      stopped = (error as Error).message.split('\n')[0]!;
      break;
    }
  }
  const clean = passed();
  const runs = writes.length;
  const versions = clean.map(versionOf);
  if (clean.length === 2) {
    const differences = differencesBetween(
      setting,
      draftOfKept(clean[0]!.kept!),
      draftOfKept(clean[1]!.kept!),
    );
    return keep(setting, clean[0]!, {
      status: differences.length ? 'split' : 'agreed',
      runs,
      versions,
      differences,
    });
  }
  if (clean.length === 1)
    return keep(
      setting,
      clean[0]!,
      { status: 'unconfirmed', runs, versions, differences: [] },
      stopped ? `Could not be compared: ${stopped}` : null,
    );
  // None passed: the last answer kept, with what was wrong with it.
  return keep(setting, writes.at(-1)!, null);
}
