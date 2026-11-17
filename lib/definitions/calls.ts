import {
  APICallError,
  generateText,
  Output,
  RetryError,
  type LanguageModel,
} from 'ai';
import type { z } from 'zod';

import { fallbackChain, thinkingLevel, type DraftingModel } from '@/lib/models';
import {
  limitedGoogle,
  limitsReady,
  rest,
  restingUntil,
} from '@/lib/definitions/limits';
import { quotaOf } from '@/lib/definitions/quota';

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
export const DRAFT_MODELS: DraftingModel[] = fallbackChain('gemini-3.6-flash');
// Flash-Lite for writing, which is many requests and which the checks hold to
// account: it allows 500 requests a day to Flash's 20.
export const WRITE_MODELS: DraftingModel[] = fallbackChain(
  'gemini-3.5-flash-lite',
);

// The model by id; replaced in tests.
export type Resolve = (id: DraftingModel) => LanguageModel;

// Every model of a chain is spent: said as before, with when the first is
// back, so a caller that can wait without holding a process may.
export class ModelsResting extends Error {
  constructor(
    message: string,
    readonly until: number,
  ) {
    super(message);
    this.name = 'ModelsResting';
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
  call: (model: LanguageModel, options: CallOptions) => Promise<R>,
  tell?: ModelTell,
  recording?: Recording<R>,
): Promise<{ value: R; model: DraftingModel }> {
  // What a model has spent is read before any is chosen, so that none is
  // asked on a guess at its quota.
  await limitsReady();
  const telemetry = await devtools(name);
  let last: unknown = null;
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
            call(counting(resolve(model), tally), options),
          )
        : await call(resolve(model), options);
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
      said(
        timedOut(error) || status >= 500
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
      if (status >= 500) {
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
  throw last instanceof Error ? last : new Error('The model service failed.');
}

// One structured answer.
export async function ask<T>(
  models: DraftingModel[],
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
  name: string,
  resolve: Resolve = limitedGoogle,
  recording?: Recording<T>,
): Promise<{ output: T; model: string }> {
  const { value, model } = await withModels(
    models,
    name,
    resolve,
    async (languageModel, options) =>
      (
        await generateText({
          model: languageModel,
          system,
          prompt,
          output: Output.object({ schema }),
          timeout: { totalMs: 180_000 },
          ...options,
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
