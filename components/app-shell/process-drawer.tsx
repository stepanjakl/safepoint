'use client';

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
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
import { cx } from '@/lib/cx';
import type { ProcessSummary } from '@/lib/process/placeholder-process';
import type { SourceDetail } from '@/lib/process/source-details';
import {
  byAttention,
  worstFreshness,
  type SystemLink,
} from '@/lib/process/system-links';
import {
  CLOSE_BUTTON,
  DrawerAside,
  PANEL,
  viewKey,
  type AsideLayer,
  type AsideView,
  type SwapDirection,
} from './drawer-aside';
import {
  InstructionChanges,
  InstructionEditor,
  InstructionsPanel,
} from './instructions-panel';
import { useInstructions } from './instructions-store';
import { useProcessName } from './process-names-store';
import { ProcessSettings } from './process-settings';
import { AddReadSystemPanel } from './source-connections';
import { SourceDetailView } from './source-detail';
import { SystemDisc, SystemMeta } from './system-parts';

export type ProcessDrawerTab = 'instructions' | 'systems' | 'settings';

// A filter field earns its place once the list is longer than a glance takes in.
const FILTER_FROM = 12;
// The Reads heading's Add button, where focus goes after a source is removed.
const ADD_READ_ID = 'add-read-system';

const TAB =
  'control-wash border-rule-default text-muted data-[hovered]:bg-surface-inset data-[hovered]:text-primary data-[focus-visible]:bg-surface-inset data-[focus-visible]:text-primary data-[selected]:bg-surface-selected data-[selected]:border-rule-strong data-[selected]:text-primary inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-meta whitespace-nowrap';

// Both panels are sized against the viewport rather than each other: the
// modal hugs them, so a click beside them lands on the scrim and dismisses.
const MAIN_WIDTH =
  'w-[min(420px,calc(100vw_-_2_*_var(--spacing-shell-inset)))]';

type AsidePanel = Omit<AsideLayer, 'key'>;

/*
  The process's setup: what it is told to do, and what it reads and writes. A
  slide-over rather than a centred dialog: this is reference material read
  alongside the run, not a decision that should block it.

  Two panels. This one, on the right, holds the process; a detail opened from
  it -- a source's records, what a version changed, the editor, adding a
  system -- opens in a second panel on its left (see drawer-aside.tsx). The
  control that opened a detail closes it again; choosing another swaps the
  content in place. Escape closes the side panel first and the drawer second,
  and closing the side panel returns focus to whatever opened it.

  Controlled, because it has two triggers in the header and each opens it on
  its own tab. react-aria drives the transition through data-entering /
  data-exiting; the `drawer-overlay` and `drawer-modal` classes are the hooks
  for the scrim and the slide, both of which stay in CSS.
*/
export function ProcessDrawer({
  process,
  sources,
  availableSources = [],
  sourceDetails = {},
  onRemoveSource,
  onConnectSource,
  isOpen,
  onOpenChange,
  tab,
  onTabChange,
}: {
  process: ProcessSummary;
  // Connected sources only; removed ones arrive as availableSources.
  sources: SystemLink[];
  availableSources?: SystemLink[];
  sourceDetails?: Record<string, SourceDetail>;
  onRemoveSource?: (id: string) => void;
  onConnectSource?: (id: string) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tab: ProcessDrawerTab;
  onTabChange: (tab: ProcessDrawerTab) => void;
}) {
  const { instructions, destinations } = process;
  const { versions, current, next } = useInstructions(process.id, instructions);
  const { name } = useProcessName(process.id, process.name);
  const worst = worstFreshness(sources);
  const run = process.runs.find((entry) => entry.current);

  // The view on show. It stays set while the panel animates out, with
  // `exiting` marking that, so the panel leaves with its content in it.
  const [aside, setAside] = useState<AsideView | null>(null);
  const [exiting, setExiting] = useState(false);
  // The view being swapped out, kept while its content leaves.
  const [leaving, setLeaving] = useState<AsideView | null>(null);
  // Which way the swap travels: towards an item further down its list or
  // back up it.
  const [direction, setDirection] = useState<SwapDirection>('down');
  // What opened the side panel, so closing it puts focus back there. A choice
  // made inside the panel -- paging to another change -- keeps the original.
  const opener = useRef<HTMLElement | null>(null);
  // Where focus returns once a closing panel is gone.
  const returnTo = useRef<HTMLElement | null>(null);

  const finishExit = () => {
    setAside(null);
    setLeaving(null);
    setExiting(false);
  };
  // Focus moved back when the close began. If the panel took it with it on
  // the way out -- it held focus, and unmounting drops focus to the body --
  // put it back once the panel is actually gone.
  useEffect(() => {
    if (aside !== null) return;
    const target = returnTo.current;
    returnTo.current = null;
    const active = document.activeElement;
    if (target?.isConnected && (!active || active === document.body)) {
      target.focus();
    }
  }, [aside]);
  const closeAside = (focusId?: string) => {
    if (aside === null || exiting) return;
    // Where focus goes back to: the element named, or else the drawer control
    // marked as having this panel open -- the opener by definition, and the
    // only reliable one, since some browsers (Safari) do not focus a button on
    // click and the dialog itself holds focus when the drawer first opens.
    // The element focused when the panel opened is the last resort.
    const expanded = document.querySelector<HTMLElement>(
      '.drawer-modal [aria-expanded="true"]',
    );
    const recorded = opener.current?.isConnected ? opener.current : null;
    const target = focusId
      ? document.getElementById(focusId)
      : (expanded ?? recorded);
    opener.current = null;
    returnTo.current = target;
    requestAnimationFrame(() => target?.focus());
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishExit();
      return;
    }
    // DrawerAside unmounts itself through finishExit when its exit has run.
    setLeaving(null);
    setExiting(true);
  };
  const openAside = (view: AsideView) => {
    // The control that opened the panel closes it.
    if (aside && !exiting && viewKey(aside) === viewKey(view)) {
      closeAside();
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest('.drawer-aside')) {
      opener.current = active;
    }
    returnTo.current = null;
    // Swapping one detail for another lets the old content leave while the
    // new one arrives. With reduced motion it is simply replaced: two layers
    // with nothing moving would only overlap.
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    setLeaving(aside && !exiting && !reduce ? aside : null);
    if (aside && !exiting) setDirection(swapDirection(aside, view));
    setExiting(false);
    setAside(view);
  };
  // Leaving the drawer altogether -- for a review item, or by closing it --
  // takes the side panel with it at once; the drawer's own exit animates.
  const closeAll = () => {
    finishExit();
    onOpenChange(false);
  };
  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || aside === null || exiting) return;
    // A dialog centred over both panels answers its own Escape.
    if (document.querySelector('[role=alertdialog]')) return;
    event.stopPropagation();
    closeAside();
  };

  // Where one view sits relative to another in the list it was chosen from:
  // read systems in the order the Systems tab lists them, versions oldest
  // first, as the pager steps through them. Anything else keeps the default.
  function swapDirection(from: AsideView, to: AsideView): SwapDirection {
    const place = (view: AsideView) => {
      if (view.kind === 'source') {
        return [...sources]
          .sort(byAttention)
          .findIndex((source) => source.id === view.id);
      }
      if (view.kind === 'changes') {
        return versions.findIndex((entry) => entry.version === view.version);
      }
      return -1;
    };
    const was = place(from);
    const is = place(to);
    return from.kind === to.kind && was >= 0 && is >= 0 && is < was
      ? 'up'
      : 'down';
  }

  const panel = aside ? asidePanel(aside) : null;
  const leavingPanel =
    leaving && aside && viewKey(leaving) !== viewKey(aside)
      ? asidePanel(leaving)
      : null;

  function asidePanel(view: AsideView): AsidePanel | null {
    switch (view.kind) {
      case 'source': {
        const link = sources.find((source) => source.id === view.id);
        const detail = sourceDetails[view.id];
        if (!link || !detail) return null;
        return {
          eyebrow: 'Read system',
          title: detail.label,
          announce: detail.label,
          leading: <SystemDisc link={link} />,
          meta: <SystemMeta link={link} />,
          body: (
            <SourceDetailView
              detail={detail}
              onNavigate={closeAll}
              onRemove={
                onRemoveSource
                  ? () => {
                      // The source leaves the list with this, so the panel
                      // goes at once rather than animating an empty face.
                      onRemoveSource(view.id);
                      opener.current = null;
                      finishExit();
                      requestAnimationFrame(() =>
                        document.getElementById(ADD_READ_ID)?.focus(),
                      );
                    }
                  : undefined
              }
            />
          ),
        };
      }
      case 'add-source':
        return onConnectSource
          ? {
              eyebrow: 'Read systems',
              title: 'Add a read system',
              announce: 'Add a read system',
              meta: 'A source the agent may read from on its next run.',
              body: (
                <AddReadSystemPanel
                  available={availableSources}
                  details={sourceDetails}
                  onConnect={onConnectSource}
                />
              ),
            }
          : null;
      case 'changes': {
        const index = versions.findIndex(
          (version) => version.version === view.version,
        );
        const to = versions[index];
        const from = index > 0 ? versions[index - 1] : undefined;
        if (!to || !from) return null;
        return {
          eyebrow: 'Instructions',
          title: (
            <>
              What changed in <span className="value">{to.version}</span>
            </>
          ),
          announce: `What changed in ${to.version}`,
          meta: `${to.updatedLabel} · ${to.author}`,
          body: (
            <InstructionChanges
              from={from}
              to={to}
              position={index}
              total={versions.length - 1}
              earlier={index > 1 ? from.version : undefined}
              later={versions[index + 1]?.version}
              onShow={(version) => openAside({ kind: 'changes', version })}
            />
          ),
        };
      }
      case 'edit':
        return {
          eyebrow: 'Instructions',
          title: 'Edit instructions',
          announce: 'Edit instructions',
          meta: (
            <>
              Draft of <span className="value">{next}</span> from{' '}
              <span className="value">{current.version}</span> · saved as you
              type
            </>
          ),
          focusOnOpen: false,
          body: (
            <InstructionEditor process={process} onDone={() => closeAside()} />
          ),
        };
    }
  }

  return (
    // Inset by the shell's own padding so the panels line up with the panes.
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) finishExit();
        onOpenChange(open);
      }}
      isDismissable
      className="drawer-overlay p-shell-inset fixed inset-0 z-40 flex justify-end"
    >
      <Modal className="drawer-modal flex h-full max-w-full">
        <Dialog className="h-full outline-none">
          <div
            className="gap-shell-inset flex h-full justify-end"
            onKeyDownCapture={onKeyDownCapture}
          >
            {aside && panel ? (
              <DrawerAside
                current={{ key: viewKey(aside), ...panel }}
                leaving={
                  leaving && leavingPanel
                    ? { key: viewKey(leaving), ...leavingPanel }
                    : null
                }
                direction={direction}
                exiting={exiting}
                onExited={finishExit}
                onLeft={() => setLeaving(null)}
              />
            ) : null}
            <div
              className={cx(
                PANEL,
                MAIN_WIDTH,
                // Where both do not fit, the side panel takes this one's place.
                panel ? 'max-lg:hidden' : null,
              )}
            >
              <Tabs
                selectedKey={tab}
                onSelectionChange={(key) => {
                  closeAside();
                  onTabChange(key as ProcessDrawerTab);
                }}
                // The column is bounded too: an unsized grid column grows to
                // its widest unwrappable row and pushes the list past the panel.
                className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]"
              >
                <header className="border-rule-faint grid gap-4 border-b p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Heading
                        slot="title"
                        className="text-title [font-weight:550]"
                      >
                        {name}
                      </Heading>
                      <p className="text-meta text-muted">Process setup</p>
                    </div>
                    <AriaButton slot="close" className={CLOSE_BUTTON}>
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
                      <span className="value">{current.version}</span>
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
                            name={
                              worst === 'unavailable' ? 'square' : 'triangle'
                            }
                            size={10}
                          />
                          <span className="sr-only">, some need attention</span>
                        </span>
                      ) : null}
                    </Tab>
                    <Tab id="settings" className={TAB}>
                      Settings
                    </Tab>
                  </TabList>
                </header>
                <TabPanel
                  id="instructions"
                  className="overflow-y-auto outline-none"
                >
                  <InstructionsPanel
                    process={process}
                    policy={Object.values(sourceDetails).find(
                      (detail) => detail.icon === 'policy',
                    )}
                    aside={exiting ? null : aside}
                    onShowChanges={(version) =>
                      openAside({ kind: 'changes', version })
                    }
                    onEdit={() => openAside({ kind: 'edit' })}
                  />
                </TabPanel>
                <TabPanel id="systems" className="overflow-y-auto outline-none">
                  <SystemsList
                    sources={sources}
                    destinations={destinations}
                    details={sourceDetails}
                    runLabel={run?.label}
                    openSourceId={
                      !exiting && aside?.kind === 'source' ? aside.id : null
                    }
                    adding={!exiting && aside?.kind === 'add-source'}
                    onOpenSource={(id) => openAside({ kind: 'source', id })}
                    onAddSource={
                      onConnectSource
                        ? () => openAside({ kind: 'add-source' })
                        : undefined
                    }
                  />
                </TabPanel>
                <TabPanel
                  id="settings"
                  className="overflow-y-auto outline-none"
                >
                  <ProcessSettings process={process} />
                </TabPanel>
              </Tabs>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function SystemsList({
  sources,
  destinations,
  details,
  runLabel,
  openSourceId,
  adding,
  onOpenSource,
  onAddSource,
}: {
  sources: SystemLink[];
  destinations: SystemLink[];
  details: Record<string, SourceDetail>;
  runLabel: string | undefined;
  openSourceId: string | null;
  adding: boolean;
  onOpenSource: (id: string) => void;
  onAddSource?: () => void;
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
        openId={openSourceId}
        onOpen={onOpenSource}
        canOpen={(id) => Boolean(details[id])}
        action={
          onAddSource ? (
            <button
              type="button"
              id={ADD_READ_ID}
              onClick={onAddSource}
              aria-expanded={adding}
              className="control-wash text-muted hover:bg-surface-selected hover:text-primary focus-visible:bg-surface-selected focus-visible:text-primary aria-expanded:bg-surface-selected aria-expanded:text-primary rounded-control text-meta -my-1 inline-flex min-h-7 cursor-pointer items-center gap-1 px-1.5"
            >
              <span aria-hidden="true">+</span> Add
              <span className="sr-only"> a read system</span>
            </button>
          ) : null
        }
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
        {onAddSource
          ? 'Reads open to the records this run used, from the scenario’s files. Adding and removing a read system is a mock saved in this browser; the recorded run and its review don’t change. Writes can’t be changed yet.'
          : 'Connecting, removing or re-authorising a system is not built yet.'}
      </p>
    </div>
  );
}

function SystemRow({ link }: { link: SystemLink }) {
  return (
    <>
      <SystemDisc link={link} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-dense text-primary truncate">{link.label}</span>
        <SystemMeta link={link} />
      </span>
    </>
  );
}

// A row that opens its source: the wash reaches past the row's text by the
// amount it pads back in, so the disc and name stay where a plain row has them.
// aria-expanded holds the selected face while its panel is open.
const ROW_BUTTON =
  'control-wash hover:bg-surface-inset focus-visible:bg-surface-inset aria-expanded:bg-surface-selected rounded-control -mx-2 flex min-h-11 w-[calc(100%+1rem)] cursor-pointer items-center gap-3 px-2 py-2 text-left';

function SystemGroup({
  title,
  meta,
  links,
  count,
  openId = null,
  onOpen,
  canOpen = () => false,
  action,
}: {
  title: string;
  meta?: string;
  links: SystemLink[];
  count: number;
  openId?: string | null;
  onOpen?: (id: string) => void;
  canOpen?: (id: string) => boolean;
  action?: ReactNode;
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
        <div className="flex items-baseline gap-2">
          {meta ? <p className="text-meta text-muted">{meta}</p> : null}
          {action}
        </div>
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
              className="border-rule-faint border-b last:border-b-0"
            >
              {canOpen(link.id) ? (
                <button
                  type="button"
                  id={`system-row-${link.id}`}
                  className={ROW_BUTTON}
                  aria-expanded={openId === link.id}
                  onClick={() => onOpen?.(link.id)}
                >
                  <SystemRow link={link} />
                  <span aria-hidden="true" className="text-muted text-dense">
                    ‹
                  </span>
                </button>
              ) : (
                <div className="flex min-h-11 items-center gap-3 py-2">
                  <SystemRow link={link} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
