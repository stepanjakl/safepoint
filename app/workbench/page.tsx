import { notFound } from 'next/navigation';
import SortArrowUpDown from 'blode-icons-react/icons/sort-arrow-up-down';

import { Button, ICON_SHAPE } from '@/components/ui/button';
import { cx } from '@/lib/cx';

import { ContrastReadout } from './contrast-readout';

/*
  Development only: the accent (cyan) and Save-order (teal) faces under
  candidate palettes, side by side in both themes, as live controls.

  Each panel declares its own stops with native light-dark() in a runtime
  <style>, so a light and a dark panel can sit on one page: the stops resolve
  against the panel's own colour scheme rather than the root's.

  Every option is flat under the pointer: both face stops and both ring stops
  take one colour, and the highlight goes transparent over it, so face, edge
  and sheen read as a single fill.
*/

type Hue = 'cyan' | 'teal';
/* One theme's stops. A hover colour stands for all five hover values. */
type Theme = {
  top: string;
  bottom: string;
  ringTop: string;
  ringBottom: string;
  edge: string;
  hover: string;
};
type Family = { light: Theme; dark: Theme };

const mix = (a: string, b: string, share = 50) =>
  `color-mix(in oklab, ${a} ${share}%, ${b})`;

/*
  A Radix step in shorthand: `9` is the light scale's step 9, `d9` the dark
  scale's, and `d7@45+d8` is 45% of dark 7 mixed with dark 8. Radix keeps its
  vivid mid-tones in the dark scale, which is where Tailwind's cyan and teal
  sit, so the light theme reads from it too.
*/
function radix(hue: Hue, spec: string): string {
  const step = (part: string) =>
    part.startsWith('d')
      ? `var(--radix-${hue}-dark-${part.slice(1)})`
      : `var(--radix-${hue}-${part})`;
  const blend = /^(d?\d+)@(\d+)\+(d?\d+)$/.exec(spec);
  if (blend) return mix(step(blend[1]!), step(blend[3]!), Number(blend[2]));
  return step(spec);
}

type Specs = Omit<Theme, 'edge'> & { edge?: string };

function fromRadix(hue: Hue, specs: { light: Specs; dark: Specs }): Family {
  const theme = (which: 'light' | 'dark'): Theme => {
    const s = specs[which];
    const top = radix(hue, s.top);
    return {
      top,
      bottom: radix(hue, s.bottom),
      ringTop: radix(hue, s.ringTop),
      ringBottom: radix(hue, s.ringBottom),
      /* Dark's sheen is the face itself, a fifth darker: a light line on a
         lit face in dark reads as glare. */
      edge: s.edge ? radix(hue, s.edge) : mix('black', top, 20),
      hover: radix(hue, s.hover),
    };
  };
  return { light: theme('light'), dark: theme('dark') };
}

/* Tailwind v4's cyan and teal, as shipped before the move to Radix. */
const TW = {
  c300: 'oklch(86.5% 0.127 207.078)',
  c400: 'oklch(78.9% 0.154 211.53)',
  c500: 'oklch(71.5% 0.143 215.221)',
  c600: 'oklch(60.9% 0.126 221.723)',
  c700: 'oklch(52% 0.105 223.128)',
  c800: 'oklch(45% 0.085 224.283)',
  t400: 'oklch(77.7% 0.152 181.912)',
  t500: 'oklch(70.4% 0.14 182.503)',
  t600: 'oklch(60% 0.118 184.704)',
  t700: 'oklch(51.1% 0.096 186.391)',
  t800: 'oklch(43.7% 0.078 188.216)',
};

const TAILWIND: Record<Hue, Family> = {
  cyan: {
    light: {
      top: TW.c400,
      bottom: TW.c600,
      ringTop: TW.c500,
      ringBottom: TW.c700,
      edge: TW.c300,
      hover: TW.c600,
    },
    dark: {
      top: mix(TW.c600, TW.c700, 25),
      bottom: mix(TW.c700, TW.c800),
      ringTop: mix(TW.c500, TW.c600),
      ringBottom: mix(TW.c700, TW.c800),
      edge: mix('black', mix(TW.c600, TW.c700, 25), 20),
      hover: TW.c700,
    },
  },
  teal: {
    light: {
      top: TW.t500,
      bottom: TW.t700,
      ringTop: TW.t700,
      ringBottom: TW.t800,
      edge: TW.t400,
      hover: TW.t700,
    },
    dark: {
      top: mix(TW.t600, TW.t700, 25),
      bottom: mix(TW.t700, TW.t800),
      ringTop: mix(TW.t400, TW.t500),
      ringBottom: mix(TW.t700, TW.t800),
      edge: mix('black', mix(TW.t600, TW.t700, 25), 10),
      hover: TW.t700,
    },
  },
};

type Option = {
  id: string;
  name: string;
  note: string;
  accent: Family;
  commit: Family;
};

const OPTIONS: Option[] = [
  {
    id: 'tailwind',
    name: 'A · Tailwind, flat hover',
    note: 'Today’s stops, the reference. Only the hover changes: one flat colour.',
    accent: TAILWIND.cyan,
    commit: TAILWIND.teal,
  },
  {
    id: 'fitted',
    name: 'B · Radix fitted to Tailwind',
    note: 'Each stop is the blend of two adjacent Radix steps closest to its Tailwind original — within ΔE 0.015 for most, about the threshold of noticing.',
    accent: fromRadix('cyan', {
      light: {
        top: 'd11',
        bottom: '10@80+11',
        ringTop: 'd10@80+d11',
        ringBottom: 'd7@45+d8',
        edge: 'd11@50+d12',
        hover: '10@80+11',
      },
      dark: {
        top: 'd7@15+d8',
        bottom: 'd7@90+d8',
        ringTop: 'd9@95+d10',
        ringBottom: 'd7@90+d8',
        hover: 'd7@45+d8',
      },
    }),
    commit: fromRadix('teal', {
      light: {
        top: 'd10@80+d11',
        bottom: 'd7@40+d8',
        ringTop: 'd7@40+d8',
        ringBottom: 'd6@60+d7',
        edge: 'd10@10+d11',
        hover: 'd7@40+d8',
      },
      dark: {
        top: 'd7@5+d8',
        bottom: 'd7@95+d8',
        ringTop: 'd10@45+d11',
        ringBottom: 'd7@95+d8',
        hover: 'd7@40+d8',
      },
    }),
  },
  {
    id: 'nearest',
    name: 'C · Radix nearest steps',
    note: 'Each stop is the single Radix step closest to Tailwind: no blends, within ΔE 0.015–0.04.',
    accent: fromRadix('cyan', {
      light: {
        top: 'd11',
        bottom: '10',
        ringTop: 'd10',
        ringBottom: '11',
        edge: 'd12',
        hover: '10',
      },
      dark: {
        top: 'd8',
        bottom: 'd7',
        ringTop: '9',
        ringBottom: 'd7',
        hover: 'd8',
      },
    }),
    commit: fromRadix('teal', {
      light: {
        top: 'd10',
        bottom: 'd8',
        ringTop: 'd8',
        ringBottom: 'd6',
        edge: 'd11',
        hover: 'd8',
      },
      dark: {
        top: 'd8',
        bottom: 'd7',
        ringTop: 'd11',
        ringBottom: 'd7',
        hover: 'd8',
      },
    }),
  },
  {
    id: 'fitted-calmer',
    name: 'D · Radix fitted, calmer top',
    note: 'B, with light’s glowing top brought down to Radix’s solid 9: less neon, and the label gains contrast where Tailwind is weakest.',
    accent: fromRadix('cyan', {
      light: {
        top: '9',
        bottom: '10@80+11',
        ringTop: 'd10@80+d11',
        ringBottom: 'd7@45+d8',
        edge: '8',
        hover: '10@80+11',
      },
      dark: {
        top: 'd7@15+d8',
        bottom: 'd7@90+d8',
        ringTop: 'd9@95+d10',
        ringBottom: 'd7@90+d8',
        hover: 'd7@45+d8',
      },
    }),
    commit: fromRadix('teal', {
      light: {
        top: '9',
        bottom: 'd7@40+d8',
        ringTop: 'd7@40+d8',
        ringBottom: 'd6@60+d7',
        edge: '8',
        hover: 'd7@40+d8',
      },
      dark: {
        top: 'd7@5+d8',
        bottom: 'd7@95+d8',
        ringTop: 'd10@45+d11',
        ringBottom: 'd7@95+d8',
        hover: 'd7@40+d8',
      },
    }),
  },
  {
    id: 'solids',
    name: 'E · Radix solids',
    note: 'Radix’s own solid steps, 9 and 10, each theme from its own scale.',
    accent: fromRadix('cyan', {
      light: {
        top: '9',
        bottom: '10',
        ringTop: '10',
        ringBottom: '11',
        edge: '8',
        hover: '10',
      },
      dark: {
        top: 'd10',
        bottom: 'd9',
        ringTop: 'd11',
        ringBottom: 'd8',
        hover: 'd9',
      },
    }),
    commit: fromRadix('teal', {
      light: {
        top: '9',
        bottom: '10',
        ringTop: '10',
        ringBottom: '11',
        edge: '8',
        hover: '10',
      },
      dark: {
        top: 'd10',
        bottom: 'd9',
        ringTop: 'd11',
        ringBottom: 'd8',
        hover: 'd9',
      },
    }),
  },
];

function declarations(prefix: string, { light, dark }: Family) {
  const pair = (key: keyof Theme) => `light-dark(${light[key]}, ${dark[key]})`;
  const tokens: Record<string, string> = {
    'face-top': pair('top'),
    'face-bottom': pair('bottom'),
    'ring-top': pair('ringTop'),
    'ring-bottom': pair('ringBottom'),
    edge: pair('edge'),
    'face-top-hover': pair('hover'),
    'face-bottom-hover': pair('hover'),
    'ring-top-hover': pair('hover'),
    'ring-bottom-hover': pair('hover'),
  };
  return Object.entries(tokens)
    .map(([name, value]) => `--sp-${prefix}-${name}: ${value};`)
    .join(' ');
}

const STYLE = OPTIONS.map(
  (option) =>
    `[data-accent-option='${option.id}'] { ${declarations('accent', option.accent)} ${declarations('commit', option.commit)} background: light-dark(var(--sp-neutral-25), var(--sp-neutral-825)); color: light-dark(var(--sp-neutral-925), var(--sp-neutral-100)); }`,
).join('\n');

const THEMES = ['light', 'dark'] as const;

export default function WorkbenchPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  return (
    <main id="main" className="bg-canvas text-primary min-h-dvh p-6">
      <style>{STYLE}</style>
      <h1 className="text-title font-semibold">Accent comparison</h1>
      <p className="text-meta text-muted mt-1 max-w-2xl">
        The primary action and the Save-order toggle under each candidate
        palette, flat under the pointer. Hover and tab through them: every state
        is live. Figures are white-label contrast on the face&rsquo;s top,
        bottom and hover colour, measured from what the page paints.
      </p>
      <div className="mt-6 grid gap-5">
        {OPTIONS.map((option) => (
          <section key={option.id} aria-labelledby={`option-${option.id}`}>
            <h2 id={`option-${option.id}`} className="text-dense font-semibold">
              {option.name}
            </h2>
            <p className="text-meta text-muted max-w-3xl">{option.note}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {THEMES.map((theme) => (
                <div
                  key={theme}
                  data-theme={theme}
                  data-accent-option={option.id}
                  className="rounded-shell border-rule-faint grid gap-3 border p-4"
                >
                  <span className="readout">{theme}</span>
                  <div className="flex items-center gap-4">
                    <Button variant="primary">Review release</Button>
                    <button
                      type="button"
                      aria-label="Save order"
                      className={cx(
                        ICON_SHAPE,
                        'control-face control-commit hover:control-commit-hover focus-visible:control-commit-hover size-7.5 text-white',
                      )}
                    >
                      <SortArrowUpDown className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  <dl className="text-micro grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    <dt className="opacity-70">Accent</dt>
                    <dd>
                      <ContrastReadout family="accent" />
                    </dd>
                    <dt className="opacity-70">Save order</dt>
                    <dd>
                      <ContrastReadout family="commit" />
                    </dd>
                  </dl>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
