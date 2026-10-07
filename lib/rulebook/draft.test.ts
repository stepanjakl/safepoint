import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { carryOver, draftRulebook } from './draft';
import { rulebook, snapshot } from './library.fixture';

const { process, sources, kinds, changeable, statements } = rulebook;
const inventory = { process, sources, kinds, changeable, statements };
const { currency, tables, timing, items } = rulebook;
const dataModel = { currency, tables, timing, items };
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

const toolCall = (toolName: string, value: unknown) => ({
  content: [
    {
      type: 'tool-call' as const,
      toolCallId: `call-${toolName}`,
      toolName,
      input: JSON.stringify(value),
    },
  ],
  finishReason: { unified: 'tool-calls' as const, raw: 'STOP' },
  usage: answer(null).usage,
  warnings: [],
});

const misnamed = (count: number) => ({
  ...dataModel,
  items: dataModel.items.map((item, i) =>
    i < Math.min(count, 2)
      ? { ...item, table: item.table.toUpperCase() }
      : item,
  ),
  timing: {
    ...timing,
    times: timing.times.map((t, i) =>
      i === 0 && count > 2 ? { ...t, table: 'Policy' } : t,
    ),
  },
});

describe('attempts, checks and stops', () => {
  it('makes the first step call the check tool, and takes a clean checked draft as the answer', async () => {
    const replies = [
      toolCall('check_inventory', inventory),
      toolCall('check_data_model', dataModel),
      toolCall('check_rules', logic),
    ];
    const model = new MockLanguageModelV4({
      doGenerate: async () => replies.shift()!,
    });
    const result = await draft([{ id: 'm', model }]);
    expect(result.rulebook).not.toBeNull();
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(model.doGenerateCalls.map((c) => c.toolChoice)).toEqual([
      { type: 'tool', toolName: 'check_inventory' },
      { type: 'tool', toolName: 'check_data_model' },
      { type: 'tool', toolName: 'check_rules' },
    ]);
    expect(result.stages.every((s) => s.note?.startsWith('Taken from'))).toBe(
      true,
    );
  });

  it('fixes and checks again within one attempt, seeing each problem the check found', async () => {
    const replies = [
      toolCall('check_inventory', inventory),
      toolCall('check_data_model', misnamed(1)),
      toolCall('check_data_model', {
        ...dataModel,
        timing: {
          ...timing,
          current_until: { table: 'policy', time: 'close_time' },
        },
      }),
      toolCall('check_data_model', dataModel),
      toolCall('check_rules', logic),
    ];
    const model = new MockLanguageModelV4({
      doGenerate: async () => replies.shift()!,
    });
    const result = await draft([{ id: 'm', model }]);
    expect(result.rulebook).not.toBeNull();
    const stage = result.stages.find((s) => s.stage === 'data_model')!;
    expect(stage.attempt).toBe(1);
    expect(
      stage.toolCalls.map((c) => [c.tool, (c.output as { ok: boolean }).ok]),
    ).toEqual([
      ['check_data_model', false],
      ['check_data_model', false],
      ['check_data_model', true],
    ]);
    expect(stage.toolCalls[0]!.input).toEqual({
      summary: 'input did not fit the schema',
    });
    // Input the schema rejected never ran the check, so checking is still
    // forced; after a real check with problems, any tool may follow.
    expect(model.doGenerateCalls.map((c) => c.toolChoice)).toEqual([
      { type: 'tool', toolName: 'check_inventory' },
      { type: 'tool', toolName: 'check_data_model' },
      { type: 'tool', toolName: 'check_data_model' },
      { type: 'required' },
      { type: 'tool', toolName: 'check_rules' },
    ]);
    expect(promptText(model, 2)).toContain(
      'Invalid input for tool check_data_model',
    );
    expect(promptText(model, 3)).toContain('Deadlines declared now');
    // Each step sends the request and the latest check onwards, not every draft.
    expect(promptText(model, 3)).not.toContain('BOOKS');
  });

  it('gives more attempts while the problems keep falling, up to six', async () => {
    const result = await draft([
      {
        id: 'm',
        model: replying(
          inventory,
          misnamed(3),
          misnamed(2),
          misnamed(1),
          dataModel,
          logic,
        ),
      },
    ]);
    expect(result.rulebook).not.toBeNull();
    expect(
      result.stages
        .filter((s) => s.stage === 'data_model')
        .map((s) => s.issues.length),
    ).toEqual([3, 2, 1, 0]);
  });

  it('stops at once when the model sends back the same answer', async () => {
    const result = await draft([
      {
        id: 'm',
        model: replying(inventory, misnamed(1), misnamed(1), dataModel),
      },
    ]);
    expect(result.rulebook).toBeNull();
    expect(result.stopped).toEqual({
      stage: 'data_model',
      round: 1,
      reason: 'repeat',
      attempts: 2,
      problems: 1,
    });
  });

  it('continues a stuck draft from the stage that failed, carrying over what passed', async () => {
    const stuck = await draft([
      {
        id: 'lite',
        model: replying(
          inventory,
          dataModel,
          { ...logic, rules: [] },
          { ...logic, rules: [] },
        ),
      },
    ]);
    expect(stuck.stopped?.stage).toBe('logic');
    const carried = carryOver(stuck);
    expect(Object.keys(carried)).toEqual(['inventory', 'dataModel']);

    const model = replying(logic);
    const resumed = await draftRulebook('strong', snapshot, 'run-2', {
      models: [{ id: 'strong', model }],
      maxRetries: 0,
      resume: { file: 'earlier.json', ...carried },
    });
    expect(resumed.rulebook).not.toBeNull();
    expect(resumed.stages.map((s) => s.stage)).toEqual(['logic']);
    expect(resumed.resumedFrom).toEqual({
      file: 'earlier.json',
      carried: ['inventory', 'data_model'],
    });
  });
});

describe('rate limits', () => {
  const limited = (retryDelay: string, quotaId: string) =>
    new APICallError({
      message: 'You exceeded your current quota.',
      url: 'https://example.test',
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
      responseBody: JSON.stringify({
        error: {
          details: [
            { violations: [{ quotaId, quotaValue: '250000' }] },
            { retryDelay },
          ],
        },
      }),
    });

  it('waits out a per-minute limit as Google asks, on the same model, and names the limit', async () => {
    let refused = false;
    const queue = [inventory, dataModel, logic].map(answer);
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        if (!refused) {
          refused = true;
          throw limited(
            '35s',
            'GenerateContentInputTokensPerModelPerMinute-FreeTier',
          );
        }
        return queue.shift()!;
      },
    });
    const waited: number[] = [];
    const result = await draftRulebook('m', snapshot, 'run', {
      models: [
        { id: 'm', model },
        { id: 'older', model: replying() },
      ],
      maxRetries: 0,
      sleep: async (ms) => {
        waited.push(ms);
      },
    });
    expect(result.rulebook).not.toBeNull();
    expect(waited).toEqual([35_000]);
    expect(result.models).toEqual(['m']);
    expect(result.stages[0]!.issues[0]!.message).toMatch(
      /input tokens per model per minute \(free tier\), limit 250,000.*Waited 35 s/,
    );
  });

  it('does not wait out a long limit, such as a daily one: it moves to the next model', async () => {
    const waited: number[] = [];
    const result = await draftRulebook('m', snapshot, 'run', {
      models: [
        {
          id: 'm',
          model: new MockLanguageModelV4({
            doGenerate: async () => {
              throw limited(
                '7200s',
                'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
              );
            },
          }),
        },
        { id: 'older', model: replying(inventory, dataModel, logic) },
      ],
      maxRetries: 0,
      sleep: async (ms) => {
        waited.push(ms);
      },
    });
    expect(result.rulebook).not.toBeNull();
    expect(waited).toEqual([]);
    expect(result.models).toEqual(['m', 'older']);
    expect(result.stages[0]!.issues[0]!.message).toMatch(
      /requests per day.*Switching to older/,
    );
  });
});
