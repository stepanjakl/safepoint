import {
  BiomorphicSymbol,
  type BiomorphicVariant,
} from '@/components/ui/biomorphic-symbol';

type SymbolCandidate = {
  variant: BiomorphicVariant;
  label: string;
  note: string;
};

const ROTATIONAL_SYMBOLS = [
  {
    variant: 'balanced-radial',
    label: 'Balanced · threefold',
    note: 'The Balanced upper lobe, repeated at 0°, 120° and 240° around one centre.',
  },
  {
    variant: 'soft-radial',
    label: 'Soft · threefold',
    note: 'The Soft upper lobe, with the same wider cut and rounded shoulders in all three segments.',
  },
] satisfies SymbolCandidate[];

const SAMPLE_SIZES = [
  { className: 'size-4', label: '16' },
  { className: 'size-5', label: '20' },
  { className: 'size-6', label: '24' },
  { className: 'size-8', label: '32' },
  { className: 'size-12', label: '48' },
];

const WEIGHTS = [
  { value: 400, className: 'font-normal' },
  { value: 500, className: 'font-medium' },
  { value: 600, className: 'font-semibold' },
  { value: 700, className: 'font-bold' },
  { value: 800, className: 'font-extrabold' },
  { value: 900, className: 'font-black' },
];

const WORDMARKS = [
  { family: 'michroma', label: 'Michroma', weights: WEIGHTS.slice(0, 1) },
  { family: 'syne', label: 'Syne', weights: WEIGHTS.slice(0, 5) },
  { family: 'orbitron', label: 'Orbitron', weights: WEIGHTS },
];

export function LogoGallery() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="readout text-muted">Threefold symmetry</h3>
        <p className="text-dense text-muted max-w-prose">
          Each version repeats its upper segment three times. Turn it by 120°
          and every segment matches, including the curves and open cuts.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {ROTATIONAL_SYMBOLS.map(({ variant, label, note }) => (
            <SymbolCard
              key={variant}
              variant={variant}
              label={label}
              note={note}
            />
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <h3 className="readout text-muted">
          Soft threefold · wordmark comparison
        </h3>
        <p className="text-dense text-muted max-w-prose">
          Every standard weight available in each family. Michroma has one
          weight; Syne runs from 400 to 800, and Orbitron from 400 to 900.
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {WORDMARKS.map(({ family, label, weights }) => (
            <section key={family} className="space-y-3">
              <h4 className="readout text-muted">{label}</h4>
              <div className="space-y-2">
                {weights.map(({ value, className }) => (
                  <figure
                    key={value}
                    className="border-rule-default bg-surface-primary flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border px-3 py-2"
                  >
                    <div
                      className={`logo-candidate text-brand-wordmark ${className}`}
                      data-logo-family={family}
                      aria-label="Safepoint"
                    >
                      <BiomorphicSymbol
                        variant="soft-radial"
                        className="logo-candidate-symbol"
                      />
                      <span aria-hidden="true">Safepoint</span>
                    </div>
                    <figcaption className="readout text-muted">
                      {value}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function SymbolCard({ variant, label, note }: SymbolCandidate) {
  return (
    <figure className="border-rule-default bg-surface-primary space-y-5 border p-4">
      <figcaption className="space-y-2">
        <p className="text-body font-medium">{label}</p>
        <p className="text-meta text-muted">{note}</p>
      </figcaption>
      <div className="text-brand-wordmark flex justify-center py-6">
        <BiomorphicSymbol variant={variant} className="size-40" />
      </div>
      {(['light', 'dark'] as const).map((theme) => (
        <div
          key={theme}
          data-theme={theme}
          className="bg-surface-primary text-brand-wordmark space-y-3 p-3"
        >
          <p className="readout text-muted">{theme} · sizes in px</p>
          <div className="flex flex-wrap items-end gap-4">
            {SAMPLE_SIZES.map(({ className, label: size }) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <BiomorphicSymbol variant={variant} className={className} />
                <span className="readout text-muted">{size}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <a
        className="text-meta inline-flex min-h-11 items-center underline underline-offset-4"
        href={`/logos/safepoint-${variant}.svg`}
        download
      >
        Download {label.toLowerCase()} SVG
      </a>
    </figure>
  );
}
