import { z } from 'zod';

import { ask, DRAFT_MODELS, WRITE_MODELS, type Resolve } from './calls';
import { groupDifferences } from './group-differences';
import { limitedGoogle } from './limits';
import { namesOf, type KeptRead } from './records';
import { sentencesOf } from './shapes';
import type { DefinitionProcess, DefinitionSet } from './types';

/*
  Server-only. Advice on two writes of one definition that disagree: which
  says what the instructions mean, resting on a sentence of them quoted
  exactly. It is advice and never a decision: a third reading of the same
  words is a vote, and over three drafts the two-of-three answer was wrong on
  2 of 6 such rules. A person still chooses (decide.ts, choose); nothing here
  is kept.
*/

// Flash reads instructions best; advice decides nothing, so where Flash is
// busy or spent a lighter answer is better than none, and names its model.
const ADVICE_MODELS = [...DRAFT_MODELS, ...WRITE_MODELS];

export const adviceSchema = z.object({
  verdict: z
    .enum(['version_1', 'version_2', 'unclear'])
    .describe('unclear where the instructions can be read either way'),
  quote: z
    .string()
    .describe(
      'The words of the instructions the verdict rests on, copied exactly',
    ),
  reason: z.string().describe('One or two plain sentences, no formulas'),
  rephrase: z
    .string()
    .nullable()
    .describe(
      'unclear only: the quoted words rewritten so they can be read one way; null otherwise',
    ),
});

export type Advice = {
  verdict: z.infer<typeof adviceSchema>['verdict'];
  // Null where the model's quote was not in the instructions, twice.
  quote: string | null;
  reason: string;
  rephrase: string | null;
  model: string;
};

// Quotes are compared without the differences typing makes.
const plain = (text: string) =>
  text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const SYSTEM = [
  'A process has written instructions. A definition was written from them twice, each time without seeing the other, and the two versions behave differently.',
  'Say which version says what the instructions mean. Rest only on the instructions: not on what is usual, likely or sensible elsewhere.',
  'Quote the words of the instructions your verdict rests on, copied exactly. Give the reason in one or two plain sentences, without formulas.',
  'If the instructions can honestly be read either way, say unclear, and rewrite the quoted words so they can be read only one way. A person decides; you only advise.',
].join('\n');

/*
  What the model is given: the instructions, the definition, each version in
  words where the app has them (a check's sentence, or the groups the two
  fill differently, with the formula), and the records where they part.
*/
function promptFor(
  owner: DefinitionProcess,
  text: string,
  set: DefinitionSet,
  read: KeptRead,
  id: string,
): string | null {
  const definition = set.definitions.find((d) => d.id === id);
  const agreement = definition?.agreement;
  if (!definition || agreement?.status !== 'split') return null;
  const names = namesOf(read, owner.subject.data);
  const named = (key: string) => (names[key] ? `${key} (${names[key]})` : key);
  const sentences = sentencesOf(owner.subject, set, read)[id]?.versions ?? [];
  const groups =
    agreement.versions.length === 2
      ? groupDifferences(
          agreement.versions[0]!.groups,
          agreement.versions[1]!.groups,
        )
      : [];
  const record = owner.subject.record.singular;
  const result = (value: string | undefined) =>
    definition.result === 'check' && (value === 'true' || value === 'false')
      ? value === 'true'
        ? 'holds'
        : 'fails'
      : (value ?? 'nothing');
  const versions = agreement.versions.map((version, index) => {
    const lines = [`Version ${index + 1}:`];
    if (version.unfit) lines.push(`No shape fits: ${version.unfit}`);
    else if (sentences[index]) lines.push(sentences[index]);
    else {
      for (const g of groups)
        lines.push(
          `${g.inFirst === (index === 0) ? 'Counts' : 'Does not count'} ${named(g.key)} as one of "${g.quote}".`,
        );
      lines.push(`Formula: ${version.formula}`);
    }
    return lines.join('\n');
  });
  const parts = agreement.differences.slice(0, 3).map((d) => {
    const inputs = Object.entries(d.inputs)
      .map(([field, value]) => `${field} ${value}`)
      .join(', ');
    return `On ${record} ${named(d.key)}${inputs ? `, with ${inputs}` : ''}: ${d.results
      .map((r, index) => `version ${index + 1} gives ${result(r)}`)
      .join('; ')}.`;
  });
  return [
    'The instructions:',
    text,
    '',
    `The definition: ${definition.name} (a ${definition.result === 'check' ? 'check' : 'calculation'}).`,
    `As read from the instructions: ${definition.text}`,
    '',
    ...versions.flatMap((v) => [v, '']),
    `Where they part, ${record} by ${record}:`,
    ...parts,
  ].join('\n');
}

export async function advise(
  owner: DefinitionProcess,
  text: string,
  set: DefinitionSet,
  read: KeptRead,
  id: string,
  { resolve = limitedGoogle }: { resolve?: Resolve } = {},
): Promise<Advice> {
  const prompt = promptFor(owner, text, set, read, id);
  if (!prompt) throw new Error('These versions no longer disagree.');
  const count = set.definitions.find((d) => d.id === id)!.agreement!.versions
    .length;
  let last: Advice | null = null;
  // A quote not in the instructions is asked for once more, then left out.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { output, model } = await ask(
      ADVICE_MODELS,
      adviceSchema,
      SYSTEM,
      attempt
        ? `${prompt}\n\nYour last quote was not in the instructions. Copy the words exactly.`
        : prompt,
      `advise-${id}`,
      resolve,
    );
    const named =
      output.verdict === 'unclear' ? 0 : Number(output.verdict.at(-1));
    if (named > count)
      throw new Error('The advice named a version that is not there.');
    const found =
      output.quote.trim() && plain(text).includes(plain(output.quote));
    last = {
      verdict: output.verdict,
      quote: found ? output.quote.trim() : null,
      reason: output.reason,
      rephrase: output.verdict === 'unclear' ? output.rephrase : null,
      model,
    };
    if (found) break;
  }
  return last!;
}
