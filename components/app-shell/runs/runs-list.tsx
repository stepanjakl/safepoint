'use client';

import {
  labelDate,
  useInstructions,
} from '@/components/app-shell/instructions/instructions-store';
// Deep imports: Blode's barrel is the whole icon library.
import ArrowUpRight from 'blode-icons-react/icons/arrow-up-right';
import ShieldCheck from 'blode-icons-react/icons/shield-check-3-filled';
import Lab from 'blode-icons-react/icons/lab-filled';
import { RunRow } from './run-row';
import { Tooltip } from '@/components/ui/tooltip';
import { useRunSelection } from './run-selection';
import type { ProcessSummary } from '@/lib/process/model';

/*
  The process's runs: one divided list, newest first. A row is `RunRow`; this
  is the list it sits in and the boundaries between its rows.

  Where the instructions or the rulebook moved between two runs, the list says
  so once, on the boundary, rather than on every row below it. Each change is a
  pill, from what the older run ran under to what the newer one did, and it
  opens the change log for the newer one. A change in both, with no run
  between, shares one boundary; a run between them gives each its own. The
  point being made is about the gap between two runs, one not being comparable
  to the other, and a boundary shows that where a chip repeated down the column
  only lets a reader infer it.

  A client component because the current version can be published in this
  browser, and a run that was comparable a moment ago stops being comparable
  the moment a new version is.
*/
export function RunsList({
  process,
  onShowVersion,
  onShowRules,
}: {
  process: ProcessSummary;
  // Opens a version's change log. Absent where there is nowhere to open it.
  onShowVersion?: (version: string) => void;
  // Opens the rulebook. Absent where the process keeps none to show.
  onShowRules?: () => void;
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
  const revised = new Map(
    (process.rulebookRevisions ?? []).map((entry) => [
      entry.revision,
      labelDate(entry.updatedAt),
    ]),
  );

  return (
    <ol className="sheet-list">
      {runs.map((run, index) => {
        // The list runs newest first, so the run after this one in the array
        // is the older one: a change between them is the moment the
        // instructions or the rules moved.
        const older = runs[index + 1];
        const changes: Change[] = [];
        if (older && older.instructionsVersion !== run.instructionsVersion)
          changes.push({
            kind: 'instructions',
            from: older.instructionsVersion,
            to: run.instructionsVersion,
            on: published.get(run.instructionsVersion),
            open:
              onShowVersion && (() => onShowVersion(run.instructionsVersion)),
          });
        if (
          older?.rulebookRevision &&
          run.rulebookRevision &&
          older.rulebookRevision !== run.rulebookRevision
        )
          changes.push({
            kind: 'rules',
            from: older.rulebookRevision,
            to: run.rulebookRevision,
            on: revised.get(run.rulebookRevision),
            open: onShowRules,
          });
        return (
          <li key={run.id}>
            <RunRow
              run={run}
              noun={process.itemNoun}
              selected={run.id === selection?.selected}
              onSelect={selection ? () => selection.select(run.id) : undefined}
            />
            {changes.length ? (
              <Boundary
                changes={changes}
                year={new Date(run.startedAt).getFullYear()}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

type Change = {
  kind: 'instructions' | 'rules';
  from: string;
  to: string;
  // When the newer one was made, as the sheet words it: "24 Aug 2026".
  on: string | undefined;
  open?: () => void;
};

const KINDS = {
  instructions: { Icon: Lab, noun: 'Instructions' },
  rules: { Icon: ShieldCheck, noun: 'Rules' },
} as const;

// "v3" reads as "V3", and "R3" stays as it is.
const name = (value: string) => value.toUpperCase();

// The date that goes with the row: the later change, worded as the rows word
// theirs ("Sep 2"), and without the year when it is the year of the run above.
function dated(changes: Change[], year: number) {
  const latest = changes
    .filter((change) => change.on)
    .sort((a, b) => Date.parse(b.on!) - Date.parse(a.on!))[0]?.on;
  const parts = latest?.split(' ');
  if (!parts || parts.length < 2) return latest;
  const [day, month, label] = parts;
  return label && Number(label) !== year
    ? `${month} ${day} ${label}`
    : `${month} ${day}`;
}

function Boundary({ changes, year }: { changes: Change[]; year: number }) {
  const on = dated(changes, year);
  return (
    <div className="sheet-break">
      {on ? <span className="sheet-break-date value">{on}</span> : null}
      <div className="sheet-break-pills">
        {changes.map((change) => (
          <ChangePill key={change.kind} change={change} />
        ))}
      </div>
    </div>
  );
}

function ChangePill({ change }: { change: Change }) {
  const { Icon, noun } = KINDS[change.kind];
  const label = `${noun} changed from ${name(change.from)} to ${name(change.to)}${change.on ? `, ${change.on}` : ''}`;
  // Only where it ended up is drawn, so every boundary fits one line; where it
  // came from is one hover away.
  const content = (
    <>
      <Icon aria-hidden size={14} className="flex-none" />
      <span className="sheet-break-chip">
        {name(change.to)}
        {change.open ? (
          <ArrowUpRight
            aria-hidden
            size={10}
            strokeWidth={2.5}
            className="sheet-break-arrow"
          />
        ) : null}
      </span>
    </>
  );
  return (
    <Tooltip
      label={`${noun} changed`}
      description={`${name(change.from)} → ${name(change.to)}`}
    >
      {change.open ? (
        <button
          type="button"
          className="sheet-break-pill"
          onClick={change.open}
          aria-label={label}
        >
          {content}
        </button>
      ) : (
        <span role="img" className="sheet-break-pill" aria-label={label}>
          {content}
        </span>
      )}
    </Tooltip>
  );
}
