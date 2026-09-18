import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Inter,
  Inter_Tight,
  JetBrains_Mono,
  Michroma,
  Orbitron,
  Roboto,
  Source_Code_Pro,
  Source_Sans_3,
  Space_Mono,
  Syne,
} from 'next/font/google';
import localFont from 'next/font/local';

/*
  Every candidate family is declared here; `data-typeface` on <html> decides
  which one each semantic role resolves to (see the role blocks in tokens/type.css).

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

// Single weight (400), no axes -- see --sp-mono-weight in tokens/type.css.
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

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
  weight: ['500', '600'],
  preload: false,
});

const sourceCodePro = Source_Code_Pro({
  subsets: ['latin'],
  variable: '--font-source-code-pro',
  display: 'swap',
  weight: 'variable',
  preload: false,
});

// Space Mono provides only 400 and 700; the utility tokens select those real
// cuts rather than asking the browser to synthesize the usual 500 and 600.
const spaceMono = Space_Mono({
  subsets: ['latin'],
  variable: '--font-space-mono',
  display: 'swap',
  weight: ['400', '700'],
  preload: false,
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
  weight: 'variable',
  preload: false,
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-source-sans',
  display: 'swap',
  weight: 'variable',
  preload: false,
});

const roboto = Roboto({
  subsets: ['latin'],
  variable: '--font-roboto',
  display: 'swap',
  weight: 'variable',
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

// Development wordmark candidates. Each is exposed independently so the
// workbench can compare the real outlines at identical optical settings.
const michroma = Michroma({
  subsets: ['latin'],
  variable: '--font-michroma',
  display: 'swap',
  weight: '400',
  preload: false,
});

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  display: 'swap',
  weight: 'variable',
  preload: false,
});

// The selected brand family is preloaded; the workbench uses its full weight range.
const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  display: 'swap',
  weight: 'variable',
  preload: true,
});

/** Class list for <html>, including the fixed brand family. */
export const fontVariables = [
  GeistSans.variable,
  GeistMono.variable,
  glide.variable,
  glideMono.variable,
  inter.variable,
  interTight.variable,
  jetBrainsMono.variable,
  ibmPlexMono.variable,
  sourceCodePro.variable,
  spaceMono.variable,
  ibmPlexSans.variable,
  sourceSans.variable,
  roboto.variable,
  commitMono.variable,
  michroma.variable,
  syne.variable,
  orbitron.variable,
].join(' ');
