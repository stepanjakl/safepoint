'use client';

import { motion, useReducedMotion } from 'motion/react';
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import { RunThread } from '@/components/app-shell/thread/run-thread';
import { ThreadPage } from '@/components/app-shell/thread/thread-page';
import { Button } from '@/components/ui/button';
import { useSwap } from '@/components/ui/swap';
import { KeyHint } from '@/components/ui/key-hint';
import { StateIllustration } from '@/components/ui/state-illustration';
import { Tooltip } from '@/components/ui/tooltip';
import { EASE_OUT_EMPHASIZED } from '@/lib/motion';
import type { ProcessSummary } from '@/lib/process/model';
import { runDay, runTime } from '@/lib/process/run-time';
import { RunSelectionProvider, useRunSelection } from './run-selection';
import { RunInstructionsPreview } from './run-instructions-preview';

// What a started run is drawn from: the recorded run's evidence and plan.
export type PlayableRun = Omit<
  ComponentProps<typeof RunThread>,
  | 'stage'
  | 'requestLabel'
  | 'initialItemId'
  | 'look'
  | 'trigger'
  | 'instructionsVersion'
>;

/*
  The page beside the rail: the run the rail has chosen, or the empty page.
  Only the current run has a recorded thread, which the server builds and
  hands in; a started run is drawn here, stage by stage, from the same data.

  A change of run swaps content within the fixed thread column. The page fades
  in place so its internal rules never move with the selection.
*/
// The empty page's key: no run.
const NONE = '';

export function RunView({
  process,
  recorded,
  playable,
  liveThread,
}: {
  process: ProcessSummary;
  recorded: ReactNode;
  playable?: PlayableRun;
  // A live run's thread, drawn for whichever live run is chosen; it reads
  // the run from the selection.
  liveThread?: ReactNode;
}) {
  const selection = useRunSelection();
  const view = useRef<HTMLDivElement>(null);
  // A run with nothing to draw shows the empty page, the same page as no run:
  // choosing it is not a change of page, so it must not fade out and back in.
  const keyOf = (id: string) =>
    id &&
    (id === process.runs.find((run) => run.current)?.id ||
      (selection?.live && liveThread && id === selection.live.run.id) ||
      (selection?.started && playable && id === selection.started.run.id))
      ? id
      : NONE;
  const target = keyOf(selection?.selected ?? NONE);
  const { shown, entering, layer } = useSwap(target, () => 'fade');
  // The outgoing thread and its consumers keep the selection they were drawn
  // from until the fade ends; the rail already reflects the new selection.
  const [shownSelection, setShownSelection] = useState(selection);
  if (shown === target && shownSelection !== selection)
    setShownSelection(selection);
  const pageSelection = shown === target ? selection : shownSelection;
  const runs = pageSelection?.runs ?? process.runs;

  // A new page starts at its top, once the old one has gone.
  useEffect(() => {
    const scroller = view.current?.parentElement;
    if (scroller) scroller.scrollTop = 0;
  }, [shown]);

  const page = (id: string): ReactNode => {
    if (id && id === process.runs.find((run) => run.current)?.id)
      return recorded;
    const live = pageSelection?.live;
    if (live && liveThread && id === live.run.id) {
      const at = live.run.startedAt;
      return (
        <ThreadPage label={`Run, ${runDay(at)} · ${runTime(at)}`}>
          {typeof live.data.additionalInstructions === 'string' ? (
            <RunInstructionsPreview
              instructions={live.data.additionalInstructions}
            />
          ) : null}
          {liveThread}
        </ThreadPage>
      );
    }
    const started = pageSelection?.started;
    if (started && playable && id === started.run.id) {
      const at = started.run.startedAt;
      return (
        <ThreadPage label={`Run, ${runDay(at)} · ${runTime(at)}`}>
          <RunInstructionsPreview
            instructions={started.additionalInstructions}
          />
          <RunThread
            key={started.run.id}
            stage={started.stage}
            requestLabel={`${runDay(at)} · ${runTime(at)}`}
            trigger={started.run.trigger}
            instructionsVersion={started.run.instructionsVersion}
            {...playable}
          />
        </ThreadPage>
      );
    }
    const chosen = pageSelection?.selected;
    const run = chosen ? runs.find((entry) => entry.id === chosen) : undefined;
    return (
      <RunEmptyState
        arrive={!entering}
        note={
          run
            ? `${runDay(run.startedAt)} · ${runTime(run.startedAt)} has no recorded thread.`
            : null
        }
      />
    );
  };

  return (
    <div ref={view} className="run-view">
      <motion.div key={`page:${shown}`} {...layer}>
        <RunSelectionProvider value={pageSelection}>
          {page(shown)}
        </RunSelectionProvider>
      </motion.div>
    </div>
  );
}

// Each part of the empty page rises into place, one after the other.
const ARRIVE = {
  hidden: { opacity: 0, y: 8 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE_OUT_EMPHASIZED },
  },
};

/* Nothing chosen, or nothing to show: what the product does, and a way in. */
function RunEmptyState({
  note,
  arrive,
}: {
  note: string | null;
  // False when a swap is already bringing the page in: the page fades as one,
  // and parts rising on top of that would arrive late and from below.
  arrive: boolean;
}) {
  const selection = useRunSelection();
  const start = selection?.start;
  // What a run follows, one tab away; absent where there is no sheet.
  const actions = useContext(ProcessSheetActions);
  const reduceMotion = useReducedMotion();
  // The key the button advertises. Left to a field that is being typed in.
  useEffect(() => {
    if (!start) return;
    function begin(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.altKey || event.shiftKey) return;
      if (!(event.metaKey || event.ctrlKey) || event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable]')
      )
        return;
      event.preventDefault();
      start?.();
    }
    document.addEventListener('keydown', begin);
    return () => document.removeEventListener('keydown', begin);
  }, [start]);
  return (
    <main
      id="main"
      tabIndex={-1}
      className="grid min-h-full place-items-center px-6 py-16 max-sm:px-4"
    >
      <motion.div
        className="grid max-w-88 justify-items-center gap-7 text-center"
        initial={reduceMotion || !arrive ? false : 'hidden'}
        animate="shown"
        transition={{ staggerChildren: 0.12 }}
      >
        <h1 className="sr-only">{note ?? 'No run selected'}</h1>
        <motion.div variants={ARRIVE} className="mb-1">
          <StateIllustration name="isometric" className="text-muted" />
        </motion.div>
        <div className="grid gap-3">
          <motion.p
            variants={ARRIVE}
            className="text-title text-primary font-medium text-balance"
          >
            Choose a run, or start a new one.
          </motion.p>
          <motion.p
            variants={ARRIVE}
            className="text-dense text-muted-strong grid gap-0.5 font-medium text-balance"
          >
            <span>
              The agent <b className="text-emphasis font-semibold">checks</b>{' '}
              the work.
            </span>
            <span>
              Nothing ships until you{' '}
              <b className="text-emphasis font-semibold">approve</b> it.
            </span>
          </motion.p>
        </div>
        <motion.div
          variants={ARRIVE}
          className="flex flex-wrap justify-center gap-2"
        >
          {start ? (
            <Button
              variant="primary"
              pill
              aria-keyshortcuts="Meta+Enter Control+Enter"
              onPress={() => start()}
            >
              Start run
              <KeyHint
                keys={['mod', 'enter']}
                on="accent"
                className="-me-1 pointer-coarse:hidden"
              />
            </Button>
          ) : (
            <Tooltip
              label="Start run"
              description={selection?.cannotStart ?? ''}
            >
              <Button variant="primary" pill aria-disabled="true">
                Start run
              </Button>
            </Tooltip>
          )}
          {actions ? (
            <Button pill onPress={actions.showInstructions}>
              Review instructions
            </Button>
          ) : null}
        </motion.div>
      </motion.div>
    </main>
  );
}
