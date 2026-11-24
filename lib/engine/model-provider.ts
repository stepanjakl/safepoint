import 'server-only';

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

import {
  DRAFTING_MODELS,
  isTrialModel,
  TRIAL_MODELS,
  type DraftingModel,
} from '@/lib/models';

import { limitedGoogle, paced } from './limits';

const providers = {
  groq: {
    key: 'GROQ_API_KEY',
    baseURL: 'https://api.groq.com/openai/v1',
  },
  openrouter: {
    key: 'OPENROUTER_API_KEY',
    baseURL: 'https://openrouter.ai/api/v1',
  },
} as const;

/*
  Development only: a model that answers on this machine, provided by the
  server as it starts (instrumentation.ts, server/models/claude-cli.ts), so
  the engine spawns nothing itself. Kept on globalThis: the server's start
  and its routes are bundled apart but share one process.
*/
type LocalModels = (id: string) => LanguageModel;
const LOCAL = Symbol.for('safepoint.localModels');
const held = globalThis as { [LOCAL]?: LocalModels };

export function provideLocalModels(make: LocalModels) {
  held[LOCAL] = make;
}

const localModels = () =>
  process.env.NODE_ENV === 'development' ? (held[LOCAL] ?? null) : null;

export function availableModels(): DraftingModel[] {
  return DRAFTING_MODELS.filter((id) => {
    if (!isTrialModel(id)) return true;
    const { provider } = TRIAL_MODELS[id];
    return provider === 'local'
      ? localModels() !== null
      : process.env[providers[provider].key]?.trim();
  });
}

export function resolveModel(model: DraftingModel) {
  if (!isTrialModel(model)) return limitedGoogle(model);

  const { provider, id } = TRIAL_MODELS[model];
  if (provider === 'local') {
    const make = localModels();
    if (!make) throw new Error(`${model} answers in development only.`);
    return make(id);
  }
  const { key, baseURL } = providers[provider];
  const apiKey = process.env[key]?.trim();
  if (!apiKey) throw new Error(`Set ${key} to use ${model}.`);

  const client = createOpenAICompatible({
    name: provider,
    baseURL,
    apiKey,
    supportsStructuredOutputs: true,
    includeUsage: true,
    transformRequestBody: (body) =>
      provider === 'openrouter'
        ? { ...body, provider: { require_parameters: true } }
        : // Groq rejects reasoning_content when the SDK sends it back with a
          // tool result. Its default output budget is spent on hidden
          // reasoning before a find's answer, which then comes back empty.
          {
            ...body,
            reasoning_format: 'hidden',
            max_completion_tokens: body.max_completion_tokens ?? 32_768,
          },
  });
  return paced(model, client(id));
}
