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

/*
  Two constructions of the same scale, compared live rather than argued about.
  'base' is the 2px-baseline scale; 'sharp' keeps the dense lower half and
  pushes the upper half for stronger hierarchy contrast. See the typescale
  blocks in app/tokens.css.
*/
export const TYPESCALES = ['base', 'sharp'] as const;

export type Typescale = (typeof TYPESCALES)[number];

export const DEFAULT_TYPESCALE: Typescale = 'base';

export function isTypescale(value: unknown): value is Typescale {
  return TYPESCALES.includes(value as Typescale);
}

export const TYPESCALE_LABELS: Record<Typescale, string> = {
  base: 'title 17 · display 22',
  sharp: 'title 18 · display 24, tighter',
};

export const THEME_CHOICES = ['system', 'light', 'dark'] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice);
}

export const TYPEFACE_STORAGE_KEY = 'safepoint:typeface';
export const MONO_STORAGE_KEY = 'safepoint:mono';
export const THEME_STORAGE_KEY = 'safepoint:theme';
export const TYPESCALE_STORAGE_KEY = 'safepoint:typescale';
