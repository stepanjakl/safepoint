'use client';

import { useEffect, useState } from 'react';

import { useWorkingFavicon } from '@/components/app-shell/runs/working-favicon';
import type { ThreadLook } from '@/components/app-shell/thread/thread-step';
import {
  ModelRunThread,
  type ModelRunActions,
  type ModelRunView,
} from '@/components/app-shell/thread/model-run-thread';
import type { Decision } from '@/components/brunch-orders/propose-step';
import { Button } from '@/components/ui/button';
import { MODEL_RUN_STAGE_LABELS } from '@/lib/process/model-run';
import { motionTime } from '@/lib/motion-time';

import type { ScriptedStage } from './brunch-direct';

// A pane, declared as one, so what follows the surface reads the pane's face.
const COLUMN =
  'ground-raised bg-surface-primary rounded-shell min-w-0 p-6 max-sm:p-4';
const STEP_MS = 5200;
const STAGE_HOLD_MS: Partial<Record<string, number>> = { starting: 2800 };
const NO_FRAMES: NonNullable<ScriptedStage['frames']> = [];
// After a stage's last recorded moment, before the player moves on.
const AFTER_FRAMES_MS = 2400;

/*
  A person's part, played here: decisions are kept for the stage they were
  made on, a check always passes (there is no rulebook), and writing moves the
  player on to the write. Nothing reaches a server.
*/
function useScriptedActions(
  view: ModelRunView,
  onWrite?: () => void,
): { view: ModelRunView; actions: ModelRunActions } {
  const [decisions, setDecisions] = useState<Record<string, Decision> | null>(
    null,
  );
  const [announced, setAnnounced] = useState('');
  const [seen, setSeen] = useState(view);
  if (seen !== view) {
    setSeen(view);
    setDecisions(null);
  }
  const current = decisions ?? view.review?.decisions ?? {};
  return {
    view: view.review
      ? {
          ...view,
          facts: { ...view.facts, decided: Object.keys(current).length },
          review: { ...view.review, decisions: current },
        }
      : view,
    actions: {
      announced,
      onDecide: (changes, words) => {
        const next = { ...current };
        for (const [key, decision] of Object.entries(changes))
          if (decision) next[key] = decision;
          else delete next[key];
        setDecisions(next);
        setAnnounced(words);
      },
      onCheck: async () => ({ kind: 'check', verdict: 'ready', checks: [] }),
      onRetry: () => undefined,
      onWrite,
      onUndo: () => undefined,
    },
  };
}

export function BrunchPlayer({
  stages,
  look,
}: {
  stages: ScriptedStage[];
  look: ThreadLook;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const scripted = stages[index]!;
  const last = index === stages.length - 1;
  const running = playing && !last;
  useWorkingFavicon(running);
  // The stage's moments play whenever it is shown, played or stepped to.
  const frames = scripted.frames ?? NO_FRAMES;
  const [frame, setFrame] = useState({ index, at: 0 });
  const at = frame.index === index ? frame.at : 0;
  useEffect(() => {
    const next = frames[at + 1];
    if (!next) return;
    // At the pace it was recorded.
    const timer = setTimeout(
      () => setFrame({ index, at: at + 1 }),
      motionTime(next.t - (frames[at]?.t ?? 0)),
    );
    return () => clearTimeout(timer);
  }, [at, index, frames]);
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(
      () => setIndex((next) => next + 1),
      motionTime(
        frames.length
          ? frames.at(-1)!.t + AFTER_FRAMES_MS
          : (STAGE_HOLD_MS[scripted.key] ?? STEP_MS),
      ),
    );
    return () => clearTimeout(timer);
  }, [running, index, scripted.key, frames]);
  const { view, actions } = useScriptedActions(
    frames[at]?.view ?? scripted.view,
    () => setIndex((at) => Math.min(at + 1, stages.length - 1)),
  );

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
          {index + 1} / {stages.length} ·{' '}
          {MODEL_RUN_STAGE_LABELS[scripted.view.stage]}
        </p>
      </div>
      <div className={COLUMN}>
        <ModelRunThread run={view} actions={actions} look={look} keepOpen />
      </div>
    </section>
  );
}

export function BrunchStages({
  stages,
  look,
}: {
  stages: ScriptedStage[];
  look: ThreadLook;
}) {
  return (
    <section aria-labelledby="every-stage" className="grid gap-4">
      <h2 id="every-stage" className="text-title font-semibold">
        Every stage
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,40rem),1fr))] gap-x-6 gap-y-10">
        {stages.map((scripted) => (
          <BrunchStage key={scripted.key} scripted={scripted} look={look} />
        ))}
      </div>
    </section>
  );
}

function BrunchStage({
  scripted,
  look,
}: {
  scripted: ScriptedStage;
  look: ThreadLook;
}) {
  const { view, actions } = useScriptedActions(scripted.view);
  const label =
    scripted.label === scripted.key
      ? MODEL_RUN_STAGE_LABELS[scripted.view.stage]
      : scripted.label;
  return (
    <section aria-label={label} className="grid content-start gap-2.5">
      <p className="readout text-muted">{label}</p>
      <div className={COLUMN}>
        <ModelRunThread run={view} actions={actions} look={look} keepOpen />
      </div>
    </section>
  );
}
