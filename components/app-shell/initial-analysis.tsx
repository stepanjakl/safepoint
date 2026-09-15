import type { ProcessAnalysis } from '@/lib/process/placeholder-process';
import {
  byAttention,
  needsAttention,
  type SystemLink,
} from '@/lib/process/system-links';
import { SystemDisc, SystemMeta } from './system-parts';

/*
  What the run worked out before it proposed anything. It sits between the
  request and the release card because that is the order the work happened in,
  and because a reader who disagrees with the plan needs to see the reasoning
  that produced it without opening anything.

  The sources that needed attention are listed here, not only counted in the
  header: staleness is a fact about this run's reads, and this is where the
  reads happened.

  Placeholder: the engine does not publish this yet. The box is real so it can
  be styled and argued with; the words in it are not.
*/
export function InitialAnalysis({
  analysis,
  sources = [],
}: {
  analysis: ProcessAnalysis;
  sources?: SystemLink[];
}) {
  const needing = sources.filter(needsAttention).sort(byAttention);
  return (
    <div className="control-face surface-floating rounded-shell text-body px-5 py-4 leading-relaxed">
      <p className="text-primary">{analysis.summary}</p>
      {/* Observations are findings, not instructions, so they are marked with a
          rule rather than numbered: nothing here happens in sequence. */}
      <ul className="border-rule-faint text-muted text-dense mt-3 grid gap-1.5 border-t pt-3">
        {analysis.observations.map((observation) => (
          <li
            key={observation}
            className="before:bg-rule-default relative pl-3.5 before:absolute before:top-[0.65em] before:left-0 before:h-px before:w-1.5 before:content-['']"
          >
            {observation}
          </li>
        ))}
      </ul>
      {needing.length > 0 ? (
        <section
          aria-labelledby="analysis-sources"
          className="border-rule-faint mt-3 border-t pt-3"
        >
          <h3 id="analysis-sources" className="readout text-muted pb-1.5">
            Sources needing attention
          </h3>
          <ul className="grid gap-1.5">
            {needing.map((link) => (
              <li
                key={link.id}
                className="text-dense flex flex-wrap items-center gap-x-2.5 gap-y-0.5"
              >
                <SystemDisc link={link} />
                <span className="text-primary">{link.label}</span>
                <SystemMeta link={link} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-muted text-meta mt-3 opacity-80">
        Placeholder. The engine does not yet publish the analysis it ran.
      </p>
    </div>
  );
}
