import { Button } from '@/components/ui/button';
import { Notch } from '@/components/ui/notch';

/*
  The app's pane in small, built from its own parts -- the pane, its face and
  ring, the process header with its notch, the sheet frame, and two columns of
  the sheet -- so a change to any of them shows. Used by /workbench/edge-
  junctions, which the pixel tests read, and /workbench/section-rules.

  With endHead, a section head lies under the notch's turn, as Instructions
  has; without, nothing does, as in Runs. With firstCurrent, the row under
  the start column's head is the lit one, as v3 is in Instructions.
*/

function Column({
  side,
  head,
  rows,
  firstCurrent = false,
}: {
  side: 'start' | 'end';
  head: boolean;
  rows: boolean;
  firstCurrent?: boolean;
}) {
  return (
    <div
      className={
        side === 'start'
          ? 'edge-junctions-column sheet-bleed'
          : 'edge-junctions-column sheet-bleed-end sheet-bleed-end-head'
      }
    >
      {head ? <div className="sheet-head" /> : null}
      {rows ? (
        <ul className="sheet-list">
          <li>
            <div
              className="sheet-row edge-junctions-row"
              data-current={firstCurrent ? '' : undefined}
            />
          </li>
          <li>
            <div
              className="sheet-row edge-junctions-row"
              data-current={firstCurrent ? undefined : ''}
            />
          </li>
          <li>
            <div className="sheet-break edge-junctions-break" />
          </li>
          <li>
            <div className="sheet-row edge-junctions-row" />
          </li>
        </ul>
      ) : null}
    </div>
  );
}

export function JunctionPane({
  name,
  endHead,
  firstCurrent = false,
}: {
  name: string;
  endHead: boolean;
  firstCurrent?: boolean;
}) {
  return (
    <div
      className="edge-junctions-pane shell-pane ground-raised relative isolate overflow-clip rounded-tr-none"
      data-junctions={name}
    >
      <div
        aria-hidden="true"
        className="control-face surface-raised rounded-shell pointer-events-none absolute inset-0 -z-10"
      />
      <div className="edge-junctions-inset p-pane-inset">
        <header className="process-header edge-junctions-header relative z-10 grid">
          <div className="-mt-pane-inset -mb-control-edge" />
          <Notch className="-mt-pane-inset -mr-pane-inset -mb-control-edge">
            <Button
              slant="left"
              aria-label="Specimen"
              excludeFromTabOrder
              className="edge-junctions-slant"
            />
          </Notch>
        </header>
        <div className="@container/sheet min-h-0 min-w-0">
          <div className="process-sheet-frame clip-past-pane-highlight rounded-tr-shell-inner rounded-b-shell-inner grid h-full">
            <div
              className="process-panels edge-junctions-columns"
              data-tab="instructions"
            >
              <Column side="start" head rows firstCurrent={firstCurrent} />
              <Column side="end" head={endHead} rows={false} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
