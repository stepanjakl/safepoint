import 'server-only';

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

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

export function availableModels(): DraftingModel[] {
  return DRAFTING_MODELS.filter(
    (id) =>
      !isTrialModel(id) ||
      process.env[providers[TRIAL_MODELS[id].provider].key]?.trim(),
  );
}

export function resolveModel(model: DraftingModel) {
  if (!isTrialModel(model)) return limitedGoogle(model);

  const { provider, id } = TRIAL_MODELS[model];
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
        : // Groq rejects reasoning_content when the SDK sends it back with a tool result.
          { ...body, reasoning_format: 'hidden' },
  });
  return paced(model, client(id));
}
