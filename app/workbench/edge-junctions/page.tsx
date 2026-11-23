import { JunctionPane } from './junction-pane';

/*
  Every place the pane's edge meets another line, in the app's pane in small
  (junction-pane.tsx). e2e/shell/edge-junctions.spec.ts reads the pixels:

  - the top edge runs into the notch's bend without a seam;
  - the notch's foot crosses the header's rule without breaking it;
  - the column divider meets the rule's solid row;
  - every rule that meets the pane's side reaches its solid ring;
  - the side's soft row reads the same beside a band, a lit row, the turn
    and nothing at all.

  It follows the design controls' soft rows; /workbench/soft-row-styles shows
  both at once.
*/

export default function EdgeJunctionsPage() {
  return (
    <main id="main" className="bg-canvas min-h-dvh">
      <h1 className="sr-only">Edge junctions</h1>
      <div className="edge-junctions" aria-hidden="true">
        <JunctionPane name="band-under-turn" endHead />
        <JunctionPane name="no-band" endHead={false} />
      </div>
    </main>
  );
}
