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
  (docs/engineering/DEFINITIONS-ENGINE.md).
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
  // The confirmed data profile it was drafted on; absent on a set drafted
  // before profiles, whose columns are typed from each read.
  profileId: z.string().optional(),
  // The keys of the records of the read it was reviewed on, kept when it was
  // accepted whole; absent on a rulebook accepted before, which then treats
  // every record as one it has seen (propose.ts, checkProposal).
  acceptedKeys: z.array(z.string()).optional(),
});

/*
  What the engine knows of a source's columns: worked out once from a read,
  confirmed by a person, then fixed, so a later read is checked against it
  rather than typed again from its own values (profile.ts).
*/
const fieldTypeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('key') }),
  z.object({ kind: z.literal('text') }),
  z.object({ kind: z.literal('whole_number') }),
  z.object({ kind: z.literal('decimal') }),
  z.object({ kind: z.literal('percent') }),
  z.object({
    kind: z.literal('money'),
    currency: z.object({ code: z.string(), minor_units: z.number().int() }),
  }),
  z.object({ kind: z.literal('date'), timeZone: z.string() }),
  z.object({ kind: z.literal('datetime'), timeZone: z.string() }),
  z.object({ kind: z.literal('weekday') }),
  z.object({ kind: z.literal('time_of_day') }),
  z.object({ kind: z.literal('yes_no') }),
  z.object({
    kind: z.literal('one_of'),
    values: z.array(z.string()).readonly(),
  }),
]);

const profileColumnSchema = z.object({
  // As a shape names it: `<column>` on a record, `<lookup as>.<column>`.
  column: z.string(),
  // Null when the read could not tell, as for a column blank throughout.
  type: fieldTypeSchema.nullable(),
  // declared: by the process, and not a person's to change; inferred: from
  // the read's cells; person: chosen by a person.
  origin: z.enum(['declared', 'inferred', 'person']),
  label: z.string(),
  // Whether any cell of it was blank in the read it was worked out from.
  blanksSeen: z.boolean(),
  // What a blank cell means for a rule that reads it; null until answered.
  blank: z.enum(['skip', 'fail']).nullable(),
});

export const dataProfileSchema = z.object({
  // A fingerprint of everything below, confirmation included.
  id: z.string(),
  readId: z.string(),
  confirmedAt: z.string().nullable(),
  columns: z.array(profileColumnSchema),
});

export type DataProfile = z.infer<typeof dataProfileSchema>;
export type ProfileColumn = z.infer<typeof profileColumnSchema>;

/*
  The data profile as a page shows it: none kept yet, with what a read
  suggests; or kept, under review or confirmed.
*/
export type ProfileState =
  | { state: 'none'; proposed: DataProfile | null }
  | { state: 'review' | 'confirmed'; profile: DataProfile };

// Why a person's draft waits: it reads the data through a confirmed profile.
export const CONFIRM_FIRST =
  'Confirm the data first: the rules are checked against what its columns hold.';

// How Accept begins its refusal of a rule reading an unanswered blank, so a
// page can lead from it to the profile.
export const BLANKS_UNANSWERED = 'Say what a blank cell means before accepting';

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
  // A proposal's model at work, for a person watching it.
  activity?: ProposalActivity;
};

/*
  What a proposal's model has done so far, as it works. Shown to a person
  watching; never read by code to decide anything.
*/
export type ProposalActivity = {
  // The model answering now.
  model: string | null;
  // Its latest thought summary, as it writes it.
  thought: string | null;
  // Records written into the answer being given, as it arrives.
  writing: number;
  events: ProposalEvent[];
  tokens: { input: number; output: number; thinking: number };
  // How long the model's steps took, as the SDK measured them.
  stepMs?: number;
  // What the model streamed back, part by part, as the SDK gives it: a
  // text's or a tool input's pieces joined into one part. The tool's answer
  // is the app's, not the model's, and says so. Absent on older records.
  stream?: StreamedPart[];
};

/*
  What happened, as facts with no words: a page words them in the process's
  own nouns, so the engine says nothing of any one process.
*/
export type ProposalEvent = { at: string } & (
  | { kind: 'asked'; model: string }
  | {
      kind: 'busy';
      model: string;
      why: 'quota' | 'slow' | 'unavailable';
      // Resting until, for quota; the service's status, when it answered.
      until?: string;
      status?: number;
    }
  | { kind: 'tried'; records: number }
  | {
      kind: 'answered';
      records: number;
      set: number;
      leave: number;
      unsure: number;
      cited: number;
      // What the app's checks sent back; none when it took the answer.
      problems: AnswerProblem[];
    }
  | { kind: 'warned'; warnings: string[] }
  // A step that ended other than by answering: cut short, filtered, failed.
  | { kind: 'ended'; reason: string }
);

// One thing the app's check of an answer sent back, as a fact about a record.
export type AnswerProblem =
  | { kind: 'twice'; key: string }
  | { kind: 'no-values'; key: string }
  | { kind: 'unanswered'; key: string }
  | { kind: 'no-tab'; key: string; tab: string }
  | { kind: 'no-column'; key: string; tab: string; column: string }
  | { kind: 'no-row'; key: string; tab: string; row: number }
  | { kind: 'blank'; key: string; cell: string };

export type StreamedPart = {
  at: string;
  from: 'model' | 'app';
  part: { type: string } & Record<string, unknown>;
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
  model answered, never the model's own account. unchecked: the rulebook has
  no check to run, so nothing says it is ready.
*/
export type Verdict = 'ready' | 'decide' | 'blocked' | 'unchecked';

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
  // Cells the model relied on, in A1 notation (<tab>!B3).
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
  // For what is written, or left as it is, as the checks found it then.
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
