import type { ProcessAnalysis } from '@/lib/process/placeholder-process';

/*
  What the run worked out before it proposed anything. It sits between the
  request and the release card because that is the order the work happened in,
  and because a reader who disagrees with the plan needs to see the reasoning
  that produced it without opening anything.

  Placeholder: the engine does not publish this yet. The box is real so it can
  be styled and argued with; the words in it are not.
*/
export function InitialAnalysis({ analysis }: { analysis: ProcessAnalysis }) {
  return (
    <div className="control-face surface-floating rounded-shell text-body px-5 py-4 leading-[1.6]">
      <p className="text-primary">{analysis.summary}</p>
      {/* Observations are findings, not instructions, so they are marked with a
          rule rather than numbered: nothing here happens in sequence. */}
      <ul className="border-rule-faint text-muted mt-3 grid gap-1.5 border-t pt-3 text-[13px]">
        {analysis.observations.map((observation) => (
          <li
            key={observation}
            className="before:bg-rule-default relative pl-3.5 before:absolute before:top-[0.65em] before:left-0 before:h-px before:w-1.5 before:content-['']"
          >
            {observation}
          </li>
        ))}
      </ul>
      <p className="text-muted mt-3 text-[12px] opacity-80">
        Placeholder. The engine does not yet publish the analysis it ran.
      </p>
    </div>
  );
}
