'use client';

import ArrowUpRight from 'blode-icons-react/icons/arrow-up-right';
import X from 'blode-icons-react/icons/x';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';

import { AssistantContext } from '@/components/app-shell/assistant/assistant-state';
import { CLOSE_BUTTON } from '@/components/app-shell/drawer-aside';
import { ProcessHeader } from '@/components/app-shell/process/process-header';
import { Button, type Slant } from '@/components/ui/button';
import { FilterTabs, type FilterTab } from '@/components/ui/filter-tabs';
import { RunStatusIcon } from '@/components/ui/run-status-icon';
import { Switch } from '@/components/ui/switch';
import {
  RUN_STATUS_LABELS,
  type ProcessSummary,
  type RunStatus,
} from '@/lib/process/model';
import type { SystemLink } from '@/lib/process/system-links';

import { Pin, type PinnedState } from './pin';

const STATES: { label: string; state?: PinnedState }[] = [
  { label: 'Rest' },
  { label: 'Hovered', state: 'hovered' },
  { label: 'Keyboard focus', state: 'focus-visible' },
  { label: 'Pressed', state: 'pressed' },
];

const HEADING = 'text-title font-semibold';
const LABEL = 'text-micro text-muted';
const GRID =
  'grid grid-cols-[8rem_repeat(5,minmax(0,1fr))] items-center gap-x-4 gap-y-3';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3" aria-label={title}>
      <h2 className={HEADING}>{title}</h2>
      {children}
    </section>
  );
}

/* One row: a name, then the control in every state, and disabled last. */
function StateRow({
  name,
  render,
}: {
  name: string;
  render: (disabled: boolean) => ReactNode;
}) {
  return (
    <>
      <span className={LABEL}>{name}</span>
      {STATES.map(({ label, state }) => (
        <Pin key={label} state={state}>
          {render(false)}
        </Pin>
      ))}
      <Pin>{render(true)}</Pin>
    </>
  );
}

function StateHeadings() {
  return (
    <>
      <span />
      {[...STATES.map(({ label }) => label), 'Disabled'].map((label) => (
        <span key={label} className={LABEL}>
          {label}
        </span>
      ))}
    </>
  );
}

const REVIEW_TABS: FilterTab[] = [
  { key: 'all', short: 'All', label: 'All items', count: 24 },
  { key: 'blocked', short: 'Blocked', label: 'Blocked', count: 3, severity: 0 },
  {
    key: 'decision',
    short: 'Decision',
    label: 'Needs a decision',
    count: 5,
    severity: 1,
  },
  {
    key: 'deferred',
    short: 'Deferred',
    label: 'Deferred',
    count: 0,
    severity: 2,
  },
  { key: 'ready', short: 'Ready', label: 'Ready', count: 14, severity: 3 },
];
const PLAIN_TABS: FilterTab[] = [
  { key: 'text', short: 'Text', label: 'Text' },
  { key: 'changes', short: '3 changes', label: '3 changes' },
];
const RECORD_TABS: FilterTab[] = [
  { key: 'all', short: 'All', label: 'All records', count: 120 },
  {
    key: 'differ',
    short: 'Don’t match',
    label: 'Records that don’t match',
    count: 4,
    severity: 0,
  },
];
const DATA_TABS: FilterTab[] = ['Orders', 'Menu', 'Staff', 'Shifts'].map(
  (name) => ({
    key: name.toLowerCase(),
    short: name,
    label: name,
    count: 12,
  }),
);

/* A strip held at one choice; the gallery never changes it. */
function Strip({
  tabs,
  selected,
  ...rest
}: Omit<React.ComponentProps<typeof FilterTabs>, 'onChange' | 'selected'> & {
  selected: string;
}) {
  return (
    <FilterTabs {...rest} tabs={tabs} selected={selected} onChange={() => {}} />
  );
}

/* A strip that keeps its own choice, so the slide, the hover faces and the
   keyboard can be tried for real. */
function LiveStrip({
  tabs,
  initial,
  ...rest
}: Omit<ComponentProps<typeof FilterTabs>, 'onChange' | 'selected'> & {
  initial: string;
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <FilterTabs
      {...rest}
      tabs={tabs}
      selected={selected}
      onChange={setSelected}
    />
  );
}

const SURFACES = [
  ['Canvas', 'bg-canvas rounded-shell'],
  ['Primary', 'control-face surface-raised rounded-shell'],
  ['Floating', 'control-face surface-floating rounded-shell'],
] as const;

const SLANTS: (Slant | undefined)[] = [undefined, 'left', 'right'];

export function ControlsGallery({
  process,
  inputs,
}: {
  process: ProcessSummary;
  inputs: SystemLink[];
}) {
  // The header's Assistant expects the shell's state; a closed one is enough
  // to draw it.
  const opener = useRef<HTMLButtonElement>(null);
  const assistant = {
    id: 'gallery-assistant',
    open: false,
    toggle: () => {},
    close: () => {},
    ask: () => {},
    opener,
  };
  return (
    <>
      <Section title="Button">
        <div className={GRID}>
          <StateHeadings />
          {(['primary', 'secondary'] as const).flatMap((variant) =>
            SLANTS.map((slant) => (
              <StateRow
                key={`${variant}${slant}`}
                name={`${variant}${slant ? ` · slant ${slant}` : ''}`}
                render={(disabled) => (
                  <Button variant={variant} slant={slant} isDisabled={disabled}>
                    Review release
                  </Button>
                )}
              />
            )),
          )}
        </div>
      </Section>

      <Section title="Filter tabs, live">
        <p className={LABEL}>
          Working strips, one set on each surface: choose, hover, tab and use
          the arrow keys.
        </p>
        <div className="grid max-w-xl gap-4">
          {SURFACES.map(([name, face]) => (
            <div
              key={name}
              data-surface={name.toLowerCase()}
              className={`${face} grid content-start gap-3 p-6`}
            >
              <span className={LABEL}>{name}</span>
              <div data-strip="default" className="contents">
                <LiveStrip tabs={REVIEW_TABS} initial="all" numberShortcuts />
              </div>
              <div data-strip="spied" className="contents">
                <LiveStrip
                  tabs={REVIEW_TABS}
                  initial="all"
                  spied="decision"
                  scrolling
                />
              </div>
              <div data-strip="narrow" className="w-72">
                <LiveStrip tabs={REVIEW_TABS} initial="decision" />
              </div>
              <div data-strip="small" className="contents">
                <LiveStrip size="small" tabs={REVIEW_TABS} initial="blocked" />
              </div>
              <div data-strip="records" className="contents">
                <LiveStrip size="small" tabs={RECORD_TABS} initial="all" />
              </div>
              <div data-strip="plain" className="contents">
                <LiveStrip
                  className="w-fit"
                  tabs={PLAIN_TABS}
                  initial="text"
                  leadKey={null}
                />
              </div>
              <div data-strip="data" className="contents">
                <LiveStrip tabs={DATA_TABS} initial="orders" leadKey={null} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Filter tabs">
        <p className={LABEL}>
          Each choice in turn, then the states a tab can be pinned in, then the
          other faces the strip takes.
        </p>
        <div className="grid max-w-xl gap-3">
          <span className={LABEL}>
            Severity buckets · default size · each choice
          </span>
          {REVIEW_TABS.map((tab) => (
            <Strip
              key={tab.key}
              tabs={REVIEW_TABS}
              selected={tab.key}
              numberShortcuts
            />
          ))}
          <span className={LABEL}>Small · each choice</span>
          {REVIEW_TABS.map((tab) => (
            <Strip
              key={tab.key}
              size="small"
              tabs={REVIEW_TABS}
              selected={tab.key}
            />
          ))}
          <span className={LABEL}>
            Group at the top of a scrolled list (spied)
          </span>
          <Strip tabs={REVIEW_TABS} selected="all" spied="decision" scrolling />
          <span className={LABEL}>Narrow · the rest move into a menu</span>
          <div className="w-72">
            <Strip tabs={REVIEW_TABS} selected="decision" />
          </div>
          <span className={LABEL}>Without counts · fitted to content</span>
          {PLAIN_TABS.map((tab) => (
            <Strip
              key={tab.key}
              className="w-fit"
              tabs={PLAIN_TABS}
              selected={tab.key}
              leadKey={null}
            />
          ))}
          <span className={LABEL}>Two buckets · small, beside a result</span>
          {RECORD_TABS.map((tab) => (
            <Strip
              key={tab.key}
              size="small"
              tabs={RECORD_TABS}
              selected={tab.key}
            />
          ))}
          <span className={LABEL}>Neutral counts · no lead tab</span>
          <Strip tabs={DATA_TABS} selected="menu" leadKey={null} />
        </div>
        <div className="grid max-w-xl gap-3">
          {STATES.filter(({ state }) => state).map(({ label, state }) => (
            <div key={label} className="grid gap-1">
              <span className={LABEL}>{label} · every tab not chosen</span>
              <Pin
                state={state}
                selector="[data-review-filter]:not([data-selected])"
              >
                <Strip tabs={REVIEW_TABS} selected="decision" />
              </Pin>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Switch">
        <div className={GRID}>
          <StateHeadings />
          {[false, true].map((selected) => (
            <StateRow
              key={String(selected)}
              name={selected ? 'on' : 'off'}
              render={(disabled) => (
                <Switch isSelected={selected} isDisabled={disabled}>
                  Notify
                </Switch>
              )}
            />
          ))}
        </div>
      </Section>

      <Section title="Field">
        <div className={GRID}>
          <StateHeadings />
          {['', 'Promotion'].map((value) => (
            <StateRow
              key={value}
              name={value ? 'holding a value' : 'empty'}
              render={(disabled) => (
                <input
                  aria-label="Filter"
                  placeholder="Filter inputs"
                  defaultValue={value}
                  disabled={disabled}
                  className="field text-dense text-primary min-h-9 w-full px-3"
                />
              )}
            />
          ))}
        </div>
      </Section>

      <Section title="Thread reference">
        <div className={GRID}>
          <StateHeadings />
          <StateRow
            name="opens a tab"
            render={(disabled) => (
              // The pill's size is a thread measure, so it is drawn in one.
              <div className="thread">
                <span className="thread-step-facts">
                  <button
                    type="button"
                    className="thread-step-link"
                    disabled={disabled}
                  >
                    Instructions v4
                    <ArrowUpRight
                      aria-hidden
                      size={12}
                      strokeWidth={2.5}
                      className="flex-none"
                    />
                  </button>
                </span>
              </div>
            )}
          />
        </div>
      </Section>

      <Section title="Drawer close">
        <div className={GRID}>
          <StateHeadings />
          <StateRow
            name="close"
            render={(disabled) => (
              <AriaButton className={CLOSE_BUTTON} isDisabled={disabled}>
                <X aria-hidden size={18} className="size-3.5 flex-none" />
                <span className="sr-only">Close</span>
              </AriaButton>
            )}
          />
        </div>
      </Section>

      <AssistantContext value={assistant}>
        <Section title="Process header">
          <p className={LABEL}>
            Every control in the header at once; the last row has the Inputs tab
            open, so Inputs wears the selected face.
          </p>
          <div className="grid gap-4">
            {STATES.map(({ label, state }) => (
              <div key={label} className="grid gap-1">
                <span className={LABEL}>{label}</span>
                <Pin state={state} selector="button">
                  <ProcessHeader
                    process={process}
                    version={process.instructions.version}
                    inputs={inputs}
                    outputs={process.outputs}
                    tab="runs"
                    onTabChange={() => {}}
                  />
                </Pin>
              </div>
            ))}
            <div className="grid gap-1">
              <span className={LABEL}>Inputs open</span>
              <Pin>
                <ProcessHeader
                  process={process}
                  version={process.instructions.version}
                  inputs={inputs}
                  outputs={process.outputs}
                  tab="inputs"
                  onTabChange={() => {}}
                />
              </Pin>
            </div>
          </div>
        </Section>
      </AssistantContext>

      <Section title="Run status">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {(Object.keys(RUN_STATUS_LABELS) as RunStatus[]).map((status) => (
            <span
              key={status}
              className="text-meta inline-flex items-center gap-2"
            >
              <RunStatusIcon status={status} />
              {RUN_STATUS_LABELS[status]}
            </span>
          ))}
        </div>
      </Section>
    </>
  );
}
