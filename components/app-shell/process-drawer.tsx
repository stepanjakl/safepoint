'use client';

import { useState } from 'react';
import {
  Button as AriaButton,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from 'react-aria-components';
// Deep import: Blode's barrel is the whole icon library.
import X from 'blode-icons-react/icons/x';
import { Glyph } from '@/components/ui/glyph';
import type { ProcessSummary } from '@/lib/process/placeholder-process';
import {
  byAttention,
  worstFreshness,
  type SystemLink,
} from '@/lib/process/system-links';
import { SystemDisc, SystemMeta } from './system-parts';

export type ProcessDrawerTab = 'instructions' | 'systems';

// A filter field earns its place once the list is longer than a glance takes in.
const FILTER_FROM = 12;

const TAB =
  'control-wash border-rule-default text-muted data-[hovered]:bg-surface-inset data-[hovered]:text-primary data-[focus-visible]:bg-surface-inset data-[focus-visible]:text-primary data-[selected]:bg-surface-selected data-[selected]:border-rule-strong data-[selected]:text-primary inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-meta whitespace-nowrap';

/*
  The process's setup: what it is told to do, and what it reads and writes. A
  slide-over rather than a centred dialog: this is reference material read
  alongside the run, not a decision that should block it. A centred modal is
  kept for what would block -- connecting or re-authorising a system, when
  that exists.

  Controlled, because it has two triggers in the header and each opens it on
  its own tab. react-aria drives the transition through data-entering /
  data-exiting; the `drawer-overlay` and `drawer-modal` classes are the hooks
  for the scrim and the slide, both of which stay in CSS.
*/
export function ProcessDrawer({
  process,
  sources,
  isOpen,
  onOpenChange,
  tab,
  onTabChange,
}: {
  process: ProcessSummary;
  sources: SystemLink[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tab: ProcessDrawerTab;
  onTabChange: (tab: ProcessDrawerTab) => void;
}) {
  const { instructions, destinations } = process;
  const worst = worstFreshness(sources);
  const run = process.runs.find((entry) => entry.current);

  return (
    // Inset by the shell's own padding so the panel lines up with the panes.
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="drawer-overlay p-shell-inset fixed inset-0 z-40 flex justify-end"
    >
      <Modal className="drawer-modal control-face surface-floating rounded-shell relative h-full w-[min(420px,100%)] overflow-clip max-sm:w-full">
        <Dialog className="h-full outline-none">
          <Tabs
            selectedKey={tab}
            onSelectionChange={(key) => onTabChange(key as ProcessDrawerTab)}
            // The column is bounded too: an unsized grid column grows to its
            // widest unwrappable row and pushes the list past the panel.
            className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]"
          >
            <header className="border-rule-faint grid gap-4 border-b p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Heading
                    slot="title"
                    className="text-title [font-weight:550]"
                  >
                    {process.name}
                  </Heading>
                  <p className="text-meta text-muted">Process setup</p>
                </div>
                <AriaButton
                  slot="close"
                  // The notch buttons' quiet face, on a round shape. The glyph
                  // rests muted and steps to primary with the face. No
                  // transition utility: control-face owns the timing, and its
                  // transition already names color.
                  className="control-face control-hairline control-quiet text-muted-strong data-[hovered]:control-quiet-hover data-[hovered]:text-primary data-[focus-visible]:control-quiet-hover data-[focus-visible]:text-primary data-[pressed]:control-quiet-hover data-[pressed]:text-primary grid size-8 flex-none cursor-pointer place-items-center rounded-full"
                >
                  <X
                    aria-hidden
                    size={18}
                    strokeWidth={2.2}
                    className="size-3.5 flex-none"
                  />
                  <span className="sr-only">Close process setup</span>
                </AriaButton>
              </div>
              <TabList aria-label="Process setup" className="flex gap-1.5">
                <Tab id="instructions" className={TAB}>
                  Instructions{' '}
                  <span className="value">{instructions.version}</span>
                </Tab>
                <Tab id="systems" className={TAB}>
                  Systems{' '}
                  <span className="value">
                    {sources.length + destinations.length}
                  </span>
                  {worst ? (
                    <span
                      className="text-state-caution data-[freshness=unavailable]:text-state-blocked inline-flex"
                      data-freshness={worst}
                    >
                      <Glyph
                        name={worst === 'unavailable' ? 'square' : 'triangle'}
                        size={10}
                      />
                      <span className="sr-only">, some need attention</span>
                    </span>
                  ) : null}
                </Tab>
              </TabList>
            </header>
            <TabPanel
              id="instructions"
              className="overflow-y-auto p-5 outline-none"
            >
              <p className="text-meta text-muted mb-4">
                <span className="value">{instructions.version}</span> ·{' '}
                {instructions.updatedAt}
              </p>
              <ol className="marker:text-muted text-dense grid list-decimal gap-3 pl-4.5 leading-relaxed">
                {instructions.body.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
              <p className="border-rule-faint text-muted text-meta mt-5 border-t pt-3">
                Placeholder text. The engine does not yet publish the
                instructions it ran under.
              </p>
            </TabPanel>
            <TabPanel id="systems" className="overflow-y-auto outline-none">
              <SystemsList
                sources={sources}
                destinations={destinations}
                runLabel={run?.label}
              />
            </TabPanel>
          </Tabs>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function SystemsList({
  sources,
  destinations,
  runLabel,
}: {
  sources: SystemLink[];
  destinations: SystemLink[];
  runLabel: string | undefined;
}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const matches = (link: SystemLink) =>
    link.label.toLocaleLowerCase().includes(needle);
  const reads = [...sources].sort(byAttention).filter(matches);
  const writes = destinations.filter(matches);
  const total = sources.length + destinations.length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 p-5">
      {total > FILTER_FROM ? (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter systems"
          aria-label="Filter systems"
          className="text-dense text-primary placeholder:text-muted border-rule-default bg-surface-inset rounded-control min-h-9 w-full border px-3"
        />
      ) : null}
      {/* Freshness is a fact about a read, so the list says which read. */}
      <SystemGroup
        title="Reads"
        meta={runLabel ? `As read by the run of ${runLabel}` : undefined}
        links={reads}
        count={sources.length}
      />
      <SystemGroup
        title="Writes"
        meta="What each connection can do"
        links={writes}
        count={destinations.length}
      />
      {needle && reads.length + writes.length === 0 ? (
        <p className="text-dense text-muted">No systems match “{query}”.</p>
      ) : null}
      <p className="border-rule-faint text-muted text-meta border-t pt-3">
        Placeholder. Connecting, removing or re-authorising a system is not
        built yet.
      </p>
    </div>
  );
}

function SystemGroup({
  title,
  meta,
  links,
  count,
}: {
  title: string;
  meta?: string;
  links: SystemLink[];
  count: number;
}) {
  // A group the filter has emptied disappears; one that was always empty says
  // so, because "reads nothing" is itself worth knowing.
  if (links.length === 0 && count > 0) return null;
  const headingId = `systems-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between gap-3 pb-1.5">
        <h3 id={headingId} className="readout text-muted">
          {title} <span className="value">{count}</span>
        </h3>
        {meta ? <p className="text-meta text-muted">{meta}</p> : null}
      </div>
      {links.length === 0 ? (
        <p className="text-dense text-muted py-2">None.</p>
      ) : (
        <ul>
          {links.map((link) => (
            // Name above its state rather than beside it: source names and
            // freshness labels are both long, and side by side one of them
            // is always the one cut short.
            <li
              key={link.id}
              className="border-rule-faint flex min-h-11 items-center gap-3 border-b py-2 last:border-b-0"
            >
              <SystemDisc link={link} />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-dense text-primary truncate">
                  {link.label}
                </span>
                <SystemMeta link={link} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
