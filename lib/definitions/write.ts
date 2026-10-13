import { google } from '@ai-sdk/google';
import { generateText, isStepCount, tool, ToolChoiceViolationError } from 'ai';
import { z } from 'zod';

import type { DefinitionSubject } from '@/lib/process/model';
import { fallbackChain } from '@/lib/models';

import { DRAFT_MODELS, withModels } from './calls';
import {
  dependentsOf,
  givenOf,
  KIND_WORDS,
  celOf,
  review,
  scopeOf,
  settingOf,
  valuesFor,
  type Draft,
  type Setting,
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
  Definition,
  DefinitionProcess,
  DefinitionSet,
  Example,
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
*/

// A write's tool calls: room to check, try and fix several times over.
const STEPS = 12;

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

export async function writeDefinition(
  owner: DefinitionProcess,
  text: string,
  read: KeptRead,
  id: string,
  { model: chosen = null, resolve }: Asking = {},
): Promise<DefinitionSet | null> {
  fitting(read, owner.subject.data);
  const set = await loadSet(owner, text);
  const definition = set?.definitions.find((d) => d.id === id);
  if (!set || !definition) return null;
  const setting = settingOf(owner, text, set, read, definition);
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
    chosen ? fallbackChain(chosen) : DRAFT_MODELS,
    `write-${id}`,
    resolve ?? google,
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

  const result = kept;
  // Why the last answer was not kept, when it was not.
  const unkept = blocked ?? (last ?? ['No answer was checked.']).join(' ');
  if (!result)
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
              ...result.written,
              examples: result.examples,
              // Its own problem, and what stopped a later answer, if any.
              problem:
                [result.problem, blocked].filter(Boolean).join(' ') || null,
              model,
              approvedAt: null,
              deniedAt: null,
              denial: null,
            }
          : dependents.has(d.id)
            ? { ...d, approvedAt: null }
            : d,
      ),
    };
  });
}
