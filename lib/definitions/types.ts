import { z } from 'zod';

import type { DefinitionSubject } from '@/lib/process/model';

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
  formula: z.string().nullable(),
  examples: z.array(exampleSchema),
  // Why the version shown is not acceptable, or what stopped the last write.
  problem: z.string().nullable(),
  model: z.string().nullable(),
  approvedAt: z.string().nullable(),
  // The person's denial, and what they said was wrong, until written again.
  deniedAt: z.string().nullable(),
  denial: z.string().nullable(),
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
});

export type Result = z.infer<typeof resultSchema>;
export type Example = z.infer<typeof exampleSchema>;
export type Definition = z.infer<typeof definitionSchema>;
export type DefinitionSet = z.infer<typeof definitionSetSchema>;

// A process the engine works for: its id names where its sets are kept, and
// its subject says what a definition is about and how its data is shaped.
export type DefinitionProcess = { id: string; subject: DefinitionSubject };

// How far a server-side draft has got, while it runs.
export type DraftProgress = {
  step: string;
  error: string | null;
  running: boolean;
};

// Shown as working once it has a formula and every example agrees; the
// server also rechecks the whole definition before accepting it.
export const acceptable = (definition: Definition) =>
  definition.formula !== null &&
  definition.examples.length > 0 &&
  definition.examples.every((e) => e.agrees);

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

// Around a value an example tried, in a step, so it can be shown as that
// example's own: private-use characters, never in a formula or the data.
export const TRIED = ['\uE000', '\uE001'] as const;
