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
  variant = 'standard',
  children,
  ...props
}: ComponentPropsWithRef<'article'> & {
  as?: 'div' | 'article';
  variant?: 'standard' | 'compact';
  children: ReactNode;
}) {
  // A div takes every prop an article does.
  const Element = as as 'article';
  return (
    <Element
      {...props}
      className={cx(
        // min-w-0: in a grid it would otherwise grow to its table's width.
        // Each variant owns its face and radius.
        'min-w-0',
        variant === 'compact'
          ? 'bg-surface-inset rounded-control overflow-auto'
          : 'ground-raised border-rule-faint bg-surface-primary rounded-shell overflow-clip border',
        className,
      )}
    >
      {children}
    </Element>
  );
}

export const DATA_TABLE_BODY =
  'text-dense w-full border-separate border-spacing-0';

export const DATA_TABLE_HEADING =
  'ground-band bg-surface-band readout text-muted-strong font-semibold';

// The heading row's face; its cells are inset as the rows' are.
export const DATA_TABLE_HEAD = cx(
  DATA_TABLE_HEADING,
  'border-rule-faint border-b py-3',
);

export const DATA_TABLE_SECONDARY_NAME = 'text-muted font-normal';

export const COMPACT_TABLE_BODY =
  'value text-meta border-separate border-spacing-0';
export const COMPACT_TABLE_CELL =
  'border-rule-faint border-b px-3 py-1.5 whitespace-nowrap';
export const COMPACT_TABLE_HEAD = cx(
  COMPACT_TABLE_CELL,
  DATA_TABLE_HEADING,
  'text-left',
);

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
export const DATA_TABLE_NAME_UNDER = cx(
  DATA_TABLE_SECONDARY_NAME,
  'block sm:hidden',
);
