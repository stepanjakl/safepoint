import { isStepCount, streamText, tool, ToolChoiceViolationError } from 'ai';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { fallbackChain, type DraftingModel } from '@/lib/models';
import { runDataDir } from '@/lib/storage/run-data';

import {
  calculate,
  layoutOf,
  onlyRecords,
  type Calculation,
} from './calculate';
import { DRAFT_MODELS, withModels, type Resolve } from './calls';
import { dependentsOf, givenOf } from './checks';
import { limitedGoogle } from './limits';
import { contextFor, run } from './formulas';
import { profiledFor } from './profile';
import { plain, timingOf } from './prompts';
import { cellOf, fitting, type KeptRead, type Row } from './records';
import { fingerprintOf } from './store';
import {
  ignoresProposal,
  type CheckVerdict,
  type DefinitionProcess,
  type DefinitionSet,
  type DraftProgress,
  type Proposal,
  type AnswerProblem,
  type ProposalActivity,
  type ProposalEvent,
  type StreamedPart,
  type Verdict,
} from './types';
import { applies, stepsFor } from './working';

/*
  Server-only. Propose: for every record, the values the model would set, why,
  the cells it relied on and what it is unsure of, found by trying values
  against the accepted checks before it answers. Every answer is checked again
  by code, and the verdicts kept are code's. A record that no value lets
  through is still answered, with the conflict said, never left out.
*/

/*
  Accepted calculations' values for one record, as a check reads them. One that
  cannot be worked out (a blank cell it reads) is left out and said, never
  thrown: only what reads it is lost.
*/
function numbersOf(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  key: string,
): { values: Row; failed: Map<string, string> } {
  const values: Row = {};
  const failed = new Map<string, string>();
  for (const d of set.definitions) {
    if (d.result !== 'number' || !d.approvedAt || !d.formula) continue;
    try {
      values[d.id] = run(
        d.formula,
        contextFor(read, key, owner.subject, givenOf(d, {}), values),
      );
    } catch (error) {
      failed.set(
        d.id,
        `${d.name} cannot be worked out: ${(error as Error).message.split('\n')[0]}`,
      );
    }
  }
  return { values, failed };
}

// What a proposal sets for a record it leaves: each field at the value the
// process says proposes nothing; a field with none declared is left unset.
export const noneOf = (subject: DefinitionProcess['subject']) =>
  Object.fromEntries(
    subject.proposal.flatMap((field) =>
      field.none === undefined ? [] : [[field.id, field.none]],
    ),
  );

// Any check a person must decide on makes it decide; any that blocks, blocked.
// With no accepted check there is nothing to say it is ready.
const verdictOf = (checks: CheckVerdict[], checked: boolean): Verdict =>
  checks.some((c) => !c.holds && c.consequence === 'block')
    ? 'blocked'
    : checks.some((c) => !c.holds)
      ? 'decide'
      : checked
        ? 'ready'
        : 'unchecked';

// Every accepted check on one record's proposed values, with its working.
export function checkProposal(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  key: string,
  values: Record<string, number>,
): { verdict: Verdict; checks: CheckVerdict[] } {
  owner = profiledFor(owner, set);
  const { subject } = owner;
  const { values: numbers, failed } = numbersOf(owner, set, read, key);
  const fields = subject.proposal.map((field) => field.id);
  // The number a check reads, directly or through another, that was left out.
  const unreadable = (d: DefinitionSet['definitions'][number]) => {
    for (const [id, why] of failed)
      if (dependentsOf(set, id).has(d.id)) return why;
    return null;
  };
  const accepted = set.definitions.filter(
    (d) => d.result === 'check' && d.approvedAt && d.formula,
  );
  // A field nothing sets -- a record left, where the field declares no none
  // -- is not read as 0: a check reading it has nothing to judge.
  const unset = subject.proposal.filter((f) => values[f.id] === undefined);
  const checks = accepted.map((d): CheckVerdict => {
    const base = {
      id: d.id,
      name: d.name,
      consequence: d.consequence ?? 'decide',
    };
    const unread = unset.filter(
      (f) => !ignoresProposal(d, set.definitions, [f.id]),
    );
    if (unread.length)
      return {
        ...base,
        holds: true,
        applies: false,
        steps: [`No ${unread.map((f) => f.label).join(' or ')} is proposed`],
        error: null,
      };
    const context = contextFor(read, key, subject, givenOf(d, values), numbers);
    try {
      return {
        ...base,
        holds: run(d.formula!, context) === true,
        applies: applies(d.formula!, context, fields),
        steps: stepsFor(d.formula!, context, fields),
        error: null,
      };
    } catch (error) {
      // A check that cannot run cannot pass; a guard may settle it before
      // it reads the missing number, so only a failed run says so.
      return {
        ...base,
        holds: false,
        applies: true,
        steps: [],
        error: unreadable(d) ?? (error as Error).message.split('\n')[0]!,
      };
    }
  });
  // A value below what the process allows blocks, whatever the rules say.
  for (const field of subject.proposal) {
    const value = values[field.id];
    if (field.min === undefined || value === undefined || value >= field.min)
      continue;
    checks.push({
      id: `min:${field.id}`,
      name: `Proposed ${field.label} at least ${field.min} ${field.unit}`,
      consequence: 'block',
      holds: false,
      applies: true,
      steps: [`${value} ${field.unit} is below ${field.min}`],
      error: null,
    });
  }
  const newcomer = newRecordCheck(set, key, subject.record);
  if (newcomer) checks.push(newcomer);
  return { verdict: verdictOf(checks, accepted.length > 0), checks };
}

/*
  A record the rulebook was not accepted on, where an accepted definition
  groups records by the instructions' words: a formula reading "in the group,
  or not" would put it with the rest in silence. One check a person decides,
  made from the process's own words. None for a rulebook that groups nothing,
  or that kept no record of the keys it was accepted on.
*/
function newRecordCheck(
  set: DefinitionSet,
  key: string,
  { singular, plural }: DefinitionProcess['subject']['record'],
): CheckVerdict | null {
  if (!set.acceptedKeys || set.acceptedKeys.includes(key)) return null;
  const quotes = [
    ...new Set(
      set.definitions
        .filter((d) => d.approvedAt)
        .flatMap((d) => d.groups.filter((g) => g.keys.length))
        .map((g) => `"${g.quote}"`),
    ),
  ];
  if (!quotes.length) return null;
  return {
    id: 'new:record',
    name: `New ${singular} since the rules were accepted: a person confirms which of the named groups it belongs to`,
    consequence: 'decide',
    holds: false,
    applies: true,
    steps: [
      `${key} was not among the ${plural} the rules were accepted on`,
      `The rules name groups by their words: ${quotes.join('; ')}`,
    ],
    error: null,
  };
}

// A cell the model cites, as a person finds it: <tab>!B3. Or why it is none.
type Cite = { tab: string; row: number; column: string };
type CiteProblem = DistributiveOmit<
  Extract<AnswerProblem, { kind: 'no-tab' | 'no-column' | 'no-row' | 'blank' }>,
  'key'
>;
function cellCited(read: KeptRead, cite: Cite): string | CiteProblem {
  const tab = read.tabs.find((t) => t.name === cite.tab);
  if (!tab) return { kind: 'no-tab', tab: cite.tab };
  const header = (tab.values[0] ?? []).map(String);
  const column = header.indexOf(cite.column);
  if (column < 0)
    return { kind: 'no-column', tab: cite.tab, column: cite.column };
  // Rows as the data shows them: the header is row 1.
  const values = tab.values[cite.row - 1];
  if (cite.row < 2 || !values)
    return { kind: 'no-row', tab: cite.tab, row: cite.row };
  const raw = values[column];
  if (raw === undefined || raw === null || raw === '')
    return { kind: 'blank', cell: cellOf(cite.tab, column, cite.row - 1) };
  return cellOf(cite.tab, column, cite.row - 1);
}

/*
  The problems as the model is told them, one sentence each, the records
  left out last and together. A page words the same facts its own way.
*/
function problemSentences(problems: AnswerProblem[]): string[] {
  const unanswered = problems
    .filter((p) => p.kind === 'unanswered')
    .map((p) => p.key);
  return [
    ...problems.flatMap((p) => {
      switch (p.kind) {
        case 'unanswered':
          return [];
        case 'twice':
          return [`${p.key} is answered twice`];
        case 'no-values':
          return [`${p.key} sets no values`];
        case 'no-tab':
          return [`${p.key} cites ${p.tab} is not a tab of the data`];
        case 'no-column':
          return [`${p.key} cites ${p.tab} has no ${p.column} column`];
        case 'no-row':
          return [`${p.key} cites ${p.tab} has no data row ${p.row}`];
        case 'blank':
          return [`${p.key} cites ${p.cell} is blank`];
      }
    }),
    ...(unanswered.length ? [`not answered: ${unanswered.join(', ')}`] : []),
  ];
}

// The data with its rows numbered, so a cell can be cited by row and column.
const numberedDataOf = (read: KeptRead) =>
  read.tabs
    .map(
      (t) =>
        `${t.name}:\n${t.values.map((r, i) => `${i + 1}: ${JSON.stringify(r)}`).join('\n')}`,
    )
    .join('\n\n');

// A batch's conversation: try values, then submit every record at once.
const STEPS = 24;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

// What a proposal's model is doing, kept as it happens, and told each change.
export type Watch = { activity: ProposalActivity; changed: () => void };

export const newActivity = (): ProposalActivity => ({
  model: null,
  thought: null,
  writing: 0,
  events: [],
  tokens: { input: 0, output: 0, thinking: 0 },
  stream: [],
});

// Enough for a long conversation's parts; a runaway one stops being kept.
const STREAM_PARTS = 400;
const PIECES = {
  'text-delta': ['text-start', 'text'],
  'reasoning-delta': ['reasoning-start', 'text'],
  'tool-input-delta': ['tool-input-start', 'input'],
} as const;

/*
  One streamed part, kept as it came. A piece of a text, a thought or a tool's
  input joins the part it belongs to, so the record shows each whole. What was
  sent (a step's request) is not what came back, and is left out.
*/
function keepPart(stream: StreamedPart[], raw: { type: string }) {
  if (stream.length >= STREAM_PARTS) return;
  const at = new Date().toISOString();
  const piece = PIECES[raw.type as keyof typeof PIECES];
  if (piece) {
    const { id, delta, text } = raw as {
      id?: string;
      delta?: string;
      text?: string;
    };
    const into = stream.findLast(
      (kept) => kept.part.type === piece[0] && kept.part.id === id,
    );
    if (into) {
      into.part[piece[1]] =
        `${(into.part[piece[1]] as string | undefined) ?? ''}${delta ?? text ?? ''}`;
      return;
    }
  }
  const part: { type: string } & Record<string, unknown> = { ...raw };
  delete part.request;
  stream.push({
    at,
    from:
      part.type === 'tool-result' || part.type === 'tool-error'
        ? 'app'
        : 'model',
    // Plain data: dates as their strings, nothing that cannot be sent.
    part: JSON.parse(JSON.stringify(part)) as StreamedPart['part'],
  });
}

// The thought being written: its last section, as a person can follow it.
const THOUGHT_CHARS = 600;
const latestThought = (text: string) => {
  const sections = text.split(/\n(?=\*\*)/);
  const last = (sections.at(-1) ?? '').trim();
  return last.length > THOUGHT_CHARS
    ? `…${last.slice(-THOUGHT_CHARS)}`
    : last || null;
};

async function proposeBatch(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  text: string,
  calculation: Calculation,
  keys: [string, ...string[]],
  models: DraftingModel[],
  resolve: Resolve | undefined,
  watch?: Watch,
): Promise<{ records: Proposal['records']; model: string }> {
  const { subject } = owner;
  // A fact for whoever watches, worded by them in the process's nouns.
  const event = (happened: DistributiveOmit<ProposalEvent, 'at'>) => {
    watch?.activity.events.push({
      at: new Date().toISOString(),
      ...happened,
    } as ProposalEvent);
    watch?.changed();
  };
  const { singular, plural } = subject.record;
  const fieldsShape = Object.fromEntries(
    subject.proposal.map((field) => [
      field.id,
      (field.min === undefined
        ? z.number().int()
        : z.number().int().min(field.min)
      ).describe(`The proposed ${field.label}, in ${field.unit}`),
    ]),
  );
  const valuesSchema = z.object(fieldsShape);
  const keySchema = z.enum(keys).describe(`The ${singular}'s key`);
  const citeSchema = z.object({
    tab: z.string(),
    row: z.number().int().describe('The row number the data shows'),
    column: z.string().describe("The header's name for the column"),
  });
  const submitSchema = z.object({
    records: z
      .array(
        z.object({
          key: keySchema,
          action: z
            .enum(['set', 'leave'])
            .describe(
              `set: propose values; leave: nothing changes for this ${singular}`,
            ),
          values: valuesSchema
            .nullable()
            .describe('Null when the action is leave'),
          reason: z.string().describe('Why, in plain words, with the numbers'),
          cited: z.array(citeSchema).describe('The cells this relies on'),
          unsure: z
            .string()
            .nullable()
            .describe('What is uncertain or in conflict; null when nothing is'),
        }),
      )
      .describe(`One entry per ${singular}`),
  });

  let submitted: Proposal['records'] | null = null;
  let last: string[] | null = null;
  let same = 0;

  const checks = set.definitions.filter(
    (d) => d.result === 'check' && d.approvedAt,
  );
  const tools = {
    // Several records a call: each round trip to the model costs far more
    // than the checks, so the model tries a whole batch at once.
    try_proposals: tool({
      description: `Run every accepted check on proposed values for as many ${plural} as you like at once: for each, every check's verdict and working. Try values here before you submit.`,
      inputSchema: z.object({
        proposals: z
          .array(z.object({ key: keySchema, values: valuesSchema }))
          .min(1)
          .describe(`Values to try, one entry per ${singular}`),
      }),
      execute: async ({ proposals }) => {
        event({ kind: 'tried', records: proposals.length });
        return {
          results: proposals.map(({ key, values }) => {
            const { verdict, checks } = checkProposal(
              owner,
              set,
              read,
              key,
              values,
            );
            return {
              key,
              verdict,
              checks: checks.map((c) => ({
                check: c.name,
                failing:
                  c.consequence === 'block' ? 'blocks' : 'a person decides',
                holds: c.holds,
                // A check its guard settles says nothing about the values.
                applies: c.applies,
                working: c.error ?? c.steps.join(' → '),
              })),
            };
          }),
        };
      },
    }),
  };
  const submit = {
    submit_proposals: tool({
      description: `Submit every ${singular} at once. Returns ok, or each problem to fix and submit again.`,
      inputSchema: submitSchema,
      execute: async ({ records }) => {
        const found: AnswerProblem[] = [];
        const answered: Proposal['records'] = {};
        for (const answer of records) {
          const { key } = answer;
          if (answered[key]) {
            found.push({ kind: 'twice', key });
            continue;
          }
          if (answer.action === 'set' && !answer.values)
            found.push({ kind: 'no-values', key });
          const cited: string[] = [];
          for (const cite of answer.cited) {
            const cell = cellCited(read, cite);
            if (typeof cell === 'string') cited.push(cell);
            else found.push({ ...cell, key });
          }
          const values = answer.action === 'set' ? answer.values : null;
          // Leaving changes nothing, but the data may still fail a check.
          const checked = checkProposal(
            owner,
            set,
            read,
            answer.key,
            values ?? noneOf(subject),
          );
          answered[answer.key] = {
            action: answer.action,
            values,
            reason: answer.reason,
            cited,
            unsure: answer.unsure,
            ...checked,
          };
        }
        for (const key of keys)
          if (!answered[key]) found.push({ kind: 'unanswered', key });
        const problems = problemSentences(found);
        same =
          last && JSON.stringify(last) === JSON.stringify(problems)
            ? same + 1
            : 1;
        last = problems;
        event({
          kind: 'answered',
          records: records.length,
          set: records.filter((r) => r.action === 'set').length,
          leave: records.filter((r) => r.action === 'leave').length,
          unsure: records.filter((r) => r.unsure).length,
          cited: records.reduce((total, r) => total + r.cited.length, 0),
          problems: found,
        });
        if (problems.length) return { ok: false, problems };
        submitted = answered;
        return { ok: true };
      },
    }),
  };

  const values = (key: string) =>
    calculation.calculations
      .map((c) => {
        const cell = calculation.rows.find((r) => r.key === key)?.values[c.id];
        return `${c.id} = ${cell?.value ?? cell?.error ?? '—'}`;
      })
      .join(', ');
  const checksText = checks
    .map(
      (d) =>
        `- ${d.name}: ${d.text} (failing it ${d.consequence === 'block' ? 'blocks the proposal' : 'needs a person to decide'})`,
    )
    .join('\n');
  // With no rulebook, the model works every value out itself, and a person
  // reviewing it is the only check.
  const checked = checks.length > 0;
  const worked = calculation.calculations.length > 0;
  const fields = subject.proposal
    .map((field) => `${field.id} (the ${field.label}, in ${field.unit})`)
    .join(', ');

  const { model } = await withModels(
    models,
    'propose',
    resolve ?? limitedGoogle,
    async (languageModel, options) => {
      try {
        const answer = streamText({
          model: languageModel,
          system: [
            `You propose, for every ${singular}, what to set: ${fields}, as the instructions intend.`,
            ...(checked
              ? [
                  'Every proposal is checked against the accepted checks below. Use try_proposals to try values and read each verdict, then choose values that pass. Try as many records in one call as you can: every call is slow.',
                  'Where no values pass every check that blocks, propose the closest values that do pass those, and say in unsure what conflicts.',
                ]
              : [
                  'Work every value out yourself from the instructions and the data, following each rule the instructions state. A person reviews every proposal, and nothing else checks it.',
                  'Where the instructions conflict for a record, or the data does not settle it, propose the closest values and say in unsure what conflicts.',
                ]),
            'Never leave a record out.',
            `Use leave for a ${singular} where nothing should change.`,
            `Read every number from the data${worked ? ' and the values worked out' : ''}, not from memory. Cite the cells you rely on by tab, the row number shown, and the column name.`,
            `Answer only by calling submit_proposals with every ${singular}; when it reports problems, fix them and submit again. ${plain(subject)}`,
          ].join('\n'),
          prompt: [
            `Instructions:\n${text}`,
            ...(checked ? [`The accepted checks:\n${checksText}`] : []),
            worked
              ? `The ${plural} to propose for, with the values worked out for each:\n${keys
                  .map((key) => `- ${key}: ${values(key)}`)
                  .join('\n')}`
              : `The ${plural} to propose for:\n${keys.map((key) => `- ${key}`).join('\n')}`,
            `How the data fits together:\n${layoutOf(subject)}`,
            `The data, by tab, each row numbered (row 1 is the header):\n${numberedDataOf(onlyRecords(read, subject, keys))}`,
            timingOf(onlyRecords(read, subject, keys), subject.data),
          ].join('\n\n'),
          // Nothing to try values against without checks.
          tools: checked ? { ...tools, ...submit } : submit,
          stopWhen: [
            isStepCount(STEPS),
            () => submitted !== null,
            () => same >= 3,
          ],
          prepareStep: () => ({ toolChoice: 'required' as const }),
          timeout: { stepMs: 180_000, totalMs: 900_000 },
          ...options,
          // Its thought summaries, for a person watching it work.
          providerOptions: {
            ...options.providerOptions,
            google: {
              ...options.providerOptions?.google,
              thinkingConfig: {
                ...options.providerOptions?.google.thinkingConfig,
                includeThoughts: true,
              },
            },
          },
          // An error is a part of the stream, rethrown below so the next
          // model is tried as with any failed call.
          onError: () => undefined,
        });
        let thinking = '';
        let input = '';
        for await (const part of answer.fullStream) {
          const activity = watch?.activity;
          if (part.type === 'error') throw part.error;
          if (!activity) continue;
          keepPart((activity.stream ??= []), part);
          watch.changed();
          if (part.type === 'start-step') {
            thinking = '';
            // Said only when there is something to say.
            if (part.warnings.length)
              event({
                kind: 'warned',
                warnings: part.warnings.map((w) => JSON.stringify(w)),
              });
          } else if (part.type === 'reasoning-delta') {
            thinking += part.text;
            activity.thought = latestThought(thinking);
            watch.changed();
          } else if (part.type === 'tool-input-start') input = '';
          else if (part.type === 'tool-input-delta') {
            input += part.delta;
            activity.writing = input.match(/"key"\s*:/g)?.length ?? 0;
            watch.changed();
          } else if (part.type === 'finish-step') {
            activity.writing = 0;
            activity.stepMs =
              (activity.stepMs ?? 0) + part.performance.stepTimeMs;
            // Answering through a tool, or simply stopping, is the ordinary
            // end; anything else -- cut short, filtered -- is said.
            if (!['tool-calls', 'stop'].includes(part.finishReason))
              event({ kind: 'ended', reason: part.finishReason });
            activity.tokens.input += part.usage.inputTokens ?? 0;
            activity.tokens.output += part.usage.outputTokens ?? 0;
            activity.tokens.thinking +=
              part.usage.outputTokenDetails.reasoningTokens ?? 0;
            watch.changed();
          }
        }
      } catch (error) {
        // An answer in text rather than through the tools ends the
        // conversation; what was submitted so far stands.
        if (!ToolChoiceViolationError.isInstance(error)) throw error;
      }
    },
    (told) => {
      if (!watch) return;
      if (told.kind === 'asking') {
        watch.activity.model = told.model;
        watch.activity.thought = null;
        event({ kind: 'asked', model: told.model });
      } else event(told);
    },
  );
  const answered = submitted as Proposal['records'] | null;
  if (!answered)
    throw new Error(
      `The model's proposal did not come through: ${(last ?? ['nothing was submitted']).slice(0, 3).join('; ')}.`,
    );
  return { records: answered, model };
}

/*
  Kept in data/<process>/proposals/ by read and rulebook, written whole; one
  still being answered is kept beside it as a part, batch by batch, so a
  proposal that stops part way asks only for the rest.
*/
const proposalFile = (
  owner: DefinitionProcess,
  readId: string,
  fp: string,
  part = false,
) => {
  // Both name a file: never a path.
  if (![readId, fp].every((id) => /^[\w-]+$/.test(id)))
    throw new Error('Not a read or rulebook id.');
  return path.join(
    runDataDir(owner.id, 'proposals'),
    `${readId}.${fp}${part ? '.part' : ''}.json`,
  );
};

export async function writeWhole(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export const keptProposal = (
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
) => readJson<Proposal>(proposalFile(owner, readId, fingerprint));

// Records a call proposes for: few enough that its answer fits.
const BATCH = 25;

export async function propose(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  readId: string,
  text: string,
  {
    model: chosen = null,
    resolve,
    batch = BATCH,
    onBatch,
    watch,
  }: {
    model?: DraftingModel | null;
    resolve?: Resolve;
    batch?: number;
    // Told as each batch starts: which, of how many.
    onBatch?: (at: number, of: number) => void;
    watch?: Watch;
  } = {},
): Promise<Proposal> {
  owner = profiledFor(owner, set);
  fitting(read, owner.subject.data);
  const open = set.definitions.filter((d) => !d.approvedAt);
  if (open.length)
    throw new Error(
      `Not every rule is accepted: ${open.map((d) => d.name).join(', ')}.`,
    );
  const calculation = calculate(owner, set, read);
  const keys = calculation.rows.map((row) => row.key);
  if (!keys.length) throw new Error('The read has no records.');
  const fingerprint = fingerprintOf(set);
  const models = chosen ? fallbackChain(chosen) : DRAFT_MODELS;
  const partFile = proposalFile(owner, readId, fingerprint, true);
  const sofar = await readJson<{
    records: Proposal['records'];
    models: string[];
  }>(partFile);
  const records: Proposal['records'] = { ...sofar?.records };
  const answeredBy = new Set(sofar?.models ?? []);
  const left = keys.filter((key) => !records[key]);
  const batches = Math.ceil(left.length / batch);
  for (let at = 0; at < left.length; at += batch) {
    onBatch?.(at / batch + 1, batches);
    const [first, ...rest] = left.slice(at, at + batch);
    const answer = await proposeBatch(
      owner,
      set,
      read,
      text,
      calculation,
      [first!, ...rest],
      models,
      resolve,
      watch,
    );
    Object.assign(records, answer.records);
    answeredBy.add(answer.model);
    await writeWhole(partFile, { records, models: [...answeredBy] });
  }
  const proposal: Proposal = {
    fingerprint,
    readId,
    model: [...answeredBy].join(', '),
    at: new Date().toISOString(),
    // In the records' own order, however the batches came back.
    records: Object.fromEntries(keys.map((key) => [key, records[key]!])),
  };
  await writeWhole(proposalFile(owner, readId, fingerprint), proposal);
  await rm(partFile, { force: true });
  return proposal;
}

/*
  A proposal as a server-side job, as a draft is (draft.ts): it carries on
  when the page is closed, its progress written as it goes, so one the server
  stopped part way through says so.
*/
// Held on globalThis for the same reason as draft.ts's drafts.
const server = globalThis as {
  definitionProposals?: Map<string, DraftProgress>;
};
const jobs = (server.definitionProposals ??= new Map<string, DraftProgress>());
const jobFile = (owner: DefinitionProcess, readId: string, fp: string) =>
  proposalFile(owner, readId, `${fp}-progress`);

const INTERRUPTED =
  'The server stopped during this proposal, so it did not finish. Propose again to carry on from where it stopped.';

export async function proposalProgress(
  owner: DefinitionProcess,
  readId: string,
  fingerprint: string,
): Promise<DraftProgress | null> {
  // A copy, as in draft.ts: the job changes the one held.
  const held = jobs.get(`${owner.id}:${readId}:${fingerprint}`);
  if (held) return { ...held };
  const kept = await readJson<DraftProgress>(
    jobFile(owner, readId, fingerprint),
  );
  if (!kept) return null;
  return kept.running ? { ...kept, running: false, error: INTERRUPTED } : kept;
}

export function startProposal(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  readId: string,
  text: string,
  options: { model?: DraftingModel | null; resolve?: Resolve } = {},
): DraftProgress {
  const fingerprint = fingerprintOf(set);
  const key = `${owner.id}:${readId}:${fingerprint}`;
  const running = jobs.get(key);
  if (running?.running) return running;
  const progress: DraftProgress = {
    step: 'Proposing…',
    error: null,
    running: true,
    activity: newActivity(),
  };
  jobs.set(key, progress);
  const note = () =>
    writeWhole(jobFile(owner, readId, fingerprint), progress).catch(
      () => undefined,
    );
  // A poll reads the job held in memory; the file only outlives a restart,
  // so a thought arriving word by word is written now and then.
  let noted = 0;
  const changed = () => {
    if (Date.now() - noted < NOTE_EVERY_MS) return;
    noted = Date.now();
    void note();
  };
  void (async () => {
    await note();
    try {
      const done = await propose(owner, set, read, readId, text, {
        ...options,
        watch: { activity: progress.activity!, changed },
        onBatch: (at, of) => {
          progress.step =
            of > 1 ? `Proposing ${at} of ${of} batches…` : 'Proposing…';
          void note();
        },
      });
      progress.step = `Proposed for ${Object.keys(done.records).length} ${owner.subject.record.plural}.`;
    } catch (error) {
      progress.error =
        error instanceof Error ? error.message.split('\n')[0]! : 'Failed.';
    } finally {
      progress.running = false;
      progress.activity!.thought = null;
      progress.activity!.writing = 0;
      await note();
    }
  })();
  return progress;
}

const NOTE_EVERY_MS = 2000;
