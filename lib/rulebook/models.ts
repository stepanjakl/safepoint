import { z } from 'zod';

/*
  The models a rulebook may be drafted with, newest first within each family,
  as listed by the Gemini API for this project's key on 6 October 2026, all
  free of charge on the standard tier. Previews and the moving -latest aliases
  are left out, so a draft record always names the model that wrote it; so are
  the 2.5 models, listed but "no longer available to new users" (checked
  7 October 2026). When
  the service fails for one (busy, or out of quota, which is counted per
  model), the draft moves to the next one down the same family; never to a
  lighter family, which would quietly lower the drafting quality.
*/
const FAMILIES = [
  [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
  ],
  ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
] as const;

export const DRAFTING_MODELS = FAMILIES.flat();
export const draftingModelSchema = z.enum(DRAFTING_MODELS);
export type DraftingModel = z.infer<typeof draftingModelSchema>;

// The chosen model, then each older one in its family.
export function fallbackChain(model: DraftingModel): DraftingModel[] {
  const family = FAMILIES.find((f) =>
    (f as readonly string[]).includes(model),
  )!;
  return family.slice((family as readonly string[]).indexOf(model));
}

// The newest model of the strongest family, when the given one is in a
// lighter family: offered, never automatic, to continue a draft that got stuck.
export function strongerModel(model: string): DraftingModel | null {
  const strongest = FAMILIES[0];
  return (strongest as readonly string[]).includes(model) ? null : strongest[0];
}
