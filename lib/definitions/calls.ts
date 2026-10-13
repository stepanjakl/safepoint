import { google } from '@ai-sdk/google';
import {
  APICallError,
  generateText,
  Output,
  RetryError,
  type LanguageModel,
} from 'ai';
import type { z } from 'zod';

import { fallbackChain, thinkingLevel, type DraftingModel } from '@/lib/models';
import { quotaOf } from '@/lib/definitions/quota';

/*
  Server-only. Every call to a model goes through `withModels`: the first
  model of the chain with quota answers, and a busy or spent one hands over to
  the next older model of the same family (never a lighter family, as
  lib/models.ts holds). No automatic retries: a refusal for quota
  says itself whether waiting helps.
*/

// Flash for both: in two drafts Flash-Lite folded a number the instructions
// define into a check when finding. A person may choose another model.
export const DRAFT_MODELS: DraftingModel[] = fallbackChain('gemini-3.8-flash');

// The model by id; replaced in tests.
export type Resolve = (id: DraftingModel) => LanguageModel;

// Models Google has refused for quota, and until when, kept while the server
// runs so later calls skip them instead of being refused again.
const outOfQuota = new Map<string, number>();
// A per-minute limit is waited out when Google says how long; a longer one,
// such as the daily limit, moves to the next model.
const MAX_WAIT_MS = 90_000;
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
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

export async function withModels<R>(
  models: DraftingModel[],
  name: string,
  resolve: Resolve,
  call: (model: LanguageModel, options: CallOptions) => Promise<R>,
): Promise<{ value: R; model: DraftingModel }> {
  const telemetry = await devtools(name);
  let last: unknown = null;
  for (const model of models) {
    if ((outOfQuota.get(model) ?? 0) > Date.now()) continue;
    for (let tries = 0; ; tries++) {
      try {
        return {
          value: await call(
            resolve(model),
            callOptions(model, telemetry, name),
          ),
          model,
        };
      } catch (error) {
        last = error;
        // Too slow to answer in time is busy too: the next model, at once.
        if (timedOut(error)) break;
        const cause = RetryError.isInstance(error) ? error.lastError : error;
        if (!APICallError.isInstance(cause)) throw error;
        const status = cause.statusCode ?? 0;
        if (status === 429) {
          const { retryAfterMs } = quotaOf(cause);
          if (
            retryAfterMs !== null &&
            retryAfterMs <= MAX_WAIT_MS &&
            tries < 2
          ) {
            await sleep(retryAfterMs);
            continue;
          }
          outOfQuota.set(model, Date.now() + (retryAfterMs ?? 3_600_000));
          break;
        }
        // Busy: once more after a moment, then the next model.
        if (status >= 500 && tries < 1) {
          await sleep(2_000);
          continue;
        }
        if (status >= 500) break;
        throw error;
      }
    }
  }
  const resting = models.filter((m) => (outOfQuota.get(m) ?? 0) > Date.now());
  if (resting.length === models.length)
    throw new Error(
      `Out of quota: ${resting.map((m) => `${m} until ${clock(outOfQuota.get(m)!)}`).join(', ')}. Choose a model of another family, or try again later.`,
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
  resolve: Resolve = google,
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
