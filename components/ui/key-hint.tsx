'use client';

// Deep imports: Blode's barrel is the whole icon library.
import CornerDownLeft from 'blode-icons-react/icons/arrow-corner-down-left';
import Cmd from 'blode-icons-react/icons/cmd';
import { useModifierKey } from '@/lib/modifier-key';
import { cx } from '@/lib/cx';

/*
  A shortcut drawn as keys: the keys that have a symbol as an icon and the rest as text in the same ink. `mod` is ⌘ on Apple
  platforms and the word Ctrl elsewhere, where ⌃ is not how anyone reads it.
  The picture is for the eye; the keys are spoken in a visually hidden line.
*/
export type Key = 'mod' | 'enter' | (string & {});

// Where the keys sit decides their ink, and whether each has a square: on a
// button they are bare, in a tooltip each is boxed.
const ON = {
  accent: {
    row: 'gap-0.5',
    key: 'text-accent-key',
    icon: 13,
    stroke: 2,
    weight: 'font-medium',
  },
  tooltip: {
    row: 'gap-1',
    key: 'h-4 min-w-4 rounded-section border border-tooltip-edge px-0.5',
    icon: 11,
    stroke: 2.4,
    weight: 'font-semibold',
  },
} as const;

const SPOKEN: Record<string, string> = { enter: 'Enter' };

export function KeyHint({
  keys,
  on,
  className,
}: {
  keys: Key[];
  on: keyof typeof ON;
  className?: string;
}) {
  const modifier = useModifierKey();
  const spoken = keys
    .map((key) =>
      key === 'mod'
        ? modifier === '⌘'
          ? 'Command'
          : 'Control'
        : (SPOKEN[key] ?? key.toUpperCase()),
    )
    .join(' ');
  return (
    <span className={cx('inline-flex items-center align-middle', className)}>
      <span className="sr-only">{spoken}</span>
      <span
        aria-hidden="true"
        className={cx('inline-flex items-center', ON[on].row)}
      >
        {keys.map((key) => (
          <kbd
            key={key}
            className={cx(
              'text-micro inline-flex items-center justify-center font-sans',
              ON[on].weight,
              ON[on].key,
            )}
          >
            {key === 'mod' ? (
              modifier === '⌘' ? (
                <Cmd size={ON[on].icon} strokeWidth={ON[on].stroke} />
              ) : (
                'Ctrl'
              )
            ) : key === 'enter' ? (
              <CornerDownLeft size={ON[on].icon} strokeWidth={ON[on].stroke} />
            ) : (
              key.toUpperCase()
            )}
          </kbd>
        ))}
      </span>
    </span>
  );
}
