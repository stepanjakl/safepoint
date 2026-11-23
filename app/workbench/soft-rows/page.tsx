/*
  How the pane's edge meets other lines, two ways, drawn enlarged: one square
  per device pixel, in the theme's own colours. The edge is two pixels -- a
  solid row and a soft row -- and the question is what the soft row is made
  of: the ring colour at half strength over whatever lies beneath it
  (translucent, as the app draws it), or one fixed mixed shade (opaque). Each
  square's colour is that mix worked out, so the comparison shows the same
  results the pixel tests measure (e2e/shell/edge-junctions.spec.ts).
*/

// One square. The keys are what the pixel is made of; soft-* is the soft row
// over the named thing, as translucency would paint it.
type Pixel =
  | 'canvas'
  | 'solid'
  | 'highlight'
  | 'face'
  | 'rule'
  | 'band'
  | 'soft-highlight'
  | 'soft-rule'
  | 'soft-band'
  | 'soft-soft'
  | 'opaque';

const SIDE = ['canvas', 'solid'] as const;

// Rows of pixels, the pane's edge on the left.
type Grid = readonly (readonly Pixel[])[];

function plain(soft: Pixel): Pixel[] {
  return [...SIDE, soft, 'highlight', 'face', 'face', 'face', 'face'];
}

const CASES: readonly {
  title: string;
  note: string;
  translucent: { grid: Grid; verdict: string; ok: boolean };
  opaque: { grid: Grid; verdict: string; ok: boolean };
}[] = [
  {
    title: 'The plain edge',
    note: 'Solid row, soft row, highlight, then the face. Both look the same.',
    translucent: {
      grid: [
        plain('soft-highlight'),
        plain('soft-highlight'),
        plain('soft-highlight'),
      ],
      verdict: 'Correct',
      ok: true,
    },
    opaque: {
      grid: [plain('opaque'), plain('opaque'), plain('opaque')],
      verdict: 'Correct',
      ok: true,
    },
  },
  {
    title: 'A rule meets the edge',
    note: 'A row rule or a head’s rule runs across to the pane’s side and has to join the solid row.',
    translucent: {
      grid: [
        plain('soft-highlight'),
        [...SIDE, 'soft-rule', 'rule', 'rule', 'rule', 'rule', 'rule'],
        plain('soft-highlight'),
      ],
      verdict:
        'Joins: the rule runs under the soft row, which then reads as ring',
      ok: true,
    },
    opaque: {
      grid: [
        plain('opaque'),
        [...SIDE, 'opaque', 'rule', 'rule', 'rule', 'rule', 'rule'],
        plain('opaque'),
      ],
      verdict:
        'One pixel short: the rule ends at the soft row, which keeps its own shade',
      ok: false,
    },
  },
  {
    title: 'A band beside the edge',
    note: 'A section head or a lit row fills the width of the column.',
    translucent: {
      grid: [
        plain('soft-highlight'),
        [...SIDE, 'soft-highlight', 'band', 'band', 'band', 'band', 'band'],
        [...SIDE, 'soft-highlight', 'band', 'band', 'band', 'band', 'band'],
        plain('soft-highlight'),
      ],
      verdict:
        'Correct, because the band stops before the soft row (the pull-back)',
      ok: true,
    },
    opaque: {
      grid: [
        plain('opaque'),
        [...SIDE, 'opaque', 'band', 'band', 'band', 'band', 'band'],
        [...SIDE, 'opaque', 'band', 'band', 'band', 'band', 'band'],
        plain('opaque'),
      ],
      verdict: 'Correct, with nothing extra',
      ok: true,
    },
  },
  {
    title: 'The band without the pull-back',
    note: 'What the band did before today: it ran under the soft row.',
    translucent: {
      grid: [
        plain('soft-highlight'),
        [...SIDE, 'soft-band', 'band', 'band', 'band', 'band', 'band'],
        [...SIDE, 'soft-band', 'band', 'band', 'band', 'band', 'band'],
        plain('soft-highlight'),
      ],
      verdict: 'Tinted: the soft row takes the band’s shade, so the edge steps',
      ok: false,
    },
    opaque: {
      grid: [
        plain('opaque'),
        [...SIDE, 'opaque', 'band', 'band', 'band', 'band', 'band'],
        [...SIDE, 'opaque', 'band', 'band', 'band', 'band', 'band'],
        plain('opaque'),
      ],
      verdict: 'Correct either way',
      ok: true,
    },
  },
  {
    title: 'Two soft rows overlap',
    note: 'Where the notch’s turn runs into the pane’s side, both draw a soft row on the same pixel.',
    translucent: {
      grid: [
        plain('soft-highlight'),
        plain('soft-soft'),
        plain('soft-soft'),
        plain('soft-highlight'),
      ],
      verdict:
        'Doubled: half over half reads heavier than the edge, unless one is masked off (fixed)',
      ok: false,
    },
    opaque: {
      grid: [
        plain('opaque'),
        plain('opaque'),
        plain('opaque'),
        plain('opaque'),
      ],
      verdict: 'Correct: one fixed shade over another is the same shade',
      ok: true,
    },
  },
  {
    title: 'A line crosses a rule',
    note: 'The notch’s slope comes down and runs across the header’s rule; its soft row lies over the rule’s solid row.',
    translucent: {
      grid: [
        [
          'face',
          'face',
          'solid',
          'soft-highlight',
          'face',
          'face',
          'face',
          'face',
        ],
        [
          'face',
          'face',
          'face',
          'solid',
          'soft-highlight',
          'face',
          'face',
          'face',
        ],
        [
          'rule',
          'rule',
          'rule',
          'rule',
          'soft-rule',
          'soft-rule',
          'rule',
          'rule',
        ],
        ['face', 'face', 'face', 'face', 'face', 'face', 'face', 'face'],
      ],
      verdict: 'Unbroken: half the ring colour over the rule is still the rule',
      ok: true,
    },
    opaque: {
      grid: [
        ['face', 'face', 'solid', 'opaque', 'face', 'face', 'face', 'face'],
        ['face', 'face', 'face', 'solid', 'opaque', 'face', 'face', 'face'],
        ['rule', 'rule', 'rule', 'rule', 'opaque', 'opaque', 'rule', 'rule'],
        ['face', 'face', 'face', 'face', 'face', 'face', 'face', 'face'],
      ],
      verdict: 'Broken: the fixed shade paints a gap into the rule',
      ok: false,
    },
  },
];

function Pixels({ grid }: { grid: Grid }) {
  return (
    <div className="soft-rows-grid" aria-hidden="true">
      {grid.map((row, y) => (
        <div key={y} className="soft-rows-row">
          {row.map((pixel, x) => (
            <span key={x} className="soft-rows-pixel" data-pixel={pixel} />
          ))}
        </div>
      ))}
    </div>
  );
}

const LEGEND: readonly [Pixel, string][] = [
  ['solid', 'solid row: the ring colour'],
  [
    'soft-highlight',
    'soft row, translucent: half the ring colour over what is beneath',
  ],
  ['opaque', 'soft row, opaque: one fixed shade, ring mixed with highlight'],
  ['highlight', 'highlight: the pane’s lit pixel inside the ring'],
  ['rule', 'rule: a hairline across the sheet'],
  ['band', 'band: a section head or a lit row'],
  ['face', 'face: the pane’s surface'],
  ['canvas', 'canvas: outside the pane'],
];

export default function SoftRowsPage() {
  return (
    <main id="main" className="soft-rows ground-raised bg-canvas min-h-dvh">
      <h1 className="text-title font-semibold">
        Soft rows: translucent or opaque
      </h1>
      <p className="soft-rows-intro text-muted">
        The pane’s edge is two device pixels: a solid row and a soft row. The
        soft row is what makes a 0.75px line read as 0.75px. Each square below
        is one device pixel, enlarged. The left column draws the soft row
        translucent, as the app does now; the right one draws it opaque, with
        other lines ending exactly at it.
      </p>
      <ul className="soft-rows-legend">
        {LEGEND.map(([pixel, label]) => (
          <li key={pixel}>
            <span
              className="soft-rows-pixel"
              data-pixel={pixel}
              aria-hidden="true"
            />
            {label}
          </li>
        ))}
      </ul>
      <div className="soft-rows-table">
        <span />
        <h2 className="text-muted-strong font-semibold">Translucent (now)</h2>
        <h2 className="text-muted-strong font-semibold">Opaque</h2>
        {CASES.map((item) => (
          <section key={item.title} className="soft-rows-case">
            <div>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-muted">{item.note}</p>
            </div>
            {[item.translucent, item.opaque].map((side, index) => (
              <figure key={index} className="soft-rows-figure">
                <Pixels grid={side.grid} />
                <figcaption data-ok={side.ok || undefined}>
                  {side.ok ? '✓ ' : '✗ '}
                  {side.verdict}
                </figcaption>
              </figure>
            ))}
          </section>
        ))}
      </div>
      <p className="soft-rows-intro text-muted">
        Translucent needs a fix only where two soft rows overlap: a few places,
        all round the notch. Opaque needs one wherever another line meets or
        crosses a soft row: every rule, divider and crossing.
      </p>
    </main>
  );
}
