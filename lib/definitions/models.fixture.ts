import { MockLanguageModelV4 } from 'ai/test';

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

export const standIn = (...steps: Step[]) => {
  const queue = [...steps];
  return new MockLanguageModelV4({ doGenerate: async () => queue.shift()! });
};

// A model that gives the same answer however often it is asked.
export const always = (step: Step) =>
  new MockLanguageModelV4({ doGenerate: async () => step });

// What the model was sent on one of its calls, as text to search.
export const told = (model: MockLanguageModelV4, call = 0) =>
  JSON.stringify(model.doGenerateCalls[call]?.prompt);
