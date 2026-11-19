'use client';

import { useId, useRef, useState, type RefObject } from 'react';
import { Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';
// Deep import: Blode's barrel is the whole icon library.
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
import { WalkthroughHint } from '@/components/ui/walkthrough-hint';
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
    ? async (note?: string) => {
        walkthrough?.advance('start-run');
        return start(note);
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
        Start a run to generate a proposal, or open the arrow menu to try a mock
        run.
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
  start: ((instructions?: string) => Promise<boolean>) | null;
  startMock: ((instructions?: string) => boolean) | null;
  cannotStart: string | null;
  pill: RefObject<HTMLSpanElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tooltipDisabled: boolean;
}) {
  const [text, setText] = useState('');
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
          label: 'Start with a note',
          description:
            cannotStart ?? 'Add a note for this run before it starts.',
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
        className="popover-motion control-face surface-popover rounded-shell w-[min(20rem,calc(100vw-2rem))]"
        {...popoverProps}
      >
        <Dialog className="p-3 outline-none">
          {({ close }) => (
            <form
              className="grid gap-2.5"
              onSubmit={(event) => {
                event.preventDefault();
                const note = text.trim();
                close();
                // The note is kept until the run is: a refused start leaves
                // it to try again.
                void start?.(note).then((started) => {
                  if (started) setText('');
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
