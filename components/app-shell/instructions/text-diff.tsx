'use client';

import { useMemo } from 'react';
import { cx } from '@/lib/cx';
import { diffText } from '@/lib/process/instruction-diff';

/*
  A change to the instructions, read in the text's own face and measure. A
  paragraph put in or taken out keeps its tint and sign; a rewritten one is one
  paragraph, with the words taken out struck and the words put in underlined,
  so a one-clause edit reads as that clause rather than as the whole paragraph
  twice.

  Colour is never the only signal: the sign carries it too, and each changed
  paragraph and word says what happened to it for a screen reader.
*/
const KINDS = {
  same: { sign: '', said: '', row: 'text-muted', ink: '' },
  changed: { sign: '±', said: 'Changed: ', row: '', ink: 'text-muted' },
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
} as const;

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
  const paragraphs = useMemo(
    () => diffText(before, after).paragraphs,
    [before, after],
  );
  return (
    <ol aria-label={label} className="text-body grid gap-1 leading-relaxed">
      {paragraphs.map((paragraph, index) => {
        const kind = KINDS[paragraph.kind];
        return (
          <li
            key={index}
            className={cx(
              'rounded-control clause-row whitespace-pre-line',
              kind.row,
            )}
          >
            <span
              aria-hidden="true"
              className={cx('text-center font-semibold', kind.ink)}
            >
              {kind.sign}
            </span>
            <span>
              {kind.said ? <span className="sr-only">{kind.said}</span> : null}
              {paragraph.kind === 'changed'
                ? paragraph.segments.map((segment, at) =>
                    segment.kind === 'same' ? (
                      <span key={at}>{segment.text}</span>
                    ) : segment.kind === 'removed' ? (
                      <del
                        key={at}
                        className="bg-diff-removed text-state-blocked"
                      >
                        <span className="sr-only">[removed: </span>
                        {segment.text}
                        <span className="sr-only">]</span>
                      </del>
                    ) : (
                      <ins
                        key={at}
                        className="bg-diff-added text-state-verified"
                      >
                        <span className="sr-only">[added: </span>
                        {segment.text}
                        <span className="sr-only">]</span>
                      </ins>
                    ),
                  )
                : paragraph.text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
