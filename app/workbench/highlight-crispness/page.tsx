import { Button } from '@/components/ui/button';

const MODES = [
  {
    id: 'default',
    label: 'Default (1×)',
    spec: 'border 1px · rule/field 1.5px · sheen 1px / 0.75px',
  },
  {
    id: 'highlights',
    label: 'Retina (highlights 0.75px)',
    spec: 'border 1px · rule/field 1.5px · sheen 0.75px / 0.5px',
  },
  {
    id: '0.5',
    label: 'Retina (all)',
    spec: 'border 0.5px · rule/field 1px · sheen 0.75px / 0.5px',
  },
] as const;

const BUTTON_METHODS = [
  {
    id: 'current',
    label: 'Baseline: 1px border',
    className: 'hc-btn-1px',
    svg: false,
  },
  {
    id: '05px',
    label: '1. 0.5px border',
    className: 'hc-btn-05px',
    svg: false,
  },
  {
    id: 'clip',
    label: '2. Dual clip-path 0.75px',
    className: 'hc-btn-clip',
    svg: false,
  },
  {
    id: 'svg',
    label: '3. SVG 0.75px stroke',
    className: 'hc-btn-svg',
    svg: true,
  },
] as const;

function SvgGradientRing({ id }: { id: string }) {
  return (
    <svg aria-hidden="true" className="hc-btn-svg-ring">
      <defs>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="hc-btn-svg-face-top" />
          <stop offset="100%" className="hc-btn-svg-face-bottom" />
        </linearGradient>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="hc-btn-svg-stop-top" />
          <stop offset="100%" className="hc-btn-svg-stop-bottom" />
        </linearGradient>
      </defs>
      <rect
        x="0.375"
        y="0.375"
        width="calc(100% - 0.75px)"
        height="calc(100% - 0.75px)"
        className="hc-btn-svg-rect"
        fill={`url(#${id}-face)`}
        stroke={`url(#${id}-ring)`}
        strokeWidth="0.75"
      />
    </svg>
  );
}

const BUTTON_VARIANTS = [
  { id: 'primary', label: 'Primary' },
  { id: 'secondary', label: 'Secondary' },
  { id: 'danger', label: 'Danger' },
] as const;

export default function HighlightCrispnessWorkbench() {
  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <header className="grid gap-2">
        <h1 className="text-display text-primary font-semibold">
          Retina edge modes
        </h1>
        <p className="text-body text-muted max-w-2xl">
          All three <strong className="text-primary font-medium">Edges</strong>{' '}
          modes side by side on a Raised pane (active at{' '}
          <code className="font-mono">2dppx+</code>; on{' '}
          <code className="font-mono">1×</code> displays all three stay at
          Default). Toggle light/dark theme in the Design Pane to compare.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {MODES.map((mode) => (
          <section
            key={mode.id}
            data-hc-mode={mode.id}
            className="hc-mode grid content-start gap-2.5"
          >
            <div className="grid gap-0.5 px-1">
              <h2 className="text-dense text-primary font-semibold">
                {mode.label}
              </h2>
              <p className="text-micro text-muted font-mono">{mode.spec}</p>
            </div>

            <div
              data-hc-part="pane"
              className="control-face surface-raised rounded-shell grid overflow-hidden"
            >
              <div
                data-hc-part="header"
                className="rule-below flex items-center justify-between px-4 py-3"
              >
                <span className="text-dense text-primary font-medium">
                  Raised pane
                </span>
                <span
                  data-hc-part="chip"
                  className="control-face control-hairline surface-floating rounded-control text-micro text-muted-strong px-2 py-0.5 font-medium"
                >
                  Hairline chip
                </span>
              </div>

              <div className="grid gap-3 p-4">
                <div
                  data-hc-part="card"
                  className="control-face surface-floating rounded-control grid gap-1 px-3.5 py-3"
                >
                  <p className="text-dense text-primary font-medium">
                    Floating card
                  </p>
                  <p className="text-meta text-muted">
                    Outer ring + inner pane sheen on a raised ground.
                  </p>
                </div>

                <div
                  data-hc-part="field"
                  className="field text-meta text-muted px-3 py-2"
                >
                  Field edge (1.5px → 1px)
                </div>

                <div className="divide-rule-faint divide-y">
                  <div className="text-meta text-primary py-2">
                    Row divider (1px → 0.5px)
                  </div>
                  <div className="text-meta text-muted py-2">
                    Second row below divider
                  </div>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="grid gap-3">
        <div className="grid gap-0.5">
          <h2 className="text-title text-primary font-medium">
            Optical 0.75px shadow-border vs crisp 1px &amp; 0.5px borders
          </h2>
          <p className="text-meta text-muted">
            The middle pane draws its outer ring with{' '}
            <code className="font-mono">box-shadow: 0 0 0 0.75px</code> (1 full
            + 1 half-blended device px at 2×) instead of a snapped CSS border.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div data-hc-mode="default" className="hc-mode grid gap-2">
            <p className="text-micro text-muted px-1 font-mono">
              border 1px · sheen 1px
            </p>
            <div className="control-face surface-raised rounded-shell grid gap-3 p-4">
              <span className="text-dense text-primary font-medium">
                Raised pane (1px border)
              </span>
              <div className="control-face surface-floating rounded-control px-3.5 py-2.5">
                <p className="text-meta text-primary font-medium">
                  Floating card (1px border)
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <p className="text-micro text-muted px-1 font-mono">
              box-shadow 0.75px · sheen 0.75px
            </p>
            <div className="hc-shadow-border-pane rounded-shell grid gap-3 p-4">
              <span className="text-dense text-primary font-medium">
                Raised pane (0.75px shadow)
              </span>
              <div className="hc-shadow-border-card rounded-control px-3.5 py-2.5">
                <p className="text-meta text-primary font-medium">
                  Floating card (0.75px shadow)
                </p>
              </div>
            </div>
          </div>

          <div data-hc-mode="0.5" className="hc-mode grid gap-2">
            <p className="text-micro text-muted px-1 font-mono">
              border 0.5px · sheen 0.75px
            </p>
            <div className="control-face surface-raised rounded-shell grid gap-3 p-4">
              <span className="text-dense text-primary font-medium">
                Raised pane (0.5px border)
              </span>
              <div className="control-face surface-floating rounded-control px-3.5 py-2.5">
                <p className="text-meta text-primary font-medium">
                  Floating card (0.5px border)
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="grid gap-0.5">
          <h2 className="text-title text-primary font-medium">
            0.75px gradient-ring button candidates
          </h2>
          <p className="text-meta text-muted">
            Three ways to retain the top-to-bottom button ring gradient at an
            optical <code className="font-mono">0.75px</code> width alongside
            the current <code className="font-mono">1px</code> border.
          </p>
        </div>

        <div className="control-face surface-raised rounded-shell grid gap-4 p-5">
          <div className="grid grid-cols-4 gap-3">
            {BUTTON_METHODS.map((method) => (
              <p
                key={method.id}
                className="text-micro text-muted text-center font-mono"
              >
                {method.label}
              </p>
            ))}
          </div>

          {BUTTON_VARIANTS.map((variant) => (
            <div key={variant.id} className="grid grid-cols-4 gap-3">
              {BUTTON_METHODS.map((method) => (
                <div key={method.id} className="flex justify-center">
                  <Button variant={variant.id} className={method.className}>
                    {method.svg ? (
                      <>
                        <SvgGradientRing id={`hc-ring-${variant.id}`} />
                        {variant.label} action
                      </>
                    ) : (
                      `${variant.label} action`
                    )}
                  </Button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
