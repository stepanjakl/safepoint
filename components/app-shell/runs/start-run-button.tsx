'use client';

import { useRef, useState, type RefObject } from 'react';
import { Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';
// Deep import: Blode's barrel is the whole icon library.
import ChevronDown from 'blode-icons-react/icons/chevron-down';
import Play from 'blode-icons-react/icons/play';
import { HeadIconButton } from '@/components/app-shell/head-icon-button';
import { Button } from '@/components/ui/button';
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
  // The tooltips of both buttons stand over the pill, not over their own icon.
  const pill = useRef<HTMLSpanElement>(null);
  if (!selection) return null;
  const { start, cannotStart } = selection;
  return (
    <span
      ref={pill}
      className={`control-wash bg-surface-hover -my-1 flex h-7 items-center rounded-full p-0.5 ${
        start
          ? 'has-[[data-leads]:hover]:bg-surface-hover-strong has-[button:focus-visible]:bg-surface-selected'
          : ''
      }`}
    >
      <HeadIconButton
        label="Start run"
        tooltip={{
          label: 'Start run',
          description:
            cannotStart ?? 'Runs now, under the current instructions.',
          placement: 'right',
          triggerRef: pill,
        }}
        size="in-pill"
        wash="none"
        leads
        unavailable={!start}
        onPress={start ? () => start() : undefined}
      >
        <Play aria-hidden size={14} strokeWidth={1.8} />
      </HeadIconButton>
      <InstructionsPopover
        start={start}
        cannotStart={cannotStart}
        pill={pill}
      />
    </span>
  );
}

function InstructionsPopover({
  start,
  cannotStart,
  pill,
}: {
  start: ((instructions?: string) => void) | null;
  cannotStart: string | null;
  pill: RefObject<HTMLSpanElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  return (
    <DialogTrigger isOpen={open && !!start} onOpenChange={setOpen}>
      <HeadIconButton
        label="Start run with instructions"
        tooltip={{
          label: 'Start with instructions',
          description:
            cannotStart ?? 'Add a note for this run before it starts.',
          placement: 'right',
          triggerRef: pill,
        }}
        size="in-pill-small"
        wash="strong"
        unavailable={!start}
        onPress={() => setOpen(true)}
      >
        <ChevronDown aria-hidden size={12} strokeWidth={1.8} />
      </HeadIconButton>
      <Popover
        // From the pill's left edge, over the thread, not from the chevron.
        triggerRef={pill}
        placement="bottom start"
        offset={6}
        className="popover-motion control-face surface-popover rounded-shell w-[min(20rem,calc(100vw-2rem))]"
      >
        <Dialog className="grid gap-3 p-4 outline-none">
          {({ close }) => (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const note = text.trim();
                setText('');
                close();
                start?.(note);
              }}
            >
              <Heading slot="title" className="text-dense font-medium">
                Start with instructions
              </Heading>
              <label className="grid gap-1.5">
                <span className="text-meta text-muted">
                  Additional instructions for this run · Optional
                </span>
                <textarea
                  autoFocus
                  name="additionalInstructions"
                  autoComplete="off"
                  rows={4}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="What should this run focus on?…"
                  className="field text-body text-primary w-full resize-y px-3 py-2"
                />
              </label>
              <p className="text-meta text-muted leading-normal">
                Applies to this run only; the process instructions stay as they
                are. Saved with the run, not applied to execution yet.
              </p>
              <div className="flex justify-end gap-2">
                <Button onPress={close}>Cancel</Button>
                <Button type="submit" variant="primary">
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
