import { EdgeLabPixelRatio } from './pixel-ratio';

/*
  Every way the app draws a line, with no text, each specimen in a cell of
  whole pixels so only its own declared offset is fractional. The attributes
  are what scripts/checks/check-line-geometry.ts reads as expectations:

  data-approach  border   a CSS border; rounds down to whole device pixels
                 layered  whole-device-pixel layers; rounds up, soft last pixel
                 native   a fractional shadow or gradient, left to the engine
                 live     the app's own tokens
  data-sides     which sides carry the line
  data-total     the line's full width in CSS px, ring and highlight together
*/

const WIDTHS = ['0.5', '0.75', '1', '1.5'] as const;
const OFFSETS = ['0', '0.25', '0.33', '0.5', '0.75'] as const;

type Recipe = {
  recipe: string;
  approach: 'border' | 'layered' | 'native' | 'live';
  sides: 'all' | 'bottom';
  // Ring and highlight together are twice the width.
  stacked?: true;
  variants?: readonly ('radius' | 'composited')[];
};

const RINGS: readonly Recipe[] = [
  {
    recipe: 'ring-border',
    approach: 'border',
    sides: 'all',
    variants: ['radius'],
  },
  {
    recipe: 'ring-inset',
    approach: 'native',
    sides: 'all',
    variants: ['radius', 'composited'],
  },
  {
    recipe: 'ring-inset-layered',
    approach: 'layered',
    sides: 'all',
    variants: ['radius', 'composited'],
  },
  {
    recipe: 'ring-border-layered',
    approach: 'layered',
    sides: 'all',
    variants: ['radius', 'composited'],
  },
  { recipe: 'ring-outset', approach: 'native', sides: 'all' },
  { recipe: 'ring-outset-layered', approach: 'layered', sides: 'all' },
  {
    recipe: 'stack',
    approach: 'native',
    sides: 'all',
    stacked: true,
    variants: ['radius'],
  },
  {
    recipe: 'stack-layered',
    approach: 'layered',
    sides: 'all',
    stacked: true,
    variants: ['radius'],
  },
];

const LINES: readonly Recipe[] = [
  { recipe: 'line-border', approach: 'border', sides: 'bottom' },
  { recipe: 'line-inset', approach: 'native', sides: 'bottom' },
  { recipe: 'line-inset-layered', approach: 'layered', sides: 'bottom' },
  { recipe: 'line-gradient', approach: 'native', sides: 'bottom' },
  { recipe: 'line-gradient-layered', approach: 'layered', sides: 'bottom' },
  { recipe: 'line-element', approach: 'native', sides: 'bottom' },
];

const JUNCTIONS: readonly Recipe[] = [
  { recipe: 'junction-native', approach: 'native', sides: 'all' },
  { recipe: 'junction-mixed', approach: 'native', sides: 'all' },
  { recipe: 'junction-layered', approach: 'layered', sides: 'all' },
  { recipe: 'junction-live', approach: 'live', sides: 'all' },
];

function Specimen({
  kind,
  recipe,
  width,
  variant,
  offset,
}: {
  kind: 'ring' | 'line' | 'junction';
  recipe: Recipe;
  width: string;
  variant: string;
  offset: string;
}) {
  const total =
    recipe.stacked || kind === 'junction' ? String(Number(width) * 2) : width;
  return (
    <div className="edge-lab-cell">
      <div
        className="edge-lab-specimen"
        data-specimen={`${recipe.recipe}/${width}/${variant}/${offset}`}
        data-kind={kind}
        data-recipe={recipe.recipe}
        data-approach={recipe.approach}
        data-sides={recipe.sides}
        data-w={width}
        data-total={total}
        data-variant={variant}
        data-off={offset}
      >
        {kind === 'junction' ? (
          <>
            <div className="edge-lab-rule" />
            <div className="edge-lab-divider" />
            <div className="edge-lab-frame-ring" />
          </>
        ) : null}
      </div>
    </div>
  );
}

function Section({
  kind,
  recipes,
  widths,
}: {
  kind: 'ring' | 'line' | 'junction';
  recipes: readonly Recipe[];
  widths: readonly string[];
}) {
  const rows = recipes.flatMap((recipe) =>
    widths.flatMap((width) =>
      ['plain', ...(width === '0.75' ? (recipe.variants ?? []) : [])].map(
        (variant) => ({ recipe, width, variant }),
      ),
    ),
  );
  return (
    <div className="edge-lab-grid" data-kind={kind}>
      {rows.flatMap(({ recipe, width, variant }) =>
        OFFSETS.map((offset) => (
          <Specimen
            key={`${recipe.recipe}/${width}/${variant}/${offset}`}
            kind={kind}
            recipe={recipe}
            width={width}
            variant={variant}
            offset={offset}
          />
        )),
      )}
    </div>
  );
}

export default function EdgeLabPage() {
  return (
    <main id="main" className="bg-canvas min-h-dvh">
      <h1 className="sr-only">Edge lab</h1>
      <div className="edge-lab" aria-hidden="true" data-edge-lab="">
        <Section kind="ring" recipes={RINGS} widths={WIDTHS} />
        <Section kind="line" recipes={LINES} widths={WIDTHS} />
        <Section kind="junction" recipes={JUNCTIONS} widths={['0.75']} />
      </div>
      <EdgeLabPixelRatio target="[data-edge-lab]" />
    </main>
  );
}
