import { z } from 'zod';

/*
  The models the app may call, as listed by the Gemini API for this project's
  key on 6 October 2026, all free of charge on the standard tier. Previews and
  the moving -latest aliases are left out, so a draft record always names the
  model that wrote it; so are the 2.5 models, listed but "no longer available
  to new users" (checked 7 October 2026). When the service fails for one (busy,
  or out of quota), the draft moves to the next one down the same family; never
  to a lighter family, which would quietly lower the drafting quality. The
  exception is chosen, not fallen into: a draft with no model chosen finds on
  Flash and writes on Flash-Lite (lib/definitions/calls.ts).

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

export const DRAFTING_MODELS = FAMILIES.flat();
export const draftingModelSchema = z.enum(DRAFTING_MODELS);
export type DraftingModel = z.infer<typeof draftingModelSchema>;

// The chosen model, then the rest of its family in order of preference.
export function fallbackChain(model: DraftingModel): DraftingModel[] {
  const family = FAMILIES.find((f) =>
    (f as readonly string[]).includes(model),
  )!;
  return [model, ...family.filter((id) => id !== model)];
}

// The thinking level to ask for, or null for the model's own default.
export function thinkingLevel(model: string): 'low' | null {
  return (FAMILIES[0] as readonly string[]).includes(model) ? 'low' : null;
}
