import {
  DEFAULT_THEME,
  DEFAULT_TYPEFACE_SET,
  DEFAULT_TYPESCALE,
  isTypescale,
  TYPESCALE_STORAGE_KEY,
  type Typescale,
  isMonoChoice,
  isThemeChoice,
  isTypefacePickerSet,
  MONO_STORAGE_KEY,
  THEME_STORAGE_KEY,
  TYPEFACE_STORAGE_KEY,
  type MonoChoice,
  type ThemeChoice,
  type TypefaceSet,
} from '@/lib/typography';

/*
  <html> is the store: data-typeface, data-mono and data-theme are what
  the stylesheet actually reads, so mirroring them into React state would just
  create a second copy that can disagree. The picker subscribes to these
  through useSyncExternalStore, which also gives hydration the right shape --
  the server snapshot is the token default, and the client snapshot is whatever
  DesignPreferencesScript already applied.

  These live outside the component on purpose: the React Compiler's
  immutability rule (correctly) rejects mutating globals from render scope.
*/

const listeners = new Set<() => void>();

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

/** Snapshots return primitives, so React compares them by value. */
export function readTypeface(): TypefaceSet {
  const value = document.documentElement.dataset.typeface;
  return isTypefacePickerSet(value) ? value : DEFAULT_TYPEFACE_SET;
}

export function readMono(): MonoChoice {
  const value = document.documentElement.dataset.mono;
  return isMonoChoice(value) ? value : 'match';
}

export function readTypescale(): Typescale {
  const value = document.documentElement.dataset.typescale;
  return isTypescale(value) ? value : DEFAULT_TYPESCALE;
}

export function readTheme(): ThemeChoice {
  const value = document.documentElement.dataset.theme;
  return isThemeChoice(value) ? value : 'system';
}

export function serverTypeface() {
  return DEFAULT_TYPEFACE_SET;
}

export function serverMono(): MonoChoice {
  return 'match';
}

export function serverTypescale(): Typescale {
  return DEFAULT_TYPESCALE;
}

export function serverTheme(): ThemeChoice {
  return DEFAULT_THEME;
}

export function setTypeface(next: TypefaceSet) {
  document.documentElement.dataset.typeface = next;
  persist(TYPEFACE_STORAGE_KEY, next);
  emit();
}

export function setMono(next: MonoChoice) {
  // 'match' means no attribute, leaving the typeface set's own mono in place.
  if (next === 'match') {
    delete document.documentElement.dataset.mono;
  } else {
    document.documentElement.dataset.mono = next;
  }
  persist(MONO_STORAGE_KEY, next);
  emit();
}

export function setTypescale(next: Typescale) {
  document.documentElement.dataset.typescale = next;
  persist(TYPESCALE_STORAGE_KEY, next);
  emit();
}

export function setTheme(next: ThemeChoice) {
  // 'system' means no attribute at all, so `color-scheme: light dark` applies.
  if (next === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = next;
  }
  persist(THEME_STORAGE_KEY, next);
  emit();
}

export const COLOUR_SYSTEM_STORAGE_KEY = 'safepoint.dev.colour-system';
export const COLOUR_SYSTEMS = ['original', 'custom'] as const;
export type ColourSystem = (typeof COLOUR_SYSTEMS)[number];
export const DEFAULT_COLOUR_SYSTEM: ColourSystem = 'original';
export const COLOUR_SYSTEM_LABELS: Record<ColourSystem, string> = {
  original: 'Original',
  custom: 'Custom',
};

/* Original is the absence of the attribute; every other system is a generated
   custom family, and only those offer the edge-treatment comparison. */
export function isGeneratedColourSystem(value: ColourSystem) {
  return value !== DEFAULT_COLOUR_SYSTEM;
}

/* Derived from the list rather than restated: written as literals, adding a
   system to COLOUR_SYSTEMS left the guard rejecting it, and the picker fell
   silently back to Original. */
export function isColourSystem(value: unknown): value is ColourSystem {
  return COLOUR_SYSTEMS.includes(value as ColourSystem);
}

export function resolveColourSystem(
  urlValue: string | null,
  storedValue: string | null,
): ColourSystem {
  if (isColourSystem(urlValue)) return urlValue;
  return isColourSystem(storedValue) ? storedValue : DEFAULT_COLOUR_SYSTEM;
}

export function readColourSystem(): ColourSystem {
  const value = document.documentElement.dataset.colourSystem;
  return isColourSystem(value) ? value : DEFAULT_COLOUR_SYSTEM;
}

export function setColourSystem(next: ColourSystem) {
  // Original is the absence of an attribute, keeping production on its baseline.
  if (next === DEFAULT_COLOUR_SYSTEM) {
    delete document.documentElement.dataset.colourSystem;
  } else {
    document.documentElement.dataset.colourSystem = next;
  }
  persist(COLOUR_SYSTEM_STORAGE_KEY, next);
  emit();
}

/* Custom's own neutral families. A separate attribute from data-neutral, not
   a shared one: the two systems name different colours, and keeping them apart
   lets each remember its own choice across a switch. */
export const CUSTOM_NEUTRAL_STORAGE_KEY = 'safepoint.dev.custom-neutral';
export const CUSTOM_NEUTRALS = [
  'graphite',
  'steel',
  'clay',
  'moss',
  'ash',
] as const;
export type CustomNeutral = (typeof CUSTOM_NEUTRALS)[number];
export const DEFAULT_CUSTOM_NEUTRAL: CustomNeutral = 'graphite';
export const CUSTOM_NEUTRAL_LABELS: Record<CustomNeutral, string> = {
  graphite: 'Graphite',
  steel: 'Steel',
  clay: 'Clay',
  moss: 'Moss',
  ash: 'Ash',
};

export function isCustomNeutral(value: unknown): value is CustomNeutral {
  return CUSTOM_NEUTRALS.includes(value as CustomNeutral);
}

export function resolveCustomNeutral(
  urlValue: string | null,
  storedValue: string | null,
): CustomNeutral {
  if (isCustomNeutral(urlValue)) return urlValue;
  return isCustomNeutral(storedValue) ? storedValue : DEFAULT_CUSTOM_NEUTRAL;
}

export function readCustomNeutral(): CustomNeutral {
  const value = document.documentElement.dataset.customNeutral;
  return isCustomNeutral(value) ? value : DEFAULT_CUSTOM_NEUTRAL;
}

export function setCustomNeutral(next: CustomNeutral) {
  // The default family binds on the bare selector, so it needs no attribute.
  if (next === DEFAULT_CUSTOM_NEUTRAL) {
    delete document.documentElement.dataset.customNeutral;
  } else {
    document.documentElement.dataset.customNeutral = next;
  }
  persist(CUSTOM_NEUTRAL_STORAGE_KEY, next);
  emit();
}

export const EDGE_TREATMENT_STORAGE_KEY = 'safepoint.dev.edge-treatment';
export const EDGE_TREATMENTS = ['existing', 'opaque'] as const;
export type EdgeTreatment = (typeof EDGE_TREATMENTS)[number];
export const DEFAULT_EDGE_TREATMENT: EdgeTreatment = 'existing';
export const EDGE_TREATMENT_LABELS: Record<EdgeTreatment, string> = {
  existing: 'Existing',
  opaque: 'Opaque recipes',
};

export function isEdgeTreatment(value: unknown): value is EdgeTreatment {
  return value === 'existing' || value === 'opaque';
}

export function resolveEdgeTreatment(
  urlValue: string | null,
  storedValue: string | null,
): EdgeTreatment {
  if (isEdgeTreatment(urlValue)) return urlValue;
  return isEdgeTreatment(storedValue) ? storedValue : DEFAULT_EDGE_TREATMENT;
}

export function readEdgeTreatment(): EdgeTreatment {
  const value = document.documentElement.dataset.edgeTreatment;
  return isEdgeTreatment(value) ? value : DEFAULT_EDGE_TREATMENT;
}

export function setEdgeTreatment(next: EdgeTreatment) {
  // Existing is the absence of an attribute, preserving the Phase A baseline.
  if (next === DEFAULT_EDGE_TREATMENT) {
    delete document.documentElement.dataset.edgeTreatment;
  } else {
    document.documentElement.dataset.edgeTreatment = next;
  }
  persist(EDGE_TREATMENT_STORAGE_KEY, next);
  emit();
}

/** Private browsing and blocked site data throw rather than no-op. */
function persist(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A picker that cannot remember the choice is still a usable picker.
  }
}

export const MOTION_STORAGE_KEY = 'safepoint.dev.motion-speed';
export const MOTION_SPEEDS = ['1', '0.5', '0.2', '0.1'] as const;
export type MotionSpeed = (typeof MOTION_SPEEDS)[number];
export const DEFAULT_MOTION_SPEED: MotionSpeed = '1';

export function readMotionSpeed(): MotionSpeed {
  const value = document.documentElement.dataset.motionSpeed;
  return MOTION_SPEEDS.find((speed) => speed === value) ?? DEFAULT_MOTION_SPEED;
}

export function serverMotionSpeed(): MotionSpeed {
  return DEFAULT_MOTION_SPEED;
}

export function setMotionSpeed(next: MotionSpeed) {
  document.documentElement.dataset.motionSpeed = next;
  persist(MOTION_STORAGE_KEY, next);
  emit();
}

/*
  Neutral palettes. Every neutral role in tokens/ reads a step from the
  --sp-neutral-* ramp rather than from zinc directly, and data-neutral rebinds
  that ramp for its own subtree -- surfaces, rules, text, menus and the faces
  that answer a press alike.
*/
export const NEUTRAL_STORAGE_KEY = 'safepoint.dev.neutral';
export const NEUTRAL_PALETTES = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'taupe',
  'mauve',
  'mist',
  'olive',
  'radix-gray',
  'radix-mauve',
  'radix-slate',
  'radix-sage',
  'radix-olive',
  'radix-sand',
] as const;
export type NeutralPalette = (typeof NEUTRAL_PALETTES)[number];
export const NEUTRAL_PALETTE_LABELS: Record<NeutralPalette, string> = {
  slate: 'Slate',
  gray: 'Gray',
  zinc: 'Zinc',
  neutral: 'Neutral',
  stone: 'Stone',
  taupe: 'Taupe',
  mauve: 'Mauve',
  mist: 'Mist',
  olive: 'Olive',
  'radix-gray': 'Radix / Gray',
  'radix-mauve': 'Radix / Mauve',
  'radix-slate': 'Radix / Slate',
  'radix-sage': 'Radix / Sage',
  'radix-olive': 'Radix / Olive',
  'radix-sand': 'Radix / Sand',
};
export const DEFAULT_NEUTRAL: NeutralPalette = 'zinc';

export function readNeutral(): NeutralPalette {
  const value = document.documentElement.dataset.neutral;
  return (
    NEUTRAL_PALETTES.find((palette) => palette === value) ?? DEFAULT_NEUTRAL
  );
}

export function setNeutral(next: NeutralPalette) {
  document.documentElement.dataset.neutral = next;
  persist(NEUTRAL_STORAGE_KEY, next);
  emit();
}

/*
  The workspace menu's tile colours, for comparing palettes by eye. 'radix'
  swaps in the Radix Colors steps copied into app/radix-colors.css; anything
  else leaves the tiles on Tailwind's ramps as they ship. The default is Radix,
  so the layout renders the attribute and a choice always writes it: without
  it the stylesheet would fall back to Tailwind, not to the default.
*/
export const TILE_PALETTE_STORAGE_KEY = 'safepoint.dev.tile-palette';
export const TILE_PALETTES = ['tailwind', 'radix'] as const;
export type TilePalette = (typeof TILE_PALETTES)[number];
export const DEFAULT_TILE_PALETTE: TilePalette = 'radix';
export const TILE_PALETTE_LABELS: Record<TilePalette, string> = {
  tailwind: 'Tailwind',
  radix: 'Radix',
};

export function readTilePalette(): TilePalette {
  const value = document.documentElement.dataset.tilePalette;
  return value === 'radix' ? 'radix' : 'tailwind';
}

export function setTilePalette(next: TilePalette) {
  document.documentElement.dataset.tilePalette = next;
  persist(TILE_PALETTE_STORAGE_KEY, next);
  emit();
}

/*
  The semantic state colours. Radix is what the app runs on -- see the
  [data-state-palette='radix'] block in tokens/state.css for the mapping and why --
  and 'tailwind' drops back to the ramps written into the tokens themselves,
  so the two can be judged against each other.

  The default is Radix, so the layout renders the attribute and a choice always
  writes it: without it the stylesheet would fall back to Tailwind, not to the
  default.
*/
export const STATE_PALETTE_STORAGE_KEY = 'safepoint.dev.state-palette';
export const STATE_PALETTES = ['tailwind', 'radix'] as const;
export type StatePalette = (typeof STATE_PALETTES)[number];
export const DEFAULT_STATE_PALETTE: StatePalette = 'radix';
export const STATE_PALETTE_LABELS: Record<StatePalette, string> = {
  tailwind: 'Tailwind',
  radix: 'Radix',
};

export function readStatePalette(): StatePalette {
  const value = document.documentElement.dataset.statePalette;
  return value === 'tailwind' ? 'tailwind' : 'radix';
}

export function setStatePalette(next: StatePalette) {
  document.documentElement.dataset.statePalette = next;
  persist(STATE_PALETTE_STORAGE_KEY, next);
  emit();
}

/*
  One multiplier for all six of the tiles' saturation ceilings in tokens/geometry.css.
  1 is the ceilings as written, and means no attribute: the default moves with
  the tokens. Anything else is an inline --tile-chroma-scale on <html>, which
  outranks :root. TILE_CHROMA_SCALE_MAX puts the highest ceiling above any
  chroma either palette gives a tile, so the far end is effectively uncapped.
*/
export const TILE_CHROMA_SCALE_STORAGE_KEY = 'safepoint.dev.tile-chroma-scale';
export const DEFAULT_TILE_CHROMA_SCALE = 1;
export const TILE_CHROMA_SCALE_MIN = 0.25;
export const TILE_CHROMA_SCALE_MAX = 2.5;
const TILE_CHROMA_SCALE_PROPERTY = '--tile-chroma-scale';

export function readTileChromaScale(): number {
  const value = Number.parseFloat(
    document.documentElement.style.getPropertyValue(TILE_CHROMA_SCALE_PROPERTY),
  );
  return Number.isFinite(value) ? value : DEFAULT_TILE_CHROMA_SCALE;
}

export function setTileChromaScale(next: number) {
  if (next === DEFAULT_TILE_CHROMA_SCALE) {
    document.documentElement.style.removeProperty(TILE_CHROMA_SCALE_PROPERTY);
  } else {
    document.documentElement.style.setProperty(
      TILE_CHROMA_SCALE_PROPERTY,
      String(next),
    );
  }
  persist(TILE_CHROMA_SCALE_STORAGE_KEY, String(next));
  emit();
}

/*
  How far a slanted corner's radius follows its angle, for tuning by eye. 0.5
  is the token as written and means no inline value, so the default moves with
  tokens/geometry.css; anything else is an inline --slant-corner-balance on <html>.
*/
export const CORNER_BALANCE_STORAGE_KEY = 'safepoint.dev.corner-balance';
export const DEFAULT_CORNER_BALANCE = 0.5;
const CORNER_BALANCE_PROPERTY = '--slant-corner-balance';

export function readCornerBalance(): number {
  const value = Number.parseFloat(
    document.documentElement.style.getPropertyValue(CORNER_BALANCE_PROPERTY),
  );
  return Number.isFinite(value) ? value : DEFAULT_CORNER_BALANCE;
}

export function setCornerBalance(next: number) {
  if (next === DEFAULT_CORNER_BALANCE) {
    document.documentElement.style.removeProperty(CORNER_BALANCE_PROPERTY);
  } else {
    document.documentElement.style.setProperty(
      CORNER_BALANCE_PROPERTY,
      String(next),
    );
  }
  persist(CORNER_BALANCE_STORAGE_KEY, String(next));
  emit();
}

/*
  The radius a slanted control's corners start from, before the corner
  balance scales each by its angle; the notch's foot follows it. In px for the
  slider. The default is --radius-shell at the default root size and means no
  inline value, so the rules' own fallback stands.
*/
export const SLANT_RADIUS_STORAGE_KEY = 'safepoint.dev.slant-radius';
export const DEFAULT_SLANT_RADIUS = 10;
export const SLANT_RADIUS_MIN = 0;
export const SLANT_RADIUS_MAX = 20;
const SLANT_RADIUS_PROPERTY = '--slant-radius';

export function readSlantRadius(): number {
  const value = Number.parseFloat(
    document.documentElement.style.getPropertyValue(SLANT_RADIUS_PROPERTY),
  );
  return Number.isFinite(value) ? value : DEFAULT_SLANT_RADIUS;
}

export function setSlantRadius(next: number) {
  if (next === DEFAULT_SLANT_RADIUS) {
    document.documentElement.style.removeProperty(SLANT_RADIUS_PROPERTY);
  } else {
    document.documentElement.style.setProperty(
      SLANT_RADIUS_PROPERTY,
      `${next}px`,
    );
  }
  persist(SLANT_RADIUS_STORAGE_KEY, String(next));
  emit();
}

/*
  Alignment guides. A development-only overlay that draws the sidebar's icon
  axis and a crosshair through the centre of every icon sitting on it, so the
  rail can be checked rather than trusted. Kept on <html> like every other
  preference here, which is also what lets the guides be pure CSS.
*/
export const RAIL_GUIDES_STORAGE_KEY = 'safepoint.dev.rail-guides';

export function readRailGuides(): boolean {
  return document.documentElement.dataset.railGuides === 'on';
}

export function serverRailGuides(): boolean {
  return false;
}

export function setRailGuides(next: boolean) {
  if (next) {
    document.documentElement.dataset.railGuides = 'on';
  } else {
    delete document.documentElement.dataset.railGuides;
  }
  persist(RAIL_GUIDES_STORAGE_KEY, next ? 'on' : 'off');
  emit();
}
