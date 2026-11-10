import { generateText, isStepCount, tool, ToolChoiceViolationError } from 'ai';
import { z } from 'zod';

import type { DefinitionSubject, Moment } from '@/lib/process/model';
import { fallbackChain, type DraftingModel } from '@/lib/models';

import { DRAFT_MODELS, WRITE_MODELS, withModels } from './calls';
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
import { fitting, READ, START, type KeptRead } from './records';
import {
  canonicalShape,
  formulaOf,
  momentTimes,
  referencesOf,
  sameShape,
  sentenceOf,
  shapeColumn,
  shapeProblems,
  shapeSchema,
  withoutUnused,
  type Shape,
  type ShapeContext,
} from './shapes';
import { ownerFor } from './profile';
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
// Refusals after which a draft with no model chosen writes once on the
// drafting model, compared with a shape written before if there is one; its
// refusal stands. In three drafts Flash-Lite refused a rule it had shaped in
// another, and two Flash writes for each of three rules spent most of its 20
// a day.
const REFUSALS_BEFORE_STRONGER = 2;
const STRONGER_WRITES = 1;

/*
  The only reasons a rule may fit no shape. A refusal is cheap for a model,
  one request where a shape takes several, so it must name what the shapes
  lack, and it stands only when no write finds a shape (writeAgreed).
*/
const REFUSALS = [
  'needs_or',
  'needs_other_arithmetic',
  'needs_missing_data',
] as const;
type Refusal = (typeof REFUSALS)[number];
const REFUSAL_WORDS: Record<Refusal, string> = {
  needs_or: 'it joins conditions with “or”',
  needs_other_arithmetic: 'it needs arithmetic no shape has',
  needs_missing_data: 'it needs something the data does not have',
};

// What shapes can do, said back to a refusal according to its reason.
const REMINDERS: Record<Refusal, string> = {
  needs_or:
    'Before refusing: is the "or" only the exception for proposing nothing? Code adds that, so the rest is one shape. Is it an "or" between records? Then scope may limit the rule to a group or to conditions. If the rule still needs "or", refuse again.',
  needs_other_arithmetic:
    'Before refusing, what shapes can do: compare the proposed field with a number, at most or at least (limit); require whole multiples (step); add the proposed field to a base and compare with a target, plus a margin in percent (target, margin_pct); compare two numbers, test a yes/no column, or put one moment before or after another, the start or the read (only_when, flag). Whether a moment has passed by the read is moment:<moment> before moment:read. If one of these says the rule, give that shape; otherwise refuse again.',
  needs_missing_data:
    "Before refusing, what shapes can read: every column listed, each lookup column as <lookup>.<column>, every earlier value as value:<id>, constants with the instructions' words, and the moments listed, with start and read. If what the rule reads is among these, give the shape; otherwise refuse again.",
};

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
    ...(definition.result === 'check'
      ? {
          shape: shapeSchema
            .nullable()
            .describe('The rule as one shape; null only when none fits'),
          none_fits: z
            .object({
              reason: z.enum(REFUSALS),
              explain: z
                .string()
                .describe('Which words of the rule no shape can say, and why'),
            })
            .nullable()
            .describe(
              'Only when no shape can say the rule; null when one does',
            ),
        }
      : { formula: z.string().describe('CEL, giving the number') }),
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
                    `The proposed ${field.label}, in ${field.unit}, where the rule reads it; otherwise null`,
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
      // A refusal has nothing to show; a shape's review asks for examples
      // where it holds and where it fails.
      .min(definition.result === 'check' ? 0 : 2)
      .max(5),
  });

// A number's answer has a formula; a check's a shape, or why none fits.
type Answer = Omit<
  z.infer<ReturnType<typeof writeSchema>>,
  'formula' | 'shape' | 'none_fits'
> & {
  formula?: string;
  shape?: Shape | null;
  none_fits?: { reason: Refusal; explain: string } | null;
};

// An answer as the review reads it: inputs the model left null are unset.
// A check's formula is the one code wrote from its shape.
const draftOf = (answer: Answer, formula = answer.formula ?? ''): Draft => ({
  formula,
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

// The kinds a shape tells apart, in words.
const TYPE_WORDS: Record<string, string> = {
  int: 'number',
  double: 'number',
  bool: 'yes/no',
  string: 'text',
};

const MOMENT_KINDS: Record<Moment['kind'], string> = {
  observed: 'the last time it came round by when the data was read',
  deadline: 'the last time it comes round before the planned period starts',
  next: 'the first time it comes round after the data was read',
};

/*
  What a shape may name, from the process's declaration and the read: the
  columns with their kinds, the moments, the proposal's fields. A model
  choosing from these cannot invent a column, and never sees how a moment is
  kept, so it cannot get a sign the wrong way round.
*/
function shapeMaterials(setting: Setting) {
  const { owner, records, earlier } = setting;
  const { subject } = owner;
  const { data } = subject;
  const times = momentTimes(
    shapeContextFor(setting, { constants: [], groups: [] }),
  );
  const values = earlier.filter((d) => d.result === 'number');
  const listed = (columns: Record<string, string>, prefix = '') =>
    Object.entries(columns)
      .filter(([name]) => shapeColumn(name, subject))
      .map(([name, type]) => `${prefix}${name} (${TYPE_WORDS[type] ?? type})`)
      .join(', ');
  const moments = data.timing
    ? [
        `- ${START}: when the planned period starts${times.start ? `, ${times.start}` : ''}`,
        `- ${READ}: when the data was read${times.read ? `, ${times.read}` : ''}`,
        ...Object.entries(data.timing.moments ?? {}).map(
          ([name, m]) =>
            `- ${name}: ${m.day} at ${m.time}, ${MOMENT_KINDS[m.kind]}${m.kind === 'observed' ? '; hours_since may read it' : ''}`,
        ),
      ]
    : [];
  return [
    `Columns of a ${subject.record.singular}: ${listed(records.types.record)}.`,
    ...data.lookups.map(
      (lookup) =>
        `Columns of its ${lookup.tab} row, named ${lookup.as}.<column>: ${listed(records.types.lookups[lookup.as] ?? {}, `${lookup.as}.`)}.`,
    ),
    values.length
      ? `Earlier values, named value:<id>: ${values.map((d) => `value:${d.id} (${d.name})`).join(', ')}. Read them as they are; never work them out again.`
      : 'There are no earlier values.',
    `Proposal fields, named proposed:<field>: ${subject.proposal.map((f) => `proposed:${f.id} (the ${f.label}, in ${f.unit})`).join(', ')}.`,
    moments.length
      ? `Moments, put before or after one another as moment:<moment>:\n${moments.join('\n')}`
      : 'There are no moments.',
  ].join('\n');
}

function shapeInstructionsFor(setting: Setting) {
  const { owner, definition } = setting;
  const { subject } = owner;
  const { plural } = subject.record;
  const nothing = subject.proposal
    .filter((f) => f.none !== undefined)
    .map((f) => `${f.id} ${f.none}`);
  return [
    'You turn one rule of a process into one fixed shape. Code writes its formula and a plain sentence from the shape, so choose what the rule says, not how to compute it. Give two to five examples that show it working.',
    'Shapes, each about the proposal for one record:',
    '- limit: the proposed field is at most, or at least, a number.',
    '- step: the proposed field is a whole multiple of a number.',
    '- only_when: something may be proposed only when every condition holds.',
    '- target: a number there already is (base) plus the proposed field reaches, or does not exceed, a target, optionally plus a margin in percent.',
    `- flag: ${definition.consequence === 'decide' ? 'flag the record for a person when every condition holds, whatever is proposed.' : 'not for this rule: failing it stops the proposal.'}`,
    'A number is a column, an earlier definition (value), a constant, the proposed field, or the hours since a moment. A condition compares two numbers, tests a yes/no column, or puts one moment before or after another. Conditions are all joined by "and".',
    'The forms, with placeholders for names: amount "column:<column>"; a condition {left: "moment:<moment>", op: "before", right: "moment:start"}; {left: "column:<yes/no column>", op: "is_yes", right: null}; {left: "hours_since:<moment>", op: ">", right: "constant:<id>"}; a target with base "value:<id>", compare "reach", target "value:<id>", margin_pct "column:<lookup>.<column>".',
    `scope limits the rule to some ${plural}: a group, or conditions; null when it is about all of them. if_blank says what a ${subject.record.singular} with a blank cell the rule reads comes to: skip (the rule does not apply to it) or fail.`,
    nothing.length
      ? `Proposing nothing (${nothing.join(', ')}) always passes a rule that stops a proposal: code adds that, so never write it.`
      : '',
    'Almost every rule fits a shape. Only if the rule joins conditions with "or", needs arithmetic no shape has, or needs something the data does not have, give no shape and fill none_fits. Never bend a shape to fit.',
    'Follow the instructions literally. Never add a condition, a record or a number they do not state.',
    `Every number the rule needs is a constant: give it an id, its value and the instructions' exact words that state it, and name it as a constant.`,
    `Where the instructions name ${plural} in words, list them as a group: the keys and the instructions' exact words that name them.`,
    `check_definition answers with the sentence code wrote from your shape: read it, and fix the shape if it does not say what the rule says. Give examples on real ${plural} where it holds (result: true) and where it does not (result: false), worked out by hand from the data, with a proposal that makes the point. For a flag, result is false where the ${subject.record.singular} is flagged. try_shape runs a shape on one real ${subject.record.singular}. Answer by calling check_definition with your whole answer until it returns ok.`,
    shapeMaterials(setting),
    plain(subject),
  ]
    .filter(Boolean)
    .join('\n');
}

function instructionsFor(setting: Setting) {
  if (setting.definition.result === 'check')
    return shapeInstructionsFor(setting);
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
    `Quote, for each constant, the words that state its number, whether as a time of day, a weekday, a percentage or a number in words, not merely words near it.`,
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
  written: Pick<
    Definition,
    'formula' | 'constants' | 'groups' | 'uses' | 'shape' | 'unfit'
  >;
  // Why no shape fits, where the model said none does.
  refusal?: Refusal;
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

// What a shape is read against: the setting, with one write's own names.
const shapeContextFor = (
  setting: Setting,
  written: Pick<Definition, 'constants' | 'groups'>,
): ShapeContext => ({
  subject: setting.owner.subject,
  records: setting.records,
  read: setting.read,
  consequence: setting.definition.consequence,
  constants: written.constants,
  groups: written.groups,
  // Every definition before it, working or not, so a shape that reads one
  // still broken is told to wait for it rather than that it does not exist.
  earlier: setting.earlier,
});

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
  // Whether this write's first refusal has been answered with a reminder.
  let reminded = false;

  // Notes an answer's problems: the same ones three times over ends it.
  const noted = (problems: string[]) => {
    same =
      last && JSON.stringify(last) === JSON.stringify(problems) ? same + 1 : 1;
    last = problems;
  };
  const shapeContextOf = (written: Pick<Answer, 'constants' | 'groups'>) =>
    shapeContextFor(setting, written);
  // A value worked out on one real record, or the exact error.
  const tryOn = (
    formula: string,
    written: Pick<Answer, 'constants' | 'groups'>,
    key: string,
    inputs: Record<string, number>,
  ) => {
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
  };
  const tryInputs = {
    key: z.string(),
    inputs: z
      .record(z.string(), z.number().int())
      .describe(`The proposed ${proposalWords(owner.subject)}, by id`)
      .default({}),
    constants: schema.shape.constants.default([]),
    groups: schema.shape.groups.default([]),
  };

  const tools = {
    ...(definition.result === 'check'
      ? {
          try_shape: tool({
            description: `Run a shape on one real ${owner.subject.record.singular}: whether it holds, with the sentence code writes from it, or what is wrong with it.`,
            inputSchema: z.object({ shape: shapeSchema, ...tryInputs }),
            execute: async ({ shape, key, inputs, constants, groups }) => {
              const written = { constants, groups };
              const context = shapeContextOf(written);
              const wrong = shapeProblems(shape, context);
              if (wrong.length) return { ok: false, problems: wrong };
              return {
                ...tryOn(formulaOf(shape, context), written, key, inputs),
                sentence: sentenceOf(shape, context),
              };
            },
          }),
        }
      : {
          try_formula: tool({
            description: `Run a formula on one real ${owner.subject.record.singular} and see what it gives, or the exact error. Use it to work out an example, or to find why one disagrees.`,
            inputSchema: z.object({ formula: z.string(), ...tryInputs }),
            execute: async ({ formula, key, inputs, constants, groups }) =>
              tryOn(formula, { constants, groups }, key, inputs),
          }),
        }),
    check_definition: tool({
      description:
        'Check your complete answer: every name and number against the instructions and the data, and every example run on the data. Returns ok, or each problem to fix. Answer only through this tool, until it returns ok.',
      inputSchema: schema,
      execute: async (given: Answer) => {
        let answer = given;
        let formula = answer.formula ?? '';
        let sentence: string | null = null;
        // What a shape never reads is not kept, and the model is told.
        const dropped: string[] = [];
        if (definition.result === 'check') {
          // A first refusal is answered with what shapes can do for its
          // reason: in two drafts, every wrong refusal claimed a shape lacked
          // something it has. A second refusal stands.
          if (!answer.shape && answer.none_fits && !reminded) {
            reminded = true;
            const reminder = [REMINDERS[answer.none_fits.reason]];
            noted(reminder);
            return { ok: false, problems: reminder };
          }
          // No shape fits: the answer, kept with its reason and no formula.
          if (!answer.shape && answer.none_fits) {
            kept = {
              written: {
                formula: null,
                constants: [],
                groups: [],
                uses: [],
                shape: null,
                unfit: answer.none_fits.explain,
              },
              examples: [],
              problem: null,
              refusal: answer.none_fits.reason,
            };
            noted([]);
            return { ok: true };
          }
          const asked = shapeContextOf(given);
          const wrong = given.shape
            ? shapeProblems(withoutUnused(given.shape), asked)
            : ['Give a shape, or say in none_fits why none fits.'];
          if (wrong.length) {
            noted(wrong);
            return { ok: false, problems: wrong };
          }
          // Read, then kept in its canonical spelling with only the constants
          // and group it names: the rest could only fail checks about them.
          const shape = canonicalShape(given.shape!, asked);
          const reads = referencesOf(shape, asked)!;
          answer = {
            ...given,
            shape,
            constants: given.constants.filter((c) =>
              reads.constants.includes(c.id),
            ),
            groups: given.groups.filter((g) => g.id === reads.group),
          };
          dropped.push(
            ...given.constants
              .filter((c) => !reads.constants.includes(c.id))
              .map((c) => `constant ${c.id}`),
            ...given.groups
              .filter((g) => g.id !== reads.group)
              .map((g) => `group ${g.id}`),
          );
          const context = shapeContextOf(answer);
          formula = formulaOf(shape, context);
          sentence = sentenceOf(shape, context);
        }
        const draft = draftOf(answer, formula);
        const { problems, ran, blocked: reads } = review(setting, draft);
        if (reads) blocked = reads;
        if (ran)
          kept = {
            written: {
              formula: draft.formula,
              constants: draft.constants,
              groups: draft.groups,
              uses: ran.uses,
              shape: answer.shape ?? null,
              unfit: null,
            },
            examples: ran.examples,
            problem: ran.problem,
          };
        // The one way round a flag's examples are read, said where they disagree.
        if (
          answer.shape?.kind === 'flag' &&
          ran?.examples.some((e) => !e.agrees)
        )
          problems.push(
            `For a flag, an example's result is false where the ${owner.subject.record.singular} is flagged and true where it is not.`,
          );
        noted(problems);
        const said = {
          ...(sentence ? { sentence } : {}),
          ...(dropped.length ? { dropped } : {}),
        };
        return problems.length
          ? { ok: false, problems, ...said }
          : { ok: true, ...said };
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
  const set = await loadSet(owner, text);
  // The read is held to the profile the set was drafted on, if it names one.
  const reading = set ? await ownerFor(owner, set) : owner;
  fitting(read, reading.subject.data);
  const definition = set?.definitions.find((d) => d.id === id);
  return set && definition
    ? settingOf(reading, text, set, read, definition)
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
                [
                  kept.refusal
                    ? `No shape can check this rule as written: ${REFUSAL_WORDS[kept.refusal]}. Rephrase it in the instructions, or write it again.`
                    : kept.problem,
                  written.blocked,
                  note,
                ]
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
  shape: kept!.written.shape ?? null,
  unfit: kept!.written.unfit ?? null,
  // A rule no shape fits has no formula; its version says why instead.
  formula: kept!.written.formula ?? '',
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
  // A refusal is not a reading of the rule, only a failure to find a shape, so
  // it is never compared: another write is asked for, and any shape wins.
  const refused = (w: Written) => Boolean(w.kept?.written.unfit);
  const passed = () => writes.filter((w) => w.clean && w.kept && !refused(w));
  const refusedSoFar = () => writes.filter((w) => w.clean && refused(w)).length;
  let stopped: string | null = null;
  let stronger = 0;
  for (let run = 1; passed().length < 2; run += 1) {
    // A model a person chose is kept; otherwise repeated refusals move on.
    const escalated =
      !asking.model && refusedSoFar() >= REFUSALS_BEFORE_STRONGER;
    if (escalated ? stronger >= STRONGER_WRITES : run > WRITES_AT_MOST) break;
    await onRun?.(run);
    try {
      writes.push(
        await writeOnce(
          setting,
          escalated ? { ...asking, model: DRAFT_MODELS[0] } : asking,
        ),
      );
    } catch (error) {
      // Nothing to show for it, so there is nothing to keep: say so as before.
      if (!passed().length && !refusedSoFar()) throw error;
      stopped = (error as Error).message.split('\n')[0]!;
      break;
    }
    if (escalated) {
      stronger += 1;
      if (refused(writes.at(-1)!)) break;
    }
  }
  const clean = passed();
  const runs = writes.length;
  // Every write refused: the rule fits no shape, and a person rephrases it.
  const refusals = writes.filter((w) => w.clean && refused(w));
  if (!clean.length && refusals.length)
    return keep(setting, refusals.at(-1)!, {
      status: 'agreed',
      runs,
      versions: refusals.map(versionOf),
      differences: [],
    });
  const versions = clean.map(versionOf);
  if (clean.length === 2) {
    const [a, b] = [clean[0]!.kept!, clean[1]!.kept!];
    const status = (differences: unknown[]) =>
      differences.length ? ('split' as const) : ('agreed' as const);
    // The same shape behaves the same; otherwise behaviour decides.
    const differences =
      a.written.shape &&
      b.written.shape &&
      sameShape(
        { ...shapeContextFor(setting, a.written), shape: a.written.shape },
        { ...shapeContextFor(setting, b.written), shape: b.written.shape },
      )
        ? []
        : differencesBetween(setting, draftOfKept(a), draftOfKept(b));
    return keep(setting, clean[0]!, {
      status: status(differences),
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
