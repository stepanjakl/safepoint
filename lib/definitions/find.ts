import { z } from 'zod';

import { ask, DRAFT_MODELS, type Resolve } from './calls';
import { columnsOf, plain, proposalWords } from './prompts';
import { fitting, sourceOf, type KeptRead } from './records';
import { hashOf, saveSet } from './store';
import type { DefinitionProcess, DefinitionSet } from './types';
import { fallbackChain, type DraftingModel } from '@/lib/models';

/*
  Finding: the model lists, in plain words, the intent of the instructions
  and every definition in them, in order, each check with what failing it
  does. Nothing is written yet; each definition is written on its own.

  It also accounts for every sentence: a quantity's working, a check, or only
  context, and which definitions it belongs to. Asked for one list, Flash-Lite
  folded the quantities into checks in 3 drafts of 4; asked for this, in none of
  5. Code holds the answer complete, and a person sees what was set aside. No
  word of a scenario is involved, so it holds for any instructions.
*/

const findSchema = z.object({
  intent: z
    .string()
    .describe('The intent of the instructions, in one plain sentence'),
  sentences: z
    .array(
      z.object({
        n: z.number().int().describe("The sentence's number"),
        kind: z
          .enum(['quantity', 'check', 'context'])
          .describe(
            'quantity: helps explain how to work a number out; check: states a condition on a proposal; context: neither',
          ),
        definitions: z
          .array(z.string())
          .describe(
            'The ids of the definitions it belongs to; none for context',
          ),
      }),
    )
    .describe('Every numbered sentence, once'),
  definitions: z
    .array(
      z.object({
        id: z.string().describe('snake_case, named for what it is'),
        name: z
          .string()
          .describe(
            "A short name in the instructions' words, two to four words",
          ),
        text: z
          .string()
          .describe(
            "What it is, in the instructions' own words or very close; for a number, how they say to work it out",
          ),
        result: z
          .enum(['check', 'number'])
          .describe(
            'check: a condition a proposal must meet; number: a quantity a check needs',
          ),
        consequence: z
          .enum(['block', 'decide'])
          .nullable()
          .describe(
            'Checks only: block, a proposal failing it must not go ahead; decide, a person decides. Null for a number.',
          ),
      }),
    )
    .describe('In order: anything another definition needs comes before it'),
});

type Found = z.infer<typeof findSchema>;

const idOf = (id: string) => id.replace(/[^a-z0-9_]/gi, '_').toLowerCase();

// The instructions as sentences, without their list marks. Only whitespace after
// a stop ends one, so a decimal or a time stays whole. A list item stays whole
// too: it is one thing being said, and read apart "If that isn't possible" became
// a rule of its own. A short line is a sentence as well, heading or not: a rule
// may be written without a stop.
const LIST_MARK = /^\s*(?:\d+[.)]|[-*•])\s+/;
export const sentencesOf = (text: string) =>
  text
    .split('\n')
    .flatMap((line) =>
      LIST_MARK.test(line)
        ? [line.replace(LIST_MARK, '').trim()]
        : line.trim().split(/(?<=[.!?])\s+/),
    )
    .filter(Boolean);

// Whatever keeps the answer from accounting for the instructions, in words the
// model can act on.
export function accountingProblems(
  sentences: string[],
  found: Found,
): string[] {
  const problems: string[] = [];
  const told = new Map(found.definitions.map((d) => [idOf(d.id), d.result]));
  const used = new Set<string>();
  const seen = new Set<number>();
  for (const { n, kind, definitions } of found.sentences) {
    if (n < 1 || n > sentences.length) {
      problems.push(`There is no sentence ${n}.`);
      continue;
    }
    if (seen.has(n)) problems.push(`Sentence ${n} is accounted for twice.`);
    seen.add(n);
    if (kind === 'context' && definitions.length)
      problems.push(
        `Sentence ${n} is context, so it belongs to no definition; give it its kind, or remove ${definitions.join(', ')}.`,
      );
    if (kind !== 'context' && !definitions.length)
      problems.push(
        `Sentence ${n} is a ${kind}, but belongs to no definition; list the definition it states.`,
      );
    const wanted = kind === 'quantity' ? 'number' : 'check';
    for (const id of definitions.map(idOf)) {
      used.add(id);
      const result = told.get(id);
      if (!result)
        problems.push(
          `Sentence ${n} belongs to ${id}, which is not listed; list it.`,
        );
      else if (kind !== 'context' && result !== wanted)
        problems.push(
          `Sentence ${n} is a ${kind}, but ${id} is a ${result}; a ${kind} belongs to a ${wanted}.`,
        );
    }
  }
  const left = sentences.flatMap((_, i) => (seen.has(i + 1) ? [] : [i + 1]));
  if (left.length)
    problems.push(`Not accounted for: sentence ${left.join(', ')}.`);
  const unsaid = [...told.keys()].filter((id) => !used.has(id));
  if (unsaid.length)
    problems.push(
      `No sentence states ${unsaid.join(', ')}; remove it, or say which sentence does.`,
    );
  return problems;
}

export type Asking = { model?: DraftingModel | null; resolve?: Resolve };

// Replaces any set kept for these instructions, approvals and all.
export async function findDefinitions(
  owner: DefinitionProcess,
  text: string,
  version: string,
  read: KeptRead | null,
  { model: chosen = null, resolve }: Asking = {},
): Promise<DefinitionSet> {
  const { subject } = owner;
  if (read) fitting(read, subject.data);
  const sentences = sentencesOf(text);
  const asking = (problems: string[]) =>
    ask(
      chosen ? fallbackChain(chosen) : DRAFT_MODELS,
      findSchema,
      [
        'You read the instructions of a process and list what they ask, nothing more.',
        'Restate the intent in one sentence.',
        `List every check the instructions state on a proposed ${proposalWords(subject)}, one each, in the instructions' own words or very close; never invent one.`,
        'Each quantity the instructions explain how to work out is its own number, listed with that whole working before the checks that read it, so a check reads it by name rather than repeating it.',
        `Not a number to list: a value the data already holds${read ? ' (its columns are listed below)' : ''}, which is read as it is; or one step of another number's working.`,
        'Account for every numbered sentence: say whether it helps work a quantity out, states a check, or is only context, and which definitions it belongs to.',
        plain(subject),
      ].join('\n'),
      [
        `Instructions, sentence by sentence:\n${sentences.map((sentence, i) => `${i + 1}. ${sentence}`).join('\n')}`,
        read
          ? `The data's columns, by ${sourceOf(subject.data).resource.singular}:\n${columnsOf(read, subject.data)}`
          : '',
        problems.length
          ? `Your last answer did not account for the instructions. Answer again in full, fixing:\n${problems.map((p) => `- ${p}`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      'find',
      resolve,
    );
  let { output, model } = await asking([]);
  const refused = accountingProblems(sentences, output);
  if (refused.length) {
    ({ output, model } = await asking(refused));
    const left = accountingProblems(sentences, output);
    if (left.length)
      throw new Error(
        `The model did not account for the instructions, so nothing was replaced: ${left.slice(0, 3).join(' ')}`,
      );
  }
  return saveSet(owner, {
    hash: hashOf(text),
    version,
    intent: output.intent,
    intentConfirmedAt: null,
    readId: null,
    foundAt: new Date().toISOString(),
    model,
    // The confirmed profile the data is read against, when it is.
    ...(subject.data.profile?.confirmedAt
      ? { profileId: subject.data.profile.id }
      : {}),
    definitions: output.definitions.map((d) => ({
      id: idOf(d.id),
      name: d.name,
      text: d.text,
      result: d.result,
      consequence: d.result === 'check' ? (d.consequence ?? 'block') : null,
      constants: [],
      groups: [],
      uses: [],
      formula: null,
      examples: [],
      problem: null,
      model: null,
      approvedAt: null,
      deniedAt: null,
      denial: null,
    })),
    accounting: output.sentences
      .toSorted((a, b) => a.n - b.n)
      .map(({ n, kind, definitions }) => ({
        sentence: sentences[n - 1]!,
        kind,
        definitions: definitions.map(idOf),
      })),
    ...(refused.length ? { refused } : {}),
  });
}
