import type { ReactNode } from 'react';

import type { ProcessTab } from './process-tab-store';

/* What the tab panels' lists share: the id each section's heading carries,
   the note under a list, and the grouping that labels a list by that heading. */

/*
  What each section calls itself, in one place. The heading is rendered once,
  by the section row, and the list below points at it -- so a list is labelled
  by the row a reader can actually see rather than by a heading of its own that
  says the same word again.
*/
export const SECTION: Record<
  Exclude<ProcessTab, 'runs'>,
  { id: string; title: string }
> = {
  instructions: { id: 'instructions-heading', title: 'Instructions' },
  inputs: { id: 'inputs-heading', title: 'Inputs' },
  outputs: { id: 'outputs-heading', title: 'Outputs' },
  settings: { id: 'settings-heading', title: 'Settings' },
};

export const NOTE = 'border-rule-faint text-muted text-meta border-t pt-3';

/*
  A list and the one line of context above it. It no longer carries a heading:
  the section row does, and a second heading repeating the same word is a
  reader's cue that they have moved somewhere, which they have not. The list
  points back at the row instead.
*/
export function Group({
  labelledBy,
  meta,
  children,
}: {
  labelledBy: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={labelledBy}>
      {meta ? <p className="text-meta text-muted pb-1.5">{meta}</p> : null}
      {children}
    </section>
  );
}
