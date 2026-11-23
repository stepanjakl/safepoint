import { JunctionPane } from '../edge-junctions/junction-pane';

/*
  The pane's edge drawn both ways, side by side: its soft row translucent over
  whatever lies beneath, or one opaque shade under the sheet's own lines
  (app/styles/geometry.css, [data-soft-rows]). Each specimen is the app's pane
  in small (junction-pane.tsx); a wrapper sets the style, so this page shows
  both whatever the design controls are set to. /workbench/soft-rows explains
  the difference, enlarged; e2e/shell/edge-junctions.spec.ts measures both.
*/

const STYLES = [
  {
    id: 'translucent',
    title: 'Translucent',
    note: 'The ring colour at half strength over what lies beneath, drawn over the sheet.',
  },
  {
    id: 'opaque',
    title: 'Opaque',
    note: 'One shade, ring mixed with the sheen, drawn under the sheet so its rules paint over it.',
  },
] as const;

const SPECIMENS = [
  {
    name: 'band-under-turn',
    endHead: true,
    title: 'A section head under the notch’s turn, as in Instructions',
  },
  {
    name: 'no-band',
    endHead: false,
    title: 'Nothing under the turn, as in Runs',
  },
] as const;

export default function SoftRowStylesPage() {
  return (
    <main id="main" className="soft-row-styles bg-canvas min-h-dvh">
      <h1 className="text-title font-semibold">Soft row styles</h1>
      <p className="soft-row-styles-intro text-muted">
        Each pane twice, its soft row drawn translucent and then opaque. Where
        nothing overlaps, the two should be identical; the design controls
        switch the app itself between them.
      </p>
      {SPECIMENS.map((specimen) => (
        <section key={specimen.name} className="soft-row-styles-specimen">
          <h2 className="font-semibold">{specimen.title}</h2>
          {STYLES.map((style) => (
            <figure
              key={style.id}
              data-soft-rows={style.id}
              className="soft-row-styles-figure"
            >
              <figcaption>
                <span className="text-muted-strong font-semibold">
                  {style.title}
                </span>{' '}
                <span className="text-muted">{style.note}</span>
              </figcaption>
              <div aria-hidden="true">
                <JunctionPane
                  name={`${specimen.name}-${style.id}`}
                  endHead={specimen.endHead}
                />
              </div>
            </figure>
          ))}
        </section>
      ))}
    </main>
  );
}
