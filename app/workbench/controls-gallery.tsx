'use client';

import ArrowUpRight from 'blode-icons-react/icons/arrow-up-right';
import X from 'blode-icons-react/icons/x';
import { useRef, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';

import { AssistantContext } from '@/components/app-shell/assistant/assistant-state';
import { CLOSE_BUTTON } from '@/components/app-shell/drawer-aside';
import { ProcessHeader } from '@/components/app-shell/process/process-header';
import { Button, type Slant } from '@/components/ui/button';
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
