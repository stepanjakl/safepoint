// A browser-storage key, versioned like the app's others.
export const THEME_KEY = 'safepoint.workbench-theme.v1';

/*
  Puts the visitor's chosen theme on <html> before the page paints, so a reload
  does not flash the default first. Rendered by the workbench layout outside
  development only; the root layout's suppressHydrationWarning already covers
  an attribute this changes.
*/
export function ThemeScript() {
  if (process.env.NODE_ENV === 'development') return null;
  const source = `try {
  var theme = localStorage.getItem(${JSON.stringify(THEME_KEY)});
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
  }
} catch (error) {}`;
  return <script dangerouslySetInnerHTML={{ __html: source }} />;
}
