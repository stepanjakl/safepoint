import { isStepCount, streamText, tool } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { fallbackChain, modelsFor, TRIAL_MODELS } from '@/lib/models';

import { ask, withModels } from './calls';
import { limitsReady, rest, restingUntil } from './limits';
import { availableModels, resolveModel } from './model-provider';
import { inScratchDatabase } from './scratch.fixture';

const groq = 'groq:openai/gpt-oss-120b';
const openrouter = 'openrouter:nvidia/nemotron-3.5-super-vl-20261015:free';
const ling = 'openrouter:inclusionai/ling-3.2-flash:free';
const schema = z.object({ quantity: z.number(), note: z.string().optional() });
const quantity = { quantity: 12 };

describe('trial model providers', () => {
  inScratchDatabase();

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('offers trial models only when their provider is configured', () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-test');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    expect(availableModels()).toContain(groq);
    expect(availableModels()).not.toContain(openrouter);
    expect(() => resolveModel(openrouter)).toThrow('Set OPENROUTER_API_KEY');
    expect(fallbackChain(groq)).toEqual([groq]);
  });

  it('keeps the other OpenRouter model available after an upstream refusal', async () => {
    await limitsReady();
    rest(ling, 60_000);
    expect(restingUntil(ling)).not.toBeNull();
    expect(restingUntil(openrouter)).toBeNull();
  });

  it('uses the selected model first and its fleet after an invalid structured response', async () => {
    const smaller = 'groq:openai/gpt-oss-20b';
    vi.stubEnv('GROQ_API_KEY', 'groq-test');
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () =>
        Response.json({
          choices: [
            {
              message: {
                content:
                  fetch.mock.calls.length === 1
                    ? '{"quantity":"some"}'
                    : JSON.stringify(quantity),
              },
              finish_reason: 'stop',
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetch);

    const models = modelsFor({ plan: smaller }, []);
    expect(models).toEqual([smaller, groq]);
    await expect(
      ask(models, schema, 'Find the quantity.', 'A dozen.', 'trial'),
    ).resolves.toEqual({
      output: quantity,
      model: groq,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    [groq, 'GROQ_API_KEY', 'https://api.groq.com/openai/v1/chat/completions'],
    [
      openrouter,
      'OPENROUTER_API_KEY',
      'https://openrouter.ai/api/v1/chat/completions',
    ],
  ] as const)('asks %s for a structured answer', async (id, key, url) => {
    vi.stubEnv(key, 'provider-test');
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        choices: [
          {
            message: { content: JSON.stringify(quantity) },
            finish_reason: 'stop',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      ask(fallbackChain(id), schema, 'Find the quantity.', 'A dozen.', 'trial'),
    ).resolves.toEqual({
      model: id,
      output: quantity,
    });
    const [input, init] = fetch.mock.calls[0]!;
    expect(String(input)).toBe(url);
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer provider-test',
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: TRIAL_MODELS[id].id,
      response_format: { type: 'json_schema', json_schema: { strict: false } },
      ...(id === openrouter
        ? { provider: { require_parameters: true } }
        : { reasoning_format: 'hidden' }),
    });
  });

  it.each([
    [groq, 'GROQ_API_KEY'],
    [openrouter, 'OPENROUTER_API_KEY'],
  ] as const)('round-trips a tool result in a %s stream', async (id, key) => {
    vi.stubEnv(key, 'provider-test');
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => {
        const first = fetch.mock.calls.length === 1;
        const delta = first
          ? {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_quantity',
                  type: 'function',
                  function: { name: 'count', arguments: '{}' },
                },
              ],
            }
          : { content: 'There are 12.' };
        const chunk = {
          choices: [
            { index: 0, delta, finish_reason: first ? 'tool_calls' : 'stop' },
          ],
        };
        return new Response(
          `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
          {
            headers: { 'content-type': 'text/event-stream' },
          },
        );
      });
    vi.stubGlobal('fetch', fetch);

    const { value } = await withModels(
      fallbackChain(id),
      'trial',
      resolveModel,
      async (model, options) =>
        streamText({
          ...options,
          model,
          prompt: 'Count the items.',
          tools: {
            count: tool({
              inputSchema: z.object({}),
              execute: async () => quantity,
            }),
          },
          stopWhen: isStepCount(2),
        }).text,
    );

    expect(value).toBe('There are 12.');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
      stream: true,
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'call_quantity',
          content: JSON.stringify(quantity),
        }),
      ]),
    });
  });
});
