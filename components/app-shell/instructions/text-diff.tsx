'use client';

import { useMemo } from 'react';
import { cx } from '@/lib/cx';
import { diffText } from '@/lib/process/instruction-diff';

/*
  A change to the instructions, read as one text: every paragraph in order,
  one taken out on red and marked −, one put in on green and marked +. A
  rewritten paragraph is its old form and then its new one, side by side in
  the flow, so the change is read as a whole rather than word by word.

  Colour is never the only signal: the sign carries it too, and each changed
  paragraph says what happened to it for a screen reader.
*/

type Line = { kind: 'same' | 'added' | 'removed'; text: string };

// The words carry the change's colour on its tint, at regular weight; the
// sign is in the same hue, a step quieter, and is the one bold mark.
const KINDS = {
  same: { sign: '', said: '', row: 'text-muted', ink: '' },
  removed: {
    sign: '−',
    said: 'Removed: ',
    row: 'bg-diff-removed text-state-blocked',
    ink: 'text-diff-removed-sign',
  },
  added: {
    sign: '+',
    said: 'Added: ',
    row: 'bg-diff-added text-state-verified',
    ink: 'text-diff-added-sign',
  },
} satisfies Record<
  Line['kind'],
  { sign: string; said: string; row: string; ink: string }
>;

function linesOf(before: string, after: string): Line[] {
  return diffText(before, after).paragraphs.flatMap((paragraph): Line[] => {
    if (paragraph.kind !== 'changed') return [paragraph];
    const join = (skip: 'added' | 'removed') =>
      paragraph.segments
        .filter((segment) => segment.kind !== skip)
        .map((segment) => segment.text)
        .join('');
    return [
      { kind: 'removed', text: join('added') },
      { kind: 'added', text: join('removed') },
    ];
  });
}

export function TextDiff({
  before,
  after,
  label,
}: {
  before: string;
  after: string;
  // Names the list, as "Changes from v3".
  label: string;
}) {
  const lines = useMemo(() => linesOf(before, after), [before, after]);
  return (
    <ol
      aria-label={label}
      className="text-meta grid gap-1 font-mono leading-relaxed"
    >
      {lines.map((line, index) => (
        <li
          key={index}
          className={cx(
            'rounded-control grid grid-cols-[1.25rem_minmax(0,1fr)] px-3 py-2 whitespace-pre-wrap',
            KINDS[line.kind].row,
          )}
        >
          <span
            aria-hidden="true"
            className={cx('font-semibold', KINDS[line.kind].ink)}
          >
            {KINDS[line.kind].sign}
          </span>
          <span>
            {KINDS[line.kind].said ? (
              <span className="sr-only">{KINDS[line.kind].said}</span>
            ) : null}
            {line.text}
          </span>
        </li>
      ))}
    </ol>
  );
}
