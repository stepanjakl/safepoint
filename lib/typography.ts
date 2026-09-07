/*
  Names and storage keys for the typography roles. Deliberately free of any
  next/font import so the development picker can read them without pulling
  font loading into the client bundle; app/typography.ts does the loading.
*/

export const TYPEFACE_SETS = ['geist', 'glide', 'inter'] as const;

export type TypefaceSet = (typeof TYPEFACE_SETS)[number];

export const DEFAULT_TYPEFACE_SET: TypefaceSet = 'geist';

export function isTypefaceSet(value: unknown): value is TypefaceSet {
  return TYPEFACE_SETS.includes(value as TypefaceSet);
}

/** display role · interface sans role · tabular utility role. */
export const TYPEFACE_SET_LABELS: Record<TypefaceSet, string> = {
  geist: 'Geist · Geist · Geist Mono',
  glide: 'Glide · Glide · Glide Mono',
  inter: 'Inter Tight · Inter · Inter tabular',
};

/*
  The utility role is a second axis rather than part of the set: which mono
  suits a sans is exactly the open question, so any pairing has to be reachable.
  'match' means no attribute at all, leaving the set's own choice in place.
*/
export const MONO_CHOICES = [
  'match',
  'sans',
  'geist',
  'glide',
  'jetbrains',
  'commit',
] as const;

export type MonoChoice = (typeof MONO_CHOICES)[number];

export function isMonoChoice(value: unknown): value is MonoChoice {
  return MONO_CHOICES.includes(value as MonoChoice);
}

export const MONO_CHOICE_LABELS: Record<MonoChoice, string> = {
  match: "the set's own",
  sans: 'interface sans, tabular',
  geist: 'Geist Mono',
  glide: 'Glide Mono, one weight',
  jetbrains: 'JetBrains Mono',
  commit: 'Commit Mono',
};

export const THEME_CHOICES = ['system', 'light', 'dark'] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice);
}

export const DEFAULT_EDGE_STRENGTH = 0.7;

export const TYPEFACE_STORAGE_KEY = 'safepoint:typeface';
export const MONO_STORAGE_KEY = 'safepoint:mono';
export const THEME_STORAGE_KEY = 'safepoint:theme';
export const EDGE_STRENGTH_STORAGE_KEY = 'safepoint:edge-strength';
