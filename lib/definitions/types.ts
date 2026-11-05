import { z } from 'zod';

import type { DefinitionSubject } from '@/lib/process/model';

import { shapeSchema } from './shape-schema';

/*
  What the definitions engine keeps for one version of a process's
  instructions, as a schema: a stored set is read through it, so a file of an
  older shape or a hand edit gone wrong is reported rather than half-read.
  Safe for the browser: no file or model access here.

  One kind of definition: what it gives is its `result`, never its type, so a
  new result is a value of that field rather than a second code path
  (docs/processes/brunch-orders/PLAN.md, phase 2b).
*/

// check: true when it holds; number: a quantity other definitions may read.
export const resultSchema = z.enum(['check', 'number']);
// What failing a check does to the proposal.
const consequenceSchema = z.enum(['block', 'decide']);

// A number the formula uses, and the instructions' words it comes from.
const constantSchema = z.object({
  id: z.string(),
  value: z.number(),
  quote: z.string(),
});
// Records the instructions name in plain words, as the keys they are.
const groupSchema = z.object({
  id: z.string(),
  keys: z.array(z.string()),
  quote: z.string(),
});

const exampleSchema = z.object({
  key: z.string(),
  // The proposal's fields the example sets, by id; unset ones read as 0.
  inputs: z.record(z.string(), z.number()),
  // What the model says should come out: whether it holds, or the number.
  expect: z.union([z.boolean(), z.number()]),
  why: z.string(),
  // What the formula gives, run on the read.
  actual: z.union([z.boolean(), z.number()]).nullable(),
  error: z.string().nullable(),
  agrees: z.boolean(),
});

// One independent write of a definition.
const writtenVersionSchema = z.object({
  // A check's shape, which its formula is written from; absent on a check
  // written as a formula before shapes, and on a number.
  shape: shapeSchema.nullable().optional(),
  // Why no shape fits the rule, when none does; it then has no formula.
  unfit: z.string().nullable().optional(),
  formula: z.string(),
  constants: z.array(constantSchema),
  groups: z.array(groupSchema),
  uses: z.array(z.string()),
  examples: z.array(exampleSchema),
  model: z.string(),
});

// Where two versions give different answers: the record, the values tried, and
// what each version gives, in the versions' order.
const differenceSchema = z.object({
  key: z.string(),
  inputs: z.record(z.string(), z.number()),
  results: z.array(z.string()),
});

/*
  What came of writing a definition more than once, without any write seeing
  another. agreed: two behave the same. split: they do not, so a person chooses.
  chosen: a person chose. unconfirmed: only one passed the checks, or the rest
  could not run, so it could be compared with nothing.
*/
const agreementSchema = z.object({
  status: z.enum(['agreed', 'split', 'chosen', 'unconfirmed']),
  runs: z.number().int(),
  versions: z.array(writtenVersionSchema),
  differences: z.array(differenceSchema),
});

const definitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  text: z.string(),
  result: resultSchema,
  // Checks only.
  consequence: consequenceSchema.nullable(),
  constants: z.array(constantSchema),
  groups: z.array(groupSchema),
  // The definitions its formula reads, worked out from the formula.
  uses: z.array(z.string()),
  // As on a version: the shape code wrote the formula from, or why none fits.
  shape: shapeSchema.nullable().optional(),
  unfit: z.string().nullable().optional(),
  formula: z.string().nullable(),
  examples: z.array(exampleSchema),
  // Why the version shown is not acceptable, or what stopped the last write.
  problem: z.string().nullable(),
  model: z.string().nullable(),
  approvedAt: z.string().nullable(),
  // The person's denial, and what they said was wrong, until written again.
  deniedAt: z.string().nullable(),
  denial: z.string().nullable(),
  // Absent on a definition written once.
  agreement: agreementSchema.nullable().optional(),
});

// What the model said one sentence of the instructions is for, and the
// definitions it belongs to: none when it is only context.
const accountedSentenceSchema = z.object({
  sentence: z.string(),
  kind: z.enum(['quantity', 'check', 'context']),
  definitions: z.array(z.string()),
});

export const definitionSetSchema = z.object({
  hash: z.string(),
  version: z.string(),
  intent: z.string(),
  intentConfirmedAt: z.string().nullable(),
  // The read the examples were run on.
  readId: z.string().nullable(),
  foundAt: z.string(),
  model: z.string(),
  // In order: a definition may read only those before it.
  definitions: z.array(definitionSchema),
  // Every sentence of the instructions, once. Absent on a set found before
  // sentences were accounted for.
  accounting: z.array(accountedSentenceSchema).optional(),
  // What was wrong with the first answer, when finding took a second.
  refused: z.array(z.string()).optional(),
});

// The stored shape's version, kept with each revision, so a revision written
// before a change of shape can be told apart rather than misread.
export const RULEBOOK_SCHEMA = 1;

/*
  What became of a rulebook: each accepted rulebook is a revision, never
  written again, with the one it came from and why. The head is the one in
  use for these instructions. One entry is one row of a database table later.
*/
export const revisionSchema = z.object({
  id: z.string(),
  parent: z.string().nullable(),
  // accepted: every definition accepted; migrated: rewritten by a script when
  // the stored shape or the data changed; used: kept when a run first used
  // an accepted rulebook that was never frozen.
  reason: z.enum(['accepted', 'migrated', 'used']),
  at: z.string(),
  schemaVersion: z.number().int(),
  note: z.string().nullable(),
});
export const revisionIndexSchema = z.object({
  head: z.string().nullable(),
  revisions: z.array(revisionSchema),
});
export type Revision = z.infer<typeof revisionSchema>;
export type RevisionIndex = z.infer<typeof revisionIndexSchema>;

export type Result = z.infer<typeof resultSchema>;
export type Example = z.infer<typeof exampleSchema>;
export type Definition = z.infer<typeof definitionSchema>;
export type DefinitionSet = z.infer<typeof definitionSetSchema>;
export type WrittenVersion = z.infer<typeof writtenVersionSchema>;
export type VersionDifference = z.infer<typeof differenceSchema>;
export type Agreement = z.infer<typeof agreementSchema>;
export type AccountedSentence = z.infer<typeof accountedSentenceSchema>;

// A process the engine works for: its id names where its sets are kept, and
// its subject says what a definition is about and how its data is shaped.
export type DefinitionProcess = { id: string; subject: DefinitionSubject };

// How far a server-side draft has got, while it runs.
export type DraftProgress = {
  step: string;
  error: string | null;
  running: boolean;
  // The definition being written right now, so its card can say so.
  writing?: string | null;
};

// Shown as working once it has a formula and every example agrees; the
// server also rechecks the whole definition before accepting it.
export const acceptable = (definition: Definition) =>
  definition.formula !== null &&
  definition.examples.length > 0 &&
  definition.examples.every((e) => e.agrees);

// A check reading two or more numbers its own words do not state is working a
// quantity out inline: as a calculation of its own, Calculate would show it and
// the cross-check test it. A warning, since nothing about it is wrong as such.
const plainWords = (text: string) =>
  text.toLowerCase().replace(/[\s"'‘’“”]+/g, ' ');
export const worksOutItself = (definition: Definition) =>
  definition.result === 'check' &&
  definition.constants.filter(
    (constant) =>
      definition.formula?.includes(`constants.${constant.id}`) &&
      !plainWords(definition.text).includes(plainWords(constant.quote)),
  ).length >= 2;

// The definitions that take a number or a group from a sentence, whatever the
// sentence was read as: context can still be where a rule's 07:00 comes from.
export const quotedFrom = (
  definitions: Definition[],
  sentence: string,
): Definition[] =>
  definitions.filter((definition) =>
    [...definition.constants, ...definition.groups].some((part) =>
      plainWords(sentence).includes(plainWords(part.quote)),
    ),
  );

// Versions a person must choose between stop it being accepted, not used: it
// still works, so what reads it can be written and tried.
export const canAccept = (definition: Definition) =>
  acceptable(definition) && definition.agreement?.status !== 'split';

// Whether a formula reads a variable of this name, words in quotes and fields
// of other things aside.
export const readsName = (formula: string, name: string) =>
  new RegExp(`(?<![.\\w])${name}\\b`).test(
    formula.replace(/"[^"]*"|'[^']*'/g, ''),
  );

// A check no proposed value can change, read through what it reads as well.
// Right for a rule about the data; wrong for one about what is proposed.
export function ignoresProposal(
  definition: Definition,
  definitions: Definition[],
  fields: string[],
): boolean {
  if (definition.result !== 'check' || !definition.formula) return false;
  const seen = new Set<string>();
  const reads = (d: Definition): boolean => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return (
      (d.formula !== null &&
        fields.some((field) => readsName(d.formula!, field))) ||
      d.uses.some((id) => {
        const used = definitions.find((one) => one.id === id);
        return used ? reads(used) : false;
      })
    );
  };
  return !reads(definition);
}

// A rulebook a run can use: its intent confirmed and every definition
// accepted.
export const complete = (set: DefinitionSet) =>
  set.intentConfirmedAt !== null &&
  set.definitions.length > 0 &&
  set.definitions.every((d) => d.approvedAt);

/*
  A proposal: for every record, what the model would set and why, and how the
  accepted checks find it. The verdicts are code's, run again on what the
  model answered, never the model's own account.
*/
export type Verdict = 'ready' | 'decide' | 'blocked';

export type CheckVerdict = {
  id: string;
  name: string;
  consequence: 'block' | 'decide';
  holds: boolean;
  // False when a guard settles it for this record whatever is proposed: it
  // holds, but says nothing about the values.
  applies: boolean;
  // The app's working of the check on these values, or why it could not run.
  steps: string[];
  error: string | null;
};

export type ProposalRecord = {
  // set: these values; leave: nothing changes for this record.
  action: 'set' | 'leave';
  values: Record<string, number> | null;
  reason: string;
  // Cells the model relied on, in A1 notation (Stock!B3).
  cited: string[];
  unsure: string | null;
  verdict: Verdict;
  checks: CheckVerdict[];
};

export type Proposal = {
  fingerprint: string;
  readId: string;
  model: string;
  at: string;
  records: Record<string, ProposalRecord>;
};

/*
  What a decided proposal does to its output tab, and the record of doing it:
  kept on the server, so what was written, on which decisions and how the
  checks found them does not depend on a browser's storage.
*/
export type AppliedDecision = {
  kind: 'approve' | 'change' | 'reject';
  // Null when the decision writes nothing.
  values: Record<string, number> | null;
  at: string;
  // Only for what is written, as the checks found it when it was written.
  verdict: Verdict | null;
  // The checks a person let fail, by name.
  failing: string[];
};

export type CellChange = {
  key: string;
  field: string;
  cell: string;
  before: string | number | boolean | null;
  after: number;
};

export type Application = {
  proposedAt: string;
  tab: string;
  at: string;
  // verified: read back as written; mismatch: read back as something else;
  // failed: the write did not land, so the cells are as they were; undone:
  // put back as they were by undo.
  status: 'verified' | 'mismatch' | 'failed' | 'undone';
  error: string | null;
  undoneAt: string | null;
  // The block written, in A1 notation, and its cells either side of it.
  range: string;
  before: unknown[][];
  after: unknown[][];
  changes: CellChange[];
  decisions: Record<string, AppliedDecision>;
};

// Around a value an example tried, in a step, so it can be shown as that
// example's own: private-use characters, never in a formula or the data.
export const TRIED = ['\uE000', '\uE001'] as const;
