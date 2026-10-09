import type { DefinitionSubject } from '@/lib/process/model';

import type { KeptRead } from './records';
import type { Definition, Example } from './types';

// Words the prompts share, all from the process's own declaration.

export const plain = (subject: DefinitionSubject) =>
  `Write for the ${subject.reader}, in plain everyday words: no code, no field names.`;

// "an order" or "an order and a price": what a proposal sets, in words.
export const proposalWords = (subject: DefinitionSubject) =>
  subject.proposal.map((field) => field.label).join(' and ');

// Each tab's columns, so the model knows what the data already holds.
export const columnsOf = (read: KeptRead) =>
  read.tabs
    .map((t) => `- ${t.name}: ${(t.values[0] ?? []).join(', ')}`)
    .join('\n');

// The whole data, one row per line.
export const dataOf = (read: KeptRead) =>
  read.tabs
    .map(
      (t) => `${t.name}:\n${t.values.map((r) => JSON.stringify(r)).join('\n')}`,
    )
    .join('\n\n');

export const describeExample = (
  e: Pick<Example, 'key' | 'inputs'>,
  subject: DefinitionSubject,
) =>
  [
    e.key,
    ...subject.proposal
      .filter((field) => e.inputs[field.id] !== undefined)
      .map((field) => `${field.label} ${e.inputs[field.id]}`),
  ].join(', ');

export const describeWritten = (
  d: Pick<Definition, 'formula' | 'constants' | 'groups'>,
) =>
  [
    `formula: ${d.formula}`,
    ...d.constants.map((c) => `constants.${c.id} = ${c.value} ("${c.quote}")`),
    ...d.groups.map(
      (g) => `groups.${g.id} = ${g.keys.join(', ')} ("${g.quote}")`,
    ),
  ].join('\n');
