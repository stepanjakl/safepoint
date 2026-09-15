import {
  DEFAULT_THEME,
  DEFAULT_TYPEFACE_SET,
  DEFAULT_TYPESCALE,
  isTypescale,
  TYPESCALE_STORAGE_KEY,
  type Typescale,
  isMonoChoice,
  isThemeChoice,
  isTypefaceSet,
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
  return isTypefaceSet(value) ? value : DEFAULT_TYPEFACE_SET;
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
  Neutral palettes. Every neutral role in tokens.css reads a step from a ramp
  rather than from zinc directly, and these two attributes rebind the ramps:
  data-neutral for surfaces, rules, text and menus, and data-control-neutral
  for the faces that answer a press -- buttons, fields, keycaps and the badges
  built on the keycap. 'match' means no attribute, leaving the controls on
  whatever the surfaces use.
*/
export const NEUTRAL_STORAGE_KEY = 'safepoint.dev.neutral';
export const CONTROL_NEUTRAL_STORAGE_KEY = 'safepoint.dev.control-neutral';
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
] as const;
export type NeutralPalette = (typeof NEUTRAL_PALETTES)[number];
export const DEFAULT_NEUTRAL: NeutralPalette = 'zinc';
export const CONTROL_NEUTRAL_CHOICES = ['match', ...NEUTRAL_PALETTES] as const;
export type ControlNeutralChoice = (typeof CONTROL_NEUTRAL_CHOICES)[number];

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

export function readControlNeutral(): ControlNeutralChoice {
  const value = document.documentElement.dataset.controlNeutral;
  return NEUTRAL_PALETTES.find((palette) => palette === value) ?? 'match';
}

export function setControlNeutral(next: ControlNeutralChoice) {
  if (next === 'match') {
    delete document.documentElement.dataset.controlNeutral;
  } else {
    document.documentElement.dataset.controlNeutral = next;
  }
  persist(CONTROL_NEUTRAL_STORAGE_KEY, next);
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
  One multiplier for all six of the tiles' saturation ceilings in tokens.css.
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
  tokens.css; anything else is an inline --slant-corner-balance on <html>.
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
