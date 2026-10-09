import { z } from 'zod';

import { ask, DRAFT_MODELS, type Resolve } from './calls';
import { columnsOf, plain, proposalWords } from './prompts';
import { fitting, type KeptRead } from './records';
import { hashOf, saveSet } from './store';
import type { DefinitionProcess, DefinitionSet } from './types';
import { fallbackChain, type DraftingModel } from '@/lib/rulebook/models';

/*
  Finding: the model lists, in plain words, the intent of the instructions
  and every definition in them, in order, each check with what failing it
  does. Nothing is written yet; each definition is written on its own.
*/

const findSchema = z.object({
  intent: z
    .string()
    .describe('The intent of the instructions, in one plain sentence'),
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
  const { output, model } = await ask(
    chosen ? fallbackChain(chosen) : DRAFT_MODELS,
    findSchema,
    [
      'You read the instructions of a process and list what they ask, nothing more.',
      'Restate the intent in one sentence.',
      `List every check the instructions state on a proposed ${proposalWords(subject)}, one each, in the instructions' own words or very close; never invent one.`,
      'Each quantity the instructions explain how to work out is its own number, listed with that whole working before the checks that read it, so a check reads it by name rather than repeating it.',
      `Not a number to list: a value the data already holds${read ? ' (its columns are listed below)' : ''}, which is read as it is; or one step of another number's working.`,
      plain(subject),
    ].join('\n'),
    [
      `Instructions:\n${text}`,
      read ? `The data's columns, by tab:\n${columnsOf(read)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    'find',
    resolve,
  );
  return saveSet(owner, {
    hash: hashOf(text),
    version,
    intent: output.intent,
    intentConfirmedAt: null,
    readId: null,
    foundAt: new Date().toISOString(),
    model,
    definitions: output.definitions.map((d) => ({
      id: d.id.replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
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
  });
}
