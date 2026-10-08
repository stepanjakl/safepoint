import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { google } from '@ai-sdk/google';
import { APICallError, generateText, Output, RetryError } from 'ai';
import { z } from 'zod';

import {
  fallbackChain,
  thinkingLevel,
  type DraftingModel,
} from '@/lib/rulebook/models';

import { contextFor, describe, parseError, recordsOf, run } from './formulas';
import { BRUNCH_ORDERS_ID } from './process';
import type { KeptRead } from './reads';

/*
  Server-only. The rules of one version of the instructions, found by a model
  and checked one at a time (docs/BRUNCH-ORDERS-PLAN.md, phase 2).

  Finding lists, in plain words, the intent, the rules and the values the rules
  need (such as expected sales). Writing gives one of them a formula and two or
  three examples on real products; code runs every example, and the person
  accepts or denies the item as its examples show it: accepting needs every
  example to agree with the formula; a denial, with what is wrong, goes back
  to the model when it writes again.

  Kept per instructions text (its hash), in the repository like any approved
  policy; a new version of the instructions starts its own.
*/

const DIR = path.join(process.cwd(), 'fixtures', BRUNCH_ORDERS_ID, 'rules');
// Finding is reading; Flash-Lite does it well. Writing a formula is the hard
// part and a handful of calls, so it starts with Flash and falls back.
const FIND_MODELS: DraftingModel[] = fallbackChain('gemini-3.5-flash-lite');
const WRITE_MODELS: DraftingModel[] = [
  ...fallbackChain('gemini-3.8-flash'),
  ...FIND_MODELS,
];
const ATTEMPTS = 3;

export type Example = {
  sku: string;
  // Rules only: the order the example proposes.
  order: number | null;
  // What the model says should come out: whether the rule holds, or the value.
  expect: boolean | number;
  why: string;
  // What the formula gives, run on the read.
  actual: boolean | number | null;
  error: string | null;
  agrees: boolean;
};

export type Item = {
  id: string;
  kind: 'value' | 'rule';
  text: string;
  // Rules only: what breaking it does.
  outcome: 'block' | 'decide' | null;
  formula: string | null;
  examples: Example[];
  // The last attempt's problem, when it could not be made to agree.
  problem: string | null;
  model: string | null;
  approvedAt: string | null;
  // The person's denial, and what they said was wrong, until written again.
  deniedAt?: string | null;
  denial?: string | null;
};

export type RuleSet = {
  hash: string;
  version: string;
  intent: string;
  intentConfirmedAt: string | null;
  // The read the examples were run on.
  readId: string | null;
  items: Item[];
  foundAt: string;
  model: string;
};

const hashOf = (text: string) =>
  createHash('sha256').update(text).digest('hex').slice(0, 12);

const fileOf = (hash: string) => path.join(DIR, `${hash}.json`);

export async function ruleSet(text: string): Promise<RuleSet | null> {
  try {
    return JSON.parse(await readFile(fileOf(hashOf(text)), 'utf8')) as RuleSet;
  } catch {
    return null;
  }
}

async function save(set: RuleSet) {
  await mkdir(DIR, { recursive: true });
  await writeFile(fileOf(set.hash), `${JSON.stringify(set, null, 2)}\n`);
  return set;
}

// ── the model ─────────────────────────────────────────────────────────────

// One structured call, moving to the next older model of the family when the
// service is busy or out of quota (never on a bad request).
async function ask<T>(
  models: DraftingModel[],
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
  name: string,
): Promise<{ output: T; model: string }> {
  const telemetry =
    process.env.NODE_ENV === 'development'
      ? (await import('@ai-sdk/devtools')).DevToolsTelemetry({
          runId: `brunch-orders-${name}-${Date.now()}`,
        })
      : null;
  let last: unknown = null;
  for (const model of models) {
    try {
      const result = await generateText({
        model: google(model),
        system,
        prompt,
        output: Output.object({ schema }),
        // Flash at its default thinking runs past any sensible timeout.
        providerOptions: thinkingLevel(model)
          ? {
              google: {
                thinkingConfig: { thinkingLevel: thinkingLevel(model) },
              },
            }
          : undefined,
        telemetry: telemetry
          ? { functionId: `brunch-orders-${name}`, integrations: [telemetry] }
          : undefined,
        maxRetries: 2,
        timeout: { totalMs: 180_000 },
      });
      return { output: result.output as T, model };
    } catch (error) {
      last = error;
      const cause = RetryError.isInstance(error) ? error.lastError : error;
      const busy =
        APICallError.isInstance(cause) &&
        (cause.statusCode === 429 || (cause.statusCode ?? 0) >= 500);
      if (!busy) throw error;
    }
  }
  throw last instanceof Error ? last : new Error('The model service failed.');
}

const PLAIN =
  'Write for the store owner, in plain everyday words: no code, no field names.';

const findSchema = z.object({
  intent: z
    .string()
    .describe('The intent of the instructions, in one plain sentence'),
  values: z
    .array(
      z.object({
        id: z.string().describe('snake_case, such as expected_sales'),
        text: z
          .string()
          .describe(
            'What the value is and how the instructions say to work it out',
          ),
      }),
    )
    .describe('Values the rules need that the instructions define'),
  rules: z.array(
    z.object({
      text: z
        .string()
        .describe('The rule, close to how the instructions say it'),
      outcome: z
        .enum(['block', 'decide'])
        .describe(
          'block: an order breaking it must not go ahead; decide: a person decides',
        ),
    }),
  ),
});

export async function findRules(
  text: string,
  version: string,
): Promise<RuleSet> {
  const { output, model } = await ask(
    FIND_MODELS,
    findSchema,
    [
      "You read a store process's instructions and list what they ask, nothing more.",
      'Restate the intent in one sentence.',
      "List every rule the instructions state, one each, in the instructions' own words or very close; never invent one.",
      'List the values the rules need that the instructions define (such as how much is expected to sell), each with how the instructions say to work it out.',
      PLAIN,
    ].join('\n'),
    `Instructions:\n${text}`,
    'find',
  );
  return save({
    hash: hashOf(text),
    version,
    intent: output.intent,
    intentConfirmedAt: null,
    readId: null,
    foundAt: new Date().toISOString(),
    model,
    items: [
      ...output.values.map((v) => ({
        id: v.id.replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
        kind: 'value' as const,
        text: v.text,
        outcome: null,
      })),
      ...output.rules.map((r, i) => ({
        id: `rule_${i + 1}`,
        kind: 'rule' as const,
        text: r.text,
        outcome: r.outcome,
      })),
    ].map((item) => ({
      ...item,
      formula: null,
      examples: [],
      problem: null,
      model: null,
      approvedAt: null,
    })),
  });
}

export async function update(
  text: string,
  change: (set: RuleSet) => RuleSet,
): Promise<RuleSet | null> {
  const set = await ruleSet(text);
  return set ? save(change(set)) : null;
}

// ── checking a formula on its examples ───────────────────────────────────

// The values worked out for one product, in the order they were found, from
// those that have a formula; a value that fails is left out.
function valuesFor(set: RuleSet, read: KeptRead, sku: string, upTo: string) {
  const values: Record<string, unknown> = {};
  for (const item of set.items) {
    if (item.id === upTo) break;
    if (item.kind !== 'value' || !item.formula) continue;
    try {
      values[item.id] = run(item.formula, contextFor(read, sku, 0, values));
    } catch {
      // Left out: a rule reading it then fails with the cause named.
    }
  }
  return values;
}

const numberOf = (v: unknown) =>
  typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : null;

function check(
  set: RuleSet,
  read: KeptRead,
  item: Item,
  formula: string,
  examples: Omit<Example, 'actual' | 'error' | 'agrees'>[],
): Example[] {
  return examples.map((example) => {
    try {
      const raw = run(
        formula,
        contextFor(
          read,
          example.sku,
          example.order ?? 0,
          valuesFor(set, read, example.sku, item.id),
        ),
      );
      const actual =
        item.kind === 'rule'
          ? typeof raw === 'boolean'
            ? raw
            : null
          : numberOf(raw);
      return {
        ...example,
        actual,
        error:
          actual === null
            ? `Gives ${String(raw)}, not ${item.kind === 'rule' ? 'true or false' : 'a number'}`
            : null,
        agrees:
          actual !== null &&
          (typeof example.expect === 'number'
            ? Math.abs(Number(actual) - example.expect) < 1e-9
            : actual === example.expect),
      };
    } catch (error) {
      return {
        ...example,
        actual: null,
        error: (error as Error).message.split('\n')[0]!,
        agrees: false,
      };
    }
  });
}

const ruleSchema = z.object({
  formula: z.string().describe('CEL, true when the rule holds'),
  examples: z
    .array(
      z.object({
        sku: z.string(),
        order: z.number().int().describe('The proposed order, in units'),
        holds: z.boolean(),
        why: z.string().describe('Why, in plain words, with the numbers'),
      }),
    )
    .min(2)
    .max(3),
});

const valueSchema = z.object({
  formula: z.string().describe('CEL, giving the value as a number'),
  examples: z
    .array(
      z.object({
        sku: z.string(),
        value: z.number(),
        why: z
          .string()
          .describe('How it is worked out, in plain words, with the numbers'),
      }),
    )
    .min(2)
    .max(3),
});

/*
  Gives one item a formula and examples. The model works the examples out by
  hand from the data; code runs the formula on each. Where they disagree, or
  the formula does not parse, the model is told and tries again, up to three
  times. What the person marked wrong last time is part of what it is told.
*/
export async function writeItem(
  text: string,
  read: KeptRead,
  id: string,
): Promise<RuleSet | null> {
  const set = await ruleSet(text);
  const item = set?.items.find((i) => i.id === id);
  if (!set || !item) return null;
  const records = recordsOf(read);
  const earlier = set.items.slice(0, set.items.indexOf(item));
  const missing = earlier.filter((i) => i.kind === 'value' && !i.formula);
  if (item.kind === 'rule' && missing.length)
    return update(text, (s) => ({
      ...s,
      items: s.items.map((i) =>
        i.id === id
          ? {
              ...i,
              problem: `Write ${missing.map((m) => m.id).join(', ')} first: the rules may read it.`,
            }
          : i,
      ),
    }));
  const data = read.tabs
    .map(
      (t) => `${t.name}:\n${t.values.map((r) => JSON.stringify(r)).join('\n')}`,
    )
    .join('\n\n');

  const system = [
    `You write the formula for one ${item.kind === 'rule' ? 'rule' : 'value'} of a store process, and two or three examples that show it working.`,
    describe(read),
    item.kind === 'rule'
      ? 'The formula is true when the rule holds: the order is fine as far as this rule goes. Give examples on real products where it holds (holds: true) and where it does not (holds: false), with an order that makes the point.'
      : 'The formula gives the value as a number. Give examples on real products.',
    'Follow the instructions literally. Never add a condition, a product or a number they do not state, and never special-case an example to make it come out.',
    'Work each example out by hand from the data below, not from your formula: the examples are how a person checks the formula. When an example and the formula disagree, check the example by hand first; change the formula only where it misreads the instructions.',
    'Write the why for the store owner, in plain words with the numbers: no code, no field names.',
  ].join('\n');
  let feedback = item.deniedAt
    ? `The person denied your last version${item.denial ? `, saying: "${item.denial}"` : ''}. It was:\n${item.formula}\nwith these examples:\n${item.examples
        .map(
          (e) =>
            `- ${e.sku}${e.order !== null ? `, ordering ${e.order}` : ''}: ${String(e.expect)} (${e.why})`,
        )
        .join('\n')}`
    : '';
  let result: { formula: string; examples: Example[] } | null = null;
  let problem: string | null = null;
  let model: string | null = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const prompt = [
      `Instructions:\n${text}`,
      `Values already written, which you may read as values.<id>:\n${
        earlier
          .filter((i) => i.kind === 'value' && i.formula)
          .map((i) => `- ${i.id}: ${i.text} (${i.formula})`)
          .join('\n') || 'none'
      }`,
      `Write: ${item.id}, ${item.text}${item.outcome ? ` (breaking it ${item.outcome === 'block' ? 'blocks the order' : 'needs a person to decide'})` : ''}`,
      `Products: ${records.skus.join(', ')}`,
      `The data:\n${data}`,
      feedback,
    ]
      .filter(Boolean)
      .join('\n\n');
    const answer =
      item.kind === 'rule'
        ? await ask(
            WRITE_MODELS,
            ruleSchema,
            system,
            prompt,
            `write-${id}`,
          ).then((r) => ({
            model: r.model,
            formula: r.output.formula,
            examples: r.output.examples.map((e) => ({
              sku: e.sku,
              order: e.order,
              expect: e.holds,
              why: e.why,
            })),
          }))
        : await ask(
            WRITE_MODELS,
            valueSchema,
            system,
            prompt,
            `write-${id}`,
          ).then((r) => ({
            model: r.model,
            formula: r.output.formula,
            examples: r.output.examples.map((e) => ({
              sku: e.sku,
              order: null,
              expect: e.value,
              why: e.why,
            })),
          }));
    model = answer.model;
    const unknown = answer.examples.filter(
      (e) => !records.skus.includes(e.sku),
    );
    const parsed = parseError(answer.formula);
    if (parsed || unknown.length) {
      problem = parsed
        ? `The formula does not parse: ${parsed}`
        : `No product ${unknown.map((e) => e.sku).join(', ')}.`;
      feedback = `Your last formula was:\n${answer.formula}\n${problem} Fix it.`;
      continue;
    }
    const examples = check(set, read, item, answer.formula, answer.examples);
    result = { formula: answer.formula, examples };
    const disagree = examples.filter((e) => !e.agrees);
    if (!disagree.length) {
      problem = null;
      break;
    }
    problem = `${disagree.length} of ${examples.length} examples disagree with the formula.`;
    feedback = `Your last formula was:\n${answer.formula}\nRun on the data, these examples disagree with what you worked out by hand; one of the two is wrong, so work it out again:\n${disagree
      .map(
        (e) =>
          `- ${e.sku}${e.order !== null ? `, ordering ${e.order}` : ''}: you said ${String(e.expect)}, the formula gives ${e.error ?? String(e.actual)}`,
      )
      .join('\n')}`;
  }
  return update(text, (s) => ({
    ...s,
    readId: read.id,
    items: s.items.map((i) =>
      i.id === id
        ? {
            ...i,
            formula: result?.formula ?? i.formula,
            examples: result?.examples ?? i.examples,
            problem,
            model,
            approvedAt: null,
            deniedAt: null,
            denial: null,
          }
        : // A rewritten value may change any rule that reads it.
          item.kind === 'value' && i.kind === 'rule'
          ? { ...i, approvedAt: null }
          : i,
    ),
  }));
}

// Acceptable once it has a formula and every example agrees with it.
export const acceptable = (item: Item) =>
  item.formula !== null &&
  item.examples.length > 0 &&
  item.examples.every((e) => e.agrees);
