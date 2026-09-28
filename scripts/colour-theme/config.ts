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

function neutralFamily(id: string): NeutralFamily {
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
  Surface layers. Every surface is a whole number of layers from the canvas --
  up is lighter in both themes -- and a recess is RECESS_DEPTH layers below
  whichever surface it is cut into. Rings and highlights are offsets, so the
  stack moves together when LAYER_STEP does; dark takes twice the distance,
  since the same step reads as less there. The generator writes these roles
  and the ground-* utilities to generated/surfaces.css, and nothing else
  declares them.
*/
const LAYER_STEP = 25;
const RECESS_DEPTH = 1;

const SURFACE_THEMES = {
  /* ring: ramp steps past whichever of the face and its ground lies further
     that way, so the ring stands off both sides; held for contrast, not
     layering. highlight: layers from the face -- lit in light, deeper in dark. */
  light: { canvas: 75, layerScale: 1, ring: 200, highlight: -1 },
  dark: { canvas: 900, layerScale: 2, ring: -125, highlight: 1 },
} as const satisfies Record<
  Theme,
  { canvas: number; layerScale: number; ring: number; highlight: number }
>;

type SurfaceLayer = {
  depth: number;
  face: `--${string}`;
  /* What it sits on. The canvas sits on nothing and paints no edge. */
  on?: string;
  ring?: `--${string}`;
  highlight?: `--${string}`;
  /* The recess cut into this surface: face, `-ring` and `-edge`. */
  recess: `--${string}`;
  /* The ground-* utility that hands the recess to what this surface holds. */
  ground?: string;
};

export const SURFACE_LAYERS = {
  canvas: { depth: 0, face: '--sp-canvas', recess: '--sp-canvas-recess' },
  primary: {
    depth: 1,
    face: '--sp-surface-primary',
    on: 'canvas',
    ring: '--sp-raised-ring',
    highlight: '--sp-raised-edge',
    recess: '--sp-primary-recess',
    ground: 'ground-raised',
  },
  floating: {
    depth: 2,
    face: '--sp-surface-floating',
    on: 'primary',
    ring: '--sp-floating-ring',
    highlight: '--sp-floating-edge',
    recess: '--sp-floating-recess',
    ground: 'ground-floating',
  },
} as const satisfies Record<string, SurfaceLayer>;

/* The recess roles surface-recessed reads. At the root they are the canvas's
   recess; a ground-* utility re-points them for everything inside it. */
export const RECESS_ROLES = {
  face: '--sp-surface-inset',
  ring: '--sp-recessed-ring',
  highlight: '--sp-recessed-edge',
} as const;

export const recessRoles = (recess: `--${string}`) =>
  ({
    face: recess,
    ring: `${recess}-ring`,
    highlight: `${recess}-edge`,
  }) as const;

function rampStep(value: number, what: string) {
  const last = COLOUR_STEPS.at(-1)!;
  if (!Number.isInteger(value / 25) || value < 0 || value > last) {
    throw new Error(
      `${what} lands on step ${value}, which is not on the 0-${last} ramp; change LAYER_STEP, RECESS_DEPTH or SURFACE_THEMES.`,
    );
  }
  return value;
}

/* Each surface role's step in each theme, keyed by CSS variable. */
export const SURFACE_STEPS: ReadonlyMap<
  `--${string}`,
  Record<Theme, number>
> = (() => {
  const steps = new Map<`--${string}`, Record<Theme, number>>();
  const put = (variable: `--${string}`, theme: Theme, value: number) => {
    const entry = steps.get(variable) ?? { light: 0, dark: 0 };
    entry[theme] = rampStep(value, `${theme} ${variable}`);
    steps.set(variable, entry);
  };
  const layers = SURFACE_LAYERS as Record<string, SurfaceLayer>;
  for (const theme of THEMES) {
    const { canvas, layerScale, ring, highlight } = SURFACE_THEMES[theme];
    const layer = LAYER_STEP * layerScale;
    const faceAt = (depth: number) => canvas - depth * layer;
    const ringFor = (face: number, ground: number) =>
      (ring > 0 ? Math.max(face, ground) : Math.min(face, ground)) + ring;
    const edgeFor = (face: number) => face + highlight * layer;
    for (const surface of Object.values(layers)) {
      const face = faceAt(surface.depth);
      put(surface.face, theme, face);
      if (surface.on) {
        const ground = faceAt(layers[surface.on]!.depth);
        if (surface.ring) put(surface.ring, theme, ringFor(face, ground));
        if (surface.highlight) put(surface.highlight, theme, edgeFor(face));
      }
      const recess = recessRoles(surface.recess);
      const recessFace = faceAt(surface.depth - RECESS_DEPTH);
      put(recess.face, theme, recessFace);
      put(recess.ring, theme, ringFor(recessFace, face));
      put(recess.highlight, theme, edgeFor(recessFace));
    }
  }
  return steps;
})();

/* Where nothing re-points them, the recess roles are the canvas's recess. */
export const SURFACE_ALIASES: ReadonlyMap<`--${string}`, `--${string}`> =
  new Map(
    Object.entries(recessRoles(SURFACE_LAYERS.canvas.recess)).map(
      ([part, variable]) => [
        RECESS_ROLES[part as keyof typeof RECESS_ROLES],
        variable,
      ],
    ),
  );

function surfaceRole(cssVariable: `--${string}`): RoleAssignment {
  const steps = SURFACE_STEPS.get(
    SURFACE_ALIASES.get(cssVariable) ?? cssVariable,
  );
  if (!steps) throw new Error(`${cssVariable} is not a surface role.`);
  return { cssVariable, ...steps };
}

/*
  Stable role inventory for the first theme. The CSS validator compares these
  assignments with the declarations the application actually paints.
*/
export const ROLE_ASSIGNMENTS = {
  canvas: surfaceRole('--sp-canvas'),
  surfacePrimary: surfaceRole('--sp-surface-primary'),
  surfaceFloating: surfaceRole('--sp-surface-floating'),
  surfaceInset: surfaceRole('--sp-surface-inset'),
  raisedRing: surfaceRole('--sp-raised-ring'),
  floatingRing: surfaceRole('--sp-floating-ring'),
  recessedRing: surfaceRole('--sp-recessed-ring'),
  raisedEdge: surfaceRole('--sp-raised-edge'),
  floatingEdge: surfaceRole('--sp-floating-edge'),
  recessedEdge: surfaceRole('--sp-recessed-edge'),
  canvasRecess: surfaceRole('--sp-canvas-recess'),
  canvasRecessRing: surfaceRole('--sp-canvas-recess-ring'),
  canvasRecessEdge: surfaceRole('--sp-canvas-recess-edge'),
  primaryRecess: surfaceRole('--sp-primary-recess'),
  primaryRecessRing: surfaceRole('--sp-primary-recess-ring'),
  primaryRecessEdge: surfaceRole('--sp-primary-recess-edge'),
  floatingRecess: surfaceRole('--sp-floating-recess'),
  floatingRecessRing: surfaceRole('--sp-floating-recess-ring'),
  floatingRecessEdge: surfaceRole('--sp-floating-recess-edge'),
  surfaceControl: {
    cssVariable: '--sp-surface-control',
    light: 25,
    dark: 750,
  },
  surfaceSelected: {
    cssVariable: '--sp-surface-selected',
    light: 175,
    dark: 725,
  },
  surfaceDisabled: {
    cssVariable: '--sp-surface-disabled',
    light: 50,
    dark: 950,
  },
  textPrimary: {
    cssVariable: '--sp-text-primary',
    light: 925,
    dark: 100,
  },
  textMuted: {
    cssVariable: '--sp-text-muted',
    light: 600,
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
    light: 275,
    dark: 650,
  },
  fieldFace: { cssVariable: '--sp-field-face', light: 50, dark: 850 },
  fieldEdge: { cssVariable: '--sp-field-edge', light: 225, dark: 750 },
  fieldEdgeActive: {
    cssVariable: '--sp-field-edge-active',
    light: 600,
    dark: 225,
  },
  keycapFace: { cssVariable: '--sp-keycap-face', light: 25, dark: 775 },
  analysisFace: {
    cssVariable: '--sp-analysis-face',
    light: 25,
    dark: 875,
  },
  noticeFace: { cssVariable: '--sp-notice-face', light: 50, dark: 825 },
  /* The tooltip wears the floating face, so it moves with the stack. */
  tooltipFace: {
    cssVariable: '--tooltip-face',
    ...SURFACE_STEPS.get('--sp-surface-floating')!,
  },
  /* Edges, so a boundary can be measured against the face it bounds and the
     ground it lies on rather than trusted because it is a border. */
  tooltipEdge: { cssVariable: '--tooltip-edge', light: 475, dark: 475 },
  ruleFaint: { cssVariable: '--sp-rule-faint', light: 225, dark: 700 },
  keycapRing: { cssVariable: '--sp-keycap-ring', light: 200, dark: 650 },
  menuChip: { cssVariable: '--sp-menu-chip', light: 150, dark: 850 },
  /* Sheens and etches: every structural edge is a step, so each is pinned
     here rather than left to whatever it composites to. */
  analysisHighlight: {
    cssVariable: '--sp-analysis-highlight',
    light: 0,
    dark: 900,
  },
  keycapHighlight: {
    cssVariable: '--sp-keycap-highlight',
    light: 0,
    dark: 825,
  },
  noticeHighlight: {
    cssVariable: '--sp-notice-highlight',
    light: 25,
    dark: 850,
  },
  tooltipHighlight: {
    cssVariable: '--sp-tooltip-highlight',
    light: 0,
    dark: 850,
  },
  notchHighlight: {
    cssVariable: '--sp-notch-highlight',
    light: 25,
    dark: 900,
  },
  enclosureEdge: {
    cssVariable: '--sp-enclosure-edge',
    light: 25,
    dark: 700,
  },
  dividerEtch: { cssVariable: '--sp-divider-etch', light: 25, dark: 925 },
  cardEtch: { cssVariable: '--sp-card-etch', light: 0, dark: 850 },
  sheetBreakEtch: {
    cssVariable: '--sp-sheet-break-etch',
    light: 25,
    dark: 875,
  },
  sheetRowEtch: { cssVariable: '--sp-sheet-row-etch', light: 25, dark: 950 },
  sheetRowEtchActive: {
    cssVariable: '--sp-sheet-row-etch-active',
    light: 0,
    dark: 850,
  },
} as const satisfies Record<string, RoleAssignment>;

type RoleKey = keyof typeof ROLE_ASSIGNMENTS;

/* Every surface ring against both sides it separates -- its own face and the
   ground it sits on -- since a ring that matches either side reads as a fade. */
const RING_SIDES: readonly (readonly [string, RoleKey, RoleKey, RoleKey])[] = [
  ['raised', 'raisedRing', 'surfacePrimary', 'canvas'],
  ['floating', 'floatingRing', 'surfaceFloating', 'surfacePrimary'],
  ['canvas-recess', 'canvasRecessRing', 'canvasRecess', 'canvas'],
  ['primary-recess', 'primaryRecessRing', 'primaryRecess', 'surfacePrimary'],
  [
    'floating-recess',
    'floatingRecessRing',
    'floatingRecess',
    'surfaceFloating',
  ],
];

const RING_CONTRACTS: readonly ContrastContract[] = RING_SIDES.flatMap(
  ([name, ring, face, ground]) =>
    (
      [
        ['face', face],
        ['ground', ground],
      ] as const
    ).map(([side, background]) => ({
      id: `${name}-ring-on-${side}`,
      classification: 'advisory' as const,
      foreground: ring,
      background,
      minimum: 1.2,
      target: 1.5,
      rationale: `The ${name.replace('-', ' ')} ring against its ${side}.`,
    })),
);

/* Text in a recess, wherever it is cut. The canvas's recess is the root
   --sp-surface-inset, held by the *-on-inset-surface contracts. */
const RECESS_TEXT_CONTRACTS: readonly ContrastContract[] = (
  [
    ['primary-recess', 'primaryRecess'],
    ['floating-recess', 'floatingRecess'],
  ] as const
).flatMap(([name, background]) => [
  {
    id: `primary-on-${name}`,
    classification: 'required' as const,
    foreground: 'textPrimary' as const,
    background,
    minimum: 4.5,
    target: 7,
    rationale: 'Ordinary text in a recess.',
  },
  {
    id: `muted-on-${name}`,
    classification: 'required' as const,
    foreground: 'textMuted' as const,
    background,
    minimum: 4.5,
    target: 4.75,
    rationale: 'Secondary text in a recess.',
  },
]);

export const CONTRAST_CONTRACTS: readonly ContrastContract[] = [
  ...RECESS_TEXT_CONTRACTS,
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
  ...RING_CONTRACTS,
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
    id: 'primary-to-its-recess',
    classification: 'visual',
    first: 'surfacePrimary',
    second: 'primaryRecess',
    targetDeltaE: 0.015,
    rationale: 'A recess in a pane should not collapse into the pane.',
  },
  {
    id: 'floating-to-its-recess',
    classification: 'visual',
    first: 'surfaceFloating',
    second: 'floatingRecess',
    targetDeltaE: 0.015,
    rationale: 'A recess in a floating surface should not collapse into it.',
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
