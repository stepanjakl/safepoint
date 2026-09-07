import {
  EDGE_STRENGTH_STORAGE_KEY,
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
  var theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  if (theme === 'light' || theme === 'dark') {
    root.dataset.theme = theme;
  }
  var edge = parseFloat(localStorage.getItem(${JSON.stringify(EDGE_STRENGTH_STORAGE_KEY)}));
  if (edge >= 0 && edge <= 1) {
    root.style.setProperty('--edge-strength', String(edge));
  }
} catch (error) {
  // No stored preference is readable; the token defaults stand.
}
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: source }} />;
}
