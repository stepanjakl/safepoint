import { CalibrationLab } from './calibration-lab';

/*
  The one place a person, not a model, decides something
  about colour. It sets a neutral part beside its coloured counterparts and
  lets you nudge it until the two look equally light; the median of several
  settings is the number to record (docs/interface/COLOUR-TESTING.md →
  Calibration). Models are shown beside it, never instead of it.
*/
export default function CalibrationPage() {
  return (
    <main
      id="main"
      className="bg-canvas text-primary grid min-h-dvh content-start gap-8 p-6"
    >
      <header className="grid gap-1">
        <h1 className="text-display font-semibold">Colour calibration</h1>
        <p className="text-meta text-muted max-w-3xl">
          Which neutral looks as light as its coloured neighbours? Nudge until
          the pairs stop standing out, record a few settings, and read off the
          median.
        </p>
      </header>
      <CalibrationLab />
    </main>
  );
}
