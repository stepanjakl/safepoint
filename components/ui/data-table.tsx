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
        // min-w-0: in a grid it would otherwise grow to its table's width.
        'border-rule-faint bg-surface-primary rounded-shell min-w-0 overflow-clip border',
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
export const DATA_TABLE_NAME = 'font-semibold';

// The rule between rows the release list draws too (controls.css), from where
// the rows' text starts. On a cell, not a <tr>, which cannot hold it; a table
// sets --row-rule-inset and --row-rule-top to place it.
export const DATA_TABLE_RULE = 'row-rule';
// The same on a row's other cells, where every cell carries it: unbroken.
export const DATA_TABLE_RULE_ON = 'row-rule row-rule-flush';

// A record's name: its own column where there is room, under its key where
// there is not (on a phone, beside it would wrap a word to a line).
export const DATA_TABLE_NAME_COLUMN = 'max-sm:hidden';
export const DATA_TABLE_NAME_UNDER = 'text-muted block font-normal sm:hidden';
