import { rulebookName, type RulebookUsed } from './evaluation-context';
import { Code, Disclosure } from './trial-parts';

type Issue = { where: string; message: string };

// The first sentence of a check's message: the finding, without the advice
// written for the drafting model.
const finding = (message: string) => message.split(/(?<=\.)\s/)[0] ?? message;

const SHOWN = 4;

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <ul className="text-meta grid gap-1">
      {issues.map((i) => (
        <li key={`${i.where}:${i.message}`}>
          <Code>{i.where}</Code> {finding(i.message)}
        </li>
      ))}
    </ul>
  );
}

/*
  A rulebook, approved or only drafted, can stop matching the sheet (a cell
  it cites is gone) or fail a check added after it was made. Its results then
  cannot be trusted, so every place that shows it says so, with what it fails.
*/
export function RulebookDrift({
  name,
  consequence,
  issues,
  compact = false,
}: {
  // One line and the list folded away, where the reader is not the one to
  // fix it.
  compact?: boolean;
  // "Rulebook v3", "This draft".
  name: string;
  // What follows for the reader, as a sentence.
  consequence: string;
  issues: Issue[];
}) {
  if (!issues.length) return null;
  return (
    <section
      aria-label={`${capitalise(name)} is out of date`}
      data-severity={1}
      className="bg-severity-fill text-severity-strong rounded-control grid gap-2 p-3"
    >
      <p className="text-dense">
        <strong>
          {capitalise(name)} no longer passes the checks a new draft must pass
        </strong>{' '}
        ({issues.length} {issues.length === 1 ? 'problem' : 'problems'} on this
        read of the sheet). {consequence}
      </p>
      {compact ? (
        <Disclosure summary={`What it fails (${issues.length})`}>
          <IssueList issues={issues} />
        </Disclosure>
      ) : (
        <IssueList issues={issues.slice(0, SHOWN)} />
      )}
      {!compact && issues.length > SHOWN ? (
        <Disclosure summary={`The other ${issues.length - SHOWN}`}>
          <IssueList issues={issues.slice(SHOWN)} />
        </Disclosure>
      ) : null}
    </section>
  );
}

// Results from a draft under test are never mistaken for those in force.
export function UnderTest({ rulebook }: { rulebook: RulebookUsed }) {
  if (rulebook.kind !== 'draft') return null;
  return (
    <p data-severity={1} className="text-dense text-severity-ink">
      <strong>Testing {rulebookName(rulebook)}.</strong> Nothing here is in
      force until it is approved.
    </p>
  );
}
