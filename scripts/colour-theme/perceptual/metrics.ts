import Color from 'colorjs.io';

/*
  The measurements the perceptual checks are made of: each takes CSS colour
  strings (whatever getComputedStyle returned) and returns a number. Nothing
  here knows about the app; see docs/interface/COLOUR-TESTING.md for what each
  one means and what it must not be asked.
*/

const parse = (colour: string | Color) =>
  typeof colour === 'string' ? new Color(colour) : colour;

const xyz100 = (colour: string | Color) =>
  parse(colour)
    .to('xyz-d65')
    .coords.map((value) => (value ?? 0) * 100) as [number, number, number];

/* CIE L*: lightness from relative luminance alone, so it is the same for a
   grey and a saturated colour of equal luminance. */
export function lstar(colour: string | Color) {
  const y = xyz100(colour)[1] / 100;
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

/* OKLab lightness, 0 to 1. The space the surface lift is measured in. */
export function oklabL(colour: string | Color) {
  return parse(colour).to('oklab').coords[0] ?? 0;
}

/* CIEDE2000, with kL = kC = kH = 1: distance including chroma and hue, so a
   grey and a saturated colour of equal lightness are not zero apart. */
export function deltaE2000(a: string | Color, b: string | Color) {
  return parse(a).deltaE(parse(b), '2000');
}

/* WCAG 2 contrast ratio, 1 to 21. The only text-contrast measure that is a
   standard today. */
export function wcag(foreground: string | Color, background: string | Color) {
  return parse(foreground).contrastWCAG21(parse(background));
}

/* APCA lightness contrast, signed: positive for dark text on a light ground.
   Advisory: WCAG 3 has no contrast algorithm yet. */
export function apca(foreground: string | Color, background: string | Color) {
  return parse(background).contrastAPCA(parse(foreground));
}

/* ── Colour-vision deficiency ───────────────────────────────────────────────
   Machado, Oliveira and Fernandes (2009), severity 1.0, applied in linear sRGB.
   Cross-checked against Chrome's own emulation in metrics.test.ts. */
export type Deficiency =
  'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

const MACHADO: Record<Exclude<Deficiency, 'achromatopsia'>, Matrix3> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const multiply = (matrix: Matrix3, vector: readonly number[]) =>
  matrix.map(
    (row) =>
      row[0] * (vector[0] ?? 0) +
      row[1] * (vector[1] ?? 0) +
      row[2] * (vector[2] ?? 0),
  ) as [number, number, number];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function simulate(colour: string | Color, kind: Deficiency) {
  const linear = parse(colour).to('srgb-linear').coords;
  let result: [number, number, number];
  if (kind === 'achromatopsia') {
    const grey =
      0.2126 * (linear[0] ?? 0) +
      0.7152 * (linear[1] ?? 0) +
      0.0722 * (linear[2] ?? 0);
    result = [grey, grey, grey];
  } else {
    result = multiply(
      MACHADO[kind],
      linear.map((value) => value ?? 0),
    );
  }
  return new Color(
    'srgb-linear',
    result.map(clamp01) as [number, number, number],
  ).to('srgb');
}

/* ── Hellwig and Fairchild (2022) with the Helmholtz–Kohlrausch extension ──
   CAM16 with the revised lightness-to-brightness relation (HF22) and the
   lightness term for saturated colours looking brighter than greys of the
   same luminance (Hellwig, Stolitzka and Fairchild 2022). Ported from the
   colour-science implementation and validated against its published vector in
   metrics.test.ts. The H-K term is a model, not a measurement: the literature
   has it overpredicting the weaker effect found in older datasets, so use the
   result as a band across viewing conditions, never as a single truth. */
export type Viewing = {
  /* Adapting field luminance, cd/m². About a fifth of the display white. */
  adaptingLuminance: number;
  /* Luminous factor of the background, % of white. */
  backgroundFactor: number;
  surround: 'average' | 'dim' | 'dark';
};

const SURROUND = {
  average: { F: 1, c: 0.69, Nc: 1 },
  dim: { F: 0.9, c: 0.59, Nc: 0.9 },
  dark: { F: 0.8, c: 0.525, Nc: 0.8 },
} as const;

/* A UI on an 80 cd/m² display, in a lit room. */
export const UI_VIEWING: Viewing = {
  adaptingLuminance: 16,
  backgroundFactor: 20,
  surround: 'average',
};

const CAT16: Matrix3 = [
  [0.401288, 0.650173, -0.051461],
  [-0.250268, 1.204414, 0.045854],
  [-0.002079, 0.048952, 0.953127],
];

const compress = (value: number, fl: number) => {
  const scaled = (fl * Math.abs(value)) / 100;
  const power = scaled ** 0.42;
  return (400 * Math.sign(value) * power) / (27.13 + power) + 0.1;
};

const radians = (degrees: number) => (degrees * Math.PI) / 180;

export type Appearance = {
  J: number;
  Q: number;
  M: number;
  C: number;
  h: number;
  JHK: number;
  QHK: number;
};

export function hellwig(
  xyz: readonly [number, number, number],
  white: readonly [number, number, number],
  viewing: Viewing,
): Appearance {
  const { F, c, Nc } = SURROUND[viewing.surround];
  const La = viewing.adaptingLuminance;
  const Yw = white[1];
  const rgbW = multiply(CAT16, white);
  const D = Math.min(
    1,
    Math.max(0, F * (1 - (1 / 3.6) * Math.exp((-La - 42) / 92))),
  );
  const k = 1 / (5 * La + 1);
  const FL =
    0.2 * k ** 4 * (5 * La) + 0.1 * (1 - k ** 4) ** 2 * (5 * La) ** (1 / 3);
  const n = viewing.backgroundFactor / Yw;
  const z = 1.48 + Math.sqrt(n);
  const adapt = (rgb: readonly number[]) =>
    rgb.map((value, index) => {
      const dRgb = (D * Yw) / (rgbW[index] ?? 1) + 1 - D;
      return compress(dRgb * value, FL);
    }) as [number, number, number];
  const achromatic = ([r, g, b]: readonly [number, number, number]) =>
    2 * r + g + 0.05 * b - 0.305;
  const Aw = achromatic(adapt(rgbW));
  const [ra, ga, ba] = adapt(multiply(CAT16, xyz));
  const a = ra - (12 * ga) / 11 + ba / 11;
  const b = (ra + ga - 2 * ba) / 9;
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const hr = radians(h);
  const et =
    -0.0582 * Math.cos(hr) -
    0.0258 * Math.cos(2 * hr) -
    0.1347 * Math.cos(3 * hr) +
    0.0289 * Math.cos(4 * hr) -
    0.1475 * Math.sin(hr) -
    0.0308 * Math.sin(2 * hr) +
    0.0385 * Math.sin(3 * hr) +
    0.0096 * Math.sin(4 * hr) +
    1;
  const A = achromatic([ra, ga, ba]);
  const J = 100 * Math.max(A / Aw, 0) ** (c * z);
  const Q = (2 / c) * (J / 100) * Aw;
  const M = 43 * Nc * et * Math.hypot(a, b);
  const C = (35 * M) / Aw;
  const hueTerm =
    -0.16 * Math.cos(hr) +
    0.132 * Math.cos(2 * hr) -
    0.405 * Math.sin(hr) +
    0.08 * Math.sin(2 * hr) +
    0.792;
  const JHK = J + hueTerm * C ** 0.587;
  const QHK = (2 / c) * (JHK / 100) * Aw;
  return { J, Q, M, C, h, JHK, QHK };
}

/* A CSS colour through the model, against the white of the sRGB display. */
export function appearance(
  colour: string | Color,
  viewing: Viewing = UI_VIEWING,
) {
  return hellwig(xyz100(colour), xyz100('white'), viewing);
}

/* ── Ensemble ───────────────────────────────────────────────────────────────
   One colour's lightness in every model we trust to say something, on a common
   0-100 scale. The models are built differently and answer different
   questions: where they agree the number is safe; where they disagree on sign,
   the question is for a person, not for whichever model flatters the fix. */
export type LightnessModels = {
  oklab: number;
  cieLstar: number;
  cam16J: number;
  hellwigJ: number;
  hellwigJHK: number;
  helmlab: number;
};

export function lightnessModels(
  colour: string | Color,
  viewing: Viewing = UI_VIEWING,
): LightnessModels {
  const c = parse(colour);
  const hw = appearance(c, viewing);
  return {
    oklab: oklabL(c) * 100,
    cieLstar: lstar(c),
    cam16J: c.to('cam16-jmh').coords[0] ?? 0,
    hellwigJ: hw.J,
    hellwigJHK: hw.JHK,
    helmlab: (c.to('helmlab-metric').coords[0] ?? 0) * 100,
  };
}

/* How far a colour sits from a reference, per model: positive means lighter
   than the reference. */
export function lightnessGap(
  colour: string | Color,
  reference: string | Color,
  viewing: Viewing = UI_VIEWING,
) {
  const a = lightnessModels(colour, viewing);
  const b = lightnessModels(reference, viewing);
  return Object.fromEntries(
    (Object.keys(a) as (keyof LightnessModels)[]).map((model) => [
      model,
      a[model] - b[model],
    ]),
  ) as LightnessModels;
}
