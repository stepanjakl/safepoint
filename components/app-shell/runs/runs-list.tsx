'use client';

import {
  labelDate,
  useInstructions,
} from '@/components/app-shell/instructions/instructions-store';
import { RunRow } from './run-row';
import { useRunSelection } from './run-selection';
import type { ProcessSummary } from '@/lib/process/model';

/*
  The process's runs: one divided list, newest first. A row is `RunRow`; this
  is the list it sits in and the boundaries between its rows.

  Where the instructions moved between two runs, the list says so once, on the
  boundary, rather than on every row below it -- and that boundary opens the
  change log for the version it names. The point being made is about the gap
  between two runs, one not being comparable to the other, and a boundary shows
  that where a chip repeated down the column only lets a reader infer it.

  A client component because the current version can be published in this
  browser, and a run that was comparable a moment ago stops being comparable
  the moment a new version is.
*/
export function RunsList({
  process,
  onShowVersion,
}: {
  process: ProcessSummary;
  // Opens a version's change log. Absent where there is nowhere to open it.
  onShowVersion?: (version: string) => void;
}) {
  const { versions } = useInstructions(process.id, process.instructions);
  // Which run the rail is on, shared with the page beside it (run-selection).
  const selection = useRunSelection();
  const runs = selection?.runs ?? process.runs;
  // When each version was published, for the boundary between the runs on
  // either side of it. The stored label leads with its own verb -- "Updated
  // 24 Aug 2026" -- and the boundary supplies that word itself.
  const published = new Map(
    versions.map((entry) => [entry.version, labelDate(entry.updatedLabel)]),
  );

  return (
    <ol className="sheet-list">
      {runs.map((run, index) => {
        // The list runs newest first, so the run after this one in the array
        // is the older one: a version change between them is the moment the
        // instructions moved.
        const older = runs[index + 1];
        const boundary =
          older && older.instructionsVersion !== run.instructionsVersion
            ? run.instructionsVersion
            : null;
        return (
          <li key={run.id}>
            <RunRow
              run={run}
              noun={process.itemNoun}
              selected={run.id === selection?.selected}
              onSelect={selection ? () => selection.select(run.id) : undefined}
            />
            {boundary ? (
              <Boundary
                version={boundary}
                published={published.get(boundary)}
                onShow={onShowVersion}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Boundary({
  version,
  published,
  onShow,
}: {
  version: string;
  published: string | undefined;
  onShow?: (version: string) => void;
}) {
  const label = (
    <>
      <span className="value">{version}</span> published
      {published ? <span className="normal-case"> · {published}</span> : null}
    </>
  );
  if (!onShow) return <p className="sheet-break readout">{label}</p>;
  return (
    <button
      type="button"
      className="sheet-break readout"
      onClick={() => onShow(version)}
      aria-label={`What changed in ${version}${published ? `, published ${published}` : ''}`}
    >
      {label}
    </button>
  );
}
