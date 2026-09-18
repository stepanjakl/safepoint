/*
  Names and storage keys for the typography roles. Deliberately free of any
  next/font import so the development picker can read them without pulling
  font loading into the client bundle; app/typography.ts does the loading.
*/

export const TYPEFACE_SETS = [
  'geist',
  'geist-orbitron',
  'geist-tabular',
  'geist-inter-tabular',
  'geist-ibm-plex-sans',
  'geist-source-sans',
  'geist-roboto',
  'geist-glide',
  'geist-jetbrains',
  'geist-ibm-plex',
  'geist-source-code',
  'geist-space',
  'geist-commit',
  'glide',
  'inter',
] as const;

export type TypefaceSet = (typeof TYPEFACE_SETS)[number];

export const TYPEFACE_PICKER_SETS = [
  'geist-tabular',
  'geist',
  'glide',
  'inter',
] as const satisfies readonly TypefaceSet[];

export const DEFAULT_TYPEFACE_SET: TypefaceSet = 'geist';

export function isTypefaceSet(value: unknown): value is TypefaceSet {
  return TYPEFACE_SETS.includes(value as TypefaceSet);
}

export function isTypefacePickerSet(value: unknown): value is TypefaceSet {
  return TYPEFACE_PICKER_SETS.includes(value as (typeof TYPEFACE_PICKER_SETS)[number]);
}

/** display role · interface sans role · tabular utility role. */
export const TYPEFACE_SET_LABELS: Record<TypefaceSet, string> = {
  geist: 'Geist · Geist Mono',
  'geist-orbitron': 'Geist · Geist · Orbitron tabular',
  'geist-tabular': 'Geist · Geist Sans tabular',
  'geist-inter-tabular': 'Geist · Inter tabular',
  'geist-ibm-plex-sans': 'Geist · IBM Plex Sans tabular',
  'geist-source-sans': 'Geist · Source Sans 3 tabular',
  'geist-roboto': 'Geist · Roboto tabular',
  'geist-glide': 'Geist · Geist · Glide Mono',
  'geist-jetbrains': 'Geist · Geist · JetBrains Mono',
  'geist-ibm-plex': 'Geist · Geist · IBM Plex Mono',
  'geist-source-code': 'Geist · Geist · Source Code Pro',
  'geist-space': 'Geist · Geist · Space Mono',
  'geist-commit': 'Geist · Geist · Commit Mono',
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
  'ibm-plex',
  'source-code',
  'space',
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
  'ibm-plex': 'IBM Plex Mono',
  'source-code': 'Source Code Pro',
  space: 'Space Mono, 400 / 700',
  commit: 'Commit Mono',
};

/*
  Two constructions of the same scale, compared live rather than argued about.
  'base' is the 2px-baseline scale; 'sharp' keeps the dense lower half and
  pushes the upper half for stronger hierarchy contrast. See the typescale
  blocks in app/tokens/type.css.
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

// Rendered on <html> by the layout. 'system' is the absence of the attribute,
// so it is a choice a person makes, never the default.
export const DEFAULT_THEME: ThemeChoice = 'light';

export const TYPEFACE_STORAGE_KEY = 'safepoint:typeface';
export const MONO_STORAGE_KEY = 'safepoint:mono';
export const THEME_STORAGE_KEY = 'safepoint:theme';
export const TYPESCALE_STORAGE_KEY = 'safepoint:typescale';
