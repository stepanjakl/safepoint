'use client';

import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
// Deep import: Blode's barrel is the whole icon library.
import Lab from 'blode-icons-react/icons/lab';
import { Button } from '@/components/ui/button';
import { Glyph } from '@/components/ui/glyph';
import { Notch } from '@/components/ui/notch';
import { cx } from '@/lib/cx';
import type { ProcessSummary } from '@/lib/process/placeholder-process';
import type { SourceDetail } from '@/lib/process/source-details';
import {
  byAttention,
  needsAttention,
  worstFreshness,
  type SystemLink,
} from '@/lib/process/system-links';
import { useRemovedSources } from './connections-store';
import { useInstructions } from './instructions-store';
import { ProcessDrawer, type ProcessDrawerTab } from './process-drawer';
import { ProcessTitle } from './process-title';
import { RefineInstructions } from './refine-instructions';
import { SystemDisc } from './system-parts';

// How many discs the summary shows before the count has to speak for the rest.
const PREVIEW_DISCS = 3;

/*
  The systems, as a summary rather than an inventory. A cluster of every disc
  stops being readable somewhere past eight, and what the header has to say
  about them at a glance is only how many there are and whether any need
  attention. The list itself is in the setup drawer this opens.

  The discs shown are the worst first, so a stale or unavailable source is
  never the one hidden behind the count.
*/
function SystemsSummary({
  sources,
  destinations,
  onPress,
}: {
  sources: SystemLink[];
  destinations: SystemLink[];
  onPress: () => void;
}) {
  const all = [...sources, ...destinations];
  if (all.length === 0) return null;
  const attention = sources.filter(needsAttention).length;
  const worst = worstFreshness(sources);
  const preview = [...all].sort(byAttention).slice(0, PREVIEW_DISCS);
  const count = `${all.length} ${all.length === 1 ? 'system' : 'systems'}`;
  const need = `${attention === 1 ? 'needs' : 'need'} attention`;

  return (
    <AriaButton
      onPress={onPress}
      aria-label={`Systems: ${count}${attention ? `, ${attention} ${need}` : ''}`}
      // The name has the row first. Beside a phone-width notch the summary
      // keeps only what cannot wait for the drawer -- the attention count --
      // and a summary with nothing to flag steps out of the way entirely.
      className={cx(
        'control-wash text-muted hover:bg-surface-selected hover:text-primary focus-visible:bg-surface-selected focus-visible:text-primary data-[pressed]:bg-surface-selected rounded-control text-meta inline-flex min-h-8 flex-none cursor-pointer items-center gap-2.5 px-2 whitespace-nowrap',
        !worst && 'max-sm:hidden',
      )}
    >
      <span className="isolate flex max-sm:hidden">
        {preview.map((link) => (
          <SystemDisc
            key={link.id}
            link={link}
            className="not-first:-ml-1.25"
          />
        ))}
      </span>
      <span className="max-sm:hidden">{count}</span>
      {worst ? (
        <span
          className="text-state-caution data-[freshness=unavailable]:text-state-blocked inline-flex items-center gap-1.5"
          data-freshness={worst}
        >
          <Glyph
            name={worst === 'unavailable' ? 'square' : 'triangle'}
            size={10}
          />
          {attention}
          <span className="max-md:hidden">{need}</span>
        </span>
      ) : null}
    </AriaButton>
  );
}

/*
  Two cells on one row: the heading and its systems, then the notch the
  instructions sit in. The notch sets the row's height -- the heading cell is
  a single line with no vertical padding of its own, so it stays shorter than
  the notch at any control height -- and reaches down over the header's rule,
  so its floor is that rule.

  The rule and its sheen belong to the header, whole width, not to the
  heading cell. The notch starts wherever the button's text width puts it,
  usually on a fraction of a pixel, and a translucent sheen drawn by two
  elements meeting there double-paints that pixel into a bright dot.

  A client component because two triggers in different cells open one drawer,
  each on its own tab.
*/
export function ProcessHeader({
  process,
  sources,
  sourceDetails,
}: {
  process: ProcessSummary;
  sources: SystemLink[];
  sourceDetails?: Record<string, SourceDetail>;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ProcessDrawerTab>('instructions');
  // Connections can be changed only where the sources have details to show:
  // the promotion scenario's files. Everything downstream reads the connected
  // set, so a removed source leaves the count and the list together.
  const { removed, remove, restore } = useRemovedSources(process.id);
  // The current version, which a publish in this browser can move on.
  const { version } = useInstructions(process.id, process.instructions).current;
  const connected = sources.filter((source) => !removed.has(source.id));
  const available = sources.filter((source) => removed.has(source.id));
  const editable = sourceDetails !== undefined;
  const show = (next: ProcessDrawerTab) => {
    setTab(next);
    setOpen(true);
  };

  return (
    <header className="border-rule-faint shadow-separator-bottom-strong grid grid-cols-[minmax(0,1fr)_auto] border-b">
      {/* Centred in the row. The notch holds the same inset above its
          controls as below them, so their centre is the row's too and the
          heading lines up with them at any control height or gap, with even
          space above and below. The controls' icons keep their own 1px
          optical lift on top of this. */}
      <div className="flex min-w-0 items-center justify-between gap-x-4 px-4 sm:px-6">
        <ProcessTitle processId={process.id} fallback={process.name} />
        <SystemsSummary
          sources={connected}
          destinations={process.destinations}
          onPress={() => show('systems')}
        />
      </div>
      {/* Two slants sharing a seam: the first leans on both sides, the last
          keeps its far side square, parallel to the pane's side and the
          notch's gap in from it. */}
      <Notch className="-mt-control-edge -mr-control-edge -mb-control-edge">
        <Button
          slant="both"
          onPress={() => show('instructions')}
          className="group/instructions"
        >
          <Lab
            aria-hidden
            size={16}
            strokeWidth={1.8}
            className="flex-none -translate-y-px"
          />
          Instructions{' '}
          {/* 20px tall in a 42px face (see --slant-height): 11px above and
              below. The end margin leaves 13px to the slope at mid-height,
              about 12px measured square to it -- the way the notch measures
              its gaps -- so the pill reads as far from the slope as from the
              top and bottom.
              It steps to its hover fill with the face's hover stops -- hover,
              keyboard focus and press, the same three the button uses -- and
              fades on the wash's timing. */}
          <span className="value bg-value-pill text-meta control-wash group-data-[hovered]/instructions:bg-value-pill-hover group-data-[focus-visible]/instructions:bg-value-pill-hover group-data-[pressed]/instructions:bg-value-pill-hover -me-px inline-grid h-5 place-items-center rounded-full px-1.5">
            {version}
          </span>
        </Button>
        <RefineInstructions version={version} slant="left" />
      </Notch>
      <ProcessDrawer
        process={process}
        sources={connected}
        availableSources={available}
        sourceDetails={sourceDetails}
        onRemoveSource={editable ? remove : undefined}
        onConnectSource={editable ? restore : undefined}
        isOpen={open}
        onOpenChange={setOpen}
        tab={tab}
        onTabChange={setTab}
      />
    </header>
  );
}
