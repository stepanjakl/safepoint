import {
  DEFAULT_TYPEFACE_SET,
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

export function serverTheme(): ThemeChoice {
  return 'system';
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
export const DEFAULT_MOTION_SPEED: MotionSpeed = '0.2';

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
