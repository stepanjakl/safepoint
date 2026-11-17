import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

import { sentencesOf } from './find';

// Stand-in models for the engine's tests: each answers its steps in turn,
// so no quota is spent and every answer is known.

type Step = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

// An answer in text: a structured answer's JSON, or a plain reply.
export const answer = (value: unknown): Step => ({
  content: [
    {
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value),
    },
  ],
  finishReason: { unified: 'stop', raw: 'STOP' },
  usage,
  warnings: [],
});

// An answer through the write's check_definition tool.
export const check = (draft: unknown): Step => ({
  content: [
    {
      type: 'tool-call',
      toolCallId: `call-${Math.random().toString(36).slice(2)}`,
      toolName: 'check_definition',
      input: JSON.stringify(draft),
    },
  ],
  finishReason: { unified: 'tool-calls', raw: 'STOP' },
  usage,
  warnings: [],
});

// A call to any tool, with its input.
export const call = (toolName: string, input: unknown): Step => ({
  content: [
    {
      type: 'tool-call',
      toolCallId: `call-${Math.random().toString(36).slice(2)}`,
      toolName,
      input: JSON.stringify(input),
    },
  ],
  finishReason: { unified: 'tool-calls', raw: 'STOP' },
  usage,
  warnings: [],
});

// The same answer streamed, for a call that streams: each part as it would
// arrive, then the finish.
type Streamed = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
type Chunk = Streamed['stream'] extends ReadableStream<infer C> ? C : never;
const streamOf = (step: Step): Streamed => ({
  stream: simulateReadableStream<Chunk>({
    chunks: [
      { type: 'stream-start', warnings: [] },
      ...step.content.flatMap((part, index): Chunk[] => {
        const id = `part-${index}`;
        if (part.type === 'text')
          return [
            { type: 'text-start', id },
            { type: 'text-delta', id, delta: part.text },
            { type: 'text-end', id },
          ];
        if (part.type === 'reasoning')
          return [
            { type: 'reasoning-start', id },
            { type: 'reasoning-delta', id, delta: part.text },
            { type: 'reasoning-end', id },
          ];
        return part.type === 'tool-call' ? [part] : [];
      }),
      { type: 'finish', finishReason: step.finishReason, usage: step.usage },
    ],
  }),
});

export const standIn = (...steps: Step[]) => {
  const queue = [...steps];
  return new MockLanguageModelV4({
    doGenerate: async () => queue.shift()!,
    doStream: async () => streamOf(queue.shift()!),
  });
};

// A model that gives the same answer however often it is asked.
export const always = (step: Step) =>
  new MockLanguageModelV4({
    doGenerate: async () => step,
    doStream: async () => streamOf(step),
  });

// What the model was sent on one of its calls, streamed or not, as text to
// search.
export const told = (model: MockLanguageModelV4, call = 0) =>
  JSON.stringify(
    (model.doGenerateCalls[call] ?? model.doStreamCalls[call])?.prompt,
  );

// A find's answer, with every sentence of the text accounted for: one definition
// each while they last, and the last sentence takes any left over. A check read
// no other way is for every record.
export function accountedFor<
  D extends { id: string; result: string; applies_to?: string | null },
  F extends { definitions: D[] },
>(found: F, text: string) {
  const sentences = sentencesOf(text);
  return {
    ...found,
    definitions: found.definitions.map((d) => ({
      ...d,
      applies_to:
        d.applies_to !== undefined
          ? d.applies_to
          : d.result === 'check'
            ? 'every'
            : null,
    })),
    sentences: sentences.map((_, i) => {
      const last = i === sentences.length - 1;
      const definitions = found.definitions.slice(
        i,
        last ? found.definitions.length : i + 1,
      );
      return {
        n: i + 1,
        kind: definitions.length
          ? definitions[0]!.result === 'number'
            ? 'quantity'
            : 'check'
          : 'context',
        definitions: definitions.map((d) => d.id),
      };
    }),
  };
}
