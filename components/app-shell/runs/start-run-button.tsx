'use client';

import { useId, useRef, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';
// Deep import: Blode's barrel is the whole icon library.
import BoltFilled from 'blode-icons-react/icons/bolt-filled';
import ChevronDown from 'blode-icons-react/icons/chevron-down';
import Play from 'blode-icons-react/icons/play';
import { HeadIconButton } from '@/components/app-shell/head-icon-button';
import { useWalkthrough } from '@/components/app-shell/walkthrough';
import {
  useAgentationPopoverDismiss,
  useAgentationPopoverProps,
} from '@/components/dev/agentation-popover';
import { Button } from '@/components/ui/button';
import { useScreenSettled } from '@/components/ui/screen-settled';
import { Select } from '@/components/ui/select';
import { WalkthroughHint } from '@/components/ui/walkthrough-hint';
import { useTRPC } from '@/components/trpc/provider';
import {
  availableModelPlan,
  DRAFTING_MODELS,
  isTrialModel,
  modelPlanLabel,
  modelPlanSchema,
  type ModelPlan,
} from '@/lib/models';
import { useRunSelection } from './run-selection';

/*
  Starts a run by hand, from the runs header: the other way a run begins, so it
  sits where the list of them does. Both buttons sit in one pill, lightly washed
  at rest. Each answers its own pointer: the start button brings the pill's
  wash up, the chevron its own circle, and an open note looks as the pointer
  left it. One press starts it under the current instructions; the chevron
  beside it opens a note for this run alone first.
*/
export function StartRunButton() {
  const selection = useRunSelection();
  const walkthrough = useWalkthrough();
  const screenSettled = useScreenSettled();
  const hintId = useId();
  const [noteOpen, setNoteOpen] = useState(false);
  // The tooltips of both buttons stand over the pill, not over their own icon.
  const pill = useRef<HTMLSpanElement>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  if (!selection) return null;
  const { start, startMock, cannotStart, starting, selected } = selection;
  const showHint =
    walkthrough?.step === 'start-run' &&
    screenSettled &&
    !noteOpen &&
    !selected &&
    Boolean(start || startMock);
  const startAndAdvance = start
    ? async (note?: string, modelPlan?: ModelPlan) => {
        walkthrough?.advance('start-run');
        return start(note, modelPlan);
      }
    : null;
  const startMockAndAdvance = startMock
    ? (note?: string) => {
        walkthrough?.advance('start-run');
        return startMock(note);
      }
    : null;
  const handleNoteOpenChange = (nextOpen: boolean) => {
    if (nextOpen) walkthrough?.advance('start-run');
    setNoteOpen(nextOpen);
  };
  return (
    <>
      <span
        ref={pill}
        className={`control-wash bg-surface-hover -my-1 flex h-7 items-center rounded-full p-0.5 ${
          start
            ? 'has-[[data-leads]:hover]:bg-surface-hover-strong has-[button:focus-visible]:bg-surface-selected'
            : ''
        }`}
      >
        <HeadIconButton
          ref={startButtonRef}
          label="Start run"
          descriptionId={showHint ? hintId : undefined}
          tooltip={{
            label: 'Start run',
            description:
              cannotStart ?? 'Runs now, under the current instructions.',
            placement: 'right',
            triggerRef: pill,
            isDisabled: showHint,
          }}
          size="in-pill"
          wash="none"
          leads
          unavailable={!start}
          onPress={startAndAdvance ? () => void startAndAdvance() : undefined}
        >
          <Play aria-hidden size={14} strokeWidth={1.8} />
        </HeadIconButton>
        <InstructionsPopover
          start={startAndAdvance}
          startMock={startMockAndAdvance}
          cannotStart={cannotStart}
          pill={pill}
          open={noteOpen}
          onOpenChange={handleNoteOpenChange}
          tooltipDisabled={showHint}
        />
        <span role="status" className="sr-only">
          {starting ? 'Starting the run…' : ''}
        </span>
      </span>
      <WalkthroughHint
        isOpen={showHint}
        step="start-run"
        title="Start a run"
        descriptionId={hintId}
        targetRef={pill}
        focusRef={startButtonRef}
        onDismiss={() => walkthrough?.dismiss()}
        onInteractOutside={() => walkthrough?.advance('start-run')}
      >
        Start a run to generate a proposal, or open the arrow menu to choose its
        models or try a mock run.
      </WalkthroughHint>
    </>
  );
}

function InstructionsPopover({
  start,
  startMock,
  cannotStart,
  pill,
  open,
  onOpenChange,
  tooltipDisabled,
}: {
  start:
    ((instructions?: string, modelPlan?: ModelPlan) => Promise<boolean>) | null;
  startMock: ((instructions?: string) => boolean) | null;
  cannotStart: string | null;
  pill: RefObject<HTMLSpanElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tooltipDisabled: boolean;
}) {
  const [text, setText] = useState('');
  const [modelPlan, setModelPlan] = useState<ModelPlan | ''>('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const canOpen = Boolean(start || startMock);
  const popoverProps = useAgentationPopoverProps(pill);
  useAgentationPopoverDismiss(
    open && canOpen,
    () => onOpenChange(false),
    popoverRef,
    pill,
  );
  return (
    <DialogTrigger isOpen={open && canOpen} onOpenChange={onOpenChange}>
      <HeadIconButton
        label="Start run with a note"
        tooltip={{
          label: 'Run options',
          description:
            cannotStart ??
            'Choose the models and add an optional note for this run.',
          placement: 'right',
          triggerRef: pill,
          isDisabled: open || tooltipDisabled,
        }}
        size="in-pill-small"
        wash="strong"
        unavailable={!canOpen}
      >
        <ChevronDown aria-hidden size={12} strokeWidth={1.8} />
      </HeadIconButton>
      <Popover
        ref={popoverRef}
        // From the pill's left edge, over the thread, not from the chevron.
        triggerRef={pill}
        placement="bottom start"
        offset={6}
        className="popover-motion control-face surface-popover rounded-shell w-80 max-w-[calc(100dvw_-_2rem)]"
        {...popoverProps}
      >
        <Dialog className="p-3 outline-none">
          {({ close }) => (
            <form
              className="grid grid-cols-1 gap-2.5"
              onSubmit={(event) => {
                event.preventDefault();
                const note = text.trim();
                close();
                // The note is kept until the run is: a refused start leaves
                // it to try again.
                void start?.(note, modelPlan || 'gemini').then((started) => {
                  if (started) {
                    setText('');
                    setModelPlan('');
                  }
                });
              }}
            >
              <Heading slot="title" className="text-dense font-medium">
                Start with a note
              </Heading>
              <textarea
                autoFocus
                aria-label="Note for this run"
                name="additionalInstructions"
                autoComplete="off"
                rows={4}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="What should this run focus on?…"
                className="field text-body text-primary w-full resize-y px-3 py-2"
              />
              {start ? (
                <RunModelSelect modelPlan={modelPlan} onChange={setModelPlan} />
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {startMock ? (
                  <Button
                    size="small"
                    className="me-auto"
                    onPress={() => {
                      const note = text.trim();
                      close();
                      if (startMock(note)) setText('');
                    }}
                  >
                    <BoltFilled aria-hidden size={13} className="flex-none" />
                    Start mock run
                  </Button>
                ) : null}
                <Button size="small" onPress={close}>
                  Cancel
                </Button>
                <Button
                  size="small"
                  type="submit"
                  variant="primary"
                  isDisabled={!start}
                >
                  Start run
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

const GEMINI_MODELS = DRAFTING_MODELS.filter((id) => !isTrialModel(id));

function RunModelSelect({
  modelPlan,
  onChange,
}: {
  modelPlan: ModelPlan | '';
  onChange: (modelPlan: ModelPlan) => void;
}) {
  const trpc = useTRPC();
  const available =
    useQuery(
      trpc.modelLimits.available.queryOptions(undefined, {
        staleTime: Infinity,
      }),
    ).data ?? GEMINI_MODELS;
  const fleets = (['gemini', 'groq', 'openrouter'] as const).filter((plan) =>
    availableModelPlan(plan, available),
  );
  return (
    <Select
      value={modelPlan}
      aria-label="Models for this run"
      className="min-w-0"
      onChange={(event) => {
        const picked = modelPlanSchema.safeParse(event.target.value);
        if (picked.success) onChange(picked.data);
      }}
    >
      <option value="" disabled>
        Models for this run
      </option>
      <optgroup label="Provider fleets">
        {fleets.map((plan) => (
          <option key={plan} value={plan}>
            {modelPlanLabel(plan)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Start with a specific model">
        {available.map((model) => (
          <option key={model} value={model}>
            {modelPlanLabel(model)}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}
