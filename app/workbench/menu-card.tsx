'use client';

import { Link } from 'react-aria-components';

import type { WorkbenchEntry } from './menu';

/*
  One page of the workbench as a card: its name and the line saying what it
  shows. It takes the secondary button's face, so hover and keyboard focus
  light it the way they light a button.
*/
export function MenuCard({ entry }: { entry: WorkbenchEntry }) {
  return (
    <Link
      href={entry.href}
      className="control-face control-button-secondary interact:control-button-secondary-hover rounded-shell text-primary grid content-start gap-1 p-4"
    >
      <span className="text-body font-medium">{entry.title}</span>
      <span className="text-meta text-muted">{entry.summary}</span>
    </Link>
  );
}
