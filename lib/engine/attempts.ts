import { AsyncLocalStorage } from 'node:async_hooks';

import { wrapLanguageModel, type LanguageModel } from 'ai';

/*
  What the engine says of each model call, for whoever is given to record it
  (server/storage/model-attempts.ts keeps it in `model_attempts`). The engine
  only reports: a call made with no `record` is made exactly as before, and a
  recorder that fails never touches the call.

  What is said is a summary, never the prompt or the answer, which hold the
  data and the instructions: sizes, counts, the definition or record keys
  involved, and the first line of an error.
*/

export type AttemptPurpose =
  'find' | 'write' | 'cross-check' | 'propose' | 'advise';

// answered: an answer code took; refused: an answer code sent back, or none
// came through; quota: refused for the model's quota; busy: the service was
// overloaded or too slow; failed: any other error, a call cut short included.
export type AttemptOutcome =
  'answered' | 'refused' | 'quota' | 'busy' | 'failed';

export type Summary = Record<
  string,
  string | number | boolean | null | string[]
>;

export type Attempt = {
  purpose: AttemptPurpose;
  model: string;
  // The definition a write or an advice was for.
  definitionId: string | null;
  startedAt: Date;
  durationMs: number;
  outcome: AttemptOutcome;
  // As the provider reported them, summed over the call's requests; null
  // when none reported any.
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  // Requests sent: a tool loop's steps, and each retry after a refusal.
  requests: number;
  // How long pacing held its requests back for the rate limit.
  waitedMs: number;
  asked: Summary;
  answer: Summary | null;
  error: string | null;
};

export type RecordAttempt = (attempt: Attempt) => void;

// What a caller tells withModels (calls.ts) about the call it makes, so it
// can be recorded; `judged` says how the caller took an answer.
export type Recording<R> = {
  record?: RecordAttempt;
  purpose: AttemptPurpose;
  definitionId?: string | null;
  asked: Summary;
  judged?: (value: R) => { refused: boolean; answer: Summary };
};

// Tallied while a call runs, across its requests.
type Tally = {
  requests: number;
  retries: number;
  waitedMs: number;
  input: number | null;
  output: number | null;
  thinking: number | null;
};

const tallies = new AsyncLocalStorage<Tally>();

export const newTally = (): Tally => ({
  requests: 0,
  retries: 0,
  waitedMs: 0,
  input: null,
  output: null,
  thinking: null,
});

export const inTally = <T>(tally: Tally, work: () => Promise<T>) =>
  tallies.run(tally, work);

// Told by pacing (limits.ts): time a request was held back, and a request
// sent again after a refusal. Nothing when no call is being recorded.
export function heldFor(ms: number) {
  const tally = tallies.getStore();
  if (tally && ms > 0) tally.waitedMs += Math.round(ms);
}
export function sentAgain() {
  const tally = tallies.getStore();
  if (tally) tally.retries += 1;
}

type Usage = {
  inputTokens?: { total?: number | undefined };
  outputTokens?: { total?: number | undefined; reasoning?: number | undefined };
};
const add = (a: number | null, b: number | undefined) =>
  b === undefined ? a : (a ?? 0) + b;
function addUsage(tally: Tally, usage: Usage | undefined) {
  tally.input = add(tally.input, usage?.inputTokens?.total);
  tally.output = add(tally.output, usage?.outputTokens?.total);
  tally.thinking = add(tally.thinking, usage?.outputTokens?.reasoning);
}

// The model, counting each request it is sent and the tokens it reports.
export function counting(model: LanguageModel, tally: Tally): LanguageModel {
  if (typeof model !== 'object' || model.specificationVersion !== 'v4')
    return model;
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v4',
      wrapGenerate: async ({ doGenerate }) => {
        tally.requests += 1;
        const result = await doGenerate();
        addUsage(tally, result.usage as Usage);
        return result;
      },
      wrapStream: async ({ doStream }) => {
        tally.requests += 1;
        const { stream, ...rest } = await doStream();
        return {
          stream: stream.pipeThrough(
            new TransformStream({
              transform(part, into) {
                if (part.type === 'finish')
                  addUsage(tally, part.usage as Usage);
                into.enqueue(part);
              },
            }),
          ),
          ...rest,
        };
      },
    },
  });
}

// The first line of what went wrong, short.
const firstLine = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .split('\n')[0]!
    .slice(0, 200);

export function report<R>(
  recording: Recording<R> | undefined,
  model: string,
  startedAt: number,
  tally: Tally,
  outcome: AttemptOutcome,
  answer: Summary | null,
  error: unknown,
) {
  if (!recording?.record) return;
  try {
    recording.record({
      purpose: recording.purpose,
      model,
      definitionId: recording.definitionId ?? null,
      startedAt: new Date(startedAt),
      durationMs: Date.now() - startedAt,
      outcome,
      inputTokens: tally.input,
      outputTokens: tally.output,
      thinkingTokens: tally.thinking,
      requests: tally.requests + tally.retries,
      waitedMs: tally.waitedMs,
      asked: recording.asked,
      answer,
      error: error === null ? null : firstLine(error),
    });
  } catch {
    // Recording is a record only: it never stops a call.
  }
}
