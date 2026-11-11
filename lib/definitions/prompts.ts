import type { DefinitionSubject } from '@/lib/process/model';

import { isDated, isDatedOrWeekly, type DataShape } from '@/lib/process/model';

import { recordsOf, type KeptRead } from './records';
import type { Definition, Example } from './types';

// Words the prompts share, all from the process's own declaration.

export const plain = (subject: DefinitionSubject) =>
  `Write for the ${subject.reader}, in plain everyday words: no code, no field names.`;

// "a <label>" or "a <label> and a <label>": what a proposal sets, in words.
export const proposalWords = (subject: DefinitionSubject) =>
  subject.proposal.map((field) => field.label).join(' and ');

// The columns worked out from when the data was read, in words, with each
// record's values; none is in a tab, so the model cannot work them out itself.
export function timingOf(read: KeptRead, data: DataShape): string {
  if (!data.timing) return '';
  const { since, until } = data.timing;
  const records = recordsOf(read, data);
  const names = [...Object.keys(since), ...Object.keys(until)];
  return [
    `Worked out by the app from when this data was read (${read.readAt}), in hours, each a double on the record:`,
    ...Object.entries(since).map(([name, columns]) =>
      isDated(columns)
        ? `- ${name}: how long ago the instant in ${columns.at} was; negative where it is still to come.`
        : `- ${name}: ${isDatedOrWeekly(columns) ? `how long ago the instant in ${columns.at} was where a record has one, otherwise ` : ''}how long ago ${columns.day} at ${columns.time} last came round.`,
    ),
    ...Object.entries(until).map(([name, columns]) =>
      isDated(columns)
        ? `- ${name}: how long is left before the instant in ${columns.at}; negative once it has passed.`
        : `- ${name}: how long is left before ${isDatedOrWeekly(columns) ? `the instant in ${columns.at} where a record has one, otherwise ` : ''}${columns.day} at ${columns.time} in the week being planned; negative once it has passed.`,
    ),
    ...records.keys.map(
      (key) =>
        `${key}: ${names.map((name) => `${name} ${String(records.record(key)[name] ?? 'blank')}`).join(', ')}`,
    ),
  ].join('\n');
}

// Each tab's columns, so the model knows what the data already holds.
export const columnsOf = (read: KeptRead, data: DataShape) =>
  [
    ...read.tabs.map((t) => `- ${t.name}: ${(t.values[0] ?? []).join(', ')}`),
    timingOf(read, data),
  ]
    .filter(Boolean)
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
