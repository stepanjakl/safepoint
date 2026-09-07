import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';

/*
  Every candidate family is declared here; `data-typeface` on <html> decides
  which one each semantic role resolves to (see the role blocks in tokens.css).

  Only the default set is preloaded. The others still emit @font-face rules --
  a few hundred bytes of CSS -- but the browser fetches a file only if a role
  actually resolves to it, so the alternates cost nothing until selected.
*/

// Roman and italic are one family: the same `--font-glide` covers both styles.
// Variable axes: wght 100-950, opsz 14-32. Optical sizing is left on `auto`,
// so the 14px interface and the 22px display pull different cuts by font-size
// alone. Available feature tags, none enabled by default: case, cv01, dlig,
// frac, ss01-ss06, ss08, tnum.
const glide = localFont({
  src: [
    {
      path: './fonts/glide-variable.woff2',
      weight: '100 950',
      style: 'normal',
    },
    {
      path: './fonts/glide-variable-italic.woff2',
      weight: '100 950',
      style: 'italic',
    },
  ],
  variable: '--font-glide',
  display: 'swap',
  preload: false,
});

// Single weight (400), no axes -- see --sp-mono-weight in tokens.css.
// Available feature tags, none enabled by default: case, frac, hist, jalt,
// ss01-ss05, zero.
const glideMono = localFont({
  src: './fonts/glide-mono.woff2',
  weight: '400',
  style: 'normal',
  variable: '--font-glide-mono',
  display: 'swap',
  preload: false,
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: false,
});

// Inter Tight is a tighter cut of Inter, not a mono companion: it fills the
// display role only. The Inter set's utility role is Inter itself with tabular
// figures, which the spec's "tabular or monospaced" wording allows.
const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
  preload: false,
});

// Candidate monos for the utility role, selectable independently of the set
// via `data-mono`. Both carry the 500 and 600 the readout and value roles ask
// for, which is what Glide Mono cannot do.
const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  preload: false,
});

// Not on Google Fonts. Vendored from the Fontsource build, which instances the
// variable source into real 400/500/600 cuts -- the release zip ships only 400
// and 700, so 600 would otherwise jump a step too far.
const commitMono = localFont({
  src: [
    { path: './fonts/commit-mono-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/commit-mono-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/commit-mono-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-commit-mono',
  display: 'swap',
  preload: false,
});

/**
 * Class list for <html>. Declaring every family here keeps the choice a
 * one-attribute change at runtime rather than a change of markup.
 */
export const fontVariables = [
  GeistSans.variable,
  GeistMono.variable,
  glide.variable,
  glideMono.variable,
  inter.variable,
  interTight.variable,
  jetBrainsMono.variable,
  commitMono.variable,
].join(' ');
