import {
  dependentsOf,
  givenOf,
  readsName,
  readsUnder,
  reviewBreakdown,
  settingOf,
  valuesFor,
  type ReviewPart,
} from './checks';
import { accountingProblems, sentencesOf } from './find';
import { contextFor, run } from './formulas';
import type { DefinitionSubject } from '@/lib/process/model';

import { recordsOf, type KeptRead } from './records';
import {
  acceptable,
  ignoresProposal,
  quotedFrom,
  TRIED,
  worksOutItself,
  type AccountedSentence,
  type Agreement,
  type Definition,
  type DefinitionProcess,
  type DefinitionSet,
} from './types';
import { applies, stepsFor } from './working';

/*
  What a person debugging a draft can see without asking any model: each thing
  code holds a definition to, run again now, and what its formula gives on every
  record. Nothing here is saved or spent.
*/

export type RecordWorking = {
  key: string;
  name: string;
  // What the formula gives; null when it could not be worked out.
  result: number | boolean | null;
  // False when a guard settles a check for this record whatever is proposed.
  applies: boolean;
  steps: string[];
  error: string | null;
};

// The data's columns a formula reads: itself, and through the definitions it
// reads. A column of a lookup is written with the lookup's name.
export type ColumnsRead = { own: string[]; through: string[] };

export type DefinitionDebug = {
  summary: {
    id: string;
    name: string;
    result: Definition['result'];
    consequence: Definition['consequence'];
    model: string | null;
    written: boolean;
    examplesAgree: boolean;
    approvedAt: string | null;
    deniedAt: string | null;
    denial: string | null;
    problem: string | null;
    worksOutItself: boolean;
    ignoresProposal: boolean;
    agreement: Agreement | null;
    reads: { id: string; name: string }[];
    readBy: { id: string; name: string }[];
  };
  source: {
    text: string;
    // The sentences it came from, each with what it was read as, and whether
    // it states the rule or only gives it a number or group. Null on a set
    // found before they were kept.
    sentences:
      | (Pick<AccountedSentence, 'sentence' | 'kind'> & {
          how: 'states' | 'quotes';
        })[]
      | null;
    constants: Definition['constants'];
    groups: Definition['groups'];
    formula: string | null;
    columns: ColumnsRead;
  };
  checks: ReviewPart[];
  read: { id: string; readAt: string; source: string };
  // The process's own words for what is worked out and tried, so nothing shown
  // assumes a process: one thing a record is, the column naming it, and the
  // proposal's fields this formula reads, with the values they were tried at.
  about: { record: string; key: string };
  fields: { id: string; label: string }[];
  inputs: Record<string, number>;
  records: RecordWorking[];
};

function ownColumns(formula: string | null, subject: DefinitionSubject) {
  if (!formula) return [];
  return [
    ...readsUnder(formula, 'record'),
    ...subject.data.lookups.flatMap(({ as }) =>
      readsUnder(formula, as).map((column) => `${as}.${column}`),
    ),
  ];
}

function columnsRead(
  definition: Definition,
  set: DefinitionSet,
  subject: DefinitionSubject,
): ColumnsRead {
  const own = ownColumns(definition.formula, subject);
  const seen = new Set<string>();
  const through = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const used = set.definitions.find((d) => d.id === id);
    if (!used) return;
    for (const column of ownColumns(used.formula, subject)) through.add(column);
    used.uses.forEach(visit);
  };
  definition.uses.forEach(visit);
  return { own, through: [...through].filter((c) => !own.includes(c)) };
}

// Every column of a read a rule could read, but does not. A column worked out
// from others counts them as read, and so does a lookup its way in; the columns
// that only name a record are not there to be read.
function columnsUnread(
  set: DefinitionSet,
  subject: DefinitionSubject,
  read: KeptRead,
): string[] {
  const { data } = subject;
  const { types } = recordsOf(read, data);
  const used = new Set(
    set.definitions.flatMap((d) => ownColumns(d.formula, subject)),
  );
  const timed = [
    ...Object.entries(data.timing?.since ?? {}),
    ...Object.entries(data.timing?.until ?? {}),
  ];
  for (const [name, { day, time }] of timed)
    if (used.has(name)) [day, time].forEach((column) => used.add(column));
  for (const { as, via } of data.lookups)
    if ([...used].some((column) => column.startsWith(`${as}.`))) used.add(via);
  return [
    ...Object.keys(types.record),
    ...Object.entries(types.lookups).flatMap(([as, columns]) =>
      Object.keys(columns).map((column) => `${as}.${column}`),
    ),
  ].filter(
    (column) =>
      !used.has(column) &&
      column !== data.records.key &&
      column !== data.records.name &&
      !data.lookups.some(({ as, key }) => column === `${as}.${key}`),
  );
}

const plainSteps = (steps: string[]) =>
  steps.map((step) => step.replaceAll(TRIED[0], '').replaceAll(TRIED[1], ''));

const plainResult = (value: unknown): RecordWorking['result'] =>
  typeof value === 'bigint'
    ? Number(value)
    : typeof value === 'number' || typeof value === 'boolean'
      ? value
      : null;

export function debugDefinition(
  owner: DefinitionProcess,
  text: string,
  set: DefinitionSet,
  read: KeptRead,
  id: string,
  given: Record<string, number> = {},
): DefinitionDebug | null {
  const definition = set.definitions.find((d) => d.id === id);
  if (!definition) return null;
  const { subject } = owner;
  const fields = subject.proposal.map((field) => field.id);
  const inputs = Object.fromEntries(
    fields.map((field) => [field, given[field] ?? 0]),
  );
  const records = recordsOf(read, subject.data);
  const byId = (ids: Iterable<string>) =>
    [...ids].flatMap((one) => {
      const found = set.definitions.find((d) => d.id === one);
      return found ? [{ id: one, name: found.name }] : [];
    });
  const { formula } = definition;
  return {
    summary: {
      id: definition.id,
      name: definition.name,
      result: definition.result,
      consequence: definition.consequence,
      model: definition.model,
      written: formula !== null,
      examplesAgree: acceptable(definition),
      approvedAt: definition.approvedAt,
      deniedAt: definition.deniedAt,
      denial: definition.denial,
      problem: definition.problem,
      worksOutItself: worksOutItself(definition),
      ignoresProposal: ignoresProposal(definition, set.definitions, fields),
      agreement: definition.agreement ?? null,
      reads: byId(definition.uses),
      readBy: byId(dependentsOf(set, definition.id)),
    },
    source: {
      text: definition.text,
      sentences: set.accounting
        ? set.accounting.flatMap(({ sentence, kind, definitions }) => {
            const how = definitions.includes(definition.id)
              ? ('states' as const)
              : quotedFrom([definition], sentence).length
                ? ('quotes' as const)
                : null;
            return how ? [{ sentence, kind, how }] : [];
          })
        : null,
      constants: definition.constants,
      groups: definition.groups,
      formula,
      columns: columnsRead(definition, set, subject),
    },
    checks: formula
      ? reviewBreakdown(settingOf(owner, text, set, read, definition), {
          formula,
          constants: definition.constants,
          groups: definition.groups,
          examples: definition.examples,
        })
      : [],
    read: { id: read.id, readAt: read.readAt, source: read.source },
    about: { record: subject.record.singular, key: subject.data.records.key },
    fields: subject.proposal
      .filter((field) => formula && readsName(formula, field.id))
      .map(({ id: fieldId, label }) => ({ id: fieldId, label })),
    inputs,
    records: formula
      ? records.keys.map((key) => {
          const name = String(
            records.record(key)[subject.data.records.name] ?? '',
          );
          const context = contextFor(
            read,
            key,
            subject,
            givenOf(definition, inputs),
            valuesFor(set, read, key, inputs, definition.id, subject),
          );
          try {
            return {
              key,
              name,
              result: plainResult(run(formula, context)),
              applies: applies(formula, context, fields),
              steps: plainSteps(stepsFor(formula, context, fields)),
              error: null,
            };
          } catch (error) {
            return {
              key,
              name,
              result: null,
              applies: true,
              steps: [],
              error: (error as Error).message.split('\n')[0]!,
            };
          }
        })
      : [],
  };
}

export type DraftDebug = {
  version: string;
  intent: string;
  intentConfirmedAt: string | null;
  model: string;
  foundAt: string;
  readId: string | null;
  // The sentences, each with what it was read as and the definitions that take
  // a number or a group from it; null before they were kept.
  accounting: (AccountedSentence & { quotedBy: string[] })[] | null;
  // Whether the account still holds, run again now.
  accountProblems: string[];
  // What was wrong with the first answer, when finding took a second.
  refused: string[];
  definitions: {
    id: string;
    name: string;
    result: Definition['result'];
    written: boolean;
    examplesAgree: boolean;
    approved: boolean;
    model: string | null;
    worksOutItself: boolean;
    problem: string | null;
  }[];
  // The models that wrote any of it, for how their quota stands.
  models: string[];
  // Each rule's columns side by side, and those none reads; null with no read
  // to take the data's columns from.
  columns: {
    rules: ({ id: string; name: string; written: boolean } & ColumnsRead)[];
    unread: string[];
  } | null;
};

export function debugDraft(
  owner: DefinitionProcess,
  text: string,
  set: DefinitionSet,
  read: KeptRead | null,
): DraftDebug {
  const sentences = sentencesOf(text);
  const accounting =
    set.accounting?.map((row) => ({
      ...row,
      quotedBy: quotedFrom(set.definitions, row.sentence).map((d) => d.id),
    })) ?? null;
  return {
    version: set.version,
    intent: set.intent,
    intentConfirmedAt: set.intentConfirmedAt,
    model: set.model,
    foundAt: set.foundAt,
    readId: set.readId,
    accounting,
    accountProblems: accounting
      ? accountingProblems(sentences, {
          intent: set.intent,
          definitions: set.definitions.map((d) => ({
            id: d.id,
            name: d.name,
            text: d.text,
            result: d.result,
            consequence: d.consequence,
          })),
          sentences: accounting.map((a) => ({
            n: sentences.indexOf(a.sentence) + 1,
            kind: a.kind,
            definitions: a.definitions,
          })),
        })
      : [],
    refused: set.refused ?? [],
    definitions: set.definitions.map((d) => ({
      id: d.id,
      name: d.name,
      result: d.result,
      written: d.formula !== null,
      examplesAgree: acceptable(d),
      approved: d.approvedAt !== null,
      model: d.model,
      worksOutItself: worksOutItself(d),
      problem: d.problem,
    })),
    models: [
      ...new Set(
        [set.model, ...set.definitions.map((d) => d.model)].filter(
          (model): model is string => model !== null,
        ),
      ),
    ],
    columns: read
      ? {
          rules: set.definitions.map((d) => ({
            id: d.id,
            name: d.name,
            written: d.formula !== null,
            ...columnsRead(d, set, owner.subject),
          })),
          unread: columnsUnread(set, owner.subject, read),
        }
      : null,
  };
}
