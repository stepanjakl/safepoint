import {
  APICallError,
  generateText,
  Output,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  RetryError,
  type LanguageModel,
} from 'ai';
import type { z } from 'zod';

import {
  fallbackChain,
  GEMINI_FIND,
  GEMINI_WRITE,
  isTrialModel,
  thinkingLevel,
  type DraftingModel,
} from '@/lib/models';
import { limitsReady, rest, restingUntil } from '@/lib/engine/limits';
import { resolveModel } from './model-provider';
import { quotaOf } from '@/lib/engine/quota';

import {
  counting,
  inTally,
  newTally,
  report,
  type AttemptOutcome,
  type Recording,
  type Summary,
} from './attempts';

/*
  Server-only. Every call to a model goes through `withModels`: the first
  model of the chain with quota answers, and a busy or spent one hands over to
  the next of the same family (never a lighter family, as lib/models.ts holds).
  Waiting is limits.ts's, request by request: what reaches here could not be
  waited out, so it moves on. Each model asked is one attempt, reported to
  the recorder a caller passes, if it passes one (attempts.ts).
*/

// Flash for finding, and for what is not a draft: in three drafts Flash-Lite
// folded a number the instructions define into a check when finding. A person
// may choose another model.
export const DRAFT_MODELS = fallbackChain(GEMINI_FIND);
// Flash-Lite for writing, which is many requests and which the checks hold to
// account: it allows 500 requests a day to Flash's 20.
export const WRITE_MODELS = fallbackChain(GEMINI_WRITE);

// The model by id; replaced in tests.
export type Resolve = (id: DraftingModel) => LanguageModel;

// Every model of a chain is spent: said as before, with when the first is
// back, so a caller that can wait without holding a process may.
// No parameter property: Node's type stripping, which runs the scripts,
// refuses them (AGENTS.md).
export class ModelsResting extends Error {
  readonly until: number;
  constructor(message: string, until: number) {
    super(message);
    this.name = 'ModelsResting';
    this.until = until;
  }
}

/*
  Every model of a chain was busy (a 5xx, or too slow), or resting: a spike
  in demand, which passes. Said as the last model said it, with a short wait,
  so a draft waits and asks again rather than stopping part way.
*/
export const BUSY_WAIT_MS = 90_000;
export class ModelsBusy extends ModelsResting {
  constructor(message: string, until: number) {
    super(message, until);
    this.name = 'ModelsBusy';
  }
}

// A call's own timeout aborts it with a TimeoutError, wrapped or not.
const timedOut = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  ((error as { name?: unknown }).name === 'TimeoutError' ||
    timedOut((error as { cause?: unknown }).cause));
const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

const devtools = async (name: string) =>
  process.env.NODE_ENV === 'development'
    ? (await import('@ai-sdk/devtools')).DevToolsTelemetry({
        runId: `definitions-${name}-${Date.now()}`,
      })
    : null;

// What every call is given: the model's thinking level (Flash at its default
// runs past any sensible timeout), telemetry in development, no retries.
const callOptions = (
  model: DraftingModel,
  telemetry: Awaited<ReturnType<typeof devtools>>,
  name: string,
) => ({
  providerOptions: thinkingLevel(model)
    ? {
        google: { thinkingConfig: { thinkingLevel: thinkingLevel(model)! } },
      }
    : undefined,
  telemetry: telemetry
    ? { functionId: `definitions-${name}`, integrations: [telemetry] }
    : undefined,
  maxRetries: 0,
});

export type CallOptions = ReturnType<typeof callOptions>;

// Told as each model is asked, and as one is passed over as busy.
export type ModelTell = (
  event:
    | { kind: 'asking'; model: DraftingModel }
    | {
        kind: 'busy';
        model: DraftingModel;
        why: 'quota' | 'slow' | 'unavailable';
        until?: string;
        status?: number;
      },
) => void;

export async function withModels<R>(
  models: DraftingModel[],
  name: string,
  resolve: Resolve,
  call: (
    model: LanguageModel,
    options: CallOptions,
    id: DraftingModel,
  ) => Promise<R>,
  tell?: ModelTell,
  recording?: Recording<R>,
): Promise<{ value: R; model: DraftingModel }> {
  // What a model has spent is read before any is chosen, so that none is
  // asked on a guess at its quota.
  await limitsReady();
  const telemetry = await devtools(name);
  let last: unknown = null;
  // Whether each model passed over was only busy or resting.
  let onlyBusy = true;
  for (const model of models) {
    const resting = restingUntil(model);
    if (resting) {
      tell?.({
        kind: 'busy',
        model,
        why: 'quota',
        until: new Date(resting).toISOString(),
      });
      continue;
    }
    tell?.({ kind: 'asking', model });
    const started = Date.now();
    const tally = newTally();
    const said = (
      outcome: AttemptOutcome,
      answer: Summary | null,
      error: unknown,
    ) => report(recording, model, started, tally, outcome, answer, error);
    try {
      // Tallied only for a recorder: with none, the call is as it was.
      const options = callOptions(model, telemetry, name);
      const value = recording?.record
        ? await inTally(tally, () =>
            call(counting(resolve(model), tally), options, model),
          )
        : await call(resolve(model), options, model);
      let judged: { refused: boolean; answer: Summary | null } = {
        refused: false,
        answer: null,
      };
      try {
        if (recording?.record && recording.judged)
          judged = recording.judged(value);
      } catch {
        // A summary that cannot be made is left out; the answer stands.
      }
      said(judged.refused ? 'refused' : 'answered', judged.answer, null);
      return { value, model };
    } catch (error) {
      last = error;
      const cause = RetryError.isInstance(error) ? error.lastError : error;
      const status = APICallError.isInstance(cause)
        ? (cause.statusCode ?? 0)
        : 0;
      // No status at all: the connection itself failed, which passes too.
      const unreached = APICallError.isInstance(cause) && status === 0;
      const invalidAnswer =
        NoObjectGeneratedError.isInstance(cause) ||
        NoOutputGeneratedError.isInstance(cause) ||
        (status === 400 &&
          APICallError.isInstance(cause) &&
          /tool call validation failed/i.test(cause.message));
      said(
        timedOut(error) || status >= 500 || unreached
          ? 'busy'
          : status === 429
            ? 'quota'
            : 'failed',
        null,
        error,
      );
      // Too slow to answer in time is busy too: the next model, at once.
      if (timedOut(error)) {
        tell?.({ kind: 'busy', model, why: 'slow' });
        continue;
      }
      if (status < 500 && status !== 429 && !unreached) onlyBusy = false;
      if (invalidAnswer) continue;
      if (!APICallError.isInstance(cause)) throw error;
      if (status === 429) {
        rest(model, quotaOf(cause).retryAfterMs ?? 3_600_000);
        tell?.({
          kind: 'busy',
          model,
          why: 'quota',
          until: new Date(restingUntil(model) ?? Date.now()).toISOString(),
        });
        continue;
      }
      if (status >= 500 || unreached) {
        tell?.({ kind: 'busy', model, why: 'unavailable', status });
        continue;
      }
      throw error;
    }
  }
  const resting = models.filter((m) => restingUntil(m));
  if (resting.length === models.length)
    throw new ModelsResting(
      `Out of quota: ${resting.map((m) => `${m} until ${clock(restingUntil(m)!)}`).join(', ')}. Choose a model of another family, or try again later.`,
      Math.min(...resting.map((m) => restingUntil(m)!)),
    );
  if (onlyBusy && last instanceof Error && models.length)
    throw new ModelsBusy(
      last.message.split('\n')[0]!,
      Date.now() + BUSY_WAIT_MS,
    );
  throw last instanceof Error ? last : new Error('The model service failed.');
}

// One structured answer.
export async function ask<T>(
  models: DraftingModel[],
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
  name: string,
  resolve: Resolve = resolveModel,
  recording?: Recording<T>,
): Promise<{ output: T; model: DraftingModel }> {
  const { value, model } = await withModels(
    models,
    name,
    resolve,
    async (languageModel, options, id) =>
      (
        await generateText({
          model: languageModel,
          system,
          prompt,
          output: Output.object({ schema }),
          timeout: { totalMs: 180_000 },
          ...options,
          providerOptions: isTrialModel(id)
            ? { openaiCompatible: { strictJsonSchema: false } }
            : options.providerOptions,
        })
      ).output as T,
    undefined,
    recording && {
      ...recording,
      asked: {
        systemChars: system.length,
        promptChars: prompt.length,
        ...recording.asked,
      },
    },
  );
  return { output: value, model };
}
