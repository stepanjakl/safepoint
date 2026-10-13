import { google } from '@ai-sdk/google';
import { generateText, isStepCount, tool, ToolChoiceViolationError } from 'ai';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { fallbackChain, type DraftingModel } from '@/lib/rulebook/models';
import { runDataDir } from '@/lib/storage/run-data';

import {
  calculate,
  layoutOf,
  onlyRecords,
  type Calculation,
} from './calculate';
import { DRAFT_MODELS, withModels, type Resolve } from './calls';
import { givenOf } from './checks';
import { contextFor, run } from './formulas';
import { plain } from './prompts';
import { cellOf, fitting, type KeptRead, type Row } from './records';
import { fingerprintOf } from './store';
import type {
  CheckVerdict,
  DefinitionProcess,
  DefinitionSet,
  DraftProgress,
  Proposal,
  Verdict,
} from './types';
import { stepsFor } from './working';

/*
  Server-only. Propose: for every record, the values the model would set, why,
  the cells it relied on and what it is unsure of, found by trying values
  against the accepted checks before it answers. Every answer is checked again
  by code, and the verdicts kept are code's. A record that no value lets
  through is still answered, with the conflict said, never left out.
*/

// Accepted calculations' values for one record, as a check reads them.
function numbersOf(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  key: string,
): Row {
  const values: Row = {};
  for (const d of set.definitions) {
    if (d.result !== 'number' || !d.approvedAt || !d.formula) continue;
    values[d.id] = run(
      d.formula,
      contextFor(read, key, owner.subject, givenOf(d, {}), values),
    );
  }
  return values;
}

// Any check a person must decide on makes it decide; any that blocks, blocked.
const verdictOf = (checks: CheckVerdict[]): Verdict =>
  checks.some((c) => !c.holds && c.consequence === 'block')
    ? 'blocked'
    : checks.some((c) => !c.holds)
      ? 'decide'
      : 'ready';

// Every accepted check on one record's proposed values, with its working.
export function checkProposal(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  key: string,
  values: Record<string, number>,
): { verdict: Verdict; checks: CheckVerdict[] } {
  const { subject } = owner;
  const numbers = numbersOf(owner, set, read, key);
  const fields = subject.proposal.map((field) => field.id);
  const checks = set.definitions
    .filter((d) => d.result === 'check' && d.approvedAt && d.formula)
    .map((d): CheckVerdict => {
      const context = contextFor(
        read,
        key,
        subject,
        givenOf(d, values),
        numbers,
      );
      const base = {
        id: d.id,
        name: d.name,
        consequence: d.consequence ?? 'decide',
      };
      try {
        return {
          ...base,
          holds: run(d.formula!, context) === true,
          steps: stepsFor(d.formula!, context, fields),
          error: null,
        };
      } catch (error) {
        // A check that cannot run cannot pass.
        return {
          ...base,
          holds: false,
          steps: [],
          error: (error as Error).message.split('\n')[0]!,
        };
      }
    });
  return { verdict: verdictOf(checks), checks };
}

// A cell the model cites, as a person finds it: Stock!B3. Or why it is none.
type Cite = { tab: string; row: number; column: string };
function cellCited(read: KeptRead, cite: Cite): string | { problem: string } {
  const tab = read.tabs.find((t) => t.name === cite.tab);
  if (!tab) return { problem: `${cite.tab} is not a tab of the data` };
  const header = (tab.values[0] ?? []).map(String);
  const column = header.indexOf(cite.column);
  if (column < 0)
    return { problem: `${cite.tab} has no ${cite.column} column` };
  // Rows as the data shows them: the header is row 1.
  const values = tab.values[cite.row - 1];
  if (cite.row < 2 || !values)
    return { problem: `${cite.tab} has no data row ${cite.row}` };
  const raw = values[column];
  if (raw === undefined || raw === null || raw === '')
    return {
      problem: `${cellOf(cite.tab, column, cite.row - 1)} is blank`,
    };
  return cellOf(cite.tab, column, cite.row - 1);
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

async function proposeBatch(
  owner: DefinitionProcess,
  set: DefinitionSet,
  read: KeptRead,
  text: string,
  calculation: Calculation,
  keys: [string, ...string[]],
  models: DraftingModel[],
  resolve: Resolve | undefined,
): Promise<{ records: Proposal['records']; model: string }> {
  const { subject } = owner;
  const { singular, plural } = subject.record;
  const fieldsShape = Object.fromEntries(
    subject.proposal.map((field) => [
      field.id,
      z
        .number()
        .int()
        .describe(`The proposed ${field.label}, in ${field.unit}`),
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

  const tools = {
    try_proposal: tool({
      description: `Run every accepted check on proposed values for one ${singular}: each check's verdict and working. Try values here before you submit.`,
      inputSchema: z.object({ key: keySchema, values: valuesSchema }),
      execute: async ({ key, values }) => {
        const { verdict, checks } = checkProposal(
          owner,
          set,
          read,
          key,
          values,
        );
        return {
          verdict,
          checks: checks.map((c) => ({
            check: c.name,
            failing: c.consequence === 'block' ? 'blocks' : 'a person decides',
            holds: c.holds,
            working: c.error ?? c.steps.join(' → '),
          })),
        };
      },
    }),
    submit_proposals: tool({
      description: `Submit every ${singular} at once. Returns ok, or each problem to fix and submit again.`,
      inputSchema: submitSchema,
      execute: async ({ records }) => {
        const problems: string[] = [];
        const answered: Proposal['records'] = {};
        for (const answer of records) {
          if (answered[answer.key]) {
            problems.push(`${answer.key} is answered twice`);
            continue;
          }
          if (answer.action === 'set' && !answer.values)
            problems.push(`${answer.key} sets no values`);
          const cited: string[] = [];
          for (const cite of answer.cited) {
            const cell = cellCited(read, cite);
            if (typeof cell === 'string') cited.push(cell);
            else problems.push(`${answer.key} cites ${cell.problem}`);
          }
          const values = answer.action === 'set' ? answer.values : null;
          const checked = values
            ? checkProposal(owner, set, read, answer.key, values)
            : { verdict: 'ready' as const, checks: [] };
          answered[answer.key] = {
            action: answer.action,
            values,
            reason: answer.reason,
            cited,
            unsure: answer.unsure,
            ...checked,
          };
        }
        const missing = keys.filter((key) => !answered[key]);
        if (missing.length)
          problems.push(`not answered: ${missing.join(', ')}`);
        same =
          last && JSON.stringify(last) === JSON.stringify(problems)
            ? same + 1
            : 1;
        last = problems;
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
  const checks = set.definitions
    .filter((d) => d.result === 'check' && d.approvedAt)
    .map(
      (d) =>
        `- ${d.name}: ${d.text} (failing it ${d.consequence === 'block' ? 'blocks the proposal' : 'needs a person to decide'})`,
    )
    .join('\n');
  const fields = subject.proposal
    .map((field) => `${field.id} (the ${field.label}, in ${field.unit})`)
    .join(', ');

  const { model } = await withModels(
    models,
    'propose',
    resolve ?? google,
    async (languageModel, options) => {
      try {
        await generateText({
          model: languageModel,
          system: [
            `You propose, for every ${singular}, what to set: ${fields}, as the instructions intend.`,
            'Every proposal is checked against the accepted checks below. Use try_proposal to try values and read each verdict, then choose values that pass.',
            'Where no values pass every check that blocks, propose the closest values that do pass those, and say in unsure what conflicts. Never leave a record out.',
            `Use leave for a ${singular} where nothing should change.`,
            'Read every number from the data and the values worked out, not from memory. Cite the cells you rely on by tab, the row number shown, and the column name.',
            `Answer only by calling submit_proposals with every ${singular}; when it reports problems, fix them and submit again. ${plain(subject)}`,
          ].join('\n'),
          prompt: [
            `Instructions:\n${text}`,
            `The accepted checks:\n${checks}`,
            `The ${plural} to propose for, with the values worked out for each:\n${keys
              .map((key) => `- ${key}: ${values(key)}`)
              .join('\n')}`,
            `How the data fits together:\n${layoutOf(subject)}`,
            `The data, by tab, each row numbered (row 1 is the header):\n${numberedDataOf(onlyRecords(read, subject, keys))}`,
          ].join('\n\n'),
          tools,
          stopWhen: [
            isStepCount(STEPS),
            () => submitted !== null,
            () => same >= 3,
          ],
          prepareStep: () => ({ toolChoice: 'required' as const }),
          timeout: { stepMs: 180_000, totalMs: 900_000 },
          ...options,
        });
      } catch (error) {
        // An answer in text rather than through the tools ends the
        // conversation; what was submitted so far stands.
        if (!ToolChoiceViolationError.isInstance(error)) throw error;
      }
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

async function writeWhole(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

async function readJson<T>(file: string): Promise<T | null> {
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
  }: {
    model?: DraftingModel | null;
    resolve?: Resolve;
    batch?: number;
    // Told as each batch starts: which, of how many.
    onBatch?: (at: number, of: number) => void;
  } = {},
): Promise<Proposal> {
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
    // In the records' own order, whatever order the batches came back in.
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
  const held = jobs.get(`${owner.id}:${readId}:${fingerprint}`);
  if (held) return held;
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
  };
  jobs.set(key, progress);
  const note = () =>
    writeWhole(jobFile(owner, readId, fingerprint), progress).catch(
      () => undefined,
    );
  void (async () => {
    await note();
    try {
      const done = await propose(owner, set, read, readId, text, {
        ...options,
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
      await note();
    }
  })();
  return progress;
}
