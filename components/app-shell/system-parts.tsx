'use client';

import { Glyph, type GlyphName } from '@/components/ui/glyph';
import { modeMarker, toneText } from '@/components/review/markers';
import { cx } from '@/lib/cx';
import type { Freshness, SystemLink } from '@/lib/process/system-links';
import { MODE_LABELS } from '@/lib/review-presentation/present-review';
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

const FRESHNESS_MARKER: Record<
  Exclude<Freshness['state'], 'fresh'>,
  { glyph: GlyphName; tone: 'caution' | 'blocked' }
> = {
  stale: { glyph: 'triangle', tone: 'caution' },
  unavailable: { glyph: 'square', tone: 'blocked' },
};

// What is worth knowing about a system, beside its name: freshness for a
// source, the adapter mode for a destination, a version for a ruleset. Shape
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
    return text ? (
      <span className="text-meta text-muted whitespace-nowrap">{text}</span>
    ) : null;
  }
  const marker = FRESHNESS_MARKER[freshness.state];
  return (
    <span
      className={cx(
        'text-meta inline-flex items-center gap-1.5 whitespace-nowrap',
        toneText[marker.tone],
      )}
    >
      <Glyph name={marker.glyph} size={10} />
      {freshness.label}
    </span>
  );
}
