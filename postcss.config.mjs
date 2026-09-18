/*
  postcss-light-dark is local (tools/postcss-light-dark) and development-only.
  Lightning CSS polyfills light-dark() into a space toggle -- Tailwind v4
  hardcodes its targets at Chrome 111 and reads no browserslist -- which leaves
  every themed custom property unreadable in DevTools, where the themes are
  tuned. The plugin folds it back. The production build keeps the polyfill and
  the browser support that comes with it.
*/
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
    ...(process.env.NODE_ENV === 'production'
      ? {}
      : { 'postcss-light-dark': {} }),
  },
};

export default config;
