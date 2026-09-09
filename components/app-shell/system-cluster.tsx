'use client';

import { Focusable, Tooltip, TooltipTrigger } from 'react-aria-components';
import type { Freshness, SystemLink } from '@/lib/process/system-links';
import { SystemIcon } from './system-icon';

// The name is revealed on hover *and* on focus. A hover-only reveal would put
// every label out of reach of a keyboard, and for sources the tooltip carries
// freshness, which is not decoration.
function Disc({ link }: { link: SystemLink }) {
  const meta = link.freshness?.label ?? link.detail;
  const described = meta ? `${link.label}. ${meta}.` : link.label;
  return (
    <TooltipTrigger delay={200}>
      <Focusable>
        <span
          className="system-disc"
          data-freshness={link.freshness?.state}
          tabIndex={0}
          role="img"
          aria-label={described}
        >
          <SystemIcon icon={link.icon} />
        </span>
      </Focusable>
      <Tooltip className="system-tooltip" offset={8}>
        <span className="system-tooltip-label">{link.label}</span>
        {meta ? <span className="system-tooltip-meta">{meta}</span> : null}
      </Tooltip>
    </TooltipTrigger>
  );
}

export function SystemCluster({
  label,
  links,
}: {
  label: string;
  links: SystemLink[];
}) {
  if (links.length === 0) return null;
  const needing = links.filter(
    (link) => link.freshness && link.freshness.state !== 'fresh',
  );
  const attention = needing.length;
  // The count spans two states, so it takes the colour of the worse one. Named
  // for freshness, not severity: `data-severity` is the review layer's numeric
  // rank, and reusing it here would put two vocabularies on one attribute.
  const worst: Freshness['state'] = needing.some(
    (link) => link.freshness?.state === 'unavailable',
  )
    ? 'unavailable'
    : 'stale';

  return (
    <div className="system-cluster">
      <span className="system-cluster-label">{label}</span>
      <ul className="system-discs">
        {links.map((link) => (
          <li key={link.id}>
            <Disc link={link} />
          </li>
        ))}
      </ul>
      {/* Staleness is what explains a blocked count, so it gets a visible
          number rather than living only inside a tooltip. */}
      {attention > 0 ? (
        <span className="system-attention" data-freshness={worst}>
          {attention} {attention === 1 ? 'needs' : 'need'} attention
        </span>
      ) : null}
    </div>
  );
}
