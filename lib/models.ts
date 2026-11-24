import { z } from 'zod';

/*
  The Gemini models, as listed by the Gemini API for this project's
  key on 6 October 2026, all free of charge on the standard tier. Previews and
  the moving -latest aliases are left out, so a draft record always names the
  model that wrote it; so are the 2.5 models, listed but "no longer available
  to new users" (checked 7 October 2026). When the service fails for one (busy,
  or out of quota), the draft moves to the next one down the same family; never
  to a lighter family, which would quietly lower the drafting quality. The
  exception is chosen, not fallen into: a draft with no model chosen finds on
  Flash and writes on Flash-Lite (lib/engine/calls.ts).

  Each family is in order of preference, not age. By 30 October 3.8 and 3.7
  Flash were answering 1 request of 30, nearly all refused as busy, and 3.6 and
  3.5 20 of 26, so the newer ones are kept as a last resort.
*/
const FAMILIES = [
  [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
  ],
  ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
] as const;

export const TRIAL_MODELS = {
  'groq:openai/gpt-oss-120b': {
    provider: 'groq',
    id: 'openai/gpt-oss-120b',
    label: 'GPT-OSS 120B · Groq',
  },
  'groq:openai/gpt-oss-20b': {
    provider: 'groq',
    id: 'openai/gpt-oss-20b',
    label: 'GPT-OSS 20B · Groq',
  },
  'openrouter:nvidia/nemotron-3.5-super-vl-20261015:free': {
    provider: 'openrouter',
    id: 'nvidia/nemotron-3.5-super-vl-20261015:free',
    label: 'Nemotron 3.5 Super VL · OpenRouter',
  },
  'openrouter:inclusionai/ling-3.2-flash:free': {
    provider: 'openrouter',
    id: 'inclusionai/ling-3.2-flash:free',
    label: 'Ling 3.2 Flash · OpenRouter',
  },
  // Development only: Claude through the CLI signed in on this machine
  // (server/models/claude-cli.ts), offered once the server has provided it.
  'local:claude-opus': {
    provider: 'local',
    id: 'opus',
    label: 'Claude Opus · local',
  },
} as const;

type TrialModel = keyof typeof TRIAL_MODELS;

export function isTrialModel(id: string): id is TrialModel {
  return Object.hasOwn(TRIAL_MODELS, id);
}

export const DRAFTING_MODELS = [
  ...FAMILIES.flat(),
  ...Object.keys(TRIAL_MODELS).filter(isTrialModel),
];
export const draftingModelSchema = z.enum(DRAFTING_MODELS);
export type DraftingModel = z.infer<typeof draftingModelSchema>;

// The chosen model, then the rest of its family in order of preference.
export function fallbackChain(model: DraftingModel): DraftingModel[] {
  if (isTrialModel(model)) return [model];
  const family = FAMILIES.find((f) =>
    (f as readonly string[]).includes(model),
  )!;
  return [model, ...family.filter((id) => id !== model)];
}

// The thinking level to ask for, or null for the model's own default.
export function thinkingLevel(model: string): 'low' | null {
  return (FAMILIES[0] as readonly string[]).includes(model) ? 'low' : null;
}

const MODEL_FLEETS = {
  gemini: 'Gemini fleet',
  groq: 'Groq fleet',
  openrouter: 'OpenRouter fleet',
} as const;

export const modelPlanSchema = z.enum([
  'gemini',
  'groq',
  'openrouter',
  ...DRAFTING_MODELS,
]);
export type ModelPlan = z.infer<typeof modelPlanSchema>;
// A model chosen for one step keeps its original fallback behaviour.
export type ModelPreference = DraftingModel | { plan: ModelPlan };

export const GEMINI_FIND = FAMILIES[0][0];
export const GEMINI_WRITE = FAMILIES[1][0];

export function modelsFor(
  preference: ModelPreference | null | undefined,
  defaults: DraftingModel[],
): DraftingModel[] {
  if (!preference) return defaults;
  if (typeof preference === 'string') return fallbackChain(preference);
  const { plan } = preference;
  if (plan === 'gemini') return defaults;
  if (plan === 'groq' || plan === 'openrouter')
    return DRAFTING_MODELS.filter(
      (id) => isTrialModel(id) && TRIAL_MODELS[id].provider === plan,
    );
  if (!isTrialModel(plan)) return fallbackChain(plan);
  const { provider } = TRIAL_MODELS[plan];
  // A local model has no fleet to fall back on.
  if (provider === 'local') return [plan];
  return [
    plan,
    ...modelsFor({ plan: provider }, []).filter((id) => id !== plan),
  ];
}

export function modelPlanLabel(plan: ModelPlan): string {
  return plan === 'gemini' || plan === 'groq' || plan === 'openrouter'
    ? MODEL_FLEETS[plan]
    : isTrialModel(plan)
      ? TRIAL_MODELS[plan].label
      : plan;
}

export function availableModelPlan(plan: ModelPlan, models: DraftingModel[]) {
  return modelsFor({ plan }, [GEMINI_FIND]).every((id) => models.includes(id));
}

// A plan in a few words, for a run's row: a fleet by its provider, a Gemini
// model by its version and kind, a trial model by its name alone.
export function modelPlanShortLabel(plan: ModelPlan): string {
  if (plan === 'gemini' || plan === 'groq' || plan === 'openrouter')
    return MODEL_FLEETS[plan];
  if (isTrialModel(plan)) return TRIAL_MODELS[plan].label.split(' · ')[0]!;
  return plan
    .replace(/^gemini-/, 'Gemini ')
    .replace(/-flash-lite$/, ' Flash-Lite')
    .replace(/-flash$/, ' Flash');
}
