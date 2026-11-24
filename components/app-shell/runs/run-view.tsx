'use client';

import { motion } from 'motion/react';
import {
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import { ThreadPage } from '@/components/app-shell/thread/thread-page';
import { AlertBox } from '@/components/ui/alert-box';
import { Button } from '@/components/ui/button';
import { useSwap } from '@/components/ui/swap';
import { Loader } from '@/components/ui/loader';
import { useLoader } from '@/components/ui/working-mark';

// A wait is said later than a panel's: past most first visits, which land
// within this, so the loader rarely holds a run back for its minimum.
const RUN_LOADER_DELAY_MS = 600;
import { KeyHint } from '@/components/ui/key-hint';
import {
  useScreenArriving,
  useScreenSettled,
} from '@/components/ui/screen-settled';
import { StateIllustration } from '@/components/ui/state-illustration';
import { EMPTY_STATE_ARRIVE, EMPTY_STATE_STAGGER } from '@/lib/ui/motion';
import type { ProcessSummary } from '@/lib/shell/model';
import { runDay, runTime } from '@/lib/shell/run-time';
import {
  RunSelectionProvider,
  useRunSelection,
  type RunSelection,
} from './run-selection';
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
// A blank page's key, while the chosen run is still being found: a reload
// shows neither the empty page nor the run until it is known which.
const PENDING = '\u0000pending';

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
          (id === selection?.instructionLoad?.runId &&
            selection.instructionLoad.failed))))
      ? id
      : NONE;
  // A run whose instructions are still being fetched is as yet unknown too:
  // only their failure has anything to say.
  const instructions = selection?.instructionLoad;
  const target =
    selection?.pending ||
    (instructions &&
      !instructions.failed &&
      instructions.runId === selection?.selected)
      ? PENDING
      : keyOf(selection?.selected ?? NONE);
  const [readiness, setReadiness] = useState<Record<string, boolean>>({});
  // A page fades in only once it has been drawn, unseen: a heavy thread
  // mounted in the fade's first frame would otherwise skip its fade.
  const [drawn, setDrawn] = useState<Record<string, true>>({});
  const failure = instructions?.runId === target ? instructions : null;
  const waitForThread = Boolean(
    selection?.live?.kept.readId && !selection.live.mock,
  );
  const preparing =
    target === PENDING || (waitForThread && readiness[target] !== true);
  // The old run leaves as soon as another is chosen; the new one waits unseen
  // until it can be drawn in full.
  const { shown, layer } = useSwap(
    target,
    () => 'fade',
    true,
    undefined,
    (current) =>
      readiness[current] !== false && (current === PENDING || !!drawn[current]),
    (current) => current === PENDING,
  );
  const reportReady = useCallback((id: string, ready: boolean | undefined) => {
    setReadiness((previous) => {
      if (previous[id] === ready) return previous;
      const next = { ...previous };
      if (ready === undefined) delete next[id];
      else next[id] = ready;
      return next;
    });
  }, []);
  const reportDrawn = useCallback((id: string, drawn: boolean) => {
    setDrawn((previous) => {
      if (Boolean(previous[id]) === drawn) return previous;
      const next = { ...previous };
      if (drawn) next[id] = true;
      else delete next[id];
      return next;
    });
  }, []);
  // The outgoing thread and its consumers keep the selection they were drawn
  // from until the fade ends; the rail already reflects the new selection.
  const [shownSelection, setShownSelection] = useState(selection);
  if (shown === target && shownSelection !== selection)
    setShownSelection(selection);
  const pageSelection = shown === target ? selection : shownSelection;
  // The next thread is built a render behind the choice, at low priority, so
  // the rail answers the click in its own frame and building cannot stall it.
  const building = useDeferredValue(target);
  const staged =
    shown !== NONE &&
    shown !== PENDING &&
    shown !== target &&
    waitForThread &&
    building === target;
  // A wait for the next run that outlasts the loader's delay is said: the
  // loader stands in the emptied column until the new run is ready.
  const loading = useLoader(preparing, RUN_LOADER_DELAY_MS);
  const waitShown = loading.phase === 'shown' || loading.phase === 'slow';

  // A new page starts at its top, once the old one has gone -- or once the
  // loader has taken its place, which sits in the column's first screen.
  useLayoutEffect(() => {
    const scroller = view.current?.parentElement;
    if (scroller) scroller.scrollTop = 0;
  }, [shown, waitShown]);

  const page = (
    id: string,
    pageSelection: RunSelection | null,
    active: boolean,
  ): ReactNode => {
    if (id === PENDING) return null;
    if (id && id === process.runs.find((run) => run.current)?.id)
      return recorded;
    const instructions = pageSelection?.instructionLoad;
    if (instructions?.runId === id && instructions.failed)
      return (
        <ThreadPage label="Run instructions">
          <AlertBox role="note" title={instructionFailure(instructions)}>
            Reopen this run to try again.
          </AlertBox>
        </ThreadPage>
      );
    const live = pageSelection?.live;
    if (live && liveThread && id === live.run.id) {
      const at = live.run.startedAt;
      return (
        <ThreadPage
          primary={active}
          label={`Run, ${runDay(at)} · ${runTime(at)}`}
        >
          {liveThread}
        </ThreadPage>
      );
    }
    const chosen = pageSelection?.selected;
    const runs = pageSelection?.runs ?? process.runs;
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
      {/* Restore the next thread at the real column width without affecting the scroller. */}
      {(staged ? [shown, target] : [shown]).map((id) => {
        const active = id === shown;
        const context = active ? pageSelection : selection;
        return (
          <motion.div
            key={id}
            {...(active
              ? {
                  ...layer,
                  animate: waitShown ? { opacity: 0 } : layer.animate,
                }
              : { initial: false, animate: { opacity: 0 } })}
            inert={!active || (shown !== target && preparing) || layer.inert}
            className={
              active
                ? undefined
                : 'invisible absolute inset-x-0 top-0 h-0 overflow-clip'
            }
          >
            <RunPage
              id={id}
              selection={context}
              onReady={reportReady}
              onDrawn={reportDrawn}
              shown={active}
            >
              {page(id, context, active)}
            </RunPage>
          </motion.div>
        );
      })}
      {waitShown && loading.phase ? (
        <div className="absolute inset-x-0 top-0 grid h-full place-items-center">
          <Loader
            phase={loading.phase}
            size="page"
            label="Loading run…"
            announce={false}
          />
        </div>
      ) : null}
      <p role="status" className="sr-only">
        {failure
          ? instructionFailure(failure)
          : preparing
            ? 'Loading run…'
            : null}
      </p>
    </div>
  );
}

function instructionFailure({
  version,
}: NonNullable<RunSelection['instructionLoad']>) {
  return `Couldn’t load instructions ${version} for this run.`;
}

function RunPage({
  id,
  selection,
  onReady,
  onDrawn,
  shown,
  children,
}: {
  id: string;
  selection: RunSelection | null;
  onReady: (id: string, ready: boolean | undefined) => void;
  onDrawn: (id: string, drawn: boolean) => void;
  shown: boolean;
  children: ReactNode;
}) {
  // Drawn once two frames have passed since it mounted: the first paints it.
  useLayoutEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => onDrawn(id, true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      onDrawn(id, false);
    };
  }, [id, onDrawn]);
  const report = useCallback(
    (ready: boolean) => onReady(id, ready),
    [id, onReady],
  );
  useLayoutEffect(() => () => onReady(id, undefined), [id, onReady]);
  return (
    <RunSelectionProvider value={selection}>
      <RunReadiness value={{ report, shown }}>{children}</RunReadiness>
    </RunSelectionProvider>
  );
}

// Each part of the empty page rises into place, one after the other, when it
// arrives with its screen -- a load or a navigation -- once the screen around it
// has finished coming in. Mounted later, by a tab or a change of run, it is
// simply there.
const ARRIVE = EMPTY_STATE_ARRIVE;

/* Nothing chosen, or nothing to show: what the product does, and a way in. */
function RunEmptyState({ note }: { note: string | null }) {
  const selection = useRunSelection();
  const start = selection?.start;
  // What a run follows, one tab away; absent where there is no sheet.
  const actions = useContext(ProcessSheetActions);
  const settled = useScreenSettled();
  const arriving = useScreenArriving();
  const [entrancePending, setEntrancePending] = useState(arriving);
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
        initial={entrancePending ? 'hidden' : false}
        animate={entrancePending && !settled ? 'hidden' : 'shown'}
        onAnimationStart={(variant) => {
          if (variant === 'shown') setEntrancePending(false);
        }}
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
