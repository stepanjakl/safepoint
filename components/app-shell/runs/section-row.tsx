import { styleDebug } from '@/lib/style-debug';
import type { ReactNode } from 'react';

/*
  The first row of a section's list, naming the section it belongs to.

  It is a row rather than a header above the list on purpose. The sheet shows
  four sections in the same column -- runs, inputs, outputs, settings -- and a
  header outside the scroller would charge each of them the same strip of
  vertical space while leaving the list below it unlabelled the moment it
  scrolls. As the list's own sticky first row it costs that space once and goes
  on saying what the reader is looking at.

  It is also the one place each section's single most relevant control belongs:
  the schedule beside the runs it produces, Add beside the inputs it adds to.
  Anything more than one belongs in the list, not in its label.
*/
export function SectionRow({
  id,
  title,
  count,
  children,
}: {
  // The heading's id, so the list it labels can point at it.
  id: string;
  title: string;
  // The size of what follows, where knowing it before scrolling is worth
  // something. A section whose length is not a fact about it leaves it off.
  count?: number;
  // The section's one control, at the row's end.
  children?: ReactNode;
}) {
  return (
    <div
      {...styleDebug({ component: 'SectionRow', appearance: 'sheet-head' })}
      className="sheet-head"
    >
      {/*
        The readout one step up, through the utility face's own strong weight
        rather than a number. Each typeface set decides what that step is for
        the mono it ships -- Geist and Inter have a real 600, and Glide, which
        ships a single weight, pins strong to its 400 so the step quietly
        becomes no step instead of a synthetic bold smearing at this size.
      */}
      <h2
        id={id}
        className="readout text-muted [font-weight:var(--sp-mono-weight-strong)]"
      >
        {title}
        {count !== undefined ? (
          <>
            {' '}
            <span className="value">{count}</span>
          </>
        ) : null}
      </h2>
      {children}
    </div>
  );
}
