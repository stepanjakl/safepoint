import {
  APICallError,
  generateText,
  Output,
  RetryError,
  type LanguageModel,
} from 'ai';
import type { z } from 'zod';

import { fallbackChain, thinkingLevel, type DraftingModel } from '@/lib/models';
import { limitedGoogle, rest, restingUntil } from '@/lib/definitions/limits';
import { quotaOf } from '@/lib/definitions/quota';

/*
  Server-only. Every call to a model goes through `withModels`: the first
  model of the chain with quota answers, and a busy or spent one hands over to
  the next of the same family (never a lighter family, as lib/models.ts holds).
  Waiting is limits.ts's, request by request: what reaches here could not be
  waited out, so it moves on.
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
): Promise<{ value: R; model: DraftingModel }> {
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
    try {
      return {
        value: await call(resolve(model), callOptions(model, telemetry, name)),
        model,
      };
    } catch (error) {
      last = error;
      // Too slow to answer in time is busy too: the next model, at once.
      if (timedOut(error)) {
        tell?.({ kind: 'busy', model, why: 'slow' });
        continue;
      }
      const cause = RetryError.isInstance(error) ? error.lastError : error;
      if (!APICallError.isInstance(cause)) throw error;
      const status = cause.statusCode ?? 0;
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
    throw new Error(
      `Out of quota: ${resting.map((m) => `${m} until ${clock(restingUntil(m)!)}`).join(', ')}. Choose a model of another family, or try again later.`,
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
  );
  return { output: value, model };
}
