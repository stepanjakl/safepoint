export const COLOUR_STEPS = Array.from(
  { length: 41 },
  (_, index) => index * 25,
) as readonly number[];

export const THEMES = ['light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

export type CurveAnchor = {
  step: number;
  lightness: number;
  chroma: number;
  hue: number;
};

export type RoleAssignment = {
  cssVariable: `--${string}`;
  light: number;
  dark: number;
};

export type ContrastContract = {
  id: string;
  classification: 'required' | 'advisory';
  foreground: keyof typeof ROLE_ASSIGNMENTS;
  background: keyof typeof ROLE_ASSIGNMENTS;
  minimum: number;
  target?: number;
  rationale: string;
};

export type VisualContract = {
  id: string;
  classification: 'visual';
  first: keyof typeof ROLE_ASSIGNMENTS;
  second: keyof typeof ROLE_ASSIGNMENTS;
  targetDeltaE: number;
  rationale: string;
};

export type NeutralFamily = {
  id: string;
  name: string;
  /* Hue is the whole of a family's identity. Because contrast follows
     lightness, rotating it at fixed lightness moves every measured ratio by
     a fraction of a percent, so a family costs no contrast retuning. */
  hue: number;
  /* How much of the shared chroma curve the family takes. Equal chroma at
     different hues does not read as equally tinted, and a family nobody can
     tell apart is not a family: these are set so every pair clears the
     threshold of noticing on a surface, measured rather than guessed. */
  chromaScale: number;
  note: string;
};

export const NEUTRAL_FAMILIES: readonly NeutralFamily[] = [
  {
    id: 'graphite',
    name: 'Graphite',
    hue: 286,
    chromaScale: 1,
    note: "Cool violet-grey on Tailwind zinc's hue and chroma. The restrained default.",
  },
  {
    id: 'steel',
    name: 'Steel',
    hue: 250,
    chromaScale: 2.4,
    note: 'Blue and colder. Earns its distinctness with chroma, as Tailwind slate does against zinc.',
  },
  {
    id: 'clay',
    name: 'Clay',
    hue: 70,
    chromaScale: 1.5,
    note: 'Warm amber-grey, near Tailwind stone.',
  },
  {
    id: 'moss',
    name: 'Moss',
    hue: 155,
    chromaScale: 1.5,
    note: 'Green-grey, between Radix sage and olive.',
  },
  {
    id: 'ash',
    name: 'Ash',
    hue: 286,
    chromaScale: 0,
    note: 'No tint at all. Graphite with the chroma removed, for a true neutral.',
  },
];

export const DEFAULT_NEUTRAL_FAMILY = 'graphite';

export function neutralFamily(id: string): NeutralFamily {
  const found = NEUTRAL_FAMILIES.find((family) => family.id === id);
  if (!found) throw new Error(`Unknown neutral family ${id}.`);
  return found;
}

/*
  The one ramp shape, shared by every family. Both themes read it, so a step is
  a colour rather than a colour per theme, and the whole light/dark
  relationship lives in the role assignments below where it can be read.
  Lightness falls by a flat 0.02237 per step from 0.995 to 0.1, so one index
  means the same everywhere and a structural edge can be stated as an offset
  instead of measured at every face.

  Chroma follows Tailwind zinc's own chroma-against-lightness curve, sampled at
  these lightnesses: near-achromatic where surfaces sit, humped through the
  midtones where text and edges live, easing off again at the dark end. That
  shape is why the light surfaces read as grey rather than tinted.
*/
const RAMP_SHAPE: readonly [step: number, lightness: number, chroma: number][] =
  [
    [0, 0.995, 0.0005],
    [100, 0.9055, 0.00459],
    [200, 0.816, 0.00898],
    [300, 0.7265, 0.01383],
    [400, 0.637, 0.01544],
    [500, 0.5475, 0.01604],
    [600, 0.458, 0.01685],
    [700, 0.3685, 0.01289],
    [800, 0.279, 0.00636],
    [900, 0.1895, 0.0057],
    [1000, 0.1, 0.005],
  ];

export function curvesFor(
  family: NeutralFamily,
): Record<Theme, readonly CurveAnchor[]> {
  const anchors = RAMP_SHAPE.map(([step, lightness, chroma]) => ({
    step,
    lightness,
    chroma: chroma * family.chromaScale,
    hue: family.hue,
  }));
  return { light: anchors, dark: anchors };
}

export const CURVES = curvesFor(neutralFamily(DEFAULT_NEUTRAL_FAMILY));

/*
  Stable role inventory for the first theme. The CSS validator compares these
  assignments with the declarations the application actually paints.
*/
export const ROLE_ASSIGNMENTS = {
  canvas: { cssVariable: '--sp-canvas', light: 75, dark: 900 },
  surfacePrimary: {
    cssVariable: '--sp-surface-primary',
    light: 25,
    dark: 825,
  },
  surfaceFloating: {
    cssVariable: '--sp-surface-floating',
    light: 0,
    dark: 750,
  },
  surfaceInset: {
    cssVariable: '--sp-surface-inset',
    light: 100,
    dark: 950,
  },
  surfaceControl: {
    cssVariable: '--sp-surface-control',
    light: 0,
    dark: 725,
  },
  surfaceSelected: {
    cssVariable: '--sp-surface-selected',
    light: 200,
    dark: 700,
  },
  surfaceDisabled: {
    cssVariable: '--sp-surface-disabled',
    light: 25,
    dark: 925,
  },
  textPrimary: {
    cssVariable: '--sp-text-primary',
    light: 925,
    dark: 100,
  },
  textMuted: {
    cssVariable: '--sp-text-muted',
    light: 575,
    dark: 325,
  },
  textMutedStrong: {
    cssVariable: '--sp-text-muted-strong',
    light: 675,
    dark: 225,
  },
  textInverse: {
    cssVariable: '--sp-text-inverse',
    light: 0,
    dark: 900,
  },
  action: { cssVariable: '--sp-action', light: 925, dark: 100 },
  ruleDefault: {
    cssVariable: '--sp-rule-default',
    light: 250,
    dark: 575,
  },
  fieldFace: { cssVariable: '--sp-field-face', light: 25, dark: 825 },
  fieldEdge: { cssVariable: '--sp-field-edge', light: 200, dark: 725 },
  fieldEdgeActive: {
    cssVariable: '--sp-field-edge-active',
    light: 575,
    dark: 200,
  },
  keycapFace: { cssVariable: '--sp-keycap-face', light: 25, dark: 775 },
  analysisFace: {
    cssVariable: '--sp-analysis-face',
    light: 0,
    dark: 850,
  },
  noticeFace: { cssVariable: '--sp-notice-face', light: 50, dark: 825 },
  tooltipFace: {
    cssVariable: '--tooltip-face',
    light: 0,
    dark: 750,
  },
  /* Edges, so a boundary can be measured against the face it bounds and the
     ground it lies on rather than trusted because it is a border. */
  tooltipEdge: { cssVariable: '--tooltip-edge', light: 450, dark: 450 },
  ruleFaint: { cssVariable: '--sp-rule-faint', light: 200, dark: 625 },
  keycapRing: { cssVariable: '--sp-keycap-ring', light: 200, dark: 650 },
  menuChip: { cssVariable: '--sp-menu-chip', light: 200, dark: 825 },
} as const satisfies Record<string, RoleAssignment>;

export const CONTRAST_CONTRACTS: readonly ContrastContract[] = [
  {
    id: 'primary-on-canvas',
    classification: 'required',
    foreground: 'textPrimary',
    background: 'canvas',
    minimum: 4.5,
    target: 7,
    rationale: 'Ordinary body text on the application canvas.',
  },
  {
    id: 'primary-on-primary-surface',
    classification: 'required',
    foreground: 'textPrimary',
    background: 'surfacePrimary',
    minimum: 4.5,
    target: 7,
    rationale: 'Ordinary body text on raised panels.',
  },
  {
    id: 'primary-on-floating-surface',
    classification: 'required',
    foreground: 'textPrimary',
    background: 'surfaceFloating',
    minimum: 4.5,
    target: 7,
    rationale: 'Ordinary text in dialogs, tooltips, and floating panels.',
  },
  {
    id: 'primary-on-inset-surface',
    classification: 'required',
    foreground: 'textPrimary',
    background: 'surfaceInset',
    minimum: 4.5,
    target: 7,
    rationale: 'Ordinary text in recessed regions.',
  },
  {
    id: 'primary-on-selected-surface',
    classification: 'required',
    foreground: 'textPrimary',
    background: 'surfaceSelected',
    minimum: 4.5,
    target: 7,
    rationale: 'Selected rows retain ordinary text readability.',
  },
  {
    id: 'muted-on-canvas',
    classification: 'required',
    foreground: 'textMuted',
    background: 'canvas',
    minimum: 4.5,
    target: 4.75,
    rationale: 'Dense secondary text on the canvas.',
  },
  {
    id: 'muted-on-inset-surface',
    classification: 'required',
    foreground: 'textMuted',
    background: 'surfaceInset',
    minimum: 4.5,
    target: 4.75,
    rationale: 'The weakest recurring secondary-text pairing.',
  },
  {
    id: 'muted-on-analysis',
    classification: 'required',
    foreground: 'textMuted',
    background: 'analysisFace',
    minimum: 4.5,
    rationale: 'Secondary analysis copy is ordinary-size text.',
  },
  {
    id: 'muted-on-notice',
    classification: 'required',
    foreground: 'textMuted',
    background: 'noticeFace',
    minimum: 4.5,
    rationale: 'Notice captions are ordinary-size text.',
  },
  {
    id: 'inverse-on-action',
    classification: 'required',
    foreground: 'textInverse',
    background: 'action',
    minimum: 4.5,
    target: 7,
    rationale: 'Neutral action labels use inverse text.',
  },
  {
    id: 'field-focus-on-face',
    classification: 'required',
    foreground: 'fieldEdgeActive',
    background: 'fieldFace',
    minimum: 3,
    rationale: 'The active field border is the visible focus indicator.',
  },
  {
    id: 'field-focus-from-resting-edge',
    classification: 'required',
    foreground: 'fieldEdgeActive',
    background: 'fieldEdge',
    minimum: 3,
    rationale: 'Focus must remain distinguishable from the resting boundary.',
  },
  {
    id: 'menu-chip-ink',
    classification: 'required',
    foreground: 'textMutedStrong',
    background: 'menuChip',
    minimum: 4.5,
    rationale:
      "The chip fills at the selected ground's depth, where plain muted ink falls under AA at the micro size its count is set in.",
  },
  {
    id: 'keycap-ink',
    classification: 'required',
    foreground: 'textMutedStrong',
    background: 'keycapFace',
    minimum: 4.5,
    rationale: 'Keyboard shortcut labels are ordinary-size text.',
  },
  {
    id: 'tooltip-ink',
    classification: 'required',
    foreground: 'textPrimary',
    background: 'tooltipFace',
    minimum: 4.5,
    target: 7,
    rationale: 'Tooltip copy uses the primary text role.',
  },
  /* A tooltip is a distinct object over whatever it covers, so its boundary
     carries required visual information rather than decoration. Its face
     aliases the floating surface, which means over a floating panel the edge
     is the only thing distinguishing the two. */
  {
    id: 'tooltip-edge-over-canvas',
    classification: 'required',
    foreground: 'tooltipEdge',
    background: 'canvas',
    minimum: 3,
    rationale:
      'A project requirement, not a WCAG citation: the tooltip must read as a separate object over what it covers.',
  },
  {
    id: 'tooltip-edge-over-primary-surface',
    classification: 'required',
    foreground: 'tooltipEdge',
    background: 'surfacePrimary',
    minimum: 3,
    rationale: 'Tooltips routinely open over raised panels.',
  },
  {
    id: 'tooltip-edge-over-floating-surface',
    classification: 'required',
    foreground: 'tooltipEdge',
    background: 'surfaceFloating',
    minimum: 3,
    rationale:
      'The tooltip face equals the floating surface, so only the edge separates them.',
  },
  {
    id: 'tooltip-edge-on-own-face',
    classification: 'advisory',
    foreground: 'tooltipEdge',
    background: 'tooltipFace',
    minimum: 1.5,
    target: 3,
    rationale: 'The box must read as bounded, not as a floating block of ink.',
  },
  /* A panel edge is decorative where the fill already separates the panel, so
     these carry a visual target rather than a WCAG minimum -- but a boundary
     that vanishes is still a defect, and nothing measured these before. */
  {
    id: 'faint-rule-on-floating-surface',
    classification: 'advisory',
    foreground: 'ruleFaint',
    background: 'surfaceFloating',
    minimum: 1.2,
    target: 1.5,
    rationale:
      'The floating panel ring; in dark it had fallen to 1.10:1 and the boundary was carried almost entirely by an alpha sheen.',
  },
  {
    id: 'faint-rule-on-primary-surface',
    classification: 'advisory',
    foreground: 'ruleFaint',
    background: 'surfacePrimary',
    minimum: 1.2,
    target: 1.5,
    rationale: 'The raised panel ring.',
  },
  {
    id: 'keycap-ring-on-face',
    classification: 'advisory',
    foreground: 'keycapRing',
    background: 'keycapFace',
    minimum: 1.2,
    target: 1.5,
    rationale: 'A keycap reads as a key because its ring sits off its face.',
  },
  {
    id: 'default-rule-on-canvas',
    classification: 'advisory',
    foreground: 'ruleDefault',
    background: 'canvas',
    minimum: 1.25,
    target: 1.5,
    rationale: 'Decorative dividers need presence, not a WCAG text minimum.',
  },
];

export const VISUAL_CONTRACTS: readonly VisualContract[] = [
  {
    id: 'canvas-to-primary-surface',
    classification: 'visual',
    first: 'canvas',
    second: 'surfacePrimary',
    targetDeltaE: 0.015,
    rationale: 'Raised panels should remain perceptibly layered over canvas.',
  },
  {
    id: 'primary-to-floating-surface',
    classification: 'visual',
    first: 'surfacePrimary',
    second: 'surfaceFloating',
    targetDeltaE: 0.015,
    rationale: 'Floating surfaces should remain distinct from raised panels.',
  },
  {
    id: 'canvas-to-inset-surface',
    classification: 'visual',
    first: 'canvas',
    second: 'surfaceInset',
    targetDeltaE: 0.015,
    rationale: 'Inset regions should not collapse into the canvas.',
  },
  {
    id: 'selected-from-canvas',
    classification: 'visual',
    first: 'surfaceSelected',
    second: 'canvas',
    targetDeltaE: 0.02,
    rationale:
      'Selection must remain visible in addition to its non-colour cue.',
  },
];

export const THEME_CONFIG = {
  name: 'graphite',
  direction: "Cool violet-grey on Tailwind zinc's hue and chroma shape",
  colourSpace: 'oklch',
  outputGamut: 'srgb',
  serialization: 'rgb channels with three decimal places',
  curves: CURVES,
  roles: ROLE_ASSIGNMENTS,
  contracts: CONTRAST_CONTRACTS,
  visualContracts: VISUAL_CONTRACTS,
} as const;
