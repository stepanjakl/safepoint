'use client';

// Deep import: Blode's barrel is the whole icon library.
import CheckCircleDashed from 'blode-icons-react/icons/check-circle-2-dashed';
import { motion } from 'motion/react';
import {
  useContext,
  useEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { ProcessSheetActions } from '@/components/app-shell/process/process-sheet';
import { RunThread } from '@/components/app-shell/thread/run-thread';
import { ThreadPage } from '@/components/app-shell/thread/thread-page';
import { Button } from '@/components/ui/button';
import { motionAlong, useSwap } from '@/components/ui/swap';
import { Tooltip } from '@/components/ui/tooltip';
import type { ProcessSummary } from '@/lib/process/model';
import { runDay, runTime } from '@/lib/process/run-time';
import { useRunSelection } from './run-selection';

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

  A change of run is a swap (components/ui/swap.tsx): to or from the empty page
  it fades; between runs it also travels, rising when the new run is further
  down the rail, so the page moves as the list does.
*/
// The empty page's key: no run.
const NONE = '';

export function RunView({
  process,
  recorded,
  playable,
}: {
  process: ProcessSummary;
  recorded: ReactNode;
  playable?: PlayableRun;
}) {
  const selection = useRunSelection();
  const runs = selection?.runs ?? process.runs;
  const view = useRef<HTMLDivElement>(null);
  const { shown, layer } = useSwap(
    selection?.selected ?? NONE,
    motionAlong(
      runs.map((run) => run.id),
      'vertical',
    ),
  );

  // A new page starts at its top, once the old one has gone.
  useEffect(() => {
    const scroller = view.current?.parentElement;
    if (scroller) scroller.scrollTop = 0;
  }, [shown]);

  const page = (id: string): ReactNode => {
    if (id && id === process.runs.find((run) => run.current)?.id)
      return recorded;
    const started = selection?.started;
    if (started && playable && id === started.run.id) {
      const at = started.run.startedAt;
      return (
        <ThreadPage label={`Run, ${runDay(at)} · ${runTime(at)}`}>
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
    const run = id ? runs.find((entry) => entry.id === id) : undefined;
    return (
      <RunEmptyState
        note={
          run
            ? `${runDay(run.startedAt)} · ${runTime(run.startedAt)} has no recorded thread.`
            : process.runs.length === 0
              ? 'This process has not run yet.'
              : null
        }
      />
    );
  };

  return (
    <div ref={view} className="run-view">
      <motion.div key={`page:${shown}`} {...layer}>
        {page(shown)}
      </motion.div>
    </div>
  );
}

/* Nothing chosen, or nothing to show: what the product does, and a way in. */
function RunEmptyState({ note }: { note: string | null }) {
  const selection = useRunSelection();
  const start = selection?.start;
  // What a run follows, one tab away; absent where there is no sheet.
  const actions = useContext(ProcessSheetActions);
  return (
    <main
      id="main"
      tabIndex={-1}
      className="grid min-h-full place-items-center px-6 py-16 max-sm:px-4"
    >
      <div className="grid max-w-88 justify-items-center gap-5 text-center">
        <h1 className="sr-only">{note ?? 'No run selected'}</h1>
        <CheckCircleDashed
          aria-hidden
          size={40}
          strokeWidth={1}
          className="text-muted"
        />
        {note ? (
          <p aria-hidden="true" className="text-meta text-muted">
            {note}
          </p>
        ) : null}
        <div className="grid gap-2">
          <p className="text-body text-primary text-balance">
            Choose a run, or start a new one.
          </p>
          <p className="text-dense text-muted text-balance">
            The agent checks the work. Nothing ships until you approve it.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {start ? (
            <Button variant="primary" pill onPress={start}>
              Start run
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
        </div>
      </div>
    </main>
  );
}
