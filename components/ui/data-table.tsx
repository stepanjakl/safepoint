import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cx } from '@/lib/cx';

/*
  A table of data on its own face: a ruled card on the primary surface, its
  heading row in small capitals over a rule, every row inset by the card's
  1rem. The face only -- what is inside keeps its own semantics: a real table
  where cells are read across and down, a list of rows where each row is one
  thing to open.
*/

// The card. Rendered as `as` names, so a card that is a region of its own
// can say so.
export function DataTable({
  as = 'div',
  className,
  children,
  ...props
}: ComponentPropsWithRef<'article'> & {
  as?: 'div' | 'article';
  children: ReactNode;
}) {
  // A div takes every prop an article does.
  const Element = as as 'article';
  return (
    <Element
      {...props}
      className={cx(
        'border-rule-faint bg-surface-primary rounded-shell overflow-clip border',
        className,
      )}
    >
      {children}
    </Element>
  );
}

// The heading row's face; its cells are inset as the rows' are.
export const DATA_TABLE_HEAD =
  'readout text-muted border-rule-faint border-b py-3 font-semibold';

// A row's name, in its first cell.
export const DATA_TABLE_NAME = 'font-bold';

// The rule between two rows: from where the rows' text starts to the card's
// far side, a step fainter than the heading's, as the release list's rows are
// divided. Rows led by a control (a chevron in the inset) start further in.
// It takes no height, so rows keep the same pitch either way.
export const DataTableRule = ({ led = false }: { led?: boolean }) => (
  <div
    aria-hidden
    className={cx('border-rule-faint -mt-px border-t', led ? 'ms-6' : 'ms-4')}
  />
);
