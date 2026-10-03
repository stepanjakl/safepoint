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
  up is lighter in both themes -- and a recess is SURFACE_THEMES.recess layers
  below whichever surface it is cut into. Rings and highlights are offsets, so the
  stack moves together when LAYER_STEP does; dark takes twice the distance,
  since the same step reads as less there. The generator writes these roles
  and the ground-* utilities to generated/surfaces.css, and nothing else
  declares them.
*/
const LAYER_STEP = 25;

type SurfaceTheme = {
  canvas: number;
  layerScale: number;
  ring: number;
  highlight: number;
  recess: number;
};

const SURFACE_THEMES = {
  /* ring: ramp steps past whichever of the face and its ground lies further
     that way, so the ring stands off both sides; held for contrast, not
     layering. highlight: layers from the face, on every surface and recess --
     lighter in light, darker in dark, never the other way round.
     recess: layers below the surface it is cut into (negative: above). */
  light: {
    canvas: 75,
    layerScale: 1,
    ring: 200,
    highlight: -1,
    recess: 1,
  },
  dark: {
    canvas: 900,
    layerScale: 2,
    ring: -125,
    highlight: 1,
    recess: 1,
  },
} as const satisfies Record<Theme, SurfaceTheme>;

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
      `${what} lands on step ${value}, which is not on the 0-${last} ramp; change LAYER_STEP or SURFACE_THEMES.`,
    );
  }
  return value;
}

type Steps = ReadonlyMap<`--${string}`, Record<Theme, number>>;

/* Each surface role's step in each theme, keyed by CSS variable. */
function surfaceSteps(themes: Record<Theme, SurfaceTheme>): Steps {
  const steps = new Map<`--${string}`, Record<Theme, number>>();
  const put = (variable: `--${string}`, theme: Theme, value: number) => {
    const entry = steps.get(variable) ?? { light: 0, dark: 0 };
    entry[theme] = rampStep(value, `${theme} ${variable}`);
    steps.set(variable, entry);
  };
  const layers = SURFACE_LAYERS as Record<string, SurfaceLayer>;
  for (const theme of THEMES) {
    const { canvas, layerScale, ring, highlight, recess } = themes[theme];
    if (theme === 'light' ? !(highlight < 0) : !(highlight > 0))
      throw new Error(
        `${theme}: a highlight is ${theme === 'light' ? 'lighter' : 'darker'} than its face, so highlight must be ${theme === 'light' ? 'below' : 'above'} 0.`,
      );
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
      const cut = recessRoles(surface.recess);
      const recessFace = faceAt(surface.depth - recess);
      put(cut.face, theme, recessFace);
      put(cut.ring, theme, ringFor(recessFace, face));
      put(cut.highlight, theme, edgeFor(recessFace));
    }
  }
  return steps;
}

export const SURFACE_STEPS = surfaceSteps(SURFACE_THEMES);

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
  Roles drawn on a surface: steps from that surface's face, per theme, so they
  move when the stack does. Written into a generated block in their own file.
*/
type SurfaceKey = keyof typeof SURFACE_LAYERS;
type Offset = { light: number; dark: number };

/* Roles that follow whichever surface they are inside. At the root they sit
   on the canvas; every ground-* utility re-declares them for its surface, and
   for the recess cut into it. Hover and selected take one step more in light
   than first tuned, so they hold on the lighter faces. */
const FOLLOWING_BY_FILE = {
  'app/styles/roles.css': {
    '--sp-surface-control': { light: -25, dark: -100 },
    /* The darkest light ground and muted ink's thinnest margin, so a control
       taking it moves its ink to primary. */
    '--sp-surface-selected': { light: 125, dark: -175 },
    /* Under the pointer. Light deepens, dark lifts: the inset is the deepest
       step, and as a hover it put a hole under the pointer in dark. */
    '--sp-surface-hover': { light: 50, dark: -100 },
    /* Rules are present, not bright: a divider should be found, not seen first. */
    '--sp-rule-faint': { light: 175, dark: -150 },
    '--sp-rule-default': { light: 225, dark: -200 },
    '--sp-rule-strong': { light: 450, dark: -375 },
  },
  'app/styles/controls.css': {
    /* A ramp step, not #fff: a pure-white top is the one face that does not
       belong to the palette. */
    '--sp-quiet-face-top': { light: -25, dark: -100 },
    '--sp-quiet-face-bottom': { light: 50, dark: 0 },
    '--sp-quiet-ring-top': { light: 175, dark: -250 },
    '--sp-quiet-ring-bottom': { light: 275, dark: -100 },
    /* Light deepens, dark lifts: on either ground the control comes forward. */
    '--sp-quiet-face-top-hover': { light: -25, dark: -175 },
    '--sp-quiet-face-bottom-hover': { light: 175, dark: -50 },
    '--sp-quiet-ring-top-hover': { light: 275, dark: -375 },
    '--sp-quiet-ring-bottom-hover': { light: 600, dark: -250 },
    '--sp-menu-chip': { light: 75, dark: -50 },
    /* The field's edge is its focus indicator: focused, it clears 3:1 against
       face and resting edge (contracts field-focus-*). Neutral: not an action. */
    '--sp-field-face': { light: -25, dark: -50 },
    '--sp-field-edge': { light: 150, dark: -150 },
    '--sp-field-edge-hover': { light: 200, dark: -425 },
    '--sp-field-edge-active': { light: 525, dark: -675 },
    /* A one-pixel band rather than a fade, whose colour would depend on what
       lies under it. */
    '--sp-enclosure-edge': { light: -25, dark: -150 },
  },
} as const satisfies Record<string, Record<`--${string}`, Offset>>;

/* Roles used on one surface only, declared once at the root. */
const ANCHORED_BY_FILE = {
  'app/styles/controls.css': {
    /* The lit line under a rule on the canvas. Dividers in a pane take
       --sp-raised-edge, since their ground is the pane. */
    '--sp-divider-etch': { on: 'canvas', light: -50, dark: 25 },
  },
  'components/app-shell/sidebar/process-menu.css': {
    '--sp-menu-wash-faint': { on: 'canvas', light: 0, dark: -125 },
    '--sp-menu-wash': { on: 'canvas', light: 75, dark: -75 },
    '--sp-menu-wash-strong': { on: 'canvas', light: 125, dark: -175 },
    /* An open toggle under the pointer: one step past the selected fill. */
    '--sp-menu-wash-pressed': { on: 'canvas', light: 175, dark: -225 },
  },
  'components/app-shell/sidebar/process-list.css': {
    /* Flat: a ramp across 20px reads as an artefact. The ring is darker than
       the row, so the key sits on it. */
    '--sp-keycap-face': { on: 'canvas', light: -50, dark: -125 },
    '--sp-keycap-ring': { on: 'canvas', light: 125, dark: -250 },
    '--sp-keycap-highlight': { highlightOf: '--sp-keycap-face' },
    /* The current row: the pane's geometry, its own stops. */
    '--sp-menu-current-face-top': { on: 'canvas', light: -50, dark: -125 },
    '--sp-menu-current-face-bottom': { on: 'canvas', light: -50, dark: -125 },
    '--sp-menu-current-ring-bottom': { on: 'canvas', light: 125, dark: 25 },
  },
  'components/app-shell/sidebar/sidebar-notice.css': {
    '--sp-notice-face': { on: 'canvas', light: -25, dark: -75 },
    '--sp-notice-edge-top': { on: 'canvas', light: 125, dark: -125 },
    '--sp-notice-edge-bottom': { on: 'canvas', light: 125, dark: -125 },
    '--sp-notice-highlight': { highlightOf: '--sp-notice-face' },
  },
  'components/app-shell/process/process-header.css': {
    /* Drawn from the quiet stops but separate, so tuning the header moves no
       other button. The one control face that is not raised in both themes,
       on purpose: light recesses it and deepens on hover; dark lifts, since a
       control set under a dark ground reads as a hole. */
    '--sp-header-button-face-top': { on: 'primary', light: 25, dark: -100 },
    '--sp-header-button-face-bottom': { on: 'primary', light: 125, dark: -50 },
    '--sp-header-button-face-top-hover': {
      on: 'primary',
      light: 50,
      dark: -250,
    },
    '--sp-header-button-face-bottom-hover': {
      on: 'primary',
      light: 225,
      dark: -100,
    },
    '--sp-header-button-ring-top-selected': {
      on: 'primary',
      light: 175,
      dark: -375,
    },
    '--sp-header-button-ring-bottom-selected': {
      on: 'primary',
      light: 275,
      dark: -250,
    },
    '--sp-header-button-face-top-selected': {
      on: 'primary',
      light: 50,
      dark: -250,
    },
    '--sp-header-button-face-bottom-selected': {
      on: 'primary',
      light: 225,
      dark: -100,
    },
    /* The pill sits off the face and they part on hover: lighter in light,
       darker in dark, as the face reverses. */
    '--sp-header-button-count': { on: 'primary', light: 0, dark: 0 },
    '--sp-header-button-count-hover': { on: 'primary', light: 25, dark: 75 },
  },
  'components/app-shell/process/process-title.css': {
    '--sp-title-field-edge-hover': { on: 'primary', light: 175, dark: -250 },
    '--sp-title-field-edge-active': { on: 'primary', light: 450, dark: -550 },
  },
  'components/app-shell/runs/runs-list.css': {
    '--sp-sheet-current': { on: 'primary', light: 75, dark: -100 },
    /* Its own step rather than the sidebar's wash: its ground is the pane. */
    '--sp-sheet-hover': { on: 'primary', light: 50, dark: -50 },
    /* The sticky head and version break. Not a recess: in dark that put the
       head in a pit below its rows. */
    '--sp-sheet-band': { on: 'primary', light: 25, dark: -25 },
    /* The tally's total: ramp, not a severity tone. Dark's label is ink at
       75%; light gives it its own step against each face. */
    '--sp-sheet-total-face': { on: 'primary', light: 150, dark: -100 },
    '--sp-sheet-total-face-hover': { on: 'primary', light: 225, dark: -175 },
    '--sp-sheet-total-face-current': { on: 'primary', light: 250, dark: -200 },
    /* The figure lightens through states in both themes. */
    '--sp-sheet-total-lead': { on: 'primary', light: 100, dark: -150 },
    '--sp-sheet-total-lead-hover': { on: 'primary', light: 75, dark: -250 },
    '--sp-sheet-total-lead-current': { on: 'primary', light: 50, dark: -275 },
  },
  'components/app-shell/thread/thread-step.css': {
    '--sp-thread-line': { on: 'primary', light: 225, dark: -200 },
    '--sp-thread-done': { on: 'primary', light: 450, dark: -375 },
    '--sp-thread-fact-face': { on: 'primary', light: 75, dark: -75 },
    /* Under the row's hover wash a pill lifts: lighter than the wash in
       light (+50 there), a step past it in dark (-100), as a raised face does.
       Light stays on the pane's own step rather than going whiter. */
    '--sp-thread-fact-face-hover': { on: 'primary', light: 0, dark: -150 },
    /* A fact that opens something: past a plain one at rest, and past the
       row's hover wash under it (-100 in dark), deepest under the pointer. */
    '--sp-thread-link-face': { on: 'primary', light: 125, dark: -125 },
    '--sp-thread-link-face-hover': { on: 'primary', light: 150, dark: -175 },
    '--sp-thread-link-face-active': { on: 'primary', light: 200, dark: -225 },
  },
  'components/review/release-card.css': {
    /* A row's change pill: past the row's hover wash (+50 light, -100 dark)
       at rest and further under it; its lead is lighter in light. */
    '--sp-card-pill-face': { on: 'floating', light: 100, dark: -75 },
    '--sp-card-pill-face-hover': { on: 'floating', light: 150, dark: -150 },
    '--sp-card-pill-lead': { on: 'floating', light: 25, dark: -150 },
    '--sp-card-pill-lead-hover': { on: 'floating', light: 75, dark: -225 },
  },
  'components/ui/tooltip.css': {
    /* Inverted in light (650, a slate), and the floating face in dark, where
       the edge alone separates it from a panel. */
    '--sp-tooltip-face': { on: 'floating', light: 625, dark: 0 },
    '--sp-tooltip-edge': { on: 'floating', light: 675, dark: -325 },
    /* Three steps lighter in light: one barely shows on a face this light.
       Dark keeps the surfaces' one layer darker. */
    '--sp-tooltip-highlight': { on: 'floating', light: 550, dark: 50 },
  },
} as const satisfies Record<
  string,
  Record<
    `--${string}`,
    (Offset & { on: SurfaceKey }) | { highlightOf: `--${string}` }
  >
>;

/* Every relative role by variable, with the stylesheet that declares it. */
function byVariable<Role>(files: Record<string, Record<string, Role>>) {
  return new Map(
    Object.entries(files).flatMap(([file, roles]) =>
      Object.entries(roles).map(
        ([variable, role]) =>
          [variable as `--${string}`, { file, ...role }] as const,
      ),
    ),
  );
}
export const FOLLOWING_ROLES = byVariable<Offset>(FOLLOWING_BY_FILE);
export const ANCHORED_ROLES = byVariable<
  (Offset & { on: SurfaceKey }) | { highlightOf: `--${string}` }
>(ANCHORED_BY_FILE);
/* The stylesheets that carry a generated block, in the order they list. */
export const RELATIVE_FILES = [
  ...new Set([
    ...Object.keys(FOLLOWING_BY_FILE),
    ...Object.keys(ANCHORED_BY_FILE),
  ]),
];

const highlightStep = (theme: Theme) =>
  SURFACE_THEMES[theme].highlight *
  LAYER_STEP *
  SURFACE_THEMES[theme].layerScale;

/* Every place a following role can resolve: a surface, or the recess in one. */
export const GROUND_CONTEXTS = {
  canvas: '--sp-canvas',
  primary: '--sp-surface-primary',
  floating: '--sp-surface-floating',
  'canvas-recess': '--sp-canvas-recess',
  'primary-recess': '--sp-primary-recess',
  'floating-recess': '--sp-floating-recess',
} as const;
export type GroundContext = keyof typeof GROUND_CONTEXTS;

const offsetFrom = (
  face: `--${string}`,
  role: Offset,
  what: string,
): Record<Theme, number> => {
  const steps = SURFACE_STEPS.get(face)!;
  return {
    light: rampStep(steps.light + role.light, `light ${what}`),
    dark: rampStep(steps.dark + role.dark, `dark ${what}`),
  };
};

/* A following role's steps inside one context. */
export function followingAt(variable: `--${string}`, context: GroundContext) {
  const role = FOLLOWING_ROLES.get(variable);
  if (!role) throw new Error(`${variable} does not follow its surface.`);
  return offsetFrom(
    GROUND_CONTEXTS[context],
    role,
    `${variable} in ${context}`,
  );
}

/* What each relative role resolves to at the root, keyed by variable. */
export const RELATIVE_STEPS: ReadonlyMap<
  `--${string}`,
  Record<Theme, number>
> = (() => {
  const steps = new Map<`--${string}`, Record<Theme, number>>();
  for (const variable of FOLLOWING_ROLES.keys())
    steps.set(variable, followingAt(variable, 'canvas'));
  for (const [variable, role] of ANCHORED_ROLES)
    if ('on' in role)
      steps.set(
        variable,
        offsetFrom(SURFACE_LAYERS[role.on].face, role, variable),
      );
  /* A highlight follows the surfaces' rule: one highlight step from the face
     it lights, lighter in light and darker in dark. */
  for (const [variable, role] of ANCHORED_ROLES) {
    if (!('highlightOf' in role)) continue;
    const face =
      steps.get(role.highlightOf) ?? SURFACE_STEPS.get(role.highlightOf);
    if (!face) throw new Error(`${variable}: no face ${role.highlightOf}.`);
    steps.set(variable, {
      light: rampStep(face.light + highlightStep('light'), `light ${variable}`),
      dark: rampStep(face.dark + highlightStep('dark'), `dark ${variable}`),
    });
  }
  return steps;
})();

function relativeRole(cssVariable: `--${string}`): RoleAssignment {
  const steps = RELATIVE_STEPS.get(cssVariable);
  if (!steps) throw new Error(`${cssVariable} is not a relative role.`);
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
  surfaceControl: relativeRole('--sp-surface-control'),
  surfaceSelected: relativeRole('--sp-surface-selected'),
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
  ruleDefault: relativeRole('--sp-rule-default'),
  fieldFace: relativeRole('--sp-field-face'),
  fieldEdge: relativeRole('--sp-field-edge'),
  fieldEdgeActive: relativeRole('--sp-field-edge-active'),
  keycapFace: relativeRole('--sp-keycap-face'),
  noticeFace: relativeRole('--sp-notice-face'),
  tooltipFace: {
    cssVariable: '--tooltip-face',
    ...RELATIVE_STEPS.get('--sp-tooltip-face')!,
  },
  /* Lighter in light, where the face is, so muted keeps its distance. */
  tooltipInk: { cssVariable: '--sp-tooltip-ink', light: 0, dark: 100 },
  tooltipMuted: { cssVariable: '--sp-tooltip-muted', light: 200, dark: 325 },
  /* Edges, so a boundary can be measured against the face it bounds and the
     ground it lies on rather than trusted because it is a border. */
  tooltipEdge: {
    cssVariable: '--tooltip-edge',
    ...RELATIVE_STEPS.get('--sp-tooltip-edge')!,
  },
  ruleFaint: relativeRole('--sp-rule-faint'),
  keycapRing: relativeRole('--sp-keycap-ring'),
  menuChip: relativeRole('--sp-menu-chip'),
  /* Sheens and etches: every structural edge is a step, so each is pinned
     here rather than left to whatever it composites to. */
  keycapHighlight: relativeRole('--sp-keycap-highlight'),
  noticeHighlight: relativeRole('--sp-notice-highlight'),
  tooltipHighlight: relativeRole('--sp-tooltip-highlight'),
  /* The notch continues the pane's edge, so it takes the pane's highlight. */
  notchHighlight: {
    cssVariable: '--sp-notch-highlight',
    ...SURFACE_STEPS.get('--sp-raised-edge')!,
  },
  enclosureEdge: relativeRole('--sp-enclosure-edge'),
  dividerEtch: relativeRole('--sp-divider-etch'),
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
    foreground: 'tooltipInk',
    background: 'tooltipFace',
    minimum: 4.5,
    target: 7,
    rationale: 'Tooltip labels are ordinary-size text.',
  },
  {
    id: 'tooltip-muted-ink',
    classification: 'required',
    foreground: 'tooltipMuted',
    background: 'tooltipFace',
    minimum: 4.5,
    rationale: 'Tooltip descriptions and rich-tooltip captions are small text.',
  },
  /* A tooltip is a distinct object over whatever it covers, so its boundary
     carries required visual information rather than decoration. In dark its
     face is the floating surface, so over a floating panel the edge is the
     only thing distinguishing the two. */
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
      'In dark the tooltip face equals the floating surface, so only the edge separates them.',
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
