'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { RunSelection } from '@/components/app-shell/runs/run-selection';
import { useWorkingFavicon } from '@/components/app-shell/runs/working-favicon';
import {
  ModelRunThread,
  type ModelRunActions,
  type ModelRunView,
} from '@/components/app-shell/thread/model-run-thread';
import {
  ThreadPlayerBar,
  useSlowMotion,
  type ThreadPlayerStep,
} from '@/components/app-shell/thread/thread-player';
import type { Decision } from '@/components/engine/propose/types';
import { DiscardRun } from '@/components/engine/run-parts';
import {
  brunchDirectScript,
  type ScriptedStage,
} from '@/lib/processes/brunch-orders/direct-script';
import { MODEL_RUN_STAGE_LABELS } from '@/lib/shell/model-run';
import { motionTime } from '@/lib/ui/motion-time';

const STEP_MS = 5200;
const STAGE_HOLD_MS: Partial<Record<string, number>> = { starting: 2800 };
const NO_FRAMES: NonNullable<ScriptedStage['frames']> = [];
const AFTER_FRAMES_MS = 2400;

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

export function DirectMockRun({
  runId,
  selection,
}: {
  runId: string;
  selection: RunSelection;
}) {
  const script = useMemo(() => brunchDirectScript(), []);
  const allStages = useMemo(
    () => [
      ...script.mainLine.map((s) => ({ ...s, group: 'main' as const })),
      ...script.branches.map((s) => ({ ...s, group: 'branch' as const })),
    ],
    [script],
  );
  const steps: ThreadPlayerStep[] = useMemo(
    () =>
      allStages.map((s) => ({
        key: s.key,
        label:
          s.label === s.key ? MODEL_RUN_STAGE_LABELS[s.view.stage] : s.label,
        group: s.group,
      })),
    [allStages],
  );

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const container = useRef<HTMLDivElement>(null);
  useSlowMotion(container, rate);

  const lastMainIndex = script.mainLine.length - 1;
  const scripted = allStages[index] ?? allStages[0]!;
  const isBranch = scripted.group === 'branch';
  const atLastMain = !isBranch && index >= lastMainIndex;
  const running = playing && !isBranch && !atLastMain;
  useWorkingFavicon(
    running ||
      scripted.view.stage === 'reading' ||
      scripted.view.stage === 'evaluating' ||
      scripted.view.stage === 'committing',
  );

  const frames = scripted.frames ?? NO_FRAMES;
  const [frame, setFrame] = useState({ index, at: 0 });
  const at = frame.index === index ? frame.at : 0;

  useEffect(() => {
    const next = frames[at + 1];
    if (!next) return;
    const timer = setTimeout(
      () => setFrame({ index, at: at + 1 }),
      motionTime(next.t - (frames[at]?.t ?? 0)) / rate,
    );
    return () => clearTimeout(timer);
  }, [at, index, frames, rate]);

  useEffect(() => {
    if (!running) return;
    const hold = frames.length
      ? frames.at(-1)!.t + AFTER_FRAMES_MS
      : (STAGE_HOLD_MS[scripted.key] ?? STEP_MS);
    const timer = setTimeout(() => {
      setIndex((current) => {
        const next = current + 1;
        if (next >= lastMainIndex) setPlaying(false);
        return Math.min(next, lastMainIndex);
      });
    }, motionTime(hold) / rate);
    return () => clearTimeout(timer);
  }, [running, index, scripted.key, frames, lastMainIndex, rate]);

  const { view, actions } = useScriptedActions(
    frames[at]?.view ?? scripted.view,
    () =>
      setIndex((current) =>
        current < lastMainIndex ? current + 1 : current,
      ),
  );

  return (
    <div ref={container}>
      <ThreadPlayerBar
        steps={steps}
        index={index}
        playing={running}
        rate={rate}
        onSelect={(next) => {
          setPlaying(false);
          setIndex(next);
        }}
        onTogglePlay={() => {
          if (isBranch || atLastMain) {
            setIndex(0);
            setPlaying(true);
          } else {
            setPlaying(!playing);
          }
        }}
        onRateChange={setRate}
      />
      <ModelRunThread run={view} actions={actions} look="proposed" keepOpen />
      <div className="border-rule-faint mt-8 flex flex-wrap items-center gap-3 border-t pt-4">
        <DiscardRun
          selection={selection}
          id={runId}
          words="Takes this mock run off the list. Nothing was called or written."
        />
      </div>
    </div>
  );
}
