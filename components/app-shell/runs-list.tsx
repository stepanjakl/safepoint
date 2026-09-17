'use client';

import { useState } from 'react';
import { useInstructions } from './instructions-store';
import { RunRow } from './run-row';
import type { ProcessSummary } from '@/lib/process/placeholder-process';

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
  /*
    Which run the rail is on. Placeholder, and deliberately local: only the
    current run has a recorded thread, so choosing another marks the rail and
    leaves the page beside it alone. When runs carry their own threads this
    becomes the thing the page is rendered from, and the state moves up to the
    sheet with it.
  */
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? process.runs.find((run) => run.current)?.id;
  // When each version was published, for the boundary between the runs on
  // either side of it. The stored label leads with its own verb -- "Updated
  // 24 Aug 2026" -- and the boundary supplies that word itself.
  const published = new Map(
    versions.map((entry) => [
      entry.version,
      entry.updatedLabel.replace(/^(Updated|Published)\s+/, ''),
    ]),
  );

  return (
    <ol className="sheet-list">
      {process.runs.map((run, index) => {
        // The list runs newest first, so the run after this one in the array
        // is the older one: a version change between them is the moment the
        // instructions moved.
        const older = process.runs[index + 1];
        const boundary =
          older && older.instructionsVersion !== run.instructionsVersion
            ? run.instructionsVersion
            : null;
        return (
          <li key={run.id}>
            <RunRow
              run={run}
              noun={process.itemNoun}
              selected={run.id === current}
              onSelect={() => setSelected(run.id)}
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
