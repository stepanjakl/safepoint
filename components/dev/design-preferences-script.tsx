import {
  DEFAULT_MOTION_SPEED,
  MOTION_SPEEDS,
  MOTION_STORAGE_KEY,
} from './design-preferences';
import {
  MONO_CHOICES,
  MONO_STORAGE_KEY,
  THEME_STORAGE_KEY,
  TYPEFACE_SETS,
  TYPEFACE_STORAGE_KEY,
} from '@/lib/typography';

/*
  Applies the stored development preferences to <html> before first paint, so
  a chosen typeface or theme does not flash the default first. Server-rendered
  and synchronous by design; it must run ahead of hydration.

  Keep <html suppressHydrationWarning> in the layout: this deliberately edits
  attributes React rendered, which is a mismatch React would otherwise report.
*/
export function DesignPreferencesScript() {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const source = `
try {
  var root = document.documentElement;
  var params = new URLSearchParams(location.search);
  var sets = ${JSON.stringify([...TYPEFACE_SETS])};
  var monos = ${JSON.stringify(MONO_CHOICES.filter((choice) => choice !== 'match'))};
  var typeface = params.get('font')
    || localStorage.getItem(${JSON.stringify(TYPEFACE_STORAGE_KEY)});
  if (sets.indexOf(typeface) !== -1) {
    root.dataset.typeface = typeface;
  }
  var mono = params.get('mono')
    || localStorage.getItem(${JSON.stringify(MONO_STORAGE_KEY)});
  if (monos.indexOf(mono) !== -1) {
    root.dataset.mono = mono;
  }
  var motionSpeeds = ${JSON.stringify(MOTION_SPEEDS)};
  var motionSpeed = localStorage.getItem(${JSON.stringify(MOTION_STORAGE_KEY)});
  root.dataset.motionSpeed = motionSpeeds.indexOf(motionSpeed) !== -1
    ? motionSpeed : ${JSON.stringify(DEFAULT_MOTION_SPEED)};
  var theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  if (theme === 'light' || theme === 'dark') {
    root.dataset.theme = theme;
  }
} catch (error) {
  // No stored preference is readable; the token defaults stand.
}
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: source }} />;
}
