'use client';

import { Glyph } from '@/components/ui/glyph';
import { modeMarker, toneText } from '@/components/review/markers';
import { cx } from '@/lib/cx';
import type { SystemLink } from '@/lib/process/system-links';
import { MODE_LABELS } from '@/lib/review-presentation';
import { SystemIcon } from './system-icon';

/*
  The pieces a system is drawn from wherever it is listed rather than
  clustered: in the header's summary, the setup drawer, and the run's
  analysis. The cluster's own disc is focusable and carries a tooltip; these
  sit beside a label that already says everything, so they are decoration.
*/

// Decorative disc. No pointer events, so the disc's hover lift -- meant for a
// disc that is itself the control -- does not fire inside a row or a button.
export function SystemDisc({
  link,
  className,
}: {
  link: SystemLink;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx('system-disc pointer-events-none', className)}
      data-freshness={link.freshness?.state}
    >
      <SystemIcon icon={link.icon} />
    </span>
  );
}

// What is worth knowing beside a name: freshness for an input, the adapter
// mode for an output, a version for the policy rules. Shape
// as well as colour, so the state survives without the hue.
export function SystemMeta({ link }: { link: SystemLink }) {
  if (link.mode) {
    const marker = modeMarker[link.mode];
    return (
      <span
        className={cx(
          'readout inline-flex items-center gap-1.5 whitespace-nowrap',
          toneText[marker.tone],
        )}
      >
        <Glyph name={marker.glyph} size={10} />
        {MODE_LABELS[link.mode]}
      </span>
    );
  }
  const freshness = link.freshness;
  if (!freshness || freshness.state === 'fresh') {
    const text = freshness?.label ?? link.detail;
    /*
      The named-group variant is inert wherever no such group is above it, which
      is everywhere but the input row: there the row takes the selected fill
      when its panel opens, and muted on that ground is the one pairing that
      falls under AA -- see the note on --sp-surface-selected.
    */
    return text ? (
      <span className="text-meta text-muted group-aria-expanded/input-row:text-primary whitespace-nowrap">
        {text}
      </span>
    ) : null;
  }
  /*
    No glyph here. Square and triangle are the review's own marks -- a held
    line, a line needing attention -- and an input whose file is a few hours
    old is not a held line. The condition says itself in words, and in a list
    the disc beside it carries the ring that makes the state visible without
    relying on the colour of this text.
  */
  return (
    <span
      className={cx(
        'text-meta whitespace-nowrap',
        toneText[freshness.state === 'unavailable' ? 'blocked' : 'caution'],
      )}
    >
      {freshness.label}
    </span>
  );
}
