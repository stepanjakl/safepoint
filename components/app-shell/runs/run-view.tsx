'use client';

import { motion } from 'motion/react';
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import { ThreadPage } from '@/components/app-shell/thread/thread-page';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import { useSwap } from '@/components/ui/swap';
import { KeyHint } from '@/components/ui/key-hint';
import { useScreenSettled } from '@/components/ui/screen-settled';
import { StateIllustration } from '@/components/ui/state-illustration';
import { EMPTY_STATE_ARRIVE, EMPTY_STATE_STAGGER } from '@/lib/ui/motion';
import type { ProcessSummary } from '@/lib/shell/model';
import { runDay, runTime } from '@/lib/shell/run-time';
import { RunSelectionProvider, useRunSelection } from './run-selection';
import { RunReadiness } from './run-readiness';

/*
  The page beside the rail: the run the rail has chosen, or the empty page.
  Only the current run has a recorded thread, which the server builds and
  hands in; a live run's is drawn here.

  A change of run swaps content within the fixed thread column. The page fades
  in place so its internal rules never move with the selection.
*/
// The empty page's key: no run.
const NONE = '';

export function RunView({
  process,
  recorded,
  liveThread,
}: {
  process: ProcessSummary;
  recorded: ReactNode;
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
      (liveThread &&
        (id === selection?.live?.run.id ||
          id === selection?.instructionLoad?.runId)))
      ? id
      : NONE;
  const target = keyOf(selection?.selected ?? NONE);
  const [readiness, setReadiness] = useState({ id: '', ready: true });
  const { shown, layer } = useSwap(
    target,
    () => 'fade',
    true,
    undefined,
    readiness.id !== target || readiness.ready,
  );
  const reportReady = useCallback(
    (ready: boolean) => {
      setReadiness((previous) =>
        previous.id === shown && previous.ready === ready
          ? previous
          : { id: shown, ready },
      );
    },
    [shown],
  );
  // The outgoing thread and its consumers keep the selection they were drawn
  // from until the fade ends; the rail already reflects the new selection.
  const [shownSelection, setShownSelection] = useState(selection);
  if (shown === target && shownSelection !== selection)
    setShownSelection(selection);
  const pageSelection = shown === target ? selection : shownSelection;
  const runs = pageSelection?.runs ?? process.runs;
  const instructions = pageSelection?.instructionLoad;
  const waiting = instructions?.runId === shown ? instructions : null;
  const instructionMessage = waiting
    ? waiting.failed
      ? `Couldn’t load instructions ${waiting.version} for this run.`
      : `Loading instructions ${waiting.version}…`
    : null;

  // A new page starts at its top, once the old one has gone.
  useEffect(() => {
    const scroller = view.current?.parentElement;
    if (scroller) scroller.scrollTop = 0;
  }, [shown]);

  const page = (id: string): ReactNode => {
    if (id && id === process.runs.find((run) => run.current)?.id)
      return recorded;
    if (waiting) {
      return (
        <ThreadPage label="Run instructions">
          {waiting.failed ? (
            <AlertBox role="note" title={instructionMessage}>
              Reopen this run to try again.
            </AlertBox>
          ) : (
            <p className="text-dense text-muted">{instructionMessage}</p>
          )}
        </ThreadPage>
      );
    }
    const live = pageSelection?.live;
    if (live && liveThread && id === live.run.id) {
      const at = live.run.startedAt;
      return (
        <ThreadPage label={`Run, ${runDay(at)} · ${runTime(at)}`}>
          {liveThread}
        </ThreadPage>
      );
    }
    const chosen = pageSelection?.selected;
    const run = chosen ? runs.find((entry) => entry.id === chosen) : undefined;
    return (
      <RunEmptyState
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
          <RunReadiness value={reportReady}>{page(shown)}</RunReadiness>
        </RunSelectionProvider>
      </motion.div>
      <p role="status" className="sr-only">
        {instructionMessage ??
          (readiness.id === shown && !readiness.ready ? 'Loading run…' : null)}
      </p>
    </div>
  );
}

// Each part of the empty page rises into place, one after the other, once the
// screen around it has finished coming in. Mounted into a screen already there,
// as on a load or a change of run, it is simply there too.
const ARRIVE = EMPTY_STATE_ARRIVE;

/* Nothing chosen, or nothing to show: what the product does, and a way in. */
function RunEmptyState({ note }: { note: string | null }) {
  const selection = useRunSelection();
  const start = selection?.start;
  // What a run follows, one tab away; absent where there is no sheet.
  const actions = useContext(ProcessSheetActions);
  const settled = useScreenSettled();
  const [rises] = useState(!settled);
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
      void start?.();
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
        initial={rises ? 'hidden' : false}
        animate={!rises || settled ? 'shown' : 'hidden'}
        transition={{ staggerChildren: EMPTY_STATE_STAGGER }}
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
              size="medium"
              aria-keyshortcuts="Meta+Enter Control+Enter"
              onPress={() => void start()}
            >
              Start run
              <KeyHint
                keys={['mod', 'enter']}
                on="button-primary"
                className="-me-1 pointer-coarse:hidden"
              />
            </Button>
          ) : (
            <Button variant="primary" size="medium" aria-disabled="true">
              Start run
            </Button>
          )}
          {actions ? (
            <Button size="medium" onPress={actions.showInstructions}>
              Review instructions
            </Button>
          ) : null}
        </motion.div>
      </motion.div>
    </main>
  );
}
