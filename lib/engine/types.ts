import { z } from 'zod';

import type { DefinitionSubject } from '@/lib/shell/model';

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
// How finding read a check: stated for every record, or only for some. Held
// against the scope of the shape written for it (checks.ts).
const appliesToSchema = z.enum(['every', 'some']);

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
  // Checks only; absent on a set found before it was asked, which is then
  // held to nothing.
  appliesTo: appliesToSchema.optional(),
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

// How a problem begins when the scope a shape gives disagrees with how finding
// read the rule, so a page can offer to correct the reading.
export const SCOPE_MISMATCH =
  'The scope written does not match how the instructions were read';

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
export type AppliesTo = z.infer<typeof appliesToSchema>;
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

/*
  What a server-side job keeps while it runs, and what a proposal's model has
  done so far: shown to a person watching, never read by code to decide
  anything. A file is read through these, so one of another shape is reported
  rather than half-shown.
*/

// One thing the app's check of an answer sent back, as a fact about a record.
// `no-tab` and `tab` are historical names, kept in progress files: the
// resource a citation names, whatever the source calls it. `key` comes last,
// as the check adds it.
const answerProblemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('twice'), key: z.string() }),
  z.object({ kind: z.literal('no-values'), key: z.string() }),
  z.object({ kind: z.literal('unanswered'), key: z.string() }),
  z.object({ kind: z.literal('no-tab'), tab: z.string(), key: z.string() }),
  z.object({
    kind: z.literal('no-column'),
    tab: z.string(),
    column: z.string(),
    key: z.string(),
  }),
  z.object({
    kind: z.literal('no-row'),
    tab: z.string(),
    row: z.number(),
    key: z.string(),
  }),
  z.object({ kind: z.literal('blank'), cell: z.string(), key: z.string() }),
]);

/*
  What happened, as facts with no words: a page words them in the process's
  own nouns, so the engine says nothing of any one process.
*/
const proposalEventSchema = z.discriminatedUnion('kind', [
  z.object({ at: z.string(), kind: z.literal('asked'), model: z.string() }),
  z.object({
    at: z.string(),
    kind: z.literal('busy'),
    model: z.string(),
    why: z.enum(['quota', 'slow', 'unavailable']),
    // Resting until, for quota; the service's status, when it answered.
    until: z.string().optional(),
    status: z.number().optional(),
  }),
  z.object({ at: z.string(), kind: z.literal('tried'), records: z.number() }),
  z.object({
    at: z.string(),
    kind: z.literal('answered'),
    records: z.number(),
    set: z.number(),
    leave: z.number(),
    unsure: z.number(),
    cited: z.number(),
    // What the app's checks sent back; none when it took the answer. A record
    // kept early on holds each as the sentence it was told, not as a fact.
    problems: z.array(z.union([answerProblemSchema, z.string()])),
  }),
  z.object({
    at: z.string(),
    kind: z.literal('warned'),
    warnings: z.array(z.string()),
  }),
  // A step that ended other than by answering: cut short, filtered, failed.
  z.object({ at: z.string(), kind: z.literal('ended'), reason: z.string() }),
]);

const streamedPartSchema = z.object({
  at: z.string(),
  from: z.enum(['model', 'app']),
  part: z.looseObject({ type: z.string() }),
});

const proposalActivitySchema = z.object({
  // The model answering now.
  model: z.string().nullable(),
  // Its latest thought summary, as it writes it.
  thought: z.string().nullable(),
  // Records written into the answer being given, as it arrives.
  writing: z.number(),
  events: z.array(proposalEventSchema),
  tokens: z.object({
    input: z.number(),
    output: z.number(),
    thinking: z.number(),
  }),
  // What the model streamed back, part by part, as the SDK gives it: a
  // text's or a tool input's pieces joined into one part. The tool's answer
  // is the app's, not the model's, and says so. Absent on older records.
  stream: z.array(streamedPartSchema).optional(),
  // How long the model's steps took, as the SDK measured them. After the
  // stream, as it is written: a key moved would change the file's bytes.
  stepMs: z.number().optional(),
});

// How far a server-side draft has got, while it runs.
export const draftProgressSchema = z.object({
  step: z.string(),
  error: z.string().nullable(),
  running: z.boolean(),
  // The definition being written right now, so its card can say so.
  writing: z.string().nullable().optional(),
  // A proposal's model at work, for a person watching it.
  activity: proposalActivitySchema.optional(),
});

export type DraftProgress = z.infer<typeof draftProgressSchema>;
export type ProposalActivity = z.infer<typeof proposalActivitySchema>;
export type ProposalEvent = z.infer<typeof proposalEventSchema>;
export type AnswerProblem = z.infer<typeof answerProblemSchema>;
export type StreamedPart = z.infer<typeof streamedPartSchema>;

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

  A proposal's records and an application are read and written back whole, so
  their objects keep any key they do not name rather than stripping it.
*/
const verdictSchema = z.enum(['ready', 'decide', 'blocked', 'unchecked']);

const checkVerdictSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  consequence: consequenceSchema,
  holds: z.boolean(),
  // False when a guard settles it for this record whatever is proposed: it
  // holds, but says nothing about the values. Absent on a proposal kept before
  // verdicts said so, which reads as applying.
  applies: z.boolean().optional(),
  // The app's working of the check on these values, or why it could not run.
  steps: z.array(z.string()),
  error: z.string().nullable(),
});

const proposalRecordSchema = z.looseObject({
  // set: these values; leave: nothing changes for this record.
  action: z.enum(['set', 'leave']),
  values: z.record(z.string(), z.number()).nullable(),
  reason: z.string(),
  // Cells the model relied on, as the source addresses them (a sheet's
  // <tab>!B3).
  cited: z.array(z.string()),
  unsure: z.string().nullable(),
  verdict: verdictSchema,
  checks: z.array(checkVerdictSchema),
});

export const proposalSchema = z.object({
  fingerprint: z.string(),
  readId: z.string(),
  model: z.string(),
  at: z.string(),
  records: z.record(z.string(), proposalRecordSchema),
});

// A proposal still being answered, kept batch by batch.
export const proposalPartSchema = z.object({
  records: z.record(z.string(), proposalRecordSchema),
  models: z.array(z.string()),
});

// The checks on a record as a person saw them when deciding it, as a
// decision on it keeps them (server/storage/decisions.ts).
export const checkVerdictsSchema = z.array(checkVerdictSchema);

export type Verdict = z.infer<typeof verdictSchema>;
export type CheckVerdict = z.infer<typeof checkVerdictSchema>;
export type ProposalRecord = z.infer<typeof proposalRecordSchema>;
export type Proposal = z.infer<typeof proposalSchema>;

/*
  What a decided proposal does to its output tab, and the record of doing it:
  kept on the server, so what was written, on which decisions and how the
  checks found them does not depend on a browser's storage.
*/
const appliedDecisionSchema = z.looseObject({
  kind: z.enum(['approve', 'change', 'reject']),
  // Null when the decision writes nothing.
  values: z.record(z.string(), z.number()).nullable(),
  at: z.string(),
  // For what is written, or left as it is, as the checks found it then.
  verdict: verdictSchema.nullable(),
  // The checks a person let fail, by name.
  failing: z.array(z.string()),
});

// `cell` is the source's address for it (a sheet's <tab>!B3).
const cellChangeSchema = z.looseObject({
  key: z.string(),
  field: z.string(),
  cell: z.string(),
  before: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  after: z.number(),
});

export const applicationSchema = z.looseObject({
  proposedAt: z.string(),
  // A historical name, kept in every application written: the output's
  // resource, whatever the source calls it.
  tab: z.string(),
  at: z.string(),
  // verified: read back as written; mismatch: read back as something else;
  // failed: the write did not land, so the cells are as they were; undone:
  // put back as they were by undo; pending: kept before the write, and not
  // yet read back, so the block may hold either side of it.
  status: z.enum(['pending', 'verified', 'mismatch', 'failed', 'undone']),
  error: z.string().nullable(),
  undoneAt: z.string().nullable(),
  // The block written, as the source addresses one (a sheet's B2:C12), and
  // its cells either side of it.
  range: z.string(),
  before: z.array(z.array(z.unknown())),
  after: z.array(z.array(z.unknown())),
  changes: z.array(cellChangeSchema),
  decisions: z.record(z.string(), appliedDecisionSchema),
  // These two last, as apply.ts adds them, so a record reads back to the
  // byte. The write had to add the resource: its absence means nothing landed.
  addsResource: z.boolean().optional(),
  // When an undo began, kept before it writes: one cut short is finished or
  // cleared by reading the block back.
  undoStartedAt: z.string().optional(),
});

export type AppliedDecision = z.infer<typeof appliedDecisionSchema>;
export type CellChange = z.infer<typeof cellChangeSchema>;
export type Application = z.infer<typeof applicationSchema>;

// Around a value an example tried, in a step, so it can be shown as that
// example's own: private-use characters, never in a formula or the data.
export const TRIED = ['\uE000', '\uE001'] as const;
