import type { ReactNode } from 'react';

/*
  What a section is called, and the controls that belong to it.

  The name is for assistive technology only: the header's selected tab already
  says which section is showing, so a visible title would repeat it. A
  section's list points at the heading (aria-labelledby).

  Only a section with a control of its own draws the band: Start run and the
  schedule above the runs they produce. It is the list's sticky first row, so
  those controls stay in reach as the list scrolls. A section with nothing to
  put there starts its content at the top instead of under an empty strip.
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
  // The size of what follows, where knowing it before reading is worth it.
  count?: number;
  // The section's controls in display order.
  children?: ReactNode;
}) {
  const heading = (
    <h2 id={id} className="sr-only">
      {count === undefined ? title : `${title} ${count}`}
    </h2>
  );
  if (!children) return heading;
  return (
    <div className="sheet-head">
      {heading}
      {children}
    </div>
  );
}
