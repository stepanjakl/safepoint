import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { draftRulebook } from './draft';
import { rulebook, snapshot } from './library.fixture';

const { process, sources, kinds, changeable, statements } = rulebook;
const inventory = { process, sources, kinds, changeable, statements };
const { tables, timing, items } = rulebook;
const dataModel = { tables, timing, items };
const { editable, facts, rules, not_ruled, notes } = rulebook;
const logic = {
  editable,
  facts,
  rules,
  not_ruled,
  data_model_requests: [] as { statement: string; request: string }[],
  notes,
};

const answer = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  finishReason: { unified: 'stop' as const, raw: 'STOP' },
  usage: {
    inputTokens: {
      total: 10,
      noCache: 10,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 10, text: 10, reasoning: undefined },
  },
  warnings: [],
});

const replying = (...replies: unknown[]) => {
  const queue = replies.map(answer);
  return new MockLanguageModelV4({ doGenerate: async () => queue.shift()! });
};

const busy = () =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw new APICallError({
        message: 'This model is currently experiencing high demand.',
        url: 'https://example.test',
        requestBodyValues: {},
        statusCode: 503,
        isRetryable: true,
      });
    },
  });

const promptText = (model: MockLanguageModelV4, call: number) =>
  JSON.stringify(model.doGenerateCalls[call]?.prompt);

const draft = (models: { id: string; model: MockLanguageModelV4 }[]) =>
  draftRulebook(models[0]!.id, snapshot, 'run', { models, maxRetries: 0 });

describe('drafting a rulebook', () => {
  it('moves to the next model when the service is busy, without spending an attempt', async () => {
    const result = await draft([
      { id: 'newer', model: busy() },
      { id: 'older', model: replying(inventory, dataModel, logic) },
    ]);
    expect(result.rulebook).not.toBeNull();
    expect(result.models).toEqual(['newer', 'older']);
    expect(result.stages.map((s) => [s.stage, s.attempt, s.model])).toEqual([
      ['inventory', 1, 'newer'],
      ['inventory', 1, 'older'],
      ['data_model', 1, 'older'],
      ['logic', 1, 'older'],
    ]);
    expect(result.stages[0]!.issues[0]!.message).toMatch(/Switching to older/);
  });

  it('stops with the reason when every model in the chain is busy', async () => {
    const result = await draft([{ id: 'only', model: busy() }]);
    expect(result.interrupted).toMatch(/busy/);
    expect(result.rulebook).toBeNull();
    expect(result.stages).toHaveLength(1);
  });

  it('sends each failed check back as the next turn, never the Checks tab', async () => {
    const model = replying(
      inventory,
      {
        ...dataModel,
        timing: {
          ...timing,
          current_until: { table: 'policy', time: 'close_time' },
        },
      },
      dataModel,
      logic,
    );
    const result = await draft([{ id: 'm', model }]);
    expect(result.rulebook).not.toBeNull();
    expect(result.stages.map((s) => [s.stage, s.attempt])).toEqual([
      ['inventory', 1],
      ['data_model', 1],
      ['data_model', 2],
      ['logic', 1],
    ]);
    expect(model.doGenerateCalls[2]!.prompt.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
    expect(promptText(model, 2)).toContain('Deadlines declared now');
    for (const call of [0, 1, 2, 3])
      expect(promptText(model, call)).not.toContain('check_id');
  });

  it('says which field broke the schema and what it found, so the next attempt can fix it', async () => {
    const model = replying(
      inventory,
      {
        ...dataModel,
        items: dataModel.items.map((item, i) =>
          i === 0 ? { ...item, table: 'Books' } : item,
        ),
      },
      dataModel,
      logic,
    );
    const result = await draft([{ id: 'm', model }]);
    expect(result.rulebook).not.toBeNull();
    expect(result.stages[1]!.issues).toContainEqual({
      where: 'items.0.table',
      message: expect.stringMatching(/lower_snake_case name.*Found "Books"/),
    });
    expect(promptText(model, 2)).toContain('items.0.table');
  });

  it('revises the data model once when the rules stage asks, then writes the rules again', async () => {
    const request = {
      statement: 'C1',
      request: 'Bind the closing time as a deadline.',
    };
    const model = replying(
      inventory,
      dataModel,
      { ...logic, data_model_requests: [request] },
      dataModel,
      logic,
    );
    const result = await draft([{ id: 'm', model }]);
    expect(result.rulebook).not.toBeNull();
    expect(result.stages.map((s) => [s.stage, s.round])).toEqual([
      ['inventory', 1],
      ['data_model', 1],
      ['logic', 1],
      ['data_model', 2],
      ['logic', 2],
    ]);
    expect(promptText(model, 3)).toContain('requests_from_the_rules_stage');
    expect(promptText(model, 3)).toContain(request.request);
  });

  it('never loops: a request still open after the revision round fails the draft', async () => {
    const asking = {
      ...logic,
      data_model_requests: [{ statement: 'C1', request: 'More.' }],
    };
    const result = await draft([
      {
        id: 'm',
        model: replying(inventory, dataModel, asking, dataModel, asking),
      },
    ]);
    expect(result.rulebook).toBeNull();
    expect(result.issues[0]!.message).toMatch(/Still unresolved/);
  });
});
