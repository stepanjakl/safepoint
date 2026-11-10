import TableFilled from 'blode-icons-react/icons/table-filled';
import type { ComponentType, ReactNode } from 'react';

import { cx } from '@/lib/cx';
import { SOURCE_KINDS, type SourceKind } from '@/lib/sources/model';

// Each kind's mark, drawn in its hue without a face of its own.
const SOURCE_MARKS: Record<
  SourceKind,
  ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
> = {
  'google-sheets': TableFilled,
  // The engine's test-only second kind; no source the app declares has it.
  database: TableFilled,
};

/*
  The head of every card about a source -- what a process reads, what a run
  writes: its kind's mark and name over the card's rule, and whatever the
  card offers at the far end. Text starts 5 in; controls end 3.5 in, as far
  as they sit from the head's top and bottom.
*/
export function SourceHead({
  kind,
  title,
  titleId,
  children,
}: {
  kind: SourceKind;
  // One source by its own title -- a file -- in a compact head, its mark
  // saying the kind; without one, the kind itself, as a panel's title.
  title?: string;
  titleId?: string;
  children?: ReactNode;
}) {
  const { name, mark } = SOURCE_KINDS[kind];
  const Mark = SOURCE_MARKS[kind];
  return (
    <header
      className={cx(
        'border-rule-faint flex items-center justify-between gap-3 border-b pr-3.5 pl-5',
        title ? 'py-2.5' : 'py-3.5',
      )}
    >
      <div
        className={cx('flex min-w-0 items-center', title ? 'gap-2' : 'gap-2.5')}
      >
        <Mark
          aria-hidden
          size={title ? 16 : 22}
          className={cx('flex-none', mark)}
        />
        <h3
          id={titleId}
          className={cx(
            'text-primary min-w-0 truncate font-semibold',
            title ? 'text-dense' : 'text-title',
          )}
        >
          {title ? (
            <>
              <span className="sr-only">{name}: </span>
              {title}
            </>
          ) : (
            name
          )}
        </h3>
      </div>
      {children}
    </header>
  );
}
