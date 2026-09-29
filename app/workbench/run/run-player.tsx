'use client';

import { useEffect, useState, type ComponentProps } from 'react';

import { RunThread } from '@/components/app-shell/thread/run-thread';
import {
  RunningRing,
  SegmentedRing,
  type ThreadLook,
} from '@/components/app-shell/thread/thread-step';
import { Button } from '@/components/ui/button';
import {
  RUN_STAGE_LABELS,
  RUN_STAGES,
  type RunStage,
} from '@/lib/process/run-lifecycle';

type Thread = Omit<
  ComponentProps<typeof RunThread>,
  'stage' | 'request' | 'initialItemId' | 'look'
>;

const REQUEST = (
  <p>Check the promotion release and show me what needs attention.</p>
);

// The stopped run is a branch, not a stage after the commit, so the player
// walks the main line and the gallery below shows the branch.
const MAIN_LINE = RUN_STAGES.filter((stage) => stage !== 'stopped');
const STEP_MS = 1800;

const COLUMN = 'bg-surface-primary rounded-shell min-w-0 p-6 max-sm:p-4';

const LOOKS: { look: ThreadLook; label: string }[] = [
  { look: 'current', label: 'Current' },
  { look: 'proposed', label: 'Proposed' },
];

// The two thread looks side by side in time rather than in space: one switch
// for the player and every stage below it, so a stage is compared with itself.
export function RunWorkbench({ thread }: { thread: Thread }) {
  const [look, setLook] = useState<ThreadLook>('proposed');
  return (
    <>
      <LoadingMarks />
      <div className="flex flex-wrap items-center gap-3">
        <p className="readout text-muted" id="look">
          Thread look
        </p>
        <div role="group" aria-labelledby="look" className="flex gap-2">
          {LOOKS.map((option) => (
            <Button
              key={option.look}
              variant={option.look === look ? 'primary' : 'secondary'}
              aria-pressed={option.look === look}
              onPress={() => setLook(option.look)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
      <RunPlayer thread={thread} look={look} />
      <section aria-labelledby="every-stage" className="grid gap-4">
        <h2 id="every-stage" className="text-title font-semibold">
          Every stage
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,40rem),1fr))] gap-x-6 gap-y-10">
          {RUN_STAGES.map((stage) => (
            <RunStageColumn
              key={stage}
              stage={stage}
              thread={thread}
              look={look}
            />
          ))}
        </div>
      </section>
    </>
  );
}

const TURN_OPTIONS: { count: 3 | 4; label: string }[] = [
  { count: 4, label: '4 arcs · quarter turn' },
  { count: 3, label: '3 arcs · third turn' },
];

function LoadingMarks() {
  return (
    <section aria-labelledby="loading-marks" className="grid gap-6">
      <div className="grid gap-1">
        <h2 id="loading-marks" className="text-title font-semibold">
          Running mark options
        </h2>
        <p className="text-meta text-muted">
          The arcs light in order, beat once, then dim. The outer shape turns
          while they are dark, and the next cycle starts as the turn ends.
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
        <figure className="bg-surface-primary rounded-shell grid justify-items-center gap-3 p-6">
          <div className="thread workbench-mark-preview" aria-hidden="true">
            <span className="thread-dot" data-status="running">
              <RunningRing />
            </span>
          </div>
          <figcaption className="text-meta text-muted">
            Original loader
          </figcaption>
        </figure>
        {TURN_OPTIONS.map(({ count, label }) => (
          <figure
            key={label}
            className="bg-surface-primary rounded-shell grid justify-items-center gap-3 p-6"
          >
            <div className="thread workbench-mark-preview" aria-hidden="true">
              <span className="thread-dot" data-status="running">
                <SegmentedRing count={count} />
              </span>
            </div>
            <figcaption className="text-meta text-muted">{label}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function RunPlayer({ thread, look }: { thread: Thread; look: ThreadLook }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stage = MAIN_LINE[index]!;
  const last = index === MAIN_LINE.length - 1;

  // Playing past the last stage is simply finished: the timer stops arming.
  const running = playing && !last;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setIndex((at) => at + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [running, index]);

  return (
    <section aria-labelledby="player" className="grid max-w-190 gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="player" className="text-title font-semibold">
          Player
        </h2>
        <div className="flex gap-2">
          <Button
            isDisabled={index === 0}
            onPress={() => {
              setPlaying(false);
              setIndex((at) => at - 1);
            }}
          >
            Back
          </Button>
          <Button
            variant="primary"
            onPress={() => {
              if (last) {
                setIndex(0);
                setPlaying(true);
              } else setPlaying(!playing);
            }}
          >
            {running ? 'Pause' : last ? 'Replay' : 'Play'}
          </Button>
          <Button
            isDisabled={last}
            onPress={() => {
              setPlaying(false);
              setIndex((at) => at + 1);
            }}
          >
            Next
          </Button>
        </div>
        <p className="readout text-muted">
          {index + 1} / {MAIN_LINE.length} · {RUN_STAGE_LABELS[stage]}
        </p>
      </div>
      <div className={COLUMN}>
        <RunThread stage={stage} request={REQUEST} look={look} {...thread} />
      </div>
    </section>
  );
}

function RunStageColumn({
  stage,
  thread,
  look,
}: {
  stage: RunStage;
  thread: Thread;
  look: ThreadLook;
}) {
  return (
    <section
      aria-label={RUN_STAGE_LABELS[stage]}
      className="grid content-start gap-2.5"
    >
      <p className="readout text-muted">{RUN_STAGE_LABELS[stage]}</p>
      <div className={COLUMN}>
        <RunThread stage={stage} request={REQUEST} look={look} {...thread} />
      </div>
    </section>
  );
}
